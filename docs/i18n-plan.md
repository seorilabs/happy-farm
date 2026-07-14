# i18n 계획

## 목표

`행복 농장 타이쿤`은 `ko-KR`을 기본 언어로 유지하고, 전 세계 론칭을 위해 다음 8개 로케일을 지원한다.

- `ko-KR`(기본), `en-US`, `ja`(일본어), `zh-Hans`(중국어 간체), `zh-Hant`(중국어 번체), `de`(독일어), `fr`(프랑스어), `es`(스페인어)

대상은 앱 UI 문구만이 아니다. 작물/구역 이름, 광고 제한 사유, 금액/시간 포맷, 스토어 등록 문구, 릴리스 노트, 스크린샷까지 같은 i18n 범위로 관리한다.

## 현재 전제

- `apps/mobile`과 `apps/ait`는 `packages/farm-ui/src/FarmGame.tsx`를 공유 화면으로 사용한다.
- `apps/ait`는 AppsInToss, `apps/mobile`은 Google Play/App Store 대상이다.
- `packages/farm-core`는 플랫폼 중립 게임 로직이다.
- `packages/farm-core`에는 React Native, AppsInToss, Firebase, Google, Apple SDK를 import하지 않는다.
- `packages/farm-ui`에는 RN 공유 화면과 UI 문구 catalog만 두고, AppsInToss/Firebase/AdMob/AsyncStorage 같은 market adapter SDK를 import하지 않는다.
- Google Play/App Store의 기본 언어는 현재 `ko-KR`이다.

## 원칙

- 새 사용자-facing 문자열은 코드에 직접 박지 않고 locale catalog에 추가한다.
- analytics event name, storage key, crop key, area key, config key는 번역하지 않는다.
- 저장 데이터에는 locale 문자열을 저장하지 않고 stable key만 저장한다.
- `packages/farm-core`는 locale-aware formatter와 label lookup만 제공하고, locale 감지/저장은 앱 shell에서 처리한다.
- `apps/ait`와 `apps/mobile`은 locale 감지, 사용자 선택 저장, platform-specific fallback만 담당한다.
- 스토어 등록 문구, 릴리스 노트, screenshot text가 바뀌는 변경은 i18n 영향 변경으로 본다.

## 목표 구조

로케일별 카탈로그는 파일로 분리하고, 조립점(`labels.ts`, `i18n/index.ts`)이 이를 모아
`Record<SupportedLocale, …>`로 조립한다. 새 로케일 추가는 파일 하나 + 조립점 한 줄이면 된다.

```text
packages/farm-core/src/i18n/
  locales.ts          # SupportedLocale, DEFAULT_LOCALE, normalizeLocale, LOCALE_ENDONYMS
  formatters.ts       # money(로케일별 단위), duration, remaining, percent, hourly gold
  messages.ts         # core 메시지(요구조건/광고 제한 사유) 전 로케일
  dailyBonusMessages.ts
  labels/
    types.ts          # CropLabel/AreaLabel/… + LabelBundle 타입
    ko-KR.ts en-US.ts ja.ts zh-Hans.ts zh-Hant.ts de.ts fr.ts es.ts
  labels.ts           # LabelBundle 조립 + get*Label 헬퍼

packages/farm-ui/src/i18n/
  messages/
    ko-KR.ts          # FarmMessages 타입 원본(typeof koFarmMessages)
    en-US.ts ja.ts zh-Hans.ts zh-Hant.ts de.ts fr.ts es.ts
  index.ts            # detectRuntimeLocale, getFarmMessages, FARM_MESSAGES 조립
```

- `LabelBundle`/`FarmMessages` 타입이 각 로케일의 key 커버리지를 컴파일 타임에 강제한다(누락 시 타입 에러).
- 언어 선택 UI는 `LOCALE_ENDONYMS`(각 언어의 자기 이름)로 노출하므로, 언어를 추가해도 picker는 자동 반영된다.
- AIT build가 pnpm workspace bare package import에 민감하므로, 로케일 파일도 현재 방식처럼 상대 경로 import만 사용한다.

## 로케일별 포맷 규칙

- 금액: `ko-KR`은 만/억/조, `ja`는 万/億/兆, `zh-Hans`/`zh-Hant`는 万(萬)/亿(億)/兆, `en-US`·`de`·`fr`·`es`는 방치형 관용 축약(K/M/B/T…)을 쓴다.
- 시간: 초/분/시간 접미사를 로케일별로 둔다(`formatters.ts`의 `DURATION_LABELS`).

## 초기 범위

1. 위 8개 로케일을 `SupportedLocale`로 고정한다.
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
- 지원 로케일 8종(`ko-KR`, `en-US`, `ja`, `zh-Hans`, `zh-Hant`, `de`, `fr`, `es`)이 모두 채워졌는가?
- crop/area 이름, 설명, unlock 조건, 광고 제한 사유처럼 core에서 만들어지는 문구가 locale-aware인가?
- 테스트가 특정 한국어 문자열에 과도하게 고정되어 있지 않은가?
- 긴 `en-US` 문구가 버튼, bottom sheet, tool strip, one-line text에서 넘치지 않는가?
- store listing, release note, screenshot text에 영향이 있으면 `play-store`, `app-store`, `docs/apps-in-toss-registration.md`를 함께 갱신했는가?
- locale 선택이 저장 데이터와 분리되어 기존 save를 깨지 않는가?

## 자동화 방향

현재 다음 검사를 추가했다.

- `pnpm check:i18n`: source에서 허용되지 않은 hardcoded 한글 UI 문자열 탐지 + Play/App Store 스토어 문구가 지원 로케일 8종에 모두 존재하는지 확인
- locale key coverage test: 지원 로케일 전체의 key set 일치 확인
- formatter test: `formatMoney`, duration, ad limit reason이 locale별 expectation을 만족하는지 확인
- store config test: Play/App Store locale map에 필수 locale이 있는지 확인

`pnpm check:i18n`의 한글 하드코딩 스캔은 고정 파일 목록이 아니라 소스 루트(`packages/farm-ui/src`, `packages/farm-core/src`, `apps/ait/src`, `apps/mobile/src`) 재귀 탐색으로 대상을 수집한다(`scripts/lib/i18n-scan-targets.js`). 새 컴포넌트/모듈은 추가되는 즉시 검사 대상이 되므로, 검사망에서 파일이 빠지는 일이 구조적으로 없다. i18n catalog 디렉터리, 테스트(`__tests__`, `*.test.*`, `*.spec.*`), 타입 선언(`*.d.ts`)만 제외한다.

또한 Play/App Store 필수 locale map 존재 검사에 더해, 마켓별 스토어 문구 글자수 제한(`scripts/lib/store-text-limits.js` — Play: 앱 이름 30/간단한 설명 80/자세한 설명 4000/출시 노트 500, App Store: 이름 30/부제 30/프로모션 텍스트 170/설명 4000/키워드 100/새로운 기능 4000)을 초과하면 실패한다. locale catalog의 key set 일치와 플레이스홀더(메시지 함수 시그니처) 정합은 typed catalog 구조상 TypeScript typecheck가 잡는다.

## 엔드게임 시스템 라벨 카탈로그

엔드게임 4종 시스템(마스터리/변이, 업적/칭호, 연구/교배, 개척/체인)의 라벨은 전부 `packages/farm-core/src/i18n/labels.ts`에 있다.

- crop label: 교배 신품종 12종 포함 (`satisfies Record<CropKey, …>`로 누락 시 컴파일 에러)
- area label: `hybrid_greenhouse` 포함
- `getMasteryRankLabel`, `getMutationLabel`, `getResearchNodeLabel`, `getRegionArchetypeLabel`, `getPrestigeSkillLabel`, `getAchievementTrackLabel`, `getTitleLabel`
- 시트 문구/토스트는 `packages/farm-ui/src/i18n/index.ts`의 `FarmMessages`에 ko/en 동시 정의

## 검증 명령

1차 구현 후 최소 검증은 다음이다.

```bash
pnpm exec jest packages/farm-core --runInBand
pnpm exec jest apps/ait --runInBand
pnpm --dir apps/mobile exec jest --runInBand
pnpm lint
pnpm typecheck
pnpm check:architecture
pnpm check:markets
pnpm check:play -- --json
pnpm check:app-store -- --json
```

영어 UI는 실기기 또는 screenshot QA에서 별도로 확인한다.

## Screenshot QA 상태

- App Store iPhone 6.9형, iPhone 6.5형, iPad 13형 screenshot은 `en_US` 시뮬레이터에서 실제 앱 화면으로 재생성했다.
- iPhone 6.5형 screenshot은 6.9형 실캡처를 App Store 요구 크기인 `1284x2778`로 리사이즈/크롭했다.
- Play Store screenshot은 기존 자산이 마케팅형 이미지이므로 별도 영문화 작업이 필요하다. Android 디바이스/AVD가 준비되면 실제 Android 영문 화면 캡처로 교체한다.
