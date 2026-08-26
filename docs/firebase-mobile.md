# Firebase 운영 기능

Firebase project는 `.firebaserc`의 `happy-farm-tycoon`을 기본값으로 사용합니다.

- Mobile: Analytics, Crashlytics, Remote Config, Anonymous Auth, Firestore cloud-save backup
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

AIT 앱 시작 시 GA4 Measurement Protocol 클라이언트와 Remote Config REST 클라이언트를 초기화합니다. Measurement Protocol 설정이 주입된 경우 `ait_firebase_initialized` smoke event와 FarmGame 이벤트를 전송하고, dev bundle에서는 DebugView 확인을 위해 `debug_mode=1`을 함께 붙입니다. 단, 이벤트 계약과 시장·세션 필드만으로 25개 상한을 채운 최대 광고 진단 payload는 `debug_mode`를 생략합니다. 설정이 없거나 초기화가 실패하면 게임은 계속 no-op analytics로 동작합니다.

현재 AIT는 Granite React Native 런타임 제약 때문에 Firebase Web SDK 대신 GA4 Measurement Protocol을 사용합니다. Measurement Protocol 예약 이름인 `first_open`, `first_visit`, `session_start`, `user_engagement`는 직접 전송할 수 없으므로 다음 계약을 사용합니다.

- `ait_first_touch`: `ait_ga4_first_touch_recorded` Storage 플래그로 신규 설치 생애 1회만 전송합니다. 계측 도입 전에 이미 `ait_ga4_client_id`가 있던 기존 사용자는 플래그만 마이그레이션해 신규 코호트 오염을 막습니다. WEB first-touch 코호트의 BigQuery 기준 이벤트입니다.
- `ait_session_start`: 앱 초기화와 30분 이상 백그라운드 복귀에 전송하는 진단 이벤트입니다.
- 실제 GA4 세션 경계: 모든 이벤트의 `session_id`로 집계하며, 30분 이상 백그라운드 복귀 시 새 ID를 발급합니다. `session_start` 예약 이벤트를 위조하지 않습니다.
- 두 lifecycle 이벤트도 `app_market`, `release_version`, `release_build_number` 공통 파라미터를 포함합니다.

Measurement Protocol 단독 WEB 스트림은 자동 수집 기반 표준 리포트가 일부 제한될 수 있으므로 WEB D1/D7은 `ait_first_touch`와 `session_id`를 사용한 BigQuery 쿼리를 권위 기준으로 봅니다.

## Platform 이벤트 dual sink

기존 Firebase Analytics와 AIT GA4 Measurement Protocol은 유지합니다. 앱 shell의
`combineTrackers`가 합의한 저빈도 핵심 이벤트 17종만 `@seorilabs/platform-sdk`를 통해
Platform BigQuery에 두 번째로 전송합니다. `ad_reward_impression`, 작물 생산·수확·강화 등
고빈도 루프 이벤트는 Platform allowlist 밖이라 전송하지 않습니다.

- AIT context: `platform=ait`, 릴리스 버전, 감지 locale
- Mobile context: 실제 `android|ios`, 릴리스 버전, 감지 locale
- 전송하지 않는 값: Firebase UID, GA4 client ID, Platform token, 저장 데이터
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

## Remote Config 기본 키

Remote Config 템플릿은 repo root의 `remoteconfig.template.json`으로 관리합니다.

```text
analytics_collection_enabled = true
crashlytics_collection_enabled = true
mobile_ads_global_enabled = true
cloud_save_backup_enabled = false
minimum_supported_version_code = 1
force_update_url = ""
remote_balance_enabled = false
```

광고는 Google Play, App Store, AppsInToss 모두 `mobile_ads_global_enabled` 하나로만 제어합니다. `true`이면 각 타깃이 연결한 광고 형식이 로드되고, `false`이면 광고를 로드하지 않습니다. 버전별 또는 광고 형식별 노출 제어는 운영 부담을 줄이기 위해 사용하지 않습니다.

`mobile_ads_enabled_max_build_number`, `rewarded_ads_enabled`, `interstitial_ads_enabled`는 이전 모바일 빌드 호환용 legacy key입니다. 새 빌드는 이 값을 읽지 않으며, 운영 중에는 변경하지 않습니다.

AppsInToss 보상형 광고는 AppsInToss 광고 그룹 ID가 발급된 뒤 `apps/ait`의 광고 설정에 반영합니다. AIT도 Firebase Web Remote Config에서 `mobile_ads_global_enabled`를 읽습니다.

게임 경제, gold, 저장 데이터는 계속 로컬 권위 상태이며 서버 신뢰값으로 쓰지 않습니다.

## 강제 업데이트 게이트 (최소지원버전)

모바일 앱(Google Play/App Store)은 기동 시 Remote Config `fetchAndActivate` 완료 후 설치된 빌드의 `RELEASE_INFO.buildNumber`를 `minimum_supported_version_code`와 비교해, 구버전이면 스토어로 유도하는 차단형 안내(닫기 불가 모달)를 노출합니다. AppsInToss(WEB)은 서버 배포형이라 이 게이트를 적용하지 않습니다.

판정 로직은 `apps/mobile/src/firebase/updateGate.ts`의 순수 함수 `shouldPromptForceUpdate`이며, 다음 오차단 방지 가드를 지킵니다.

- `minimum_supported_version_code`가 기본값 `1` 이하이면(미설정·fetch 실패 폴백 포함) 절대 발동하지 않습니다.
- `buildNumber`가 유효한 양의 정수가 아니면(로컬/미버전 빌드의 `0` 등) 발동하지 않습니다.
- 위를 모두 통과하고 `buildNumber < minimum_supported_version_code`일 때만 안내를 노출합니다.

### 운영 절차 — 언제 최소버전을 올리나

1. **원칙**: 이미 배포·전파된 수정을 구버전이 무효화하고 있고(예: 스팸/오작동), 스토어 자동 업데이트만으로는 전파가 느릴 때만 올립니다. 상시로 최신 빌드를 강제하지 않습니다.
2. **선행 조건**: 올릴 목표 버전(고정 대상 `versionCode`/`buildNumber`)이 **이미 스토어에 승인·게시**되어 사용자가 실제로 업데이트할 수 있어야 합니다. 게시 전에 올리면 업데이트할 곳이 없어 사용자가 갇힙니다.
3. **`force_update_url` 설정(권장, iOS는 필수)**:
   - Android는 미설정 시 패키지명 기반 Play Store URL(`https://play.google.com/store/apps/details?id=com.seorilabs.happyfarm`)로 폴백합니다.
   - iOS는 숫자 App Store ID가 레포에 없어 정식 딥링크를 구성할 수 없습니다. **iOS 운영 시 반드시 `force_update_url`에 해당 App Store 링크를 설정**하세요(미설정 시 App Store 앱만 여는 최후 폴백).
4. **값 설정**: Firebase 콘솔 Remote Config에서 `minimum_supported_version_code`를 목표 버전으로 올리고 게시합니다. 클라이언트는 `minimumFetchIntervalMillis`(release 15분) 주기로 반영됩니다.
5. **롤백**: 문제가 생기면 값을 다시 `1`로 내려 게이트를 즉시 해제합니다.
6. **측정**: 배포 후 `update_gate_shown`/`update_gate_store_click`(파라미터 `build_number`/`minimum_supported_version_code`/`platform`)와 버전 분포 수렴 속도를 BigQuery로 확인합니다.

## 로컬 농장 알림

모바일 앱은 첫 수확 뒤 표시되는 농장 알림 안내에서 사용자가 명시적으로 수락하거나, 설정에서 알림 토글을 직접 켠 경우에만 OS 알림 권한을 요청합니다. 안내 수락 시 `수확 알림`과 `복귀 리마인더`를 함께 켜며, 설정에서는 둘을 개별 해제할 수 있습니다.

- 수확 알림은 현재 심어진 작물 중 가장 빨리 수확 가능한 시점에 단일 로컬 알림을 예약합니다.
- 복귀 리마인더는 데일리 보너스 쿨다운 만료와 오늘의 작물 갱신 시점을 서로 다른 로컬 알림 id로 예약합니다.

- Android 13+에서는 `POST_NOTIFICATIONS` 런타임 권한을 요청합니다.
- `SCHEDULE_EXACT_ALARM` 권한은 요청하지 않습니다. 알림은 수확 시점 안내용이며 정확한 알람/시계 기능으로 취급하지 않습니다.
- Firebase Cloud Messaging, 서버 저장 token, 원격 push campaign은 사용하지 않습니다.
- 각 알림을 끄거나 예약 대상이 없으면 해당 로컬 trigger notification을 취소합니다.

## 익명 Auth와 클라우드 저장 백업

모바일 앱은 `cloud_save_backup_enabled`가 `true`이고 Firebase 설정이 있는 경우 Firebase Anonymous Auth로 앱 설치 단위 UID를 확보한 뒤 Firestore에 현재 저장 데이터를 백업합니다. 기본값은 `false`이며, Firestore API, Anonymous Auth provider, Firestore rules 배포가 끝난 뒤 Remote Config에서 켭니다.

저장 원칙:

- 로컬 저장이 계속 권위 상태입니다.
- Firestore 저장본은 복구용 백업본이며 서버 검증/치트 방지 원장으로 사용하지 않습니다.
- 앱 시작 시 로컬 저장이 없고 같은 Firebase Auth 세션의 Firestore 백업이 있으면 로컬 저장으로 복원합니다.
- 앱 삭제, 기기 초기화, 계정 linking 없는 기기 이전까지 보장하지 않습니다. 그 범위는 Google/Apple 계정 linking을 별도 기능으로 추가할 때 다룹니다.
- `packages/farm-core`와 `packages/farm-ui`에는 Firebase SDK를 import하지 않고, 모바일 어댑터가 Auth/Firestore를 담당합니다.

Firestore 경로:

```text
users/{uid}/saves/current
```

저장 필드:

```text
schemaVersion = happy-farm-save-v1
payloadJson = serialized GameState
payloadBytes = approximate UTF-8 byte size
saveHash = client-side hash for diagnostics
clientRevision = client-side incrementing revision
clientUpdatedAtMs = client wall-clock timestamp
deviceId = app-install-scoped device id
appVersion = releaseInfo.versionName
platform = mobile
updatedAt = Firestore server timestamp
```

Firestore 보안 규칙은 `firestore.rules`에 두며, `request.auth.uid == {uid}`인 사용자만 자신의 `users/{uid}/saves/current` 문서를 읽고 쓸 수 있습니다. 저장 payload는 900KB 이하로 제한합니다.

Auth/Firestore/Remote Config 배포:

```bash
firebase deploy --only firestore:rules,firestore:indexes,remoteconfig --project happy-farm-tycoon
```

운영 전 Firebase Console에서 Firestore API/database와 Anonymous provider가 활성화되어 있어야 합니다. 현재 CLI 계정은 `happy-farm-tycoon`의 `firestore.googleapis.com` 활성화 권한이 없으므로, 프로젝트 owner가 먼저 Firestore API를 켜야 합니다. `cloud_save_backup_enabled=false`로 두면 게임은 로컬 저장만 사용합니다.

배포:

```bash
firebase deploy --only remoteconfig --project happy-farm-tycoon
```

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

Crashlytics 최초 연결 확인은 실제 기기나 에뮬레이터에서 non-fatal smoke test를 기록한 뒤 Firebase Console에 수집되는지 확인합니다. 실제 crash 테스트는 릴리즈 직전 별도 임시 버튼이나 디버그 메뉴로만 수행합니다.
