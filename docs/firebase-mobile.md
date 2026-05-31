# Firebase 모바일 운영 기능

이 저장소는 초기 Firebase 범위를 `apps/mobile`의 Android/iOS 운영 기능으로 제한합니다.

- 사용: Analytics, Crashlytics, Remote Config
- 미사용: Firestore, Cloud Functions, Authentication
- AIT: native Firebase SDK를 직접 붙이지 않고, 필요 시 별도 HTTPS API 경유로 검토합니다.

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

Remote Config 템플릿은 repo root의 `remoteconfig.template.json`으로 관리하고, Firebase project는 `.firebaserc`의 `happy-farm-tycoon`을 기본값으로 사용합니다.

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

광고는 `mobile_ads_global_enabled=true`이고 현재 앱의 release `buildNumber`가 `mobile_ads_enabled_max_build_number` 이하일 때만 초기화합니다. 내부 테스트에서 검증 중인 새 릴리즈는 이 값을 올리기 전까지 광고를 로드하지 않습니다.

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
