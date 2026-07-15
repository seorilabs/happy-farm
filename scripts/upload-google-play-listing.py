#!/usr/bin/env python3
"""Google Play 스토어 등록정보(리스팅) 텍스트와 로컬라이즈 이미지를 Android Publisher
API로 라이브 콘솔에 반영한다.

`upload-google-play-internal.py`가 AAB(릴리스 트랙)를 담당한다면, 이 스크립트는
"메인 스토어 등록정보" 페이지 즉 언어별 제목/간단한 설명/자세한 설명과
스크린샷·피처 그래픽을 담당한다.

- 소스 오브 트루스: play-store/google-play.config.json
  - storeListing.appName / shortDescription / fullDescription (locale map)
  - localizedAssets[locale].featureGraphic / phoneScreenshots / *TabletScreenshots
- config의 로케일 키(BCP-47 유사)를 Google Play 콘솔 언어 코드로 매핑한다.
- 기본은 dry-run(변경 미리보기)이며, 실제 반영은 --commit 을 명시할 때만 수행한다.
  이는 라이브 제품 페이지를 바꾸는 아웃바운드 작업이라 사고를 막기 위함이다.

인증: upload-google-play-internal.py 와 동일하게 GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
(또는 _BASE64), 없으면 Application Default Credentials 를 사용한다.
"""
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
from googleapiclient.http import MediaFileUpload


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "play-store" / "google-play.config.json"
ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher"
DEFAULT_API_TIMEOUT_SECONDS = 300
DEFAULT_API_RETRIES = 5

# config 로케일 키 -> Google Play 콘솔 언어 코드.
# Play 는 zh-Hans/zh-Hant 대신 지역 코드(zh-CN/zh-TW)를, 단일 언어에도 지역
# 접미사(de-DE/fr-FR/es-ES)를 요구한다.
CONFIG_TO_PLAY_LANGUAGE = {
    "ko-KR": "ko-KR",
    "en-US": "en-US",
    "ja": "ja-JP",
    "zh-Hans": "zh-CN",
    "zh-Hant": "zh-TW",
    "de": "de-DE",
    "fr": "fr-FR",
    "es": "es-ES",
}

# Play edits.images imageType. config localizedAssets 필드명 -> Play imageType.
IMAGE_TYPE_BY_FIELD = {
    "featureGraphic": "featureGraphic",
    "phoneScreenshots": "phoneScreenshots",
    "sevenInchTabletScreenshots": "sevenInchScreenshots",
    "tenInchTabletScreenshots": "tenInchScreenshots",
}

# 스토어 콘솔 필드별 최대 글자수(제출 전 로컬 가드).
TEXT_LIMITS = {"title": 30, "shortDescription": 80, "fullDescription": 4000}


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
        return json.loads(base64.b64decode(encoded_json).decode("utf-8"))
    return None


def make_android_publisher(timeout_seconds):
    info = decode_service_account_secret()
    if info:
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=[ANDROID_PUBLISHER_SCOPE]
        )
    else:
        credentials, _ = google.auth.default(scopes=[ANDROID_PUBLISHER_SCOPE])
    base_http = httplib2.Http(timeout=timeout_seconds)
    try:
        base_http.redirect_codes = base_http.redirect_codes - {308}
    except AttributeError:
        pass
    http = google_auth_httplib2.AuthorizedHttp(credentials, http=base_http)
    return build("androidpublisher", "v3", http=http, cache_discovery=False)


def count_chars(value):
    # 콘솔이 세는 방식(코드 포인트)에 맞춘다.
    return len(list(value))


def resolve_locales(config, requested):
    """반영할 (config_locale, play_language) 목록을 만든다."""
    listing = config.get("storeListing", {})
    available = list(listing.get("fullDescription", {}).keys())
    if requested:
        selected = requested
    else:
        selected = available
    result = []
    for loc in selected:
        play_lang = CONFIG_TO_PLAY_LANGUAGE.get(loc)
        if not play_lang:
            print(f"Warning: '{loc}' 에 대한 Play 언어 코드 매핑이 없어 건너뜁니다.", file=sys.stderr)
            continue
        result.append((loc, play_lang))
    return result


def build_listing_body(config, locale):
    listing = config["storeListing"]
    body = {
        "title": listing["appName"][locale],
        "shortDescription": listing["shortDescription"][locale],
        "fullDescription": listing["fullDescription"][locale],
    }
    violations = []
    for field, limit in TEXT_LIMITS.items():
        length = count_chars(body[field])
        if length > limit:
            violations.append(f"{field} {length}/{limit}자 초과")
    return body, violations


def collect_locale_images(config, locale):
    """localizedAssets[locale] 에서 존재하는 이미지 파일을 (imageType, [paths]) 로 모은다."""
    localized = config.get("localizedAssets", {}).get(locale, {})
    result = {}
    for field, image_type in IMAGE_TYPE_BY_FIELD.items():
        value = localized.get(field)
        if value is None:
            continue
        paths = value if isinstance(value, list) else [value]
        existing = [p for p in paths if (ROOT / p).exists()]
        if existing:
            result[image_type] = existing
    return result


def upload_images(publisher, package_name, edit_id, play_lang, images, retries):
    """해당 언어의 이미지 타입을 deleteall 후 재업로드한다."""
    for image_type, paths in images.items():
        publisher.edits().images().deleteall(
            packageName=package_name, editId=edit_id, language=play_lang, imageType=image_type
        ).execute(num_retries=retries)
        for path in paths:
            media = MediaFileUpload(str(ROOT / path), mimetype="image/png", resumable=False)
            publisher.edits().images().upload(
                packageName=package_name,
                editId=edit_id,
                language=play_lang,
                imageType=image_type,
                media_body=media,
            ).execute(num_retries=retries)


def run(args):
    config = load_config()
    package_name = args.package_name or config.get("packageName")
    if not package_name:
        raise RuntimeError("packageName 이 필요합니다.")

    locales = resolve_locales(config, args.locales)
    publisher = make_android_publisher(args.api_timeout_seconds)
    edit = publisher.edits().insert(packageName=package_name, body={}).execute(num_retries=args.api_retries)
    edit_id = edit["id"]

    summary = {"packageName": package_name, "committed": False, "locales": []}
    try:
        # 현재 콘솔의 리스팅 언어 목록(권한/상태 확인용).
        current = publisher.edits().listings().list(
            packageName=package_name, editId=edit_id
        ).execute(num_retries=args.api_retries)
        summary["existingLanguages"] = sorted(l["language"] for l in current.get("listings", []))

        for locale, play_lang in locales:
            body, violations = build_listing_body(config, locale)
            entry = {
                "configLocale": locale,
                "playLanguage": play_lang,
                "title": body["title"],
                "shortLen": count_chars(body["shortDescription"]),
                "fullLen": count_chars(body["fullDescription"]),
                "violations": violations,
                "images": {},
            }
            if violations:
                raise RuntimeError(f"{locale}/{play_lang} 글자수 위반: {violations}")

            if not args.dry_run:
                publisher.edits().listings().update(
                    packageName=package_name, editId=edit_id, language=play_lang, body=body
                ).execute(num_retries=args.api_retries)

            if args.with_images:
                images = collect_locale_images(config, locale)
                entry["images"] = {k: len(v) for k, v in images.items()}
                if images and not args.dry_run:
                    upload_images(publisher, package_name, edit_id, play_lang, images, args.api_retries)

            summary["locales"].append(entry)

        if args.commit and not args.dry_run:
            commit_kwargs = {"packageName": package_name, "editId": edit_id}
            if args.changes_not_sent_for_review:
                commit_kwargs["changesNotSentForReview"] = True
            committed = publisher.edits().commit(**commit_kwargs).execute(num_retries=args.api_retries)
            summary["committed"] = True
            summary["editId"] = committed["id"]
        else:
            # dry-run 또는 --commit 미지정: 편집을 폐기(콘솔 미반영).
            publisher.edits().delete(packageName=package_name, editId=edit_id).execute(num_retries=args.api_retries)
            summary["editId"] = None
        return summary
    except Exception:
        try:
            publisher.edits().delete(packageName=package_name, editId=edit_id).execute()
        except Exception as cleanup_error:
            print(f"Warning: edit {edit_id} 삭제 실패: {cleanup_error}", file=sys.stderr)
        raise


def main():
    parser = argparse.ArgumentParser(description="Upload Google Play store listing text/images via Android Publisher API.")
    parser.add_argument("--package-name", default=None)
    parser.add_argument("--locales", nargs="*", default=None, help="config 로케일 키(미지정 시 전체).")
    parser.add_argument("--with-images", action="store_true", help="localizedAssets 이미지도 업로드.")
    parser.add_argument("--commit", action="store_true", help="편집을 실제로 커밋(라이브 반영).")
    parser.add_argument("--dry-run", action="store_true", help="변경 미리보기만; 콘솔 미반영.")
    parser.add_argument("--changes-not-sent-for-review", action="store_true")
    parser.add_argument("--api-timeout-seconds", type=int, default=DEFAULT_API_TIMEOUT_SECONDS)
    parser.add_argument("--api-retries", type=int, default=DEFAULT_API_RETRIES)
    args = parser.parse_args()

    try:
        result = run(args)
    except Exception as error:
        print(f"Google Play listing 업로드 실패: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
