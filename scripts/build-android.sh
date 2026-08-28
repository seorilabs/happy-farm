#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

[ -f build.env ] || { echo "build.env가 없습니다." >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./build.env
set +a

build_mode="${SEORI_BUILD_MODE:-market-upload}"
echo "Android Cloud Build 계약 검증 시작: mode=$build_mode"

fail() {
  echo "$1" >&2
  exit 1
}

require_env() {
  local name="$1"
  [ -n "${!name:-}" ] || fail "필수 환경변수가 없습니다: $name"
}

reject_env() {
  local name="$1"
  if printenv "$name" >/dev/null 2>&1; then
    fail "$build_mode 모드에서는 환경변수를 허용하지 않습니다: $name"
  fi
}

require_tool() {
  command -v "$1" >/dev/null 2>&1 || fail "빌더 이미지에 필수 도구가 없습니다: $1"
}

verify_toolchain() {
  local tool
  for tool in node pnpm java keytool jarsigner jar; do
    require_tool "$tool"
  done
  require_env ANDROID_HOME

  [ "$(node --version)" = "v$NODE_VERSION" ] || {
    fail "Node 버전이 다릅니다: expected=v$NODE_VERSION actual=$(node --version)"
  }
  [ "$(pnpm --version)" = "$PNPM_VERSION" ] || {
    fail "pnpm 버전이 다릅니다: expected=$PNPM_VERSION actual=$(pnpm --version)"
  }
  local actual_java
  actual_java="$(java -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')"
  [ "$actual_java" = "$JDK_VERSION" ] || {
    fail "JDK 버전이 다릅니다: expected=$JDK_VERSION actual=${actual_java:-unknown}"
  }
  [ -d "$ANDROID_HOME/platforms/android-$ANDROID_PLATFORM" ] || {
    fail "Android platform이 없습니다: android-$ANDROID_PLATFORM"
  }
  [ -d "$ANDROID_HOME/build-tools/$ANDROID_BUILD_TOOLS" ] || {
    fail "Android build-tools가 없습니다: $ANDROID_BUILD_TOOLS"
  }
  [ -d "$ANDROID_HOME/ndk/$ANDROID_NDK_VERSION" ] || {
    fail "Android NDK가 없습니다: $ANDROID_NDK_VERSION"
  }
  [[ "$GRADLE_MAX_WORKERS" =~ ^[1-9][0-9]*$ ]] || {
    fail "Gradle worker 수가 올바르지 않습니다: $GRADLE_MAX_WORKERS"
  }
  echo "빌더 도구와 Android SDK 확인 완료"
}

firebase_config="$repo_root/apps/mobile/android/app/google-services.json"
key_properties="$repo_root/apps/mobile/android/key.properties"
secret_dir=""

require_clean_credential_files() {
  if [ -e "$firebase_config" ] || [ -e "$key_properties" ]; then
    fail "Cloud Build source에 자격증명 파일이 포함되어 있습니다."
  fi
}

cleanup() {
  rm -f "$firebase_config" "$key_properties"
  if [ -n "$secret_dir" ]; then
    rm -rf "$secret_dir"
  fi
}

decode_base64() {
  local value="$1"
  local destination="$2"
  if ! printf '%s' "$value" | base64 --decode > "$destination" 2>/dev/null; then
    printf '%s' "$value" | base64 -D > "$destination"
  fi
  [ -s "$destination" ] || fail "base64 디코드 결과가 비었습니다: $destination"
  chmod 600 "$destination"
}

write_key_properties() {
  local keystore_file="$1"
  local store_password="$2"
  local key_alias="$3"
  local key_password="$4"
  {
    printf 'storeFile=%s\n' "$keystore_file"
    printf 'storePassword=%s\n' "$store_password"
    printf 'keyAlias=%s\n' "$key_alias"
    printf 'keyPassword=%s\n' "$key_password"
  } > "$key_properties"
  chmod 600 "$key_properties"
}

run_mobile_quality() {
  pnpm --dir apps/mobile typecheck
  pnpm --dir apps/mobile test --watchAll=false
}

build_release_bundle() {
  local version_code="$1"
  local version_name="$2"
  (
    cd apps/mobile/android
    ./gradlew :app:bundleRelease \
      --no-daemon \
      --max-workers="$GRADLE_MAX_WORKERS" \
      -PversionCodeOverride="$version_code" \
      -PversionNameOverride="$version_name"
  )
}

require_source_aab() {
  local source_aab="$repo_root/apps/mobile/android/app/build/outputs/bundle/release/app-release.aab"
  [ -s "$source_aab" ] || fail "Gradle 결과 AAB를 찾지 못했습니다: $source_aab"
  printf '%s' "$source_aab"
}

run_build_only() {
  local name
  for name in \
    ANDROID_VERSION_NAME ANDROID_VERSION_CODE \
    FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64 \
    GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64 \
    GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD \
    GOOGLE_PLAY_UPLOAD_KEY_PASSWORD \
    GOOGLE_PLAY_UPLOAD_KEY_ALIAS; do
    reject_env "$name"
  done

  require_env SEORI_SOURCE_SHA
  require_env SEORI_ANDROID_AAB_OUTPUT
  [[ "$SEORI_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || {
    fail "SEORI_SOURCE_SHA는 40자리 소문자 Git SHA여야 합니다."
  }

  local expected_output="$repo_root/app-release.aab"
  [ "$SEORI_ANDROID_AAB_OUTPUT" = "$expected_output" ] || {
    fail "SEORI_ANDROID_AAB_OUTPUT이 중앙 build-only 계약 경로와 다릅니다: expected=$expected_output"
  }
  [ ! -e "$SEORI_ANDROID_AAB_OUTPUT" ] || {
    fail "build-only 출력 경로가 비어 있지 않습니다: $SEORI_ANDROID_AAB_OUTPUT"
  }

  if git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local observed_source_sha
    observed_source_sha="$(git -C "$repo_root" rev-parse HEAD)"
    [ "$observed_source_sha" = "$SEORI_SOURCE_SHA" ] || {
      fail "SEORI_SOURCE_SHA가 checkout HEAD와 다릅니다."
    }
  fi

  require_clean_credential_files
  secret_dir="$(mktemp -d)"
  trap cleanup EXIT INT TERM

  local source_prefix="${SEORI_SOURCE_SHA:0:12}"
  local ephemeral_alias="seori-build-only-$source_prefix"
  local ephemeral_password="seori-build-only"
  local ephemeral_keystore="$secret_dir/build-only.p12"
  local build_only_version_name="0.0.0"
  local build_only_version_code=$((16#${SEORI_SOURCE_SHA:0:7} + 1))

  keytool -genkeypair -noprompt \
    -keystore "$ephemeral_keystore" \
    -storetype PKCS12 \
    -storepass "$ephemeral_password" \
    -keypass "$ephemeral_password" \
    -alias "$ephemeral_alias" \
    -dname "CN=Seorilabs Build Only $source_prefix,OU=CI,O=Seorilabs,C=KR" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 2
  chmod 600 "$ephemeral_keystore"
  write_key_properties \
    "$ephemeral_keystore" \
    "$ephemeral_password" \
    "$ephemeral_alias" \
    "$ephemeral_password"
  echo "build-only 일회성 서명 재료 생성 완료: source=${SEORI_SOURCE_SHA}"

  pnpm install --frozen-lockfile
  run_mobile_quality
  build_release_bundle "$build_only_version_code" "$build_only_version_name"

  local source_aab
  source_aab="$(require_source_aab)"
  install -m 600 "$source_aab" "$SEORI_ANDROID_AAB_OUTPUT"
  jarsigner -verify -strict \
    -keystore "$ephemeral_keystore" \
    -storepass "$ephemeral_password" \
    "$SEORI_ANDROID_AAB_OUTPUT" "$ephemeral_alias" >/dev/null

  echo "Android build-only AAB 생성 완료: path=$SEORI_ANDROID_AAB_OUTPUT bytes=$(wc -c < "$SEORI_ANDROID_AAB_OUTPUT" | tr -d ' ') source=$SEORI_SOURCE_SHA"
}

run_market_upload() {
  reject_env SEORI_SOURCE_SHA
  reject_env SEORI_ANDROID_AAB_OUTPUT

  local name
  for name in \
    ANDROID_VERSION_NAME ANDROID_VERSION_CODE \
    FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64 \
    GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64 \
    GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD \
    GOOGLE_PLAY_UPLOAD_KEY_PASSWORD \
    GOOGLE_PLAY_UPLOAD_KEY_ALIAS; do
    require_env "$name"
  done

  [ -d "$repo_root/$CLOUD_BUILD_PNPM_STORE" ] || {
    fail "인증된 Cloud Build pnpm store가 없습니다: $CLOUD_BUILD_PNPM_STORE"
  }
  [ "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS" = "$EXPECTED_UPLOAD_KEY_ALIAS" ] || {
    fail "Google Play upload key alias가 다릅니다."
  }

  local version_json
  local resolved_version_name
  local resolved_version_code
  version_json="$(node scripts/resolve-release-version.mjs --tag "v$ANDROID_VERSION_NAME")"
  resolved_version_name="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).version_name)' "$version_json")"
  resolved_version_code="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).google_play_version_code)' "$version_json")"
  [ "$resolved_version_name" = "$ANDROID_VERSION_NAME" ] || {
    fail "Android versionName이 release tag 파생값과 다릅니다."
  }
  [ "$resolved_version_code" = "$ANDROID_VERSION_CODE" ] || {
    fail "Android versionCode가 release tag 파생값과 다릅니다."
  }
  echo "릴리즈 버전 계약 확인 완료"

  local firebase_config_base64="$FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64"
  local upload_keystore_base64="$GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64"
  local upload_store_password="$GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD"
  local upload_key_password="$GOOGLE_PLAY_UPLOAD_KEY_PASSWORD"
  unset FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64
  unset GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64
  unset GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD
  unset GOOGLE_PLAY_UPLOAD_KEY_PASSWORD

  require_clean_credential_files
  secret_dir="$(mktemp -d)"
  trap cleanup EXIT INT TERM
  local keystore_file="$secret_dir/happy-farm-upload.jks"

  decode_base64 "$firebase_config_base64" "$firebase_config"
  decode_base64 "$upload_keystore_base64" "$keystore_file"
  unset firebase_config_base64 upload_keystore_base64
  echo "빌드 자격증명 임시 복원 완료"

  local firebase_project
  local firebase_package_ok
  firebase_project="$(node -e 'const c=require(process.argv[1]); process.stdout.write(c.project_info?.project_id ?? "")' "$firebase_config")"
  firebase_package_ok="$(node -e 'const c=require(process.argv[1]); const p=process.argv[2]; process.stdout.write(String((c.client ?? []).some((v) => v?.client_info?.android_client_info?.package_name === p)))' "$firebase_config" "$EXPECTED_ANDROID_PACKAGE")"
  [ "$firebase_project" = "$EXPECTED_FIREBASE_PROJECT" ] || {
    fail "Firebase project가 다릅니다."
  }
  [ "$firebase_package_ok" = "true" ] || {
    fail "Firebase Android package가 다릅니다."
  }
  echo "Firebase Android identity 확인 완료"

  local keystore_details
  local actual_fingerprint
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
    fail "Google Play upload certificate fingerprint가 다릅니다."
  }
  echo "Google Play upload certificate 확인 완료"

  write_key_properties \
    "$keystore_file" \
    "$upload_store_password" \
    "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS" \
    "$upload_key_password"

  pnpm install \
    --frozen-lockfile \
    --store-dir "$repo_root/$CLOUD_BUILD_PNPM_STORE"
  node scripts/check-firebase-android-config.mjs
  run_mobile_quality
  build_release_bundle "$ANDROID_VERSION_CODE" "$ANDROID_VERSION_NAME"

  local source_aab
  local output_aab="$repo_root/$AAB_PATH"
  source_aab="$(require_source_aab)"
  pnpm check:play:release -- --json
  mkdir -p "$(dirname "$output_aab")"
  install -m 600 "$source_aab" "$output_aab"
  jarsigner -verify -strict \
    -keystore "$keystore_file" \
    -storepass "$upload_store_password" \
    "$output_aab" "$GOOGLE_PLAY_UPLOAD_KEY_ALIAS" >/dev/null

  unset upload_store_password upload_key_password keystore_details
  echo "Android signed AAB 생성 완료: path=$AAB_PATH bytes=$(wc -c < "$output_aab" | tr -d ' ') versionName=$ANDROID_VERSION_NAME versionCode=$ANDROID_VERSION_CODE"
}

case "$build_mode" in
  build-only)
    verify_toolchain
    run_build_only
    ;;
  market-upload)
    verify_toolchain
    run_market_upload
    ;;
  *)
    fail "지원하지 않는 Android build mode입니다: $build_mode"
    ;;
esac
