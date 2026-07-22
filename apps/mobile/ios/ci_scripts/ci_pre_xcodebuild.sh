#!/bin/sh

# Xcode Cloud — archive 직전 iOS 마케팅/빌드 버전 주입.
#
# 정책(#364): 어떤 트리거로 만든 빌드든 프로젝트 기본값(project.pbxproj의
# MARKETING_VERSION)이 그대로 아카이브·업로드되지 않도록 한다. 기본값이 스토어의
# 기존 버전 train보다 낮으면(예: 1.0) TestFlight 업로드가 거부되거나, 더 나쁘게는
# 구버전 표기(app_version=1.0)로 심사에 나가 신규 유저가 구버전 빌드를 받게 된다.
#
# 버전 소스:
#   1) CI_TAG(vX.Y.Z) 트리거 빌드 → 그 태그로 산출.
#   2) CI_TAG 부재(브랜치/검증 빌드) → 저장소의 "가장 최근 릴리즈 태그"로 폴백 주입.
#   3) 태그를 전혀 결정할 수 없으면 → 비-제로 종료(archive 차단). 기본값 아카이브 금지.
# 산출은 scripts/resolve-release-version.mjs 로 marketing/build number를 계산한다
# (GitHub Actions 배포 경로와 동일 로직 재사용). node 는 ci_post_clone 에서 설치됨.
#
# 검증: CI_PRE_XCODEBUILD_DRY_RUN=1 로 실행하면 agvtool 없이 산출 버전만 출력한다
# (CI_TAG 유/무 두 경로를 로컬/CI에서 안전하게 확인 — scripts/__tests__ 에서 사용).

set -e

# resolver 스크립트는 이 스크립트 위치 기준으로 찾는다(ci_scripts 는 항상
# <repo>/apps/mobile/ios/ci_scripts 에 있으므로 4단계 상위가 저장소 루트).
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../../../.." && pwd)"
RESOLVER="${REPO_ROOT}/scripts/resolve-release-version.mjs"
# agvtool 대상·git 폴백 대상은 Xcode Cloud 체크아웃 루트. 로컬/테스트에서는 저장소 루트.
REPO="${CI_PRIMARY_REPOSITORY_PATH:-${REPO_ROOT}}"

RELEASE_TAG="${CI_TAG}"
if [ -z "${RELEASE_TAG}" ]; then
  echo "▸ CI_TAG 없음 — 최신 릴리즈 태그로 폴백 버전 주입 시도(기본값 아카이브 차단)"
  RELEASE_TAG="$(git -C "${REPO}" describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' 2>/dev/null || true)"
  if [ -z "${RELEASE_TAG}" ]; then
    echo "  최신 릴리즈 태그를 결정할 수 없어 버전 주입 불가 — 기본값 아카이브를 막기 위해 실패 처리" >&2
    exit 1
  fi
  echo "  폴백 태그=${RELEASE_TAG}"
fi

echo "▸ 릴리즈 버전 산출 (tag=${RELEASE_TAG})"
OUTFILE="$(mktemp)"
GITHUB_OUTPUT="${OUTFILE}" RELEASE_TAG="${RELEASE_TAG}" \
  node "${RESOLVER}" --github-output --quiet

MARKETING="$(grep '^apple_marketing_version=' "${OUTFILE}" | cut -d= -f2)"
BUILD="$(grep '^apple_build_number=' "${OUTFILE}" | cut -d= -f2)"

if [ -z "${MARKETING}" ] || [ -z "${BUILD}" ]; then
  echo "  릴리즈 버전 산출 실패 (tag=${RELEASE_TAG})" >&2
  exit 1
fi

echo "  marketing=${MARKETING} build=${BUILD}"

if [ "${CI_PRE_XCODEBUILD_DRY_RUN}" = "1" ]; then
  # 검증용: 실제 프로젝트를 수정하지 않고 산출 결과만 남긴다.
  echo "DRY_RUN resolved marketing=${MARKETING} build=${BUILD} tag=${RELEASE_TAG}"
  exit 0
fi

cd "${REPO}/apps/mobile/ios"
agvtool new-marketing-version "${MARKETING}"
agvtool new-version -all "${BUILD}"
echo "✅ 버전 설정 완료: ${MARKETING} (${BUILD})"
