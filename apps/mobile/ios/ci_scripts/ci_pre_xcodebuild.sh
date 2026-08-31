#!/bin/sh

# Xcode Cloud archive 직전 exact GitHub tag의 중앙 version binding을 적용한다.
# 앱 저장소는 version을 계산하지 않는다. 아래 두 파일을 같은 불변 중앙 commit에서 내려받고
# checksum을 검증한 뒤 Info.plist와 런타임 releaseInfo에 확정값만 투영한다.

set -eu

AUTHORITY_SHA="8a11a145fed35479a4a89ebc7ca97edd0a0f05fd"
APPLIER_SHA256="a8436ec24933dfdb3dde38211e70e05df4f085d1f8d8fe0809d32c093de1a11e"
AUTHORITY_SHA256="ca9ef5b4fe326323840b171f9e6ed069cb182d2aee8e88b72e352c57514d466b"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../../../.." && pwd)"
REPO="${CI_PRIMARY_REPOSITORY_PATH:-${REPO_ROOT}}"
RELEASE_TAG="${CI_TAG:-}"
INFO_PLIST="${REPO}/apps/mobile/ios/HappyFarmMobile/Info.plist"
DRY_RUN="${CI_PRE_XCODEBUILD_DRY_RUN:-0}"

if [ -z "$RELEASE_TAG" ]; then
  echo "CI_TAG가 없습니다. Xcode Cloud release archive는 exact vX.Y.Z tag에서만 허용됩니다." >&2
  exit 1
fi

authority_dir=""
cleanup_authority="false"
cleanup() {
  if [ "$cleanup_authority" = "true" ] && [ -n "$authority_dir" ]; then
    rm -rf "$authority_dir"
  fi
}
trap cleanup EXIT INT TERM

if [ "$DRY_RUN" = "1" ] && [ -n "${SEORI_RELEASE_AUTHORITY_DIR:-}" ]; then
  authority_dir="$SEORI_RELEASE_AUTHORITY_DIR"
  cleanup_authority="false"
else
  authority_dir="$(mktemp -d)"
  cleanup_authority="true"
  base_url="https://raw.githubusercontent.com/seorilabs/.github/${AUTHORITY_SHA}/scripts/release"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    "${base_url}/xcode-cloud-apply-tag-version.mjs" \
    --output "${authority_dir}/xcode-cloud-apply-tag-version.mjs"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    "${base_url}/tag-version-authority.mjs" \
    --output "${authority_dir}/tag-version-authority.mjs"
  (
    cd "$authority_dir"
    printf '%s  %s\n' "$APPLIER_SHA256" xcode-cloud-apply-tag-version.mjs \
      | shasum -a 256 -c
    printf '%s  %s\n' "$AUTHORITY_SHA256" tag-version-authority.mjs \
      | shasum -a 256 -c
  )
fi

# 경로에는 공백이 없다는 전제 대신 positional argument를 정확히 전달한다.
if [ "$DRY_RUN" = "1" ]; then
  result="$(node "${authority_dir}/xcode-cloud-apply-tag-version.mjs" \
    --tag "$RELEASE_TAG" --repository "$REPO" --info-plist "$INFO_PLIST" --dry-run)"
else
  result="$(node "${authority_dir}/xcode-cloud-apply-tag-version.mjs" \
    --tag "$RELEASE_TAG" --repository "$REPO" --info-plist "$INFO_PLIST")"
fi

marketing="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).appleMarketingVersion ?? ""))' "$result")"
build="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).appleBuildNumber ?? ""))' "$result")"
source_sha="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).sourceSha ?? ""))' "$result")"

if [ -z "$marketing" ] || [ -z "$build" ] || [ -z "$source_sha" ]; then
  echo "중앙 Xcode Cloud release binding 결과가 불완전합니다." >&2
  exit 1
fi

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY_RUN resolved marketing=${marketing} build=${build} tag=${RELEASE_TAG}"
  exit 0
fi

(
  cd "$REPO"
  SEORI_RELEASE_TAG="$RELEASE_TAG" \
  SEORI_RELEASE_VERSION="$marketing" \
  SEORI_RELEASE_VERSION_CODE="$build" \
  SEORI_RELEASE_SOURCE_SHA="$source_sha" \
    node scripts/write-release-info.mjs
)

echo "중앙 태그 버전 적용 완료: ${marketing} (${build})"
