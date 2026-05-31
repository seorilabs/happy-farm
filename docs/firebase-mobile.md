# Firebase 운영 기능

Firebase project는 `.firebaserc`의 `happy-farm-tycoon`을 기본값으로 사용합니다.

- Mobile: Analytics, Crashlytics, Remote Config
- AppsInToss: Firebase Web App 등록 완료. AIT target은 Firebase Web SDK를 `apps/ait/src/firebaseWeb/*`에서만 import합니다.
- 미사용: Firestore, Cloud Functions, Authentication

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
mobile_ads_global_enabled = false
mobile_ads_enabled_max_build_number = 0
rewarded_ads_enabled = true
interstitial_ads_enabled = true
minimum_supported_version_code = 1
force_update_url = ""
remote_balance_enabled = false
```

모바일 광고는 `mobile_ads_global_enabled=true`이고 현재 앱의 release `buildNumber`가 `mobile_ads_enabled_max_build_number` 이하일 때만 초기화합니다. 내부 테스트에서 검증 중인 새 릴리즈는 이 값을 올리기 전까지 광고를 로드하지 않습니다.

AppsInToss 보상형 광고는 AppsInToss 광고 그룹 ID가 발급된 뒤 `apps/ait`의 광고 설정에 반영합니다. Firebase Remote Config를 AIT 런타임에서 직접 읽는 구조는 아직 사용하지 않습니다.

게임 경제, gold, 저장 데이터는 계속 로컬 권위 상태이며 서버 신뢰값으로 쓰지 않습니다.

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
