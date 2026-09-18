# Firebase 운영 기능

Firebase project는 `.firebaserc`의 `happy-farm-tycoon`을 기본값으로 사용합니다.

- Mobile: Analytics(GA4)와 Platform 세션용 Anonymous Auth
- AppsInToss: Firebase Web App 등록 완료. AIT target은 Firebase Web SDK를 `apps/ait/src/firebaseWeb/*`에서만 import합니다.
- 미사용: Cloud Functions, Cloud Messaging
- Mobile local notifications: Notifee 기반 기기 로컬 농장 알림(수확·데일리 보너스·오늘의 작물). FCM token이나 서버 푸시는 사용하지 않습니다.

## Firebase 앱 등록

현재 Firebase project에 등록된 client app은 다음과 같습니다.

```text
Android release: com.seorilabs.happyfarm
Android debug: com.seorilabs.happyfarm.debug
Web AppsInToss: 행복한 농장 타이쿤 (AppsInToss)
```

AppsInToss Web App SDK config:

```text
projectId = happy-farm-tycoon
appId = 1:1874344437:web:a34abb444eae2baa6c48bc
authDomain = happy-farm-tycoon.firebaseapp.com
storageBucket = happy-farm-tycoon.firebasestorage.app
messagingSenderId = 1874344437
measurementId = G-LQQQQZHG1V
```

Firebase Web API key는 service credential이 아니며, AIT 실기기 smoke test를 위해 client config를 `apps/ait/src/firebaseWeb/app.ts`에 고정했습니다. 서비스 계정 JSON, Admin SDK credential, private key는 앱에 넣지 않습니다.

AIT 앱 시작 시 기존 `ait_ga4_client_id`를 불러오거나 생성합니다. 커스텀 이벤트는 클라이언트에서 GA4 Measurement Protocol을 직접 호출하지 않고 Platform `/v1/events` 한 경로로만 보냅니다. Platform relay는 등록된 GA4 Web stream으로 전달하며, 실패해도 게임 흐름에는 오류를 전파하지 않습니다.

AIT는 Granite React Native 런타임 제약 때문에 Firebase Web Analytics SDK를 사용하지 않습니다. 신규 버전은 Platform relay를 사용하고, 기존 설치가 쓰던 client ID와 first-touch 플래그를 그대로 재사용합니다. 자동 이벤트 이름을 위조하지 않고 다음 계약을 사용합니다.

- `ait_first_touch`: `ait_ga4_first_touch_recorded` Storage 플래그로 신규 설치 생애 1회만 전송합니다. 계측 도입 전에 이미 `ait_ga4_client_id`가 있던 기존 사용자는 플래그만 마이그레이션해 신규 코호트 오염을 막습니다. WEB first-touch 코호트의 BigQuery 기준 이벤트입니다.
- `ait_session_start`: 앱 초기화와 30분 이상 백그라운드 복귀에 전송하는 진단 이벤트입니다.
- 실제 GA4 세션 경계: 모든 이벤트의 숫자형 `session_id`로 집계하며, 30분 이상 백그라운드 복귀 시 새 ID를 발급합니다. `session_start` 예약 이벤트를 위조하지 않습니다.
- lifecycle을 포함한 모든 앱 커스텀 이벤트는 `app_market=apps_in_toss`, `runtime_platform=web`, `release_version`, `engagement_time_msec`를 포함합니다.

AIT WEB 스트림은 자동 수집 기반 표준 리포트가 일부 제한될 수 있으므로 WEB D1/D7은 `ait_first_touch`와 `session_id`를 사용한 BigQuery 쿼리를 권위 기준으로 봅니다.

## Platform 이벤트 경로

네이티브 Android·iOS는 Firebase Analytics SDK를 유지하고, 합의한 저빈도 핵심 이벤트
17종만 `@seorilabs/platform-sdk`를 통해 Platform 원장에도 복제합니다. 이 네이티브
Platform 경로에는 GA4 client ID를 싣지 않으므로 Firebase SDK와 Platform GA4 relay가
동시에 발화하지 않습니다. AppsInToss는 모든 커스텀 이벤트의 단일 GA4 경로로 Platform
relay를 사용합니다.

- AIT context: `platform=ait`, 릴리스 버전, 감지 locale, stable GA4 client ID,
  `analyticsConsent=false`
- Mobile context: 실제 `android|ios`, 릴리스 버전, 감지 locale
- 전송하지 않는 값: Firebase UID, 광고 ID, Platform token, 저장 데이터
- 수명주기: 앱 시작 시 SDK start, background 시 Presence stop과 best-effort flush,
  foreground 시 Presence start/resume, unmount 시 SDK shutdown
- 장애 격리: Platform 네트워크 실패는 게임과 기존 GA4 sink에 전파하지 않음

SDK `0.4.0`부터 제공하는 Presence heartbeat는 AIT와 Mobile 조합 지점에
`presenceEnabled=false`로 고정해 두었습니다. 비활성 상태에서는 token과 Edge 요청을
모두 0건으로 유지합니다. context는 stable `appId=happy-farm`, 실제 platform, 릴리스 버전만
사용하며 사용자 ID, 광고 ID, 원시 session ID, locale을 포함하지 않습니다. 이후 opt-in할 때도
SDK의 token/heartbeat 경로만 사용하고, Edge 요청은 2초 timeout과 fail-open 동작을 유지합니다.
앱에는 heartbeat retry queue, outbox, 별도 HTTP·UDP·BigQuery fallback을 두지 않습니다.

Presence 활성화는 Platform #78의 Edge health·TLS 확인, Backoffice #148의 registry/regsync,
대상 앱 `features.presence=true`, 릴리스 후보 검증과 live readback이 끝난 뒤 별도 변경으로
진행합니다. SDK 탑재만으로 운영 동접 수집이 시작되거나 배포된 것으로 보지 않습니다.

Platform SDK package는 private GitHub Packages이므로 로컬과 CI 설치에 `read:packages`
인증이 필요합니다. 토큰은 `.npmrc`, 소스, 앱 번들에 저장하지 않습니다. 긴급 중단은
Platform registry의 `features.events=false`를 sync하며, 이 경우 GA4는 계속 동작합니다.

## 설정 파일

Firebase 콘솔에서 Android/iOS 앱을 만들고 설정 파일을 배치합니다.

```text
apps/mobile/android/app/google-services.json
apps/mobile/ios/HappyFarmMobile/GoogleService-Info.plist
```

Android debug 빌드는 `applicationIdSuffix ".debug"`를 사용합니다. debug에서도 Firebase를 확인하려면 Firebase 콘솔에 `com.seorilabs.happyfarm.debug` Android 앱을 추가하고, release/debug client가 모두 들어 있는 `google-services.json`을 사용합니다.

설정 파일은 gitignore 대상입니다. 로컬에는 직접 두고, GitHub Actions release build에는 secret `FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64`로 복원합니다.

```bash
base64 -i apps/mobile/android/app/google-services.json | tr -d '\n' | gh secret set FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64
pnpm check:firebase:android
```

설정 파일이 없으면 Android Gradle Firebase plugin과 JS telemetry 초기화는 건너뜁니다. 이 상태에서는 기존 로컬 빌드가 Firebase 연결 없이 동작합니다.

## 원격 설정 없음

Firebase Remote Config는 사용하지 않습니다. 광고 on/off, 수집 토글, 최소지원버전,
광고 빈도·cap을 원격에서 바꾸던 경로를 모두 걷어냈고, 이 값들은 이제 빌드에
고정됩니다.

- 광고 빈도·cap: `packages/farm-core/src/balance.json`이 정본입니다. 바꾸려면
  balance를 고쳐 배포합니다.
- Analytics 수집: 빌드에서 항상 켭니다.
- 광고 단위·그룹 ID: `apps/mobile/src/ads/config.ts`와 `apps/ait/src/pages/index.tsx`의
  상수입니다. AdMob 식별자의 정본은 중앙 원장
  [seorilabs/.github#167](https://github.com/seorilabs/.github/issues/167)입니다.

### 잃은 운영 수단

원격 설정을 걷어내면서 **배포 없이 대응하던 두 수단이 사라졌습니다.**

- **광고 전역 kill switch**: 광고 정책 위반이나 SDK 사고 시 즉시 광고를 끌 수
  없습니다. 새 빌드를 올려 스토어 심사를 거쳐야 합니다.
- **강제 업데이트 게이트**: 구버전을 차단할 수 없습니다. 치명적 결함은 수정 빌드의
  스토어 자동 업데이트 전파 속도에 의존합니다.

둘 중 하나라도 다시 필요해지면 원격 설정을 되살리는 대신, 그때의 요구사항에 맞는
최소 수단을 새로 설계합니다.

게임 경제, gold, 저장 데이터는 계속 로컬 권위 상태이며 서버 신뢰값으로 쓰지 않습니다.


## 로컬 농장 알림

모바일 앱은 첫 수확 뒤 표시되는 농장 알림 안내에서 사용자가 명시적으로 수락하거나, 설정에서 알림 토글을 직접 켠 경우에만 OS 알림 권한을 요청합니다. 안내 수락 시 `수확 알림`과 `복귀 리마인더`를 함께 켜며, 설정에서는 둘을 개별 해제할 수 있습니다.

- 수확 알림은 현재 심어진 작물 중 가장 빨리 수확 가능한 시점에 단일 로컬 알림을 예약합니다.
- 복귀 리마인더는 데일리 보너스 쿨다운 만료와 오늘의 작물 갱신 시점을 서로 다른 로컬 알림 id로 예약합니다.

- Android 13+에서는 `POST_NOTIFICATIONS` 런타임 권한을 요청합니다.
- `SCHEDULE_EXACT_ALARM` 권한은 요청하지 않습니다. 알림은 수확 시점 안내용이며 정확한 알람/시계 기능으로 취급하지 않습니다.
- Firebase Cloud Messaging, 서버 저장 token, 원격 push campaign은 사용하지 않습니다.
- 각 알림을 끄거나 예약 대상이 없으면 해당 로컬 trigger notification을 취소합니다.

## 익명 Auth (Platform 세션)

Firebase에서 쓰는 기능은 **GA4 하나**입니다. Crashlytics, Firestore 클라우드 저장,
Remote Config는 모두 제거했습니다.

다만 **Firebase Anonymous Auth는 남습니다.** 클라우드 저장용이 아니라 Seorilabs
Platform 세션의 자격증명이기 때문입니다. `ensureMobilePlatformSession()`이 Firebase
ID token을 짧은 Platform 세션으로 교환하고, 그 세션 위에서 다음이 동작합니다.

- 보상형 광고의 정책 조회와 claim 생성·확인(AdMob SSV 검증)
- Platform analytics relay
- 인앱결제(광고 제거) 경로

즉 Auth를 함께 걷어내면 프로덕션 광고 수익 경로가 멈춥니다.

### 저장

저장은 로컬 하나입니다. 서버 사본이 없습니다.

- 게임 진행 데이터는 기기 밖으로 나가지 않습니다.
- 기기를 바꾸면 진행이 이어지지 않습니다. 계정 연동으로 이어가려면 Google/Apple
  계정 linking을 별도 기능으로 설계합니다.
- `packages/farm-core`와 `packages/farm-ui`에는 Firebase SDK를 import하지 않습니다.

### 잃은 것

원격 설정 제거(위)에 더해 **크래시 리포팅이 없습니다.** 출시 후 문제를 감지할 수단은
GA4 이벤트뿐이며, 스택 트레이스나 비치명적 오류는 수집되지 않습니다. 내부에서 쓰던
`recordNonFatalError` 호출은 개발 빌드에서만 경고를 남기는 `logDevWarning`으로
바뀌었고, 릴리스 빌드에서는 no-op입니다.

과거 클라우드 백업이 켜져 있던 기간에 Firestore에 쌓인 사용자 문서는 앱에서 더 이상
읽지 않습니다. 그 데이터 정리는 별도 운영 작업입니다.


## 검증

```bash
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile test --watchAll=false
pnpm --dir apps/mobile build:android
```

AIT Firebase Web SDK 검증:

```bash
pnpm --dir apps/ait typecheck
pnpm --dir apps/ait lint
pnpm --dir apps/ait test
pnpm --dir apps/ait build
```

Analytics DebugView 확인:

```bash
pnpm --dir apps/mobile android:debugview:on
pnpm --dir apps/mobile android
pnpm --dir apps/mobile android:debugview:off
```

로컬 8081 포트에 다른 dev server가 떠 있으면 mobile Metro를 8082로 띄우고 debug 앱의 React Native host도 같이 바꿉니다.

```bash
pnpm --dir apps/mobile start:reset --port 8082
adb reverse tcp:8082 tcp:8082
pnpm --dir apps/mobile android:debughost:8082
adb shell am start -n com.seorilabs.happyfarm.debug/com.seorilabs.happyfarm.MainActivity
```

Firebase Console의 Analytics DebugView에서 `game_start`, `farm_main_screen` 이벤트가 보이는지 확인합니다.
