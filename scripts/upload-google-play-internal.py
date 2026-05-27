#!/usr/bin/env python3
import argparse
import base64
import json
import os
import sys
from pathlib import Path

import google.auth
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "play-store" / "google-play.config.json"
DEFAULT_AAB_PATH = ROOT / "apps/mobile/android/app/build/outputs/bundle/release/app-release.aab"
ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher"


def load_config():
    with CONFIG_PATH.open(encoding="utf-8") as file:
        return json.load(file)


def decode_service_account_secret():
    raw_json = os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")
    encoded_json = os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64")

    if raw_json and encoded_json:
        raise RuntimeError(
            "Set only one of GOOGLE_PLAY_SERVICE_ACCOUNT_JSON or "
            "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64."
        )

    if raw_json:
        return json.loads(raw_json)

    if encoded_json:
        decoded = base64.b64decode(encoded_json).decode("utf-8")
        return json.loads(decoded)

    return None


def make_android_publisher():
    info = decode_service_account_secret()
    if info:
        credentials = service_account.Credentials.from_service_account_info(
            info,
            scopes=[ANDROID_PUBLISHER_SCOPE],
        )
    else:
        credentials, _project_id = google.auth.default(scopes=[ANDROID_PUBLISHER_SCOPE])

    return build("androidpublisher", "v3", credentials=credentials, cache_discovery=False)


def default_release_notes(release_config, language):
    notes = release_config.get("notes", {})
    if isinstance(notes, dict):
        if notes.get(language):
            return notes[language]
        for value in notes.values():
            if value:
                return value
    return ""


def resolve_track(publisher, package_name, edit_id, requested_track):
    try:
        response = (
            publisher.edits()
            .tracks()
            .list(packageName=package_name, editId=edit_id)
            .execute()
        )
    except Exception:
        return requested_track

    track_names = {track.get("track") for track in response.get("tracks", [])}
    if requested_track in track_names:
        return requested_track

    aliases = {
        "internal": "qa",
        "qa": "internal",
    }
    alias = aliases.get(requested_track)
    if alias in track_names:
        return alias

    return requested_track


def upload_internal_release(args):
    package_name = args.package_name
    aab_path = Path(args.aab_path).resolve()

    if not aab_path.exists():
        raise FileNotFoundError(f"AAB file does not exist: {aab_path}")

    if not args.release_notes:
        raise RuntimeError("Release notes are required.")

    publisher = make_android_publisher()
    edit = publisher.edits().insert(packageName=package_name, body={}).execute()
    edit_id = edit["id"]
    track = resolve_track(publisher, package_name, edit_id, args.track)

    try:
        media = MediaFileUpload(
            str(aab_path),
            mimetype="application/octet-stream",
            chunksize=16 * 1024 * 1024,
            resumable=True,
        )
        bundle = (
            publisher.edits()
            .bundles()
            .upload(packageName=package_name, editId=edit_id, media_body=media)
            .execute()
        )
        version_code = int(bundle["versionCode"])

        release = {
            "name": args.release_name,
            "versionCodes": [str(version_code)],
            "status": args.release_status,
            "releaseNotes": [
                {
                    "language": args.release_notes_language,
                    "text": args.release_notes,
                }
            ],
        }
        track_body = {
            "track": track,
            "releases": [release],
        }

        publisher.edits().tracks().update(
            packageName=package_name,
            editId=edit_id,
            track=track,
            body=track_body,
        ).execute()

        commit_kwargs = {
            "packageName": package_name,
            "editId": edit_id,
        }
        if args.changes_not_sent_for_review:
            commit_kwargs["changesNotSentForReview"] = True

        committed_edit = publisher.edits().commit(**commit_kwargs).execute()
        return {
            "packageName": package_name,
            "requestedTrack": args.track,
            "track": track,
            "releaseStatus": args.release_status,
            "versionCode": version_code,
            "editId": committed_edit["id"],
        }
    except Exception:
        publisher.edits().delete(packageName=package_name, editId=edit_id).execute()
        raise


def main():
    config = load_config()
    release_config = config.get("release", {})
    default_language = config.get("defaultLanguage", "ko-KR")
    default_aab_path = ROOT / release_config.get("aabPath", str(DEFAULT_AAB_PATH.relative_to(ROOT)))

    parser = argparse.ArgumentParser(
        description="Upload a signed AAB to Google Play internal testing via Android Publisher API."
    )
    parser.add_argument("--package-name", default=config.get("packageName"))
    parser.add_argument("--aab-path", default=str(default_aab_path))
    parser.add_argument("--track", default=release_config.get("track", config.get("targetTrack", "internal")))
    parser.add_argument(
        "--release-status",
        choices=["draft", "completed"],
        default="draft",
        help="Use draft for first automation runs; completed makes it available to internal testers.",
    )
    parser.add_argument("--release-name", default=release_config.get("name", "0.1.0-internal"))
    parser.add_argument("--release-notes-language", default=default_language)
    parser.add_argument(
        "--release-notes",
        default=default_release_notes(release_config, default_language),
    )
    parser.add_argument(
        "--changes-not-sent-for-review",
        action="store_true",
        help="Commit the edit with changesNotSentForReview=true.",
    )
    args = parser.parse_args()

    if not args.package_name:
        print("Google Play package name is required.", file=sys.stderr)
        return 1

    try:
        result = upload_internal_release(args)
    except Exception as error:
        print(f"Google Play internal upload failed: {error}", file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
