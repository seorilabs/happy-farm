#!/usr/bin/env python3
import argparse
import base64
import json
import os
import sys
from pathlib import Path

import google.auth
import google_auth_httplib2
import httplib2
from google.oauth2 import service_account
from googleapiclient.discovery import build


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "play-store" / "google-play.config.json"
ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher"
DEFAULT_API_TIMEOUT_SECONDS = 300
DEFAULT_API_RETRIES = 5
MAX_VERSION_CODE = 2100000000


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


def env_int(name, default, minimum=None):
    raw_value = os.environ.get(name)
    if raw_value in (None, ""):
        return default

    try:
        parsed = int(raw_value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer.") from error

    if minimum is not None and parsed < minimum:
        raise RuntimeError(f"{name} must be {minimum} or greater.")

    return parsed


def positive_int(value):
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than 0")
    return parsed


def non_negative_int(value):
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be 0 or greater")
    return parsed


def make_android_publisher(timeout_seconds):
    info = decode_service_account_secret()
    if info:
        credentials = service_account.Credentials.from_service_account_info(
            info,
            scopes=[ANDROID_PUBLISHER_SCOPE],
        )
    else:
        credentials, _project_id = google.auth.default(scopes=[ANDROID_PUBLISHER_SCOPE])

    base_http = httplib2.Http(timeout=timeout_seconds)
    try:
        base_http.redirect_codes = base_http.redirect_codes - {308}
    except AttributeError:
        pass

    http = google_auth_httplib2.AuthorizedHttp(
        credentials,
        http=base_http,
    )
    return build("androidpublisher", "v3", http=http, cache_discovery=False)


def execute_request(request, retries):
    return request.execute(num_retries=retries)


def collect_version_codes(items):
    version_codes = []
    for item in items:
        raw_value = item.get("versionCode")
        if raw_value is not None:
            version_codes.append(int(raw_value))
    return version_codes


def collect_track_version_codes(tracks):
    version_codes = []
    for track in tracks:
        for release in track.get("releases", []):
            for raw_value in release.get("versionCodes", []):
                version_codes.append(int(raw_value))
    return version_codes


def default_release_notes(notes, language):
    if isinstance(notes, dict):
        if notes.get(language):
            return notes[language]
        for value in notes.values():
            if value:
                return value
    return ""


def unit_fraction(value):
    parsed = float(value)
    if not 0 < parsed <= 1:
        raise argparse.ArgumentTypeError("must be in (0, 1]")
    return parsed


def load_notes_map(path):
    """Backoffice 가 붙인 release-notes.json({notes:{'ko-KR':..}}) → {storeLocale: text}."""
    if not path:
        return {}
    notes_path = Path(path)
    if not notes_path.exists():
        return {}
    with notes_path.open(encoding="utf-8") as file:
        doc = json.load(file)
    notes = doc.get("notes", {}) if isinstance(doc, dict) else {}
    return {k: v for k, v in notes.items() if isinstance(v, str) and v.strip()}


def listing_languages(publisher, package_name, edit_id, retries):
    """앱 스토어 등록(listing) 언어 집합. 실패 시 빈 집합."""
    try:
        response = execute_request(
            publisher.edits().listings().list(packageName=package_name, editId=edit_id),
            retries,
        )
    except Exception as error:
        print(f"Warning: failed to list Google Play listings: {error}", file=sys.stderr)
        return set()
    return {item.get("language") for item in response.get("listings", []) if item.get("language")}


def build_release_notes(publisher, package_name, edit_id, args, retries):
    """release-notes.json 이 있으면 앱에 등록된 언어와 교집합인 언어별 노트 전부를,
    없으면 단일 --release-notes 를 반환한다(미등록 언어는 400 방지 위해 제외)."""
    notes_map = load_notes_map(getattr(args, "release_notes_json", None))
    if notes_map:
        languages = listing_languages(publisher, package_name, edit_id, retries)
        if languages:
            selected = {lang: text for lang, text in notes_map.items() if lang in languages}
        else:
            # 리스팅 조회 실패 시엔 전체를 넣되(폴백), 미등록 언어 400 위험은 감수.
            selected = notes_map
        if selected:
            return [{"language": lang, "text": text} for lang, text in selected.items()]
    if args.release_notes:
        return [{"language": args.release_notes_language, "text": args.release_notes}]
    return []


def resolve_track(publisher, package_name, edit_id, requested_track, retries):
    try:
        response = execute_request(
            publisher.edits().tracks().list(packageName=package_name, editId=edit_id),
            retries,
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


def resolve_next_version_code(args):
    package_name = args.package_name
    publisher = make_android_publisher(args.api_timeout_seconds)
    edit = execute_request(
        publisher.edits().insert(packageName=package_name, body={}),
        args.api_retries,
    )
    edit_id = edit["id"]

    try:
        bundle_response = execute_request(
            publisher.edits().bundles().list(packageName=package_name, editId=edit_id),
            args.api_retries,
        )
        version_codes = collect_version_codes(bundle_response.get("bundles", []))

        try:
            track_response = execute_request(
                publisher.edits().tracks().list(packageName=package_name, editId=edit_id),
                args.api_retries,
            )
            version_codes.extend(collect_track_version_codes(track_response.get("tracks", [])))
        except Exception as track_error:
            print(f"Warning: failed to inspect Google Play tracks: {track_error}", file=sys.stderr)

        next_version_code = max(version_codes, default=0) + 1
        if next_version_code > MAX_VERSION_CODE:
            raise RuntimeError(f"Next versionCode exceeds Google Play maximum: {next_version_code}")
        return next_version_code
    finally:
        try:
            execute_request(
                publisher.edits().delete(packageName=package_name, editId=edit_id),
                args.api_retries,
            )
        except Exception as cleanup_error:
            print(f"Warning: failed to delete Google Play edit {edit_id}: {cleanup_error}", file=sys.stderr)


def promote_release(args):
    """중앙 tag binding이 지정한 exact versionCode만 재빌드 없이 승격한다."""
    if not args.release_name:
        raise RuntimeError("--release-name is required for promotion.")
    package_name = args.package_name
    publisher = make_android_publisher(args.api_timeout_seconds)
    edit = execute_request(
        publisher.edits().insert(packageName=package_name, body={}),
        args.api_retries,
    )
    edit_id = edit["id"]
    try:
        from_track = resolve_track(
            publisher, package_name, edit_id, args.promote_from_track, args.api_retries
        )
        to_track = resolve_track(
            publisher, package_name, edit_id, args.promote_to_track, args.api_retries
        )
        source = execute_request(
            publisher.edits().tracks().get(
                packageName=package_name, editId=edit_id, track=from_track
            ),
            args.api_retries,
        )
        version_codes = []
        for release in source.get("releases", []):
            version_codes.extend(int(v) for v in release.get("versionCodes", []) or [])
        if args.promote_version_code is None:
            raise RuntimeError("--promote-version-code is required for promotion.")
        if args.promote_version_code not in version_codes:
            raise RuntimeError(
                f"versionCode {args.promote_version_code} was not found on '{from_track}'."
            )
        target_version_code = str(args.promote_version_code)

        release_notes = build_release_notes(
            publisher, package_name, edit_id, args, args.api_retries
        )
        release = {
            "name": args.release_name,
            "versionCodes": [target_version_code],
            "status": args.release_status,
        }
        if release_notes:
            release["releaseNotes"] = release_notes
        if args.rollout is not None:
            # 단계적 출시는 inProgress + userFraction 로만 표현 가능.
            release["status"] = "inProgress"
            release["userFraction"] = args.rollout

        execute_request(
            publisher.edits().tracks().update(
                packageName=package_name,
                editId=edit_id,
                track=to_track,
                body={"track": to_track, "releases": [release]},
            ),
            args.api_retries,
        )
        committed_edit = execute_request(
            publisher.edits().commit(packageName=package_name, editId=edit_id),
            args.api_retries,
        )
        return {
            "packageName": package_name,
            "fromTrack": from_track,
            "toTrack": to_track,
            "versionCode": int(target_version_code),
            "releaseStatus": release["status"],
            "editId": committed_edit["id"],
        }
    except Exception:
        try:
            execute_request(
                publisher.edits().delete(packageName=package_name, editId=edit_id),
                args.api_retries,
            )
        except Exception as cleanup_error:
            print(f"Warning: failed to delete Google Play edit {edit_id}: {cleanup_error}", file=sys.stderr)
        raise


def main():
    config = load_config()
    default_language = config.get("defaultLanguage", "ko-KR")
    parser = argparse.ArgumentParser(
        description="Read Google Play version state or promote one exact centrally bound build."
    )
    parser.add_argument("--package-name", default=config.get("packageName"))
    parser.add_argument(
        "--release-status",
        choices=["draft", "completed"],
        default="draft",
        help="Use draft for first automation runs; completed makes it available to internal testers.",
    )
    parser.add_argument("--release-name", default=None)
    parser.add_argument("--release-notes-language", default=default_language)
    parser.add_argument(
        "--release-notes",
        default=default_release_notes(config.get("releaseNotes", {}), default_language),
    )
    parser.add_argument(
        "--release-notes-json",
        default=os.environ.get("RELEASE_NOTES_JSON") or None,
        help="Path to release-notes.json ({notes:{locale:text}}) for per-language notes.",
    )
    parser.add_argument(
        "--promote",
        action="store_true",
        help="Promote an existing build from one track to another (no rebuild).",
    )
    parser.add_argument("--promote-from-track", default="internal")
    parser.add_argument("--promote-to-track", default="production")
    parser.add_argument(
        "--promote-version-code",
        type=positive_int,
        default=None,
        help="Exact central tag-derived versionCode to promote.",
    )
    parser.add_argument(
        "--rollout",
        type=unit_fraction,
        default=None,
        help="Staged rollout fraction (0,1] for promotion. Omit for full release.",
    )
    parser.add_argument(
        "--api-timeout-seconds",
        type=positive_int,
        default=env_int("GOOGLE_PLAY_API_TIMEOUT_SECONDS", DEFAULT_API_TIMEOUT_SECONDS, minimum=1),
        help="HTTP timeout for Google Play API calls. Defaults to GOOGLE_PLAY_API_TIMEOUT_SECONDS or 300.",
    )
    parser.add_argument(
        "--api-retries",
        type=non_negative_int,
        default=env_int("GOOGLE_PLAY_API_RETRIES", DEFAULT_API_RETRIES, minimum=0),
        help="Retries for Google API requests. Defaults to GOOGLE_PLAY_API_RETRIES or 5.",
    )
    parser.add_argument(
        "--print-next-version-code",
        action="store_true",
        help="Print the next Google Play versionCode and exit.",
    )
    args = parser.parse_args()

    if not args.package_name:
        print("Google Play package name is required.", file=sys.stderr)
        return 1

    if args.print_next_version_code:
        try:
            print(resolve_next_version_code(args))
        except Exception as error:
            print(f"Failed to resolve next Google Play versionCode: {error}", file=sys.stderr)
            return 1
        return 0

    if args.promote:
        try:
            result = promote_release(args)
        except Exception as error:
            print(f"Google Play promotion failed: {error}", file=sys.stderr)
            return 1
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    parser.error(
        "AAB upload moved to the exact central upload-google-play-aab.py; "
        "use --print-next-version-code or --promote."
    )


if __name__ == "__main__":
    sys.exit(main())
