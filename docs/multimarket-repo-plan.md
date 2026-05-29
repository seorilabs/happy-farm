# React Native 멀티마켓 repo 전환 계획

## 현재 상태

현재 저장소는 멀티마켓 모노레포 전환 1차 구조에 진입했습니다.

- `pnpm build`는 `apps/ait`의 AppsInToss `.ait` 산출물을 만듭니다.
- `pnpm build:android`는 `apps/mobile`의 Android App Bundle을 만듭니다.
- `apps/ait/granite.config.ts`와 `apps/ait/src/_app.tsx`는 AppsInToss/TDS 런타임에 묶여 있습니다.
- `packages/farm-core`는 플랫폼 중립 게임 밸런스/타입/analytics 이벤트 정의를 담습니다.
- `apps/mobile/android`, `apps/mobile/ios` 표준 React Native 네이티브 프로젝트가 있습니다.
- Google Play용 `applicationId`는 `com.seorilabs.happyfarm`입니다.
- `apps/mobile`은 아직 전체 게임 UI/저장소/광고 adapter 포팅 전인 Android/iOS shell입니다.

따라서 repo를 새로 나누기보다, 이 저장소를 멀티마켓 모노레포로 승격합니다.

## 목표 구조

최종 목표는 다음 구조입니다.

```text
happy-farm/
  apps/
    ait/             # AppsInToss Granite RN 앱
    mobile/          # Android/iOS 표준 React Native 앱
  packages/
    farm-core/       # 플랫폼 중립 게임 상태/밸런스/저장 데이터 migration
```

Android와 iOS는 별도 앱 폴더로 쪼개지 않고 `apps/mobile`의 네이티브 타깃으로 관리합니다.

## 1차 전환 범위

공유 가능한 core를 먼저 분리하고, 현재 AIT 앱을 `apps/ait`로 이동해 계속 빌드되는 상태를 유지합니다.

1차 이동 완료 대상:

- `packages/farm-core/src/balance.json`
- `packages/farm-core/src/types.ts`
- `packages/farm-core/src/constants.ts`
- `packages/farm-core/src/analytics.ts`
- `packages/farm-core/src/__tests__/constants.test.ts`

앱 타깃에 남길 대상:

- `apps/ait/src/farm/FarmGame.tsx`
- `apps/ait/src/farm/persistence.ts`
- `apps/ait/src/farm/platform/*`
- `apps/ait/src/_app.tsx`
- `apps/ait/src/pages/index.tsx`
- `apps/ait/pages/*`
- `apps/ait/granite.config.ts`

## 플랫폼 adapter 경계

공유 core는 React Native, AppsInToss, TDS, 광고 SDK, native module을 import하지 않습니다.

앱 타깃별로 구현할 adapter:

- 저장소: AppsInToss `Storage`, 모바일 native storage
- 광고: AppsInToss fullscreen ad, 모바일 광고 SDK 또는 no-op
- analytics: 현재 no-op wrapper, 이후 플랫폼별 SDK
- UI feedback: TDS toast, native toast/snackbar

## 단계

1. `packages/farm-core` 생성
2. 밸런스/타입/상태 계산/migration을 core로 이동
3. 현재 AIT 앱이 `packages/farm-core`를 import하도록 변경
4. core 테스트를 package-local 테스트로 이동하거나 root Jest에서 계속 실행되게 연결
5. root scripts에 `check:core`, `check:ait` 추가
6. AIT 앱 파일을 `apps/ait`로 이동
7. 표준 RN `apps/mobile` 생성 후 Android/iOS 빌드 추가
8. Google Play/App Store/AppsInToss release guide와 CI를 target별로 분리

## 성공 기준

1차 전환 완료 기준:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm check:play`는 기존 blocker를 유지하면서 core 분리로 인한 새 오류가 없어야 함

`pnpm check:play`가 실패하는 것은 아직 정상입니다. Android 네이티브 프로젝트와 `.aab`는 생겼지만, release signing과 Play 등록값/이미지 blocker가 남아 있습니다.

## 진행 기록

- `packages/farm-core`를 생성했습니다.
- `balance.json`, `types.ts`, `constants.ts`, `analytics.ts`와 core 테스트를 `packages/farm-core/src`로 이동했습니다.
- AIT 앱 파일을 `apps/ait`로 이동했습니다.
- 현재 `apps/ait`는 `packages/farm-core/src`를 상대 경로로 import합니다.
- `apps/ait/src/farm/persistence.ts`에 저장소 factory를 만들고, `apps/ait/src/farm/platform/appsInTossStorage.ts`에 AppsInToss Storage adapter를 분리했습니다.
- `apps/ait/src/farm/platform/fullScreenAd.ts`에 AppsInToss 전면/보상형 광고 hook을 분리했습니다.
- `apps/ait/src/farm/platform/analytics.ts`에서 `createFarmAnalytics()`로 앱 타깃별 analytics adapter를 만들 수 있게 했습니다.
- `apps/mobile` 표준 React Native 0.85 Android/iOS 타깃을 생성했습니다.
- `apps/mobile`은 `packages/farm-core/src`를 import하는 Android/iOS shell로 시작합니다.
- `pnpm build:android`로 `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`를 생성했습니다.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm check:core`, `pnpm check:ait`가 통과했습니다.

## AIT workspace dependency 주의

현재 `ait build`의 package version 수집 단계는 pnpm workspace symlink로 연결된 bare package dependency를 처리하지 못합니다. 따라서 `apps/ait`는 `@happy-farm/farm-core`를 `package.json.dependencies`에 넣지 않고 상대 경로로 `packages/farm-core/src`를 import합니다.

나중에 `apps/ait` 또는 `apps/mobile`의 번들러가 workspace dependency를 정상 처리하는지 확인한 뒤 bare package import로 전환합니다.

## RN 0.85 pnpm workspace 주의

`apps/mobile`은 pnpm symlink 환경에서 RN Gradle/Metro가 직접 찾는 패키지를 명시해야 합니다.

- `@react-native/gradle-plugin`
- `@react-native/codegen`
- `hermes-compiler` 경로를 Node resolution으로 찾아 `react.hermesCommand`에 지정
- Metro `watchFolders`를 workspace root로 잡고 symlink resolution을 켬
