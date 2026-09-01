#!/usr/bin/env python3
"""App Store Connect 스토어 등록정보(App 정보 + 버전 로컬라이제이션 + 스크린샷)를
App Store Connect API 로 라이브 콘솔에 반영한다.

App Store 는 리스팅 필드가 두 리소스에 나뉜다:
  - App 정보(appInfoLocalizations): name, subtitle  (편집 가능한 App 정보에 귀속)
  - 버전(appStoreVersionLocalizations): description, keywords, promotionalText,
    whatsNew, marketingUrl, supportUrl  (편집 가능한 버전에 귀속)
  - 스크린샷: 버전 로컬라이제이션의 appScreenshotSets

따라서 텍스트 편집에는 "편집 가능한(미출시) 버전"과 편집 가능한 App 정보가
필요하다. query 서브커맨드로 현재 상태를 먼저 확인한다.

소스 오브 트루스: app-store/app-store.config.json (storeListing.*, releaseNotes)
config 로케일 키 -> ASC 로케일 코드 매핑은 CONFIG_TO_ASC_LOCALE 참고.

인증: ~/.config/seorilabs/app-store-connect.env
  (APP_STORE_CONNECT_API_KEY_ID / _ISSUER_ID / _PRIVATE_KEY_PATH)

ASC 는 Play 처럼 edit/commit 트랜잭션이 없어 각 POST/PATCH 가 즉시 반영된다.
그래서 기본은 dry-run(미전송, 미리보기)이고 --commit 을 명시할 때만 실제 전송한다.
"""
import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

import jwt
import requests


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "app-store" / "app-store.config.json"
ASC_ENV_PATH = Path(os.path.expanduser("~/.config/seorilabs/app-store-connect.env"))
API_BASE = "https://api.appstoreconnect.apple.com"

# config 로케일 키 -> App Store Connect 로케일 코드.
CONFIG_TO_ASC_LOCALE = {
    "ko-KR": "ko",
    "en-US": "en-US",
    "ja": "ja",
    "zh-Hans": "zh-Hans",
    "zh-Hant": "zh-Hant",
    "de": "de-DE",
    "fr": "fr-FR",
    "es": "es-ES",
}

# 기본 대상: 이번 글로벌 론칭에서 추가/갱신할 6개 언어.
DEFAULT_TARGET_LOCALES = ["ja", "zh-Hans", "zh-Hant", "de", "fr", "es"]

# localizedScreenshots 필드 -> ASC screenshotDisplayType.
# 기존 en-US/ko 로컬라이제이션과 동일 슬롯(6.5" iPhone / 12.9" iPad Pro)을 사용한다.
DISPLAY_TYPE_BY_FIELD = {
    "iphone65": "APP_IPHONE_65",
    "ipad13": "APP_IPAD_PRO_3GEN_129",
}

# 필드별 최대 글자수(콘솔 제출 전 로컬 가드).
TEXT_LIMITS = {
    "name": 30, "subtitle": 30, "promotionalText": 170,
    "description": 4000, "keywords": 100, "whatsNew": 4000,
}


def load_config():
    with CONFIG_PATH.open(encoding="utf-8") as file:
        return json.load(file)


def load_asc_env():
    env = {}
    if ASC_ENV_PATH.exists():
        for line in ASC_ENV_PATH.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            line = line[len("export "):] if line.startswith("export ") else line
            if "=" in line:
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip().strip('"').strip("'")
    for key in ("APP_STORE_CONNECT_API_KEY_ID", "APP_STORE_CONNECT_ISSUER_ID", "APP_STORE_CONNECT_PRIVATE_KEY_PATH"):
        if os.environ.get(key):
            env[key] = os.environ[key]
    return env


def make_token(env):
    key_id = env["APP_STORE_CONNECT_API_KEY_ID"]
    issuer_id = env["APP_STORE_CONNECT_ISSUER_ID"]
    key_path = os.path.expanduser(os.path.expandvars(env["APP_STORE_CONNECT_PRIVATE_KEY_PATH"]))
    private_key = Path(key_path).read_text()
    now = int(time.time())
    payload = {"iss": issuer_id, "iat": now, "exp": now + 20 * 60, "aud": "appstoreconnect-v1"}
    headers = {"alg": "ES256", "kid": key_id, "typ": "JWT"}
    return jwt.encode(payload, private_key, algorithm="ES256", headers=headers)


class ASC:
    def __init__(self, token):
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {token}"})

    def get(self, path, params=None):
        r = self.session.get(f"{API_BASE}{path}", params=params, timeout=60)
        r.raise_for_status()
        return r.json()

    def post(self, path, body):
        r = self.session.post(f"{API_BASE}{path}", json=body, timeout=60)
        if r.status_code >= 400:
            raise RuntimeError(f"POST {path} -> {r.status_code}: {r.text}")
        return r.json()

    def patch(self, path, body):
        r = self.session.patch(f"{API_BASE}{path}", json=body, timeout=60)
        if r.status_code >= 400:
            raise RuntimeError(f"PATCH {path} -> {r.status_code}: {r.text}")
        return r.json()

    def put_data(self, url, data, headers):
        # 업로드 대상은 Apple object-storage presigned URL 이라 ASC Bearer 인증을
        # 붙이면 안 된다(400). 세션이 아닌 순수 requests 로, operation 헤더만 보낸다.
        r = requests.put(url, data=data, headers=headers, timeout=120)
        if r.status_code >= 400:
            raise RuntimeError(f"PUT {url} -> {r.status_code}: {r.text}")
        return r


def find_app(asc, bundle_id):
    data = asc.get("/v1/apps", {"filter[bundleId]": bundle_id, "limit": 1})
    apps = data.get("data", [])
    if not apps:
        raise RuntimeError(f"앱을 찾을 수 없습니다: {bundle_id}")
    return apps[0]


def editable_version(asc, app_id):
    versions = asc.get(f"/v1/apps/{app_id}/appStoreVersions",
                       {"limit": 10, "fields[appStoreVersions]": "versionString,appStoreState"})
    for v in versions.get("data", []):
        if v["attributes"]["appStoreState"] in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"):
            return v
    return None


def editable_app_info(asc, app_id):
    infos = asc.get(f"/v1/apps/{app_id}/appInfos", {"fields[appInfos]": "appStoreState,state"})
    for a in infos.get("data", []):
        if a["attributes"].get("appStoreState") == "PREPARE_FOR_SUBMISSION":
            return a
    return None


def count_chars(value):
    return len(list(value))


def validate(field, value):
    limit = TEXT_LIMITS.get(field)
    if limit and count_chars(value) > limit:
        return f"{field} {count_chars(value)}/{limit}자 초과"
    return None


def target_locales(config, requested):
    keys = requested or DEFAULT_TARGET_LOCALES
    out = []
    for k in keys:
        asc_locale = CONFIG_TO_ASC_LOCALE.get(k)
        if not asc_locale:
            print(f"Warning: '{k}' ASC 로케일 매핑 없음, 건너뜀.", file=sys.stderr)
            continue
        out.append((k, asc_locale))
    return out


# ---------- 텍스트 업로드 ----------

def upsert_localization(asc, type_name, list_url, create_url, relationship, existing, asc_locale, attrs):
    """로케일 로컬라이제이션을 생성하거나(이미 있으면/자동생성 충돌 시) PATCH 한다."""
    if asc_locale in existing:
        loc_id = existing[asc_locale]
        asc.patch(f"/v1/{type_name}/{loc_id}", {"data": {"type": type_name, "id": loc_id, "attributes": attrs}})
        return loc_id
    try:
        created = asc.post(create_url, {"data": {
            "type": type_name, "attributes": {"locale": asc_locale, **attrs}, "relationships": relationship,
        }})
        existing[asc_locale] = created["data"]["id"]
        return existing[asc_locale]
    except RuntimeError as error:
        if "409" not in str(error):
            raise
        # 반대편 로케일 추가로 자동 생성됨 -> 재조회 후 patch.
        refreshed = {l["attributes"]["locale"]: l["id"] for l in asc.get(list_url, {"limit": 50}).get("data", [])}
        loc_id = refreshed.get(asc_locale)
        if loc_id is None:
            raise
        existing[asc_locale] = loc_id
        asc.patch(f"/v1/{type_name}/{loc_id}", {"data": {"type": type_name, "id": loc_id, "attributes": attrs}})
        return loc_id


def upload_text(args):
    env = load_asc_env()
    asc = ASC(make_token(env))
    config = load_config()
    bundle_id = args.bundle_id or config.get("bundleId")
    sl = config["storeListing"]
    notes = config.get("releaseNotes", {})
    support_url = config.get("supportUrl")
    marketing_url = config.get("marketingUrl")

    app = find_app(asc, bundle_id)
    app_id = app["id"]

    version = editable_version(asc, app_id)
    app_info = editable_app_info(asc, app_id)
    if version is None:
        raise RuntimeError("편집 가능한(PREPARE_FOR_SUBMISSION) 버전이 없습니다. 콘솔에서 새 버전을 준비해야 합니다.")
    if app_info is None:
        raise RuntimeError("편집 가능한 App 정보가 없습니다.")
    version_id = version["id"]
    app_info_id = app_info["id"]

    # 기존 로컬라이제이션(로케일->id).
    existing_info = {
        l["attributes"]["locale"]: l["id"]
        for l in asc.get(f"/v1/appInfos/{app_info_id}/appInfoLocalizations", {"limit": 50}).get("data", [])
    }
    existing_ver = {
        l["attributes"]["locale"]: l["id"]
        for l in asc.get(f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations", {"limit": 50}).get("data", [])
    }

    summary = {
        "appId": app_id, "versionId": version_id, "versionString": version["attributes"]["versionString"],
        "appInfoId": app_info_id, "commit": bool(args.commit and not args.dry_run), "locales": [],
    }

    for config_key, asc_locale in target_locales(config, args.locales):
        info_attrs = {"name": sl["appName"][config_key], "subtitle": sl["subtitle"][config_key]}
        ver_attrs = {
            "description": sl["description"][config_key],
            "keywords": sl["keywords"][config_key],
            "promotionalText": sl["promotionalText"][config_key],
        }
        if notes.get(config_key):
            ver_attrs["whatsNew"] = notes[config_key]
        if support_url:
            ver_attrs["supportUrl"] = support_url
        if marketing_url:
            ver_attrs["marketingUrl"] = marketing_url

        violations = []
        for f, v in {**info_attrs, **ver_attrs}.items():
            msg = validate(f, v)
            if msg:
                violations.append(msg)
        if violations:
            raise RuntimeError(f"{asc_locale} 글자수 위반: {violations}")

        entry = {
            "configKey": config_key, "ascLocale": asc_locale,
            "name": info_attrs["name"],
            "appInfoAction": "patch" if asc_locale in existing_info else "create",
            "versionAction": "patch" if asc_locale in existing_ver else "create",
        }

        if not args.dry_run and args.commit:
            # App 정보 로컬라이제이션(name/subtitle). ASC 는 한 로케일을 추가하면
            # 반대편(버전) 로컬라이제이션도 자동 생성하므로 create 충돌 시 patch 로 폴백.
            upsert_localization(
                asc, "appInfoLocalizations",
                f"/v1/appInfos/{app_info_id}/appInfoLocalizations", "/v1/appInfoLocalizations",
                {"appInfo": {"data": {"type": "appInfos", "id": app_info_id}}},
                existing_info, asc_locale, info_attrs,
            )
            # 버전 로컬라이제이션(description/keywords/promo/whatsNew/urls)
            upsert_localization(
                asc, "appStoreVersionLocalizations",
                f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations", "/v1/appStoreVersionLocalizations",
                {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}}},
                existing_ver, asc_locale, ver_attrs,
            )

        summary["locales"].append(entry)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


# ---------- 스크린샷 업로드 ----------

def md5_hex(path):
    h = hashlib.md5()
    h.update(Path(path).read_bytes())
    return h.hexdigest()


def upload_one_screenshot(asc, set_id, path):
    """appScreenshots 예약 -> 바이너리 PUT -> commit."""
    data = Path(path).read_bytes()
    reserve = asc.post("/v1/appScreenshots", {"data": {
        "type": "appScreenshots",
        "attributes": {"fileName": Path(path).name, "fileSize": len(data)},
        "relationships": {"appScreenshotSet": {"data": {"type": "appScreenshotSets", "id": set_id}}},
    }})
    shot_id = reserve["data"]["id"]
    for op in reserve["data"]["attributes"]["uploadOperations"]:
        headers = {h["name"]: h["value"] for h in op.get("requestHeaders", [])}
        chunk = data[op["offset"]: op["offset"] + op["length"]]
        asc.put_data(op["url"], chunk, headers)
    asc.patch(f"/v1/appScreenshots/{shot_id}", {"data": {
        "type": "appScreenshots", "id": shot_id,
        "attributes": {"uploaded": True, "sourceFileChecksum": md5_hex(path)},
    }})
    return shot_id


def upload_screenshots(args):
    env = load_asc_env()
    asc = ASC(make_token(env))
    config = load_config()
    bundle_id = args.bundle_id or config.get("bundleId")
    localized = config.get("localizedScreenshots", {})

    app = find_app(asc, bundle_id)
    app_id = app["id"]
    version = editable_version(asc, app_id)
    if version is None:
        raise RuntimeError("편집 가능한 버전이 없습니다.")
    version_id = version["id"]

    existing_ver = {
        l["attributes"]["locale"]: l["id"]
        for l in asc.get(f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations", {"limit": 50}).get("data", [])
    }

    summary = {"versionId": version_id, "commit": bool(args.commit and not args.dry_run), "locales": []}
    for config_key, asc_locale in target_locales(config, args.locales):
        assets = localized.get(config_key)
        loc_id = existing_ver.get(asc_locale)
        entry = {"configKey": config_key, "ascLocale": asc_locale, "sets": {}}
        if assets is None:
            entry["error"] = "localizedScreenshots 없음"
            summary["locales"].append(entry)
            continue
        if loc_id is None:
            entry["error"] = f"버전 로컬라이제이션({asc_locale}) 없음 - 먼저 text 업로드 필요"
            summary["locales"].append(entry)
            continue

        # 기존 세트(재실행 시 표시타입별 존재 여부).
        sets = asc.get(f"/v1/appStoreVersionLocalizations/{loc_id}/appScreenshotSets", {"limit": 50}).get("data", [])
        set_by_type = {s["attributes"]["screenshotDisplayType"]: s["id"] for s in sets}

        for field, display_type in DISPLAY_TYPE_BY_FIELD.items():
            paths = [p for p in assets.get(field, []) if (ROOT / p).exists()]
            entry["sets"][display_type] = len(paths)
            if not paths or args.dry_run or not args.commit:
                continue
            set_id = set_by_type.get(display_type)
            if set_id is None:
                created = asc.post("/v1/appScreenshotSets", {"data": {
                    "type": "appScreenshotSets",
                    "attributes": {"screenshotDisplayType": display_type},
                    "relationships": {"appStoreVersionLocalization": {"data": {"type": "appStoreVersionLocalizations", "id": loc_id}}},
                }})
                set_id = created["data"]["id"]
            else:
                # 재실행 시 기존 스크린샷 제거 후 재업로드(중복 방지).
                existing_shots = asc.get(f"/v1/appScreenshotSets/{set_id}/appScreenshots", {"limit": 50}).get("data", [])
                for sh in existing_shots:
                    asc.session.delete(f"{API_BASE}/v1/appScreenshots/{sh['id']}", timeout=60)
            for p in paths:
                upload_one_screenshot(asc, set_id, str(ROOT / p))
        summary["locales"].append(entry)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


# ---------- 조회 ----------

def query(args):
    env = load_asc_env()
    asc = ASC(make_token(env))
    config = load_config()
    bundle_id = args.bundle_id or config.get("bundleId")
    app = find_app(asc, bundle_id)
    app_id = app["id"]
    out = {"appId": app_id, "bundleId": bundle_id, "appName": app["attributes"].get("name")}
    versions = asc.get(f"/v1/apps/{app_id}/appStoreVersions",
                       {"limit": 5, "fields[appStoreVersions]": "versionString,appStoreState,platform"})
    out["versions"] = []
    for v in versions.get("data", []):
        locs = asc.get(f"/v1/appStoreVersions/{v['id']}/appStoreVersionLocalizations",
                       {"limit": 50, "fields[appStoreVersionLocalizations]": "locale"})
        out["versions"].append({
            "id": v["id"], "version": v["attributes"]["versionString"],
            "state": v["attributes"]["appStoreState"],
            "locales": sorted(l["attributes"]["locale"] for l in locs.get("data", [])),
        })
    app_infos = asc.get(f"/v1/apps/{app_id}/appInfos", {"fields[appInfos]": "appStoreState,state"})
    out["appInfos"] = []
    for a in app_infos.get("data", []):
        locs = asc.get(f"/v1/appInfos/{a['id']}/appInfoLocalizations",
                       {"limit": 50, "fields[appInfoLocalizations]": "locale"})
        out["appInfos"].append({"id": a["id"], "attrs": a["attributes"],
                                "locales": sorted(l["attributes"]["locale"] for l in locs.get("data", []))})
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


def main():
    parser = argparse.ArgumentParser(description="App Store Connect listing uploader")
    sub = parser.add_subparsers(dest="command", required=True)

    q = sub.add_parser("query", help="현재 앱/버전/로컬라이제이션 상태 조회")
    q.add_argument("--bundle-id", default=None)
    q.set_defaults(func=query)

    t = sub.add_parser("text", help="App 정보/버전 텍스트 로컬라이제이션 업로드")
    t.add_argument("--bundle-id", default=None)
    t.add_argument("--locales", nargs="*", default=None, help="config 로케일 키(기본: 6개 신규 언어)")
    t.add_argument("--commit", action="store_true", help="실제 전송(라이브 반영)")
    t.add_argument("--dry-run", action="store_true", help="미리보기만")
    t.set_defaults(func=upload_text)

    s = sub.add_parser("screenshots", help="버전 스크린샷(6.5 iPhone / 12.9 iPad) 업로드")
    s.add_argument("--bundle-id", default=None)
    s.add_argument("--locales", nargs="*", default=None, help="config 로케일 키(기본: 6개 신규 언어)")
    s.add_argument("--commit", action="store_true", help="실제 전송(라이브 반영)")
    s.add_argument("--dry-run", action="store_true", help="미리보기만")
    s.set_defaults(func=upload_screenshots)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
