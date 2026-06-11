# i18n 계획

## 목표

`행복 농장 타이쿤`은 `ko-KR`을 기본 언어로 유지하고, 1차 i18n 범위에서 `en-US`를 추가한다.

대상은 앱 UI 문구만이 아니다. 작물/구역 이름, 광고 제한 사유, 금액/시간 포맷, 스토어 등록 문구, 릴리스 노트, 스크린샷까지 같은 i18n 범위로 관리한다.

## 현재 전제

- `apps/mobile`은 `apps/ait/src/farm/FarmGame.tsx`를 공유 화면으로 사용한다.
- `apps/ait`는 AppsInToss, `apps/mobile`은 Google Play/App Store 대상이다.
- `packages/farm-core`는 플랫폼 중립 게임 로직이다.
- `packages/farm-core`에는 React Native, AppsInToss, Firebase, Google, Apple SDK를 import하지 않는다.
- Google Play/App Store의 기본 언어는 현재 `ko-KR`이다.

## 원칙

- 새 사용자-facing 문자열은 코드에 직접 박지 않고 locale catalog에 추가한다.
- analytics event name, storage key, crop key, area key, config key는 번역하지 않는다.
- 저장 데이터에는 locale 문자열을 저장하지 않고 stable key만 저장한다.
- `packages/farm-core`는 locale-aware formatter와 label lookup만 제공하고, locale 감지/저장은 앱 shell에서 처리한다.
- `apps/ait`와 `apps/mobile`은 locale 감지, 사용자 선택 저장, platform-specific fallback만 담당한다.
- 스토어 등록 문구, 릴리스 노트, screenshot text가 바뀌는 변경은 i18n 영향 변경으로 본다.

## 목표 구조

```text
packages/farm-core/src/i18n/
  locales.ts          # SupportedLocale, DEFAULT_LOCALE
  labels.ko-KR.ts     # crop/area/core label
  labels.en-US.ts
  formatters.ts       # money, duration, count, percent

apps/ait/src/farm/i18n/
  messages.ko-KR.ts   # FarmGame UI text
  messages.en-US.ts
  index.ts            # typed t helper
```

AIT build가 pnpm workspace bare package import에 민감하므로, 현재 방식처럼 상대 경로 import를 유지한다.

## 1차 범위

1. `ko-KR`, `en-US`를 `SupportedLocale`로 고정한다.
2. `FarmGame.tsx`의 화면 문구, toast, sheet title/description, button label, accessibility label을 catalog로 이동한다.
3. `balance.json`의 crop/area 표시 이름과 설명은 stable key 기반 locale label로 분리한다.
4. `formatMoney`, duration formatter, reward limit reason을 locale-aware 함수로 바꾼다.
5. `FarmGameSettings`에 사용자 선택 locale을 추가한다. 저장된 locale 값이 없으면 shell에서 감지한 preferred locale을 쓰고, 감지값이 없으면 `ko-KR`을 fallback으로 쓴다.
6. `apps/mobile`, `apps/ait`에서 동일한 locale 값을 `FarmGame`에 주입한다.
7. Play/App Store/AppsInToss 문서와 config에 `en-US` store listing을 정식으로 추가한다.
8. 영어 UI 기준 screenshot 재생성은 앱 UI i18n 적용 뒤 release-assets 작업으로 진행한다.

## 제외 범위

1차에서는 다음을 하지 않는다.

- 자동 번역 API 연동
- runtime 원격 번역 다운로드
- Firebase Remote Config를 번역 source of truth로 사용
- `react-i18next` 같은 앱 전역 i18n 라이브러리를 core에 직접 결합
- save migration에서 기존 crop/area key를 locale 문자열로 바꾸기

## 변경 시 체크리스트

새 기능, UI 수정, 밸런스 수정, 스토어 문구 수정 시 다음을 확인한다.

- 새 사용자-facing 문자열을 locale catalog에 추가했는가?
- `ko-KR`과 `en-US`가 모두 채워졌는가?
- crop/area 이름, 설명, unlock 조건, 광고 제한 사유처럼 core에서 만들어지는 문구가 locale-aware인가?
- 테스트가 특정 한국어 문자열에 과도하게 고정되어 있지 않은가?
- 긴 `en-US` 문구가 버튼, bottom sheet, tool strip, one-line text에서 넘치지 않는가?
- store listing, release note, screenshot text에 영향이 있으면 `play-store`, `app-store`, `docs/apps-in-toss-registration.md`를 함께 갱신했는가?
- locale 선택이 저장 데이터와 분리되어 기존 save를 깨지 않는가?

## 자동화 방향

현재 다음 검사를 추가했다.

- `pnpm check:i18n`: source에서 허용되지 않은 hardcoded 한글 UI 문자열 탐지
- locale key coverage test: `ko-KR`과 `en-US`의 key set 일치 확인
- formatter test: `formatMoney`, duration, ad limit reason이 locale별 expectation을 만족하는지 확인
- store config test: Play/App Store locale map에 필수 locale이 있는지 확인

`pnpm check:i18n`은 현재 `FarmGame.tsx`, `apps/ait/src/farm/components/*`(SheetParts, CollectionSheet, AchievementsSheet, LabSheet, ChainMapSheet), `packages/farm-core/src`의 로직 모듈(constants, types, harvest, mastery, modifiers, achievements, prestige, research)의 한글 하드코딩과 Play/App Store 필수 locale map을 검사한다. locale catalog의 key set 일치는 TypeScript typecheck가 잡는다.

## 엔드게임 시스템 라벨 카탈로그

엔드게임 4종 시스템(마스터리/변이, 업적/칭호, 연구/교배, 개척/체인)의 라벨은 전부 `packages/farm-core/src/i18n/labels.ts`에 있다.

- crop label: 교배 신품종 12종 포함 (`satisfies Record<CropKey, …>`로 누락 시 컴파일 에러)
- area label: `hybrid_greenhouse` 포함
- `getMasteryRankLabel`, `getMutationLabel`, `getResearchNodeLabel`, `getRegionArchetypeLabel`, `getPrestigeSkillLabel`, `getAchievementTrackLabel`, `getTitleLabel`
- 시트 문구/토스트는 `apps/ait/src/farm/i18n/index.ts`의 `FarmMessages`에 ko/en 동시 정의

## 검증 명령

1차 구현 후 최소 검증은 다음이다.

```bash
pnpm exec jest packages/farm-core --runInBand
pnpm exec jest apps/ait --runInBand
pnpm --dir apps/mobile exec jest --runInBand
pnpm lint
pnpm typecheck
pnpm check:play -- --json
pnpm check:app-store -- --json
```

영어 UI는 실기기 또는 screenshot QA에서 별도로 확인한다.

## Screenshot QA 상태

- App Store iPhone 6.9형, iPhone 6.5형, iPad 13형 screenshot은 `en_US` 시뮬레이터에서 실제 앱 화면으로 재생성했다.
- iPhone 6.5형 screenshot은 6.9형 실캡처를 App Store 요구 크기인 `1284x2778`로 리사이즈/크롭했다.
- Play Store screenshot은 기존 자산이 마케팅형 이미지이므로 별도 영문화 작업이 필요하다. Android 디바이스/AVD가 준비되면 실제 Android 영문 화면 캡처로 교체한다.
