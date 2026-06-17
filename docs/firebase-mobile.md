# Firebase 운영 기능

Firebase project는 `.firebaserc`의 `happy-farm-tycoon`을 기본값으로 사용합니다.

- Mobile: Analytics, Crashlytics, Remote Config, Anonymous Auth, Firestore cloud-save backup
- AppsInToss: Firebase Web App 등록 완료. AIT target은 Firebase Web SDK를 `apps/ait/src/firebaseWeb/*`에서만 import합니다.
- 미사용: Cloud Functions, Cloud Messaging

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

AIT 앱 시작 시 `firebase/app`으로 Web App을 초기화하고, `firebase/analytics`의 `isSupported()`가 true인 환경에서만 Analytics를 초기화합니다. 지원되는 경우 `ait_firebase_initialized` smoke event와 FarmGame 이벤트를 Firebase Analytics로 전송합니다. dev bundle에서는 DebugView 확인을 위해 `debug_mode=1`을 함께 붙입니다. AppsInToss 실기기에서 Analytics 지원이 false이거나 초기화가 실패하면 게임은 계속 no-op analytics로 동작합니다.

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
