# Xcode Cloud ci_scripts

Xcode Cloud가 빌드 각 단계에서 자동 실행하는 훅 스크립트 모음.

- `ci_post_clone.sh` — 클론 직후 의존성/툴체인(node 등) 준비.
- `ci_pre_xcodebuild.sh` — **archive 직전 iOS 버전 주입**.

## 버전 주입 정책 (#364)

App Store에 **구버전 표기(예: `app_version=1.0`) 빌드가 나가는 것을 원천 차단**한다.
`project.pbxproj`의 `MARKETING_VERSION` 기본값이 그대로 아카이브되면 스토어의 기존 버전
train과 충돌해 TestFlight 업로드가 거부되거나, 심사에 구버전으로 나가 신규 유저가 온보딩·
리텐션 수정이 빠진 빌드를 받게 된다(해당 코호트 잔존 측정도 오염).

`ci_pre_xcodebuild.sh`가 버전을 결정하는 순서:

1. **`CI_TAG`(vX.Y.Z) 트리거 빌드** → 그 태그로 `scripts/resolve-release-version.mjs`가
   `CFBundleShortVersionString`(marketing) / `CFBundleVersion`(build number)을 산출해 주입.
2. **`CI_TAG` 부재(브랜치/검증 빌드)** → `git describe --tags --abbrev=0`로 찾은 **가장 최근
   릴리즈 태그**로 폴백 주입.
3. **태그를 전혀 결정할 수 없음** → **비-제로 종료**로 archive를 실패시킨다. 어떤 경우에도
   `MARKETING_VERSION` 기본값이 그대로 아카이브되지 않는다.

방어선 2중화: `project.pbxproj`의 `MARKETING_VERSION` 기본값도 `1.0`이 아닌 현행 릴리즈
버전(`app-store/app-store.config.json`의 `version.versionNumber`와 일치)으로 유지한다.
단, **최종 아카이브 버전의 authoritative 소스는 항상 릴리즈 태그**이며 위 스크립트가 빌드
시점에 주입한다. pbxproj 기본값은 스크립트가 없거나 우회된 경우의 보조 방어선일 뿐이다.

GitHub Actions 배포 경로(`.github/workflows/deploy-app-store.yml`)는 이미
`MARKETING_VERSION`을 명시 주입 + 아카이브 검증(태그 없으면 실패)으로 안전하다. 이
스크립트는 Xcode Cloud 경로에 동일한 안전장치를 맞춘다.

### 로컬/CI 검증 (dry-run)

`agvtool`(macOS 전용) 없이 산출 버전만 확인:

```sh
# CI_TAG 경로
CI_TAG=v1.7.0 CI_PRE_XCODEBUILD_DRY_RUN=1 sh apps/mobile/ios/ci_scripts/ci_pre_xcodebuild.sh
# 폴백/실패 경로 (CI_TAG 없음)
CI_PRE_XCODEBUILD_DRY_RUN=1 sh apps/mobile/ios/ci_scripts/ci_pre_xcodebuild.sh
```

두 경로(태그 유/무)는 `scripts/__tests__/ci-pre-xcodebuild.test.ts`에서 자동 검증한다.
