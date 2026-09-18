# happy-farm

AppsInToss Granite React Native 버전의 `행복한 농장 타이쿤`입니다. 현재 repo는 멀티마켓 출시를 위해 `apps/ait`, `apps/mobile`, `packages/farm-core`를 둔 pnpm workspace 구조입니다.

## 구현 범위

- `apps/ait`에서 `farm-game`의 WebView 게임을 React Native 화면으로 재작성했습니다.
- `apps/mobile`에 Google Play/App Store용 표준 React Native Android/iOS 타깃을 추가했습니다.
- `packages/farm-core`에 원본의 `balance.json`, 작물/구역/광고 제한/업그레이드 경제 로직을 분리했습니다.
- AIT 타깃은 AppsInToss 네이티브 `Storage`로 저장/불러오기/초기화를 처리합니다.
- 전면/보상형 광고 호출은 `loadFullScreenAd`/`showFullScreenAd` 흐름으로 포팅했습니다. 보상형·전면형 광고 그룹 ID는 모두 `apps/ait/src/pages/index.tsx`의 상수입니다.

## 명령어

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm check:core
pnpm check:ait
pnpm check:mobile
pnpm check:i18n
pnpm build
pnpm build:android
pnpm check:play
```

## i18n

i18n 계획과 변경 지침은 `docs/i18n-plan.md`를 기준으로 관리합니다. 새 사용자-facing 문자열은 locale catalog에 추가하고, `ko-KR`과 `en-US`를 함께 갱신합니다.

## 브랜치/배포 전략

- `develop`: 기본 작업 브랜치입니다. `main`을 제외한 push에서 CI가 `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`를 실행합니다.
- `main`: 릴리스/배포 브랜치입니다. `develop -> main` PR 병합으로 push가 발생하면 AppsInToss 배포 워크플로가 실행됩니다.
- 배포 워크플로는 동일한 검증을 다시 실행한 뒤 `.ait` 파일을 업로드하고 `pnpm deploy`를 실행합니다.
- 배포에는 GitHub Actions secret `APPS_IN_TOSS_API_KEY`가 필요합니다.
- 배포 성공 후 `happy-farm-release-<run-number>` 형식의 릴리즈 태그를 생성합니다. 수동 실행 시 태그 생성을 끌 수 있습니다.

## 샌드박스 URL

```text
intoss://happy-farm/
```

## 출시 전 차단 사항

- `apps/ait/granite.config.ts`의 `brand.icon`은 승인된 AppsInToss 콘솔 로고 URL로 설정했습니다.
- 공용 게임 컴포넌트는 `packages/farm-ui/src/FarmGame.tsx`이며, AppsInToss 광고 그룹 ID는 `apps/ait/src/pages/index.tsx`의 상수입니다. 보상형·전면형 모두 발급 완료했습니다. AIT 콘솔에 공개된 전면 지면은 복귀(welcome-back) 하나뿐이라 진행 마일스톤 지면은 닫아 두었고, 켜려면 해당 지면의 정책·빈도 승인을 먼저 받아야 합니다.
- **모바일 전면광고 ad unit이 아직 비어 있습니다.** `apps/mobile/src/ads/config.ts`의 `PRODUCTION_INTERSTITIAL_AD_UNIT_IDS`에 AdMob 콘솔에서 만든 Android/iOS 전면 unit ID를 채워야 프로덕션에서 노출됩니다. 비어 있는 동안에는 지면이 켜져 있어도 컨트롤러가 미지원으로 동작해 노출되지 않습니다. debug 빌드는 `TestIds.INTERSTITIAL`을 씁니다.
- Google Play package name은 `com.seorilabs.happyfarm`으로 확정했습니다.
- 고객지원 이메일은 `cs@seorilabs.com`, 개인정보 처리방침은 `https://www.seorilabs.com/privacy`로 확정했습니다.
- Google Play 광고 포함 여부와 한국 게임 배포 선언은 `yes`로 확정했습니다.
- 콘텐츠 등급, 타겟 연령, 데이터 보안, 스크린샷/썸네일은 확정 필요입니다.

## Google Play 출시 준비

현재 이 저장소는 `apps/mobile`에서 upload key로 서명된 Android App Bundle을 생성할 수 있습니다. 키 파일과 `key.properties`는 gitignore 대상입니다.

```bash
pnpm build:android
pnpm check:play
```

상세 절차와 현재 blocker는 `docs/google-play-release.md`를 기준으로 관리합니다.
