# 설계: iOS 추적 없음 정렬과 Google 광고 동의 창 제거

- 설계 ID·버전: `2026-10-13-ios-no-tracking-consent` v2 (v1 승인 후 변경 절 추가)
- 상태: 승인
- 승인자·시각·근거·승인 커밋: v1은 저장소 소유자(Ilhwan Seo)가 2026-10-13 대화에서 "승인"으로 답했고, 승인 커밋은 `0a0967d5a54c8c4b8616b0deb2751ec3bb21009c`다. v2는 같은 날 대화에서 "앱 내 고지 + 정책 수정"을 선택한 것이 승인이며, 승인 커밋은 아래 "v2 변경" 절을 처음 담은 커밋이다.
- 관련: App Review 5.1.2(i) 거절(버전 1.12.0 / 빌드 1012000, 제출 `c383700a-8709-4915-be23-5c08c6fa2618`), 2026-10-13 대화에서 사용자가 "추적 안 함 + 동의 창 제거" 방향을 선택

## 목적·범위·근거

App Review가 1.12.0을 5.1.2(i)로 거절했다. 요지는 "쿠키를 수집하는 웹 콘텐츠가 있는데 ATT 없이 추적 데이터를 모은다"이다. 앱에는 WebView도 외부 링크도 없다. 심사자가 본 쿠키 창은 Google 광고 동의 창(UMP, IAB TCF)이다.

| 관찰 | 근거 |
|---|---|
| EEA·영국·스위스에서 농장 진입 시 Google 동의 창이 뜨고, "쿠키 등 기기 정보 저장·접근" 문구가 있다 | `apps/mobile/src/ads/adMobConsent.ts:26` `gatherConsent()`, 호출부 `apps/mobile/App.tsx:41`, `adMobInterstitialAd.ts:212`, `adMobRewardedAd.ts` |
| App Privacy에 "추적에 사용: 대략적 위치"로 신고했다 | `app-store/app-store.config.json` `appPrivacy.tracking: "yes"`, `approximateLocation.usedForTracking: true` |
| ATT를 쓰지 않는다 | `Info.plist`에 `NSUserTrackingUsageDescription` 없음 |
| 광고는 전부 비개인화로 요청한다 | `requestNonPersonalizedAdsOnly: true` (`adMobRewardedAd.ts:33,316`, `adMobInterstitialAd.ts:144`) |
| 앱과 Google SDK의 개인정보 목록은 추적 안 함이다 | `PrivacyInfo.xcprivacy` `NSPrivacyTracking=false`, GoogleMobileAds·UMP 목록의 모든 항목 `Tracking=false` |
| 같은 창이 있던 1.11.6~1.11.8은 통과했다 | 1.11.8 제출 `a25d54f2…` `COMPLETE`. 이번 거절은 EEA 지역 심사자에게 걸린 경우로 본다 |

Apple 안내문은 "추적하지 않는다면 쿠키 창을 없애거나 추적하지 않는다고 고쳐라"라고 한다. 추적 신고와 실제 동작도 서로 맞지 않는다. 그래서 iOS를 실제 동작에 맞춰 "추적 안 함"으로 정리하고 동의 창을 없앤다.

| 항목 | 현재 | 변경 후 |
|---|---|---|
| iOS 농장 진입 (EEA·영국·스위스) | Google 동의 창 | 창 없음, 광고 SDK 바로 초기화 |
| iOS 설정 "광고 개인정보" | EEA에서 보임 | 안 보임 |
| iOS EEA·영국·스위스 광고 | 동의에 따라 비개인화 또는 제한 광고 | 동의 문자열 없음 → Google 제한 광고 |
| iOS 기존 동의 기록(`IABTCF_*`) | 기기에 남아 광고 SDK가 계속 읽음 | 앱 시작 시 삭제 |
| iOS 그 외 지역 | 비개인화 광고 | 변화 없음 |
| Android | UMP 동의 창 유지 | 변화 없음 |
| AppsInToss | 해당 없음 | 변화 없음 |
| App Store App Privacy | 추적에 사용: 대략적 위치 | 추적 안 함 (수집·목적은 유지) |

**포함**: `adMobConsent.ts`의 iOS 분기와 동의 기록 삭제, 단위 테스트, `app-store.config.json`·App Store 문서의 추적 답변, App Store Connect App Privacy 수정, 심사 메모, `docs/qa/feature-inventory.json` 신설(중앙 E2E 검증의 전제), v1.12.1 iOS 빌드와 재제출.

**제외**: ATT 도입, 맞춤 광고, Android·AppsInToss 동작, AdMob 콘솔의 메시지 설정, Firebase Analytics 동의 처리(이번 창과 무관한 기존 동작), Google Play·AppsInToss 출시.

## 사용자 흐름·화면 상태

```text
타이틀 ──Enter Farm──▶ isFarmStarted
                         │
          ┌──────────────┴──────────────┐
       Android                         iOS
  gatherConsent()               IABTCF_* 삭제 (1회)
  (EEA면 동의 창)                      │
          │                    mobileAds().initialize()
  canRequestAds?                       │
   ├ 예 → initialize()          광고 준비 완료
   └ 아니오 → 광고 없음            (EEA는 Google이 제한 광고로 처리)
```

- 설정 시트: iOS에서는 `privacySettings.isSupported`가 항상 false라서 "광고 개인정보" 섹션이 없다. 화면 배치는 기존 비EEA 사용자 화면과 같다. 새 문구나 새 화면은 없다.
- 오류: `initialize()` 실패 시 지금처럼 경고만 남기고 광고를 끈다. 동의 기록 삭제가 실패해도 광고 초기화는 계속한다.
- 보상 광고 버튼, 전면 광고 지면, 광고 제한 사유 표시는 바뀌지 않는다.

## 구조·책임·의존성

`apps/mobile/src/ads/adMobConsent.ts` 한 곳만 바꾼다. 보상 광고, 전면 광고, `App.tsx`의 설정 연결은 이 모듈의 공개 함수(`ensureAdMobReady`, `isAdMobPrivacyOptionsRequired`, `showAdMobPrivacyOptions`)를 그대로 쓴다. `packages/farm-ui`, `packages/farm-core`, 네이티브 프로젝트, 의존성은 바꾸지 않는다. 동의 기록 삭제에는 React Native 내장 `Settings`(iOS NSUserDefaults 연결, null을 넘기면 키 삭제 — `RCTSettingsManager.mm` `setValues`)를 쓴다.

## 데이터·인터페이스·실패 처리

- 저장 데이터와 Platform·Firebase 계약은 바뀌지 않는다.
- 삭제 대상은 IAB TCF v2 규격의 앱 내 키 전체다. `IABTCF_CmpSdkID`, `CmpSdkVersion`, `PolicyVersion`, `gdprApplies`, `PublisherCC`, `PurposeOneTreatment`, `UseNonStandardTexts`, `TCString`, `VendorConsents`, `VendorLegitimateInterests`, `DisclosedVendors`, `PurposeConsents`, `PurposeLegitimateInterests`, `SpecialFeaturesOptIns`, `PublisherRestrictions1`~`11`, `PublisherConsent`, `PublisherLegitimateInterests`, `PublisherCustomPurposesConsents`, `PublisherCustomPurposesLegitimateInterests`, Google 추가 동의 `IABTCF_AddtlConsent`가 대상이다. 근거는 IAB 규격의 "CMP SDK를 제거하면 게시자가 남은 `IABTCF_*` 값을 모두 지운다"이다.
- 삭제는 광고 초기화 전에 1회 수행한다. 삭제할 키가 없으면 아무것도 하지 않는다.
- 미국 주 규정용 GPP 키(`IABGPP_*`)는 건드리지 않는다. 남아 있으면 광고를 더 제한하는 방향으로만 작용한다.

## 품질 요구사항

- 개인정보: iOS 바이너리가 IDFA를 쓰지 않고, 동의 창도 띄우지 않으며, 비개인화 요청만 보내는 상태를 테스트로 고정한다.
- 성능: 동의 창 대기 시간이 사라질 뿐 시작 경로에 추가 비용은 없다.
- 접근성·현지화: 새 문구가 없다. 설정 시트는 섹션 하나가 빠질 뿐 기존 배치와 같다.

## 대안·주요 결정

| 대안 | 판단 |
|---|---|
| A. 추적 안 함 + iOS 동의 창 제거 | **선택**(2026-10-13 사용자). Apple이 제시한 해결책이고 실제 동작과 신고가 맞는다. EEA·영국·스위스 iOS 광고는 제한 광고로 바뀌어 채움률과 단가가 낮아진다 |
| B. ATT 도입 | 시스템 창이 하나 늘고 8개 언어 설명, AdMob 콘솔 메시지, 맞춤 광고 전환 결정이 필요하다. GDPR 창과 ATT 순서 문제로 다시 거절된 사례가 있다 |
| C. 동의 창 유지 + 해명 | 새 빌드 없이 빠르지만 Apple의 요구(창 제거 또는 수정)를 충족하지 못한다 |
| UMP `reset()`으로 기록 삭제 | Google 문서가 새 설치 상태를 재현하는 테스트 용도로 설명하고, `IABTCF_*` 삭제 범위도 문서로 확인되지 않아 쓰지 않는다 |

Google 근거: TC string이 없는 EEA·영국·스위스 요청도 제한 광고 대상이다([Limited ads](https://support.google.com/admanager/answer/9882911), [AdMob 동의 요건](https://support.google.com/admob/answer/13554116)). 인증 CMP 필수 요건은 맞춤 광고에만 적용된다.

## 인수조건·테스트·검수

| 조건 ID | 관찰할 동작·통과 기준 | 테스트 방법·환경 | 격리 데이터·시작 상태 | 기대 결과 | 증거 |
|---|---|---|---|---|---|
| AC-1 | iOS에서 `ensureAdMobReady()`가 UMP(`gatherConsent`, `requestInfoUpdate`, 폼 표시)를 부르지 않고 `initialize()`를 호출한다 | Jest, `Platform.OS='ios'` | mock 초기 상태 | UMP 호출 0회, `initialize` 1회, 결과 true | 테스트 로그 |
| AC-2 | iOS에서 `isAdMobPrivacyOptionsRequired()`는 false, `showAdMobPrivacyOptions()`는 폼 없이 false다 | Jest | mock | 설정 섹션 미노출 조건 충족 | 테스트 로그 |
| AC-3 | iOS에서 광고 초기화 전에 위 `IABTCF_*` 키 전체를 1회 삭제한다 | Jest(`Settings.set` 호출 인자), 개발 런타임에서 `simctl spawn defaults read`로 확인 | 키를 미리 심은 시뮬레이터 | 초기화 뒤 키 없음 | 테스트 로그, defaults 출력 |
| AC-4 | Android의 기존 동의 흐름(동의 대기, 거부 시 광고 차단, 개인정보 옵션)이 그대로다 | 기존 Jest 회귀 | mock | 기존 테스트 통과 | 테스트 로그 |
| AC-5 | iOS 개발 빌드에서 농장 진입부터 보상 광고, 설정까지 동의 창이 없고 설정에 "광고 개인정보"가 없다 | iOS 시뮬레이터 개발 런타임 | 새 설치 | 창·섹션 없음, 테스트 광고 시청 후 보상 지급 | 화면 캡처, 로그 |
| AC-6 | App Store Connect App Privacy가 "추적 안 함"이고 수집 유형·목적은 그대로다 | 콘솔 저장 후 새로고침 | — | "Data Used to Track You" 없음 | 콘솔 캡처 |
| AC-7 | `app-store.config.json`·App Store 문서·`pnpm check:app-store`가 추적 안 함과 일치한다 | 로컬 검사 | — | 검사 통과 | 명령 출력 |

- TDD: AC-1~4는 실패 테스트부터 작성한다. AC-5는 실제 실행으로, AC-6·7은 콘솔·문서 대조로 확인한다.
- UI 검수 3회: 화면 변경은 iOS 설정 섹션이 빠지고 동의 창이 사라지는 것뿐이다. 그래도 중앙 규칙대로 iOS 시뮬레이터 개발 런타임에서 구현자와 다른 리뷰 에이전트가 3회 검수한다. 1회는 첫 사용자 흐름과 AC-5, 2회는 광고 실패·취소·재시도와 작은 화면(iPhone SE), 3회는 재시작·저장 복구·기존 기능 회귀를 본다.
- 구현 기능 전체 목록: 이번에 `docs/qa/feature-inventory.json`을 처음 만든다. 이어받을 기준 실행이 없으므로 모든 기능을 빌드 전 E2E에서 실제로 실행한다. 시나리오는 아래 E2E 표를 따른다.
- 실행 환경: iOS 시뮬레이터 개발 빌드(Metro). 조작은 기존 `~/.local/share/seorilabs/idb/venv`의 idb 클라이언트와 Homebrew `idb_companion` 1.1.8로 한다. 대상 목록 조회는 확인했다. iOS 27 시뮬레이터에서 탭이 동작하지 않으면 iOS 26.x 시뮬레이터로 바꾸고, 그래도 안 되면 검수를 차단으로 보고한다.
- 실기기: 기반 기능 6개는 기준 실행이 없어 모두 "영향받음"이다. 그래서 후보마다 1회 실기기 확인이 필요하다. 연결된 iPhone 12 Pro에 태그 SHA 개발 빌드를 설치해 진입 → 동의 창 없음 → 보상 광고 1회 → 설정 확인 → 알림 허용을 본다. 실기기에는 탭 자동화가 없다. 먼저 iPhone 미러링과 Computer Use를 시도하고, 안 되면 사용자가 3~5분 직접 조작해야 한다. 둘 다 안 되면 차단으로 보고하고 빌드하지 않는다.
- 중앙 계약의 빈틈: 기능 목록에 마켓 구분이 없다. 그래서 AppsInToss 빌드 때는 AIT에 없는 `notifications`·`ad-consent`를 덮을 수 없다. 이번 범위에서는 고치지 않고, 다음 AIT 출시 전에 `seorilabs/.github`에 기능별 마켓 구분을 제안한다.

### 구현 기능 전체 목록 (`docs/qa/feature-inventory.json`)

중앙 검증기는 마켓별로 기능을 거르지 않는다. 그래서 플랫폼 전용 동작은 따로 떼지 않고 같은 제품 기능의 플랫폼별 형태로 묶는다. 예를 들어 Android 뒤로 가기는 `menus-sheets`에, Android 화면 켜짐 유지는 `app-launch-shell`에 들어간다. 이번 iOS E2E는 각 기능의 iOS 형태를 실행한다.

| 기능 ID | 핵심 | 기반 | 포함 범위 |
|---|---|---|---|
| `app-launch-shell` | ● | | 실행·스플래시·안전 영역·플랫폼 화면 처리 |
| `title-startup` | ● | | 타이틀, 2단계 로딩, 읽기 실패 재시도, 진입 |
| `onboarding` | ● | | 첫 수확·보상 안내, 건너뛰기, 바로 시작, 대기 힌트 |
| `planting` | ● | | 구역 탭, 씨앗 선택·정렬, 심기, 모두 심기 |
| `growth-harvest` | ● | | 성장·비료, 수확·판매, 모두 수확·다시 심기, 콤보·변이·숙련·발견·첫 수확 연출 |
| `shop` | ● | | 상점 탭, 밭 개간, 구역 열기, 업그레이드, 장식·배치 |
| `welcome-back-offline` | ● | | 복귀 요약, 오프라인 골드 |
| `save-restore` | ● | | 자동 저장, 종료 후 복원 |
| `reset-farm` | ● | | 확인 단어 입력 후 초기화, 새 온보딩 |
| `hud-goals-status` | | | 골드·시간당 수익, 다음 목표, 상태 시트, 오늘의 작물, 주간 이벤트, 날씨, 배경 |
| `menus-sheets` | | | 더보기 메뉴, 시트 닫기·드래그, 기능 안내 팝업, Android 뒤로 가기 |
| `missions` | | | 일일·주간 미션, 보상 받기 |
| `daily-bonus-wheel` | | | 출석 보너스, 행운 바퀴 |
| `collection-achievements` | | | 도감, 업적·칭호 |
| `production` | | | 동물, 공방, 요리 |
| `research-automation` | | | 연구소, 자동화, 교배 |
| `prestige-map-landmark` | | | 졸업, 이전 농장 수익·스킬, 랜드마크 |
| `settings` | | | 효과음·배경음, 날씨 효과, 진동, 언어 8개 |
| `rewarded-ads` | | ● | 보상 광고 7개 지면, 제한·쿨다운 |
| `interstitial-ads` | | ● | 전면 광고 3개 지면, 간격 |
| `ad-consent` | | ● | Android UMP 동의·개인정보 옵션, iOS 동의 창 없음·기록 삭제 |
| `notifications` | | ● | 로컬 알림, 설정 토글, 권한 안내, 알림 열기 기록 |
| `firebase-auth-analytics` | | ● | 익명 인증, Analytics 이벤트 |
| `platform-session-events` | | ● | Platform 세션·이벤트 복사·광고 정책 |

기반 기능의 `paths`는 JSON에 적었다. 기준 실행이 없으므로 이번에는 모두 실제로 실행한다.

### 빌드 전 E2E 시나리오 (iOS 시뮬레이터 개발 빌드, 태그 SHA)

격리: 검수 전용 시뮬레이터에 새로 설치하고, 고급 상태는 기존 스크린샷 시딩 방식(AsyncStorage 파일 주입)으로 만든다. 사용자 기기와 계정은 쓰지 않는다.

| 시나리오 | 흐름 | 기능 |
|---|---|---|
| E1 첫 사용자 | `IABTCF_*` 키를 미리 심음 → 실행·타이틀·진입 → 동의 창 없음, 키 삭제 확인 → 온보딩 수확·보상·심기 → 상점 개간·업그레이드·장식 → 설정(광고 개인정보 없음, 소리·날씨·진동·언어 전환) → 종료·재실행 후 복원 | app-launch-shell, title-startup, onboarding, planting, growth-harvest, shop, settings, save-restore, menus-sheets, hud-goals-status, ad-consent, firebase-auth-analytics, platform-session-events |
| E2 광고 | 테스트 광고로 성장 단축·수확 부스트·상점 보상 시청 후 보상 확인, 모두 수확 3회 후 전면 광고, 쿨다운 표시 | rewarded-ads, interstitial-ads |
| E3 진행 농장 | 시딩한 후반 저장 → 미션·출석·바퀴·도감·업적·동물·공방·요리·연구·자동화·교배·지도·졸업·랜드마크 | missions, daily-bonus-wheel, collection-achievements, production, research-automation, prestige-map-landmark |
| E4 복귀·알림 | `lastSeen` 8시간 전 → 복귀 요약·두 배 광고 → 알림 권한 안내 허용 → 예약 알림 수신·열기 기록 | welcome-back-offline, notifications |
| E5 초기화 | 설정 → 초기화 단어 입력 → 새 온보딩 시작 | reset-farm |

E1~E5의 로그·캡처·`defaults` 출력은 Release 자산에 묶어 올리고 근거 JSON에서 링크한다.

## 적용·운영·되돌리기

1. 이 설계 승인 → 실행 티켓(Issue) → 테스트 우선 구현 → PR·CI·Copilot 리뷰.
2. UI 검수 1~3회(브랜치 SHA별 보고서 `docs/qa/2026-10-13-ios-no-tracking-consent/iteration-N.md`) → 병합.
3. `release-tag.yml`로 `v1.12.1` 태그 생성(main 기준. #571·#572의 Platform SDK 0.6.0, 디버그 광고 표식이 함께 들어간다) → 태그 SHA로 빌드 전 E2E → `development-evidence.app-store.before-build.json`과 `release-notes.json`을 Release에 첨부 → `deploy-app-store.yml` 실행.
4. App Store Connect: App Privacy를 추적 안 함으로 수정·게시(Account Holder·Admin 권한, 콘솔 작업) → 거절된 제출 취소 → 기존 버전 레코드의 `versionString`을 1.12.1로 변경 → 새 빌드 연결 → 심사 메모에 변경 요약 추가 → 제출.
5. 심사 메모(영문) 요지: "The Google consent form has been removed from the iOS app. The app does not track users: ads are requested as non-personalized only, the IDFA is not accessed, and App Privacy has been updated to 'Data Not Used to Track You'."

- Google Play·AppsInToss는 이번에 출시하지 않는다. v1.12.1 태그는 iOS 빌드에만 쓴다.
- 되돌리기: 거절이 반복되면 대안 B(ATT)로 새 설계를 올린다. iOS EEA 광고 수익이 의미 있게 떨어지면 AdMob 국가별 리포트로 확인하고 B를 재검토한다.
- 남은 위험: EEA·영국·스위스 iOS 광고 수익 감소. 이미 공개된 1.11.8은 다음 버전 공개 전까지 동의 창을 유지한다(App Privacy 수정은 1.11.8에도 사실과 맞는다).

## v2 변경 (2026-10-13, Codex 리뷰 반영)

PR #574의 Codex 보안 리뷰가 문제를 지적했다. CMP 없이 제한 광고를 쓰더라도 Google 정책은 데이터를 처리하는 당사자와 그 사용 방식을 "눈에 띄고 쉽게 접근 가능하게" 알리라고 요구한다([Limited ads](https://support.google.com/admob/answer/10105530)). v1은 iOS에서 UMP를 없애면서 앱 안의 유일한 고지까지 없앴다. 공용 개인정보처리방침(`seorilabs-official` `src/lib/privacyContent.ts`)에도 "EEA·영국·스위스에서는 UMP를 쓰고 앱 설정에서 철회"라고 적혀 있어, iOS에서는 사실과 달라진다. 이 사이트는 분석 동의 설정을 띄우므로 앱에서 링크하면 같은 거절 사유가 다시 생길 수 있다.

| 항목 | v1 | v2 |
|---|---|---|
| 설정 시트 광고 섹션 | Android EEA에서만 "개인정보 > 광고 개인정보 설정" | 모바일(iOS·Android) 항상 "광고 정보" 섹션: 고지 문단 + "Google의 데이터 사용 방식" 버튼. Android EEA는 기존 "광고 개인정보 설정" 버튼이 이어서 보인다 |
| 고지 내용 | 없음 | Google AdMob이 광고 제공·측정·부정 이용 방지를 위해 IP 주소(대략적 위치), 기기·앱 정보, 광고 상호작용, 진단 정보를 처리할 수 있음. 맞춤 광고를 요청하지 않고 추적에 쓰지 않음 |
| 링크 대상 | — | `https://policies.google.com/technologies/partner-sites?hl=<언어>`를 외부 브라우저로 연다. 서리랩스 사이트는 링크하지 않는다 |
| AppsInToss | — | `privacySettings`를 넘기지 않으므로 섹션 없음(변화 없음) |
| 공용 개인정보처리방침 | 변경 없음 | "iOS에서 추적하지 않는 앱은 UMP를 표시하지 않고 제한 광고만 제공하며, 앱 설정의 '광고 정보'에서 처리 내용을 안내한다"를 추가하고, 철회 안내가 Android에 해당함을 밝힌다. 별도 PR(`seorilabs/seorilabs-official`)로 재제출 전에 공개한다 |

- 새 문구 3개(`adInfoSection`, `adDataNotice`, `adDataPolicyAction`)를 8개 언어에 추가하고, 더 이상 쓰지 않는 `privacySection`은 지운다. 버튼 문구 `adPrivacyOptionsAction`은 유지한다.
- 구조: `FarmPrivacySettings`에 `openAdDataPolicy(locale)`를 더한다. URL과 언어 코드 변환은 `apps/mobile`에서 맡는다(플랫폼 연동은 앱 계층 규칙). 링크 열기에 실패해도 경고만 남긴다.

| 조건 ID | 관찰할 동작·통과 기준 | 테스트 방법·환경 | 기대 결과 |
|---|---|---|---|
| AC-8 | 모바일 설정 시트에 "광고 정보" 고지와 링크 버튼이 보이고, 버튼은 현재 언어의 Google 안내 URL을 연다. 개인정보 옵션 버튼은 UMP가 요구할 때만 보인다. `privacySettings`가 없으면(AIT) 섹션이 없다 | Jest(FarmGame 렌더, URL 변환), iOS 시뮬레이터 | 문구·버튼 노출, URL 일치, 긴 영어·독일어 문구가 넘치지 않음 |
| AC-9 | 공용 개인정보처리방침이 iOS의 UMP 미사용·제한 광고·앱 내 고지 위치와 맞다 | `seorilabs-official` PR과 공개 페이지 확인 | 재제출 전에 공개 반영 |

- UI 검수 2·3회는 v2 후보로 실행하고 설정 시트의 새 섹션(작은 화면 iPhone SE, 긴 영어·독일어)을 포함한다. 1회는 v1 후보(`1366729`)의 결과로 보존한다.
- `ad-consent` 기능 정의는 그대로 두고, 이 고지를 같은 기능의 일부로 검수한다.

## 승인·추적

- 최신 원본: 이 파일. 승인 커밋: `0a0967d5a54c8c4b8616b0deb2751ec3bb21009c`(v1). 이후 커밋의 이 파일 변경은 승인·추적 기록만이다.
- 티켓·PR·검수 보고서·E2E 증거는 승인 후 이 절에 연결한다.
- Wiki가 꺼져 있어 `docs/design/README.md`로 목록을 제공한다.
