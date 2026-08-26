#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

[ -f build.env ] || { echo "build.env가 없습니다." >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./build.env
set +a
echo "Android Cloud Build 계약 검증 시작"

require_env() {
  local name="$1"
  [ -n "${!name:-}" ] || { echo "필수 환경변수가 없습니다: $name" >&2; exit 1; }
}

require_tool() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "빌더 이미지에 필수 도구가 없습니다: $1" >&2
    exit 1
  }
}

for tool in node pnpm java keytool jarsigner jar; do
  require_tool "$tool"
done

for name in \
  ANDROID_VERSION_NAME ANDROID_VERSION_CODE \
  FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64 \
  GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64 \
  GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD \
  GOOGLE_PLAY_UPLOAD_KEY_PASSWORD \
  GOOGLE_PLAY_UPLOAD_KEY_ALIAS; do
  require_env "$name"
done
echo "필수 환경변수 확인 완료"

[ "$(node --version)" = "v$NODE_VERSION" ] || {
  echo "Node 버전이 다릅니다: expected=v$NODE_VERSION actual=$(node --version)" >&2
  exit 1
}
[ "$(pnpm --version)" = "$PNPM_VERSION" ] || {
  echo "pnpm 버전이 다릅니다: expected=$PNPM_VERSION actual=$(pnpm --version)" >&2
  exit 1
}
actual_java="$(java -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')"
[ "$actual_java" = "$JDK_VERSION" ] || {
  echo "JDK 버전이 다릅니다: expected=$JDK_VERSION actual=${actual_java:-unknown}" >&2
  exit 1
}
[ -d "$ANDROID_HOME/platforms/android-$ANDROID_PLATFORM" ] || {
  echo "Android platform이 없습니다: android-$ANDROID_PLATFORM" >&2
  exit 1
}
[ -d "$ANDROID_HOME/build-tools/$ANDROID_BUILD_TOOLS" ] || {
  echo "Android build-tools가 없습니다: $ANDROID_BUILD_TOOLS" >&2
  exit 1
}
[ -d "$ANDROID_HOME/ndk/$ANDROID_NDK_VERSION" ] || {
  echo "Android NDK가 없습니다: $ANDROID_NDK_VERSION" >&2
  exit 1
}
[[ "$GRADLE_MAX_WORKERS" =~ ^[1-9][0-9]*$ ]] || {
  echo "Gradle worker 수가 올바르지 않습니다: $GRADLE_MAX_WORKERS" >&2
  exit 1
}
[ -d "$repo_root/$CLOUD_BUILD_PNPM_STORE" ] || {
  echo "인증된 Cloud Build pnpm store가 없습니다: $CLOUD_BUILD_PNPM_STORE" >&2
  exit 1
}
echo "빌더 도구와 Android SDK 확인 완료"
[ "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS" = "$EXPECTED_UPLOAD_KEY_ALIAS" ] || {
  echo "Google Play upload key alias가 다릅니다." >&2
  exit 1
}

version_json="$(node scripts/resolve-release-version.mjs --tag "v$ANDROID_VERSION_NAME")"
resolved_version_name="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).version_name)' "$version_json")"
resolved_version_code="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).google_play_version_code)' "$version_json")"
[ "$resolved_version_name" = "$ANDROID_VERSION_NAME" ] || {
  echo "Android versionName이 release tag 파생값과 다릅니다." >&2
  exit 1
}
[ "$resolved_version_code" = "$ANDROID_VERSION_CODE" ] || {
  echo "Android versionCode가 release tag 파생값과 다릅니다." >&2
  exit 1
}
echo "릴리즈 버전 계약 확인 완료"

firebase_config_base64="$FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64"
upload_keystore_base64="$GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64"
upload_store_password="$GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD"
upload_key_password="$GOOGLE_PLAY_UPLOAD_KEY_PASSWORD"
unset FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64
unset GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64
unset GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD
unset GOOGLE_PLAY_UPLOAD_KEY_PASSWORD

secret_dir="$(mktemp -d)"
firebase_config="$repo_root/apps/mobile/android/app/google-services.json"
key_properties="$repo_root/apps/mobile/android/key.properties"
keystore_file="$secret_dir/happy-farm-upload.jks"

if [ -e "$firebase_config" ] || [ -e "$key_properties" ]; then
  echo "Cloud Build source에 자격증명 파일이 포함되어 있습니다." >&2
  rm -rf "$secret_dir"
  exit 1
fi

cleanup() {
  rm -f "$firebase_config" "$key_properties"
  rm -rf "$secret_dir"
}
trap cleanup EXIT INT TERM

decode_base64() {
  local value="$1"
  local destination="$2"
  printf '%s' "$value" | base64 --decode > "$destination"
  [ -s "$destination" ] || {
    echo "base64 디코드 결과가 비었습니다: $destination" >&2
    exit 1
  }
  chmod 600 "$destination"
}

decode_base64 "$firebase_config_base64" "$firebase_config"
decode_base64 "$upload_keystore_base64" "$keystore_file"
unset firebase_config_base64 upload_keystore_base64
echo "빌드 자격증명 임시 복원 완료"

firebase_project="$(node -e 'const c=require(process.argv[1]); process.stdout.write(c.project_info?.project_id ?? "")' "$firebase_config")"
firebase_package_ok="$(node -e 'const c=require(process.argv[1]); const p=process.argv[2]; process.stdout.write(String((c.client ?? []).some((v) => v?.client_info?.android_client_info?.package_name === p)))' "$firebase_config" "$EXPECTED_ANDROID_PACKAGE")"
[ "$firebase_project" = "$EXPECTED_FIREBASE_PROJECT" ] || {
  echo "Firebase project가 다릅니다." >&2
  exit 1
}
[ "$firebase_package_ok" = "true" ] || {
  echo "Firebase Android package가 다릅니다." >&2
  exit 1
}
echo "Firebase Android identity 확인 완료"

keystore_details="$(
  keytool -list -v \
    -J-Duser.language=en -J-Duser.country=US \
    -keystore "$keystore_file" \
    -storepass "$upload_store_password" \
    -alias "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS"
)"
actual_fingerprint="$(
  printf '%s\n' "$keystore_details" \
    | sed -n 's/^[[:space:]]*SHA256:[[:space:]]*//p' \
    | head -n 1 \
    | tr -d ':' \
    | tr '[:lower:]' '[:upper:]'
)"
[ "$actual_fingerprint" = "$EXPECTED_UPLOAD_CERT_SHA256" ] || {
  echo "Google Play upload certificate fingerprint가 다릅니다." >&2
  exit 1
}
echo "Google Play upload certificate 확인 완료"

{
  printf 'storeFile=%s\n' "$keystore_file"
  printf 'storePassword=%s\n' "$upload_store_password"
  printf 'keyAlias=%s\n' "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS"
  printf 'keyPassword=%s\n' "$upload_key_password"
} > "$key_properties"
chmod 600 "$key_properties"

pnpm install \
  --frozen-lockfile \
  --store-dir "$repo_root/$CLOUD_BUILD_PNPM_STORE"
node scripts/check-firebase-android-config.mjs
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile test --watchAll=false

(
  cd apps/mobile/android
  ./gradlew :app:bundleRelease \
    --no-daemon \
    --max-workers="$GRADLE_MAX_WORKERS" \
    -PversionCodeOverride="$ANDROID_VERSION_CODE" \
    -PversionNameOverride="$ANDROID_VERSION_NAME"
)

source_aab="$repo_root/apps/mobile/android/app/build/outputs/bundle/release/app-release.aab"
[ -s "$source_aab" ] || {
  echo "Gradle 결과 AAB를 찾지 못했습니다: $source_aab" >&2
  exit 1
}

pnpm check:play:release -- --json

output_aab="$repo_root/$AAB_PATH"
mkdir -p "$(dirname "$output_aab")"
install -m 600 "$source_aab" "$output_aab"
jarsigner -verify -strict \
  -keystore "$keystore_file" \
  -storepass "$upload_store_password" \
  "$output_aab" "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS" >/dev/null

unset upload_store_password upload_key_password keystore_details
echo "Android signed AAB 생성 완료: path=$AAB_PATH bytes=$(wc -c < "$output_aab" | tr -d ' ') versionName=$ANDROID_VERSION_NAME versionCode=$ANDROID_VERSION_CODE"
