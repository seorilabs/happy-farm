# Xcode Cloud ci_scripts

Xcode Cloud가 빌드 각 단계에서 자동 실행하는 훅 스크립트 모음.

- `ci_post_clone.sh` — 클론 직후 의존성/툴체인(node 등) 준비.
- `ci_pre_xcodebuild.sh` — **archive 직전 iOS 버전 주입**.

## 버전 주입 정책 (#364)

App Store에 **구버전 표기(예: `app_version=1.0`) 빌드가 나가는 것을 원천 차단**한다.
`project.pbxproj`의 `MARKETING_VERSION` 기본값이 그대로 아카이브되면 스토어의 기존 버전
train과 충돌해 TestFlight 업로드가 거부되거나, 심사에 구버전으로 나가 신규 유저가 온보딩·
리텐션 수정이 빠진 빌드를 받게 된다(해당 코호트 잔존 측정도 오염).

`ci_pre_xcodebuild.sh`는 `CI_TAG=vX.Y.Z`가 있는 exact tag archive만 허용한다. 브랜치 빌드에서
최신 태그를 추측하지 않으며 `CI_TAG`가 없으면 비-제로 종료한다. 버전 계산기는 앱 저장소에 두지
않는다. 불변 중앙 commit `8a11a145fed35479a4a89ebc7ca97edd0a0f05fd`의
`xcode-cloud-apply-tag-version.mjs`와 `tag-version-authority.mjs`를 내려받아 각각 SHA-256 checksum을
검증한 뒤 `CFBundleShortVersionString`, `CFBundleVersion`과 런타임 `RELEASE_INFO`에 확정값만 투영한다.

`project.pbxproj`의 값은 개발 기본값일 뿐 release authority가 아니다. 위 스크립트가 실행되지
않거나 exact tag binding을 검증하지 못하면 archive 자체를 실패시킨다.

Backoffice 의 ASC 트리거 경로도 같은 중앙 reusable resolver의
exact tag binding을 사용한다. 이 스크립트는 Xcode Cloud 경로에 같은 정본을 적용한다.

### 로컬/CI 검증 (dry-run)

`agvtool`(macOS 전용) 없이 산출 버전만 확인:

```sh
# CI_TAG 경로
CI_TAG=v1.7.0 CI_PRE_XCODEBUILD_DRY_RUN=1 sh apps/mobile/ios/ci_scripts/ci_pre_xcodebuild.sh
# 실패 경로 (CI_TAG 없음)
CI_PRE_XCODEBUILD_DRY_RUN=1 sh apps/mobile/ios/ci_scripts/ci_pre_xcodebuild.sh
```

테스트는 네트워크 대신 dry-run 전용 중앙 helper fixture를 사용하며, production 경로의 exact SHA와
두 checksum 고정을 함께 검증한다.
