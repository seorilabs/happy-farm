#!/bin/sh

# Xcode Cloud — happy-farm(React Native 모노레포) iOS 빌드 사전 준비.
#
# 이 스크립트는 반드시 .xcworkspace 와 같은 디렉터리(apps/mobile/ios/ci_scripts/)에
# 있어야 하며, Xcode Cloud 가 저장소 클론 직후 자동 실행한다. Xcode Cloud 환경에는
# Node/pnpm/CocoaPods 가 기본 제공되지 않으므로 여기서 설치하고 JS 의존성 + Pods 를
# 구성한다. 코드 서명은 Xcode Cloud 매니지드 서명이 처리하므로 여기서 다루지 않는다.
#
# 필요 환경변수(Xcode Cloud 워크플로의 시크릿):
#   GITHUB_PACKAGES_TOKEN — (필수) GitHub Packages read:packages 토큰. 저장소 .npmrc 가
#     @seorilabs 스코프를 npm.pkg.github.com 으로 보내므로 없으면 pnpm install 이 401 로 죽는다.
#   FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64 — (선택) GoogleService-Info.plist(base64).
#     미설정 시 저장소에 커밋된 GoogleService-Info.plist 를 사용한다.

set -e

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

REPO="${CI_PRIMARY_REPOSITORY_PATH}"
MOBILE="${REPO}/apps/mobile"
IOS="${MOBILE}/ios"

echo "▸ Node / CocoaPods 설치 (Homebrew)"
brew install node cocoapods

echo "▸ pnpm 설치 (저장소 핀 버전)"
# Homebrew node 는 최신 버전에서 corepack 을 번들하지 않으므로 npm 으로 직접 설치한다.
npm install -g pnpm@11.3.0

echo "▸ GitHub Packages 인증 (@seorilabs 비공개 패키지)"
# 저장소 .npmrc 는 @seorilabs 스코프를 npm.pkg.github.com 으로 보내지만 토큰은 담지 않는다.
# GitHub Actions 는 setup-pnpm-workspace 가 NODE_AUTH_TOKEN 을 넣어 주지만 Xcode Cloud 는
# 그 경로를 타지 않으므로 여기서 직접 넣어야 한다. 저장소 파일을 더럽히지 않도록 홈 npmrc 에만 쓴다.
if [ -z "${GITHUB_PACKAGES_TOKEN}" ]; then
  echo "❌ GITHUB_PACKAGES_TOKEN 이 없습니다. Xcode Cloud 워크플로의 환경변수(시크릿)로" >&2
  echo "   read:packages 스코프 토큰을 추가하세요. 없으면 pnpm install 이 401 로 실패합니다." >&2
  exit 1
fi
printf '//npm.pkg.github.com/:_authToken=%s\n' "${GITHUB_PACKAGES_TOKEN}" >> "${HOME}/.npmrc"

echo "▸ JS 의존성 설치 (pnpm workspace — 저장소 루트)"
cd "${REPO}"
pnpm install --frozen-lockfile

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
pod install

echo "✅ ci_post_clone 완료"
