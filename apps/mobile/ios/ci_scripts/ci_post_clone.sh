#!/bin/sh

# Xcode Cloud — happy-farm(React Native 모노레포) iOS 빌드 사전 준비.
#
# 이 스크립트는 반드시 .xcworkspace 와 같은 디렉터리(apps/mobile/ios/ci_scripts/)에
# 있어야 하며, Xcode Cloud 가 저장소 클론 직후 자동 실행한다. Xcode Cloud 환경에는
# Node/pnpm/CocoaPods 가 기본 제공되지 않으므로 여기서 설치하고 JS 의존성 + Pods 를
# 구성한다. 코드 서명은 Xcode Cloud 매니지드 서명이 처리하므로 여기서 다루지 않는다.
#
# 필요 환경변수(Xcode Cloud 워크플로의 시크릿):
#   FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64 — (선택) GoogleService-Info.plist(base64).
#     미설정 시 저장소에 커밋된 GoogleService-Info.plist 를 사용한다.

set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

REPO="${CI_PRIMARY_REPOSITORY_PATH}"
MOBILE="${REPO}/apps/mobile"
IOS="${MOBILE}/ios"

# CI_POST_CLONE_DRY_RUN=1 이면 macOS 전용 외부 명령(brew/npm/pnpm/pod)을 실행하지 않고
# 실행했을 명령만 찍는다. 스크립트 자체 로직(인증 구성, 순서, 가드)을 다른 OS 에서도
# 테스트할 수 있게 하기 위함이다 — ci_pre_xcodebuild.sh 의 dry-run 과 같은 관례(#364).
run_step() {
  if [ -n "${CI_POST_CLONE_DRY_RUN}" ]; then
    echo "dry-run: skipped: $*"
    return 0
  fi
  "$@"
}

echo "▸ Node / CocoaPods 설치 (Homebrew)"
run_step brew install node cocoapods

echo "▸ pnpm 설치 (저장소 핀 버전)"
# Homebrew node 는 최신 버전에서 corepack 을 번들하지 않으므로 npm 으로 직접 설치한다.
run_step npm install -g pnpm@11.3.0

echo "▸ JS 의존성 설치 (pnpm workspace — 저장소 루트)"
cd "${REPO}"
run_step pnpm install --frozen-lockfile

echo "▸ Firebase iOS 설정 확인 (GoogleService-Info.plist)"
GS_PLIST="${IOS}/HappyFarmMobile/GoogleService-Info.plist"
if [ -n "${FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64}" ]; then
  # 시크릿이 설정돼 있으면 우선 사용(저장소 커밋본을 덮어씀).
  printf '%s' "${FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64}" | base64 --decode > "${GS_PLIST}"
  plutil -lint "${GS_PLIST}"
  echo "  시크릿에서 복원"
elif [ -f "${GS_PLIST}" ]; then
  echo "  저장소 커밋본 사용"
else
  echo "  경고: GoogleService-Info.plist 없음(시크릿 미설정 + 미커밋)" >&2
fi

echo "▸ CocoaPods 설치 (use_frameworks + RNFB 혼합 링키지)"
cd "${IOS}"
run_step pod install

echo "✅ ci_post_clone 완료"
