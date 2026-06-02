# Apple App Store 출시 절차

## 현재 판정

`happy-farm`의 App Store 대상은 `apps/mobile` iOS React Native 앱입니다. 현재 확인된 고정값은 다음과 같습니다.

- App Store bundle ID: `com.seorilabs.happyfarm`
- 표시 앱 이름: `행복 농장 타이쿤`
- 기본 언어: `ko-KR`
- 앱 유형: 게임
- 가격: 무료
- 고객지원 이메일: `cs@seorilabs.com`
- 개인정보 처리방침: `https://www.seorilabs.com/privacy`
- iOS 최소 버전: `15.1`
- Xcode scheme: `HappyFarmMobile`
- Apple Developer Team ID: `HCDUXX4Z3X`

App Store Connect 등록 화면에 복사할 값은 `docs/app-store-registration.md`를 기준으로 관리합니다. 제출 준비 상태는 `pnpm check:app-store`로 확인합니다. 초기 상태에서는 실패하는 것이 정상이며, 실패 항목이 App Store Connect 입력값, iOS signing, 심사용 자산, 개인정보 답변의 남은 blocker입니다.

```bash
pnpm check:app-store
pnpm check:app-store -- --json
```

## 현재 blocker

- App Store archive용 Apple Distribution signing 설정이 아직 없습니다.
- App Store Connect 앱 개인정보 답변이 `확정 필요` 상태입니다.
- 연령 등급 설문 결과가 `확정 필요` 상태입니다.
- iOS Firebase 설정 파일 `GoogleService-Info.plist`는 gitignore 대상이며, 로컬 또는 CI secret으로 복원해야 합니다.
- App Store Connect 지원 URL/개인정보 처리방침 URL은 제출 전 실제 접속과 연락처 노출을 다시 확인해야 합니다.
- App Store Connect Team ID와 Xcode `DEVELOPMENT_TEAM` 값이 일치해야 합니다.

## 1단계: App Store Connect 앱 레코드 생성

App Store Connect에서 새 앱을 만들 때 다음 값을 사용합니다.

- Platform: iOS
- Name: `행복 농장 타이쿤`
- Primary language: `Korean`
- Bundle ID: `com.seorilabs.happyfarm`
- SKU: `happy-farm-ios`
- User access: 전체 접근 또는 운영 정책에 맞는 제한 접근

Apple 공식 도움말 기준으로 앱 레코드 생성 시 앱 이름, 기본 언어, bundle ID, SKU를 입력합니다. 앱 이름은 App Store product page와 설치 후 표시 이름에 쓰이며, 이름과 subtitle은 각각 최대 30자입니다.

## 2단계: 인증서, 프로비저닝, signing

App Store 배포용으로 준비할 항목:

- Apple Distribution certificate
- App Store provisioning profile for `com.seorilabs.happyfarm`
- Apple Developer Team ID: `HCDUXX4Z3X`
- App Store Connect API key

Xcode에서 `Apple Distribution: Seori Labs (HCDUXX4Z3X)`가 보이면 App Store/TestFlight 업로드용 signing 인증서는 잡힌 상태입니다. `Apple Development: Ilhwan Seo (BQFZ3325F2)`는 개발/실기기 실행용 인증서라 App Store profile과 섞어 쓰지 않습니다.

현재 repo의 Release signing 기준:

- Certificate: `Apple Distribution: Seori Labs (HCDUXX4Z3X)`
- Provisioning profile: `AppStore Happy Farm Profile`
- Debug 설정은 개발 실행용이므로 Apple Development를 계속 사용할 수 있습니다.

repo에는 인증서, profile, API key를 커밋하지 않습니다. 로컬/CI 비밀값은 다음 이름을 기준으로 맞춥니다.

```text
APP_STORE_CONNECT_API_KEY_ID
APP_STORE_CONNECT_ISSUER_ID
APP_STORE_CONNECT_PRIVATE_KEY_BASE64
APPLE_TEAM_ID
APPLE_KEYCHAIN_PASSWORD
APPLE_DISTRIBUTION_CERTIFICATE_BASE64
APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD
APPLE_PROVISIONING_PROFILE_BASE64
FIREBASE_IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64
```

## 3단계: iOS Firebase와 광고 설정

Firebase project는 `happy-farm-tycoon`을 사용합니다. iOS 앱을 Firebase Console에 등록하고 다음 파일을 복원해야 합니다.

```text
apps/mobile/ios/HappyFarmMobile/GoogleService-Info.plist
```

현재 iOS AdMob 값은 다음으로 확정했습니다.

- App ID: `ca-app-pub-2444587584524186~5266256811`
- 보상형 광고 단위 ID: `ca-app-pub-2444587584524186/5623525630`

`apps/mobile/app.json`, `apps/mobile/src/ads/config.ts`, `apps/mobile/ios/HappyFarmMobile/Info.plist`가 같은 값을 기준으로 합니다.

광고 SDK, Firebase Analytics, Crashlytics, Remote Config 사용 여부는 App Store Connect 앱 개인정보 답변에 반영해야 합니다.

콘텐츠 권한 질문은 AdMob 보상형 광고가 타사 광고 콘텐츠를 표시할 수 있으므로 다음으로 답변합니다.

```text
예, 타사 콘텐츠가 포함 또는 표시되거나 앱에서 타사 콘텐츠에 액세스하며 필요한 권한이 있습니다.
```

수출 규정/암호화 질문은 다음 기준으로 답변합니다.

- 앱은 Firebase, AdMob, App Store Connect, HTTPS/TLS 통신을 사용합니다.
- 자체/비표준 암호화 알고리즘은 구현하지 않습니다.
- Apple 운영체제 또는 표준 SDK가 제공하는 암호화 범위라 App Store Connect 제출 문서는 필요하지 않습니다.
- `Info.plist`에는 `ITSAppUsesNonExemptEncryption = false`를 둡니다.

디지털 서비스법(DSA)은 EU 포함 전세계 배포를 목표로 하고 AdMob 광고 수익화가 있으므로 거래자로 답변합니다.

```text
디지털 서비스법에 따른 거래자임
```

조직 계정에서는 D-U-N-S 주소가 표시되고, 제품 페이지 표시용 전화번호와 이메일을 제공해야 합니다. 이메일은 `cs@seorilabs.com`, 전화번호는 확정 필요입니다.

앱 개인정보의 `대략적인 위치`는 AdMob/Firebase 기준으로 수집됨으로 보고, 사용 목적은 `타사 광고`와 `분석`만 선택합니다. 게임 기능 자체는 위치를 사용하지 않으므로 `앱 기능`, `제품 개인 맞춤화`, `개발자의 광고 또는 마케팅`, `기타 목적`은 선택하지 않습니다. 추적 목적 사용 여부는 AdMob 광고 SDK가 타깃 광고 또는 광고 측정 목적으로 타사 데이터와 결합될 수 있으므로 `예`로 답변합니다. 이 답변을 유지하면 App Tracking Transparency/IDFA 동의 흐름 또는 비개인화 광고 제한 여부를 제출 전 확정해야 합니다.

## 4단계: App Store 등록 문구

등록 source of truth는 `app-store/app-store.config.json`입니다.

현재 값은 `docs/app-store-registration.md`와 `app-store/app-store.config.json`에 있습니다.

- 앱 이름: `행복 농장 타이쿤`
- subtitle: `작물을 키우는 방치형 농장`
- promotional text: `작물을 심고 수확해 골드를 모으세요. 밭을 넓히고 성장 속도와 판매 수익을 업그레이드하는 가벼운 방치형 농장 타이쿤입니다.`
- keywords: `작물,수확,농사,성장,방치형,타이쿤,시뮬레이션,게임`
- 설명: `docs/app-store-registration.md`의 App Store용 상세 설명 사용

남은 수동 입력:

- 연령 등급 설문
- App Review 연락처 전화번호
- 앱 개인정보 상세 답변
- 마케팅 URL 사용 여부와 실제 URL

## 5단계: App Store 이미지

Apple 공식 screenshot spec 기준, 앱은 1~10장의 `.jpeg`, `.jpg`, `.png` screenshot을 업로드합니다. iPhone은 최신 6.9형 screenshot을 우선 준비하되, App Store Connect가 6.5형 슬롯을 요구하는 경우 6.5형 규격도 사용할 수 있습니다. 현재 Xcode target은 iPhone과 iPad를 모두 포함하므로, iPad 13형 screenshot도 준비하거나 iPad 지원 여부를 별도로 줄여야 합니다.

생성된 파일:

```text
app-store/assets/app-icon-1024.png
app-store/screenshots/iphone-6.9/iphone-1.png
app-store/screenshots/iphone-6.9/iphone-2.png
app-store/screenshots/iphone-6.5/iphone-1.png
app-store/screenshots/iphone-6.5/iphone-2.png
app-store/screenshots/ipad-13/ipad-1.png
app-store/screenshots/ipad-13/ipad-2.png
```

권장 크기:

- App icon: `1024x1024`
- iPhone 6.9 portrait: `1260x2736`, `1290x2796`, `1320x2868`
- iPhone 6.5 portrait fallback: `1242x2688`, `1284x2778`
- iPad 13 portrait: `2064x2752`, `2048x2732`

## 6단계: TestFlight

첫 목표는 production 제출이 아니라 TestFlight 내부 테스트입니다.

확인 순서:

1. App Store Connect 앱 레코드 생성
2. iOS signing 설정 완료
3. `GoogleService-Info.plist` 복원
4. archive 생성 및 upload
5. App Store Connect에서 build processing 완료 확인
6. 내부 테스터 그룹 생성
7. TestFlight build를 내부 그룹에 배포

Apple 공식 도움말 기준으로 build upload에는 Account Holder, Admin, App Manager 또는 Developer 권한이 필요합니다. 내부 테스터 그룹은 App Store Connect 사용자 기준 최대 100명까지 추가할 수 있습니다.

## 7단계: GitHub Actions archive/upload

App Store archive/upload는 `.github/workflows/deploy-app-store.yml`에서 처리합니다. workflow는 `vX.Y.Z` 릴리즈 태그를 source of truth로 사용하고, `scripts/resolve-release-version.mjs --write-release-info`로 런타임 `RELEASE_INFO`를 먼저 쓴 뒤 archive합니다.

```bash
gh workflow run deploy-app-store.yml --ref develop -f release_tag=v1.0.0 -f upload_to_app_store=true
```

workflow가 자동으로 주입하는 값:

- `CFBundleShortVersionString`: 릴리즈 태그의 SemVer core, 예: `v1.0.0` -> `1.0.0`
- `CFBundleVersion`: 공통 buildNumber, 예: `v1.0.0` -> `1000000`
- 런타임 `RELEASE_INFO`: 같은 태그와 buildNumber

GitHub-hosted macOS runner에서 실행되므로 public repository는 표준 runner 무료 사용 범위에 들어갑니다. private repository에서는 GitHub plan의 included minutes를 사용하며, quota를 넘기면 billing 설정에 따라 차단 또는 과금됩니다.

## 8단계: 로컬 확인

```bash
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile test --watchAll=false
xcodebuild -list -project apps/mobile/ios/HappyFarmMobile.xcodeproj
pnpm check:app-store
```

Pods 설치 후에는 workspace 기준으로 archive를 확인합니다.

```bash
cd apps/mobile/ios
bundle install
bundle exec pod install
xcodebuild -workspace HappyFarmMobile.xcworkspace -scheme HappyFarmMobile -configuration Release -sdk iphoneos archive
```

## 공식 참고 문서

- [Add a new app](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/)
- [App information](https://developer.apple.com/help/app-store-connect/reference/app-information)
- [Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds)
- [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [Add internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/)
- [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications)
