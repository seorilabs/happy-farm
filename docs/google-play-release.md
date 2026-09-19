# Google Play 출시 절차

## 현재 판정

현재 저장소는 AppsInToss Granite React Native 미니앱을 `apps/ait`에 두고, Google Play/App Store용 표준 React Native 타깃을 `apps/mobile`에 둔 pnpm workspace입니다. `pnpm build`는 AppsInToss 배포용 `.ait`를 만들고, `pnpm build:android`는 `apps/mobile`의 Android App Bundle(`.aab`)을 만듭니다.

실제 확인 결과:

- `apps/mobile/android` 네이티브 프로젝트가 있습니다.
- `apps/mobile/android/app/build.gradle`의 `applicationId`는 `com.seorilabs.happyfarm`입니다.
- `targetSdkVersion`은 36입니다.
- `pnpm build:android`로 `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`를 생성했습니다.
- `pnpm --dir apps/ait exec react-native config`의 `project.android`가 `null`입니다.
- `apps/ait/src/farm/platform/*`는 AppsInToss `Storage`, 전면/보상형 광고 API에 묶여 있습니다.
- `packages/farm-ui`는 공유 RN 게임 화면을 담고, `apps/mobile`은 모바일 storage/Firebase/AdMob/audio adapter를 주입합니다.
- 현재 `.aab`는 `play-store/secrets/happy-farm-upload-key.jks` upload key로 서명됩니다.
- Android release는 R8 코드 최적화와 리소스 축소를 사용하며, AAB 안의 가독화 파일·음원·작물 이미지가 업로드 전에 자동 검사됩니다.
- Firebase Analytics는 유지하고 저빈도 핵심 이벤트만 익명 Platform BigQuery sink에도 복제합니다. 전송 경계와 중단 절차는 `docs/firebase-mobile.md`를 따릅니다.

따라서 지금은 Play Console 내부 테스트 업로드에 필요한 signed AAB와 repo-local readiness 체크가 준비된 상태입니다.

## 목표 산출물

- Google Play에 영구 등록할 `packageName`: `com.seorilabs.happyfarm`
- `apps/mobile` Android 네이티브 프로젝트
- `targetSdkVersion` 35 이상인 release `.aab`
- Play App Signing에 사용할 upload key
- Play Console 기본 등록값, 앱 콘텐츠 선언, 스토어 등록 문구, 이미지
- 내부 테스트 트랙에 업로드 가능한 첫 release draft
- 이후 자동화를 위한 `play-store/google-play.config.json`

## 현재 자동 체크

```bash
pnpm check:play
pnpm check:play -- --json
pnpm check:markets
pnpm check:markets:build
python3 /Users/syous/.codex/skills/google-play-store-registration/scripts/validate_play_store_config.py --root .
python3 /Users/syous/.codex/skills/google-play-store-registration/scripts/validate_play_store_config.py --root . --allow-console-gates
```

전체 출시 readiness 체크는 아직 실패하는 것이 정상입니다. Android 프로젝트, `.aab`, release signing, 고객지원/개인정보/광고/한국 배포 선언과 Play Store 이미지 항목은 통과하지만, 콘텐츠 등급/타겟 연령/데이터 보안/한국 게임 등급 판단이 남아 있습니다.

## 1단계: Google Play용 앱 구조 결정

추천 경로는 AppsInToss 앱을 그대로 바꾸지 않고 Google Play용 표준 RN 앱 타깃을 repo 안에 추가하는 것입니다.

- 현재 repo 안에 `apps/mobile/android`를 생성해 Android/iOS dual target으로 운영
- `packages/farm-core`의 게임 로직과 `packages/farm-ui`의 RN 화면을 공유하고, `apps/ait`와 `apps/mobile`에서 플랫폼 adapter만 다르게 구현

분리 시 교체해야 할 항목:

- AppsInToss `Storage` -> 네이티브 저장소
- AppsInToss 전면/보상형 광고 -> Google Play에서 허용되는 Android 광고 SDK 또는 광고 제거
- AppsInToss analytics/bridge -> 네이티브 분석 또는 제거
- `intoss://happy-farm/` 진입 -> Android launcher activity

## 2단계: Android release build 준비

필수 조건:

- `android/app/build.gradle` 또는 `build.gradle.kts`
- `applicationId`와 `play-store/google-play.config.json.packageName` 일치
- 새 앱 제출 기준 `targetSdkVersion >= 35`
- 증가 가능한 `versionCode`
- release signing 설정
- `pnpm build:android` 또는 `apps/mobile/android/gradlew :app:bundleRelease`로 `.aab` 생성

release 최적화 기준:

- `minifyEnabled true`, `shrinkResources true`, `proguard-android-optimize.txt`를 함께 사용합니다.
- `react-native-sound`가 파일명으로 동적 조회하는 WAV 7개는 `com_seorilabs_happyfarm_audio_keep.xml`에서 명시적으로 보존합니다. Android 리소스 keep 파일은 전역 범위이므로 package name이 포함된 고유 파일명을 유지합니다.
- `pnpm check:play`는 소스 설정을 검사하고 AAB가 없으면 산출물 검사를 건너뜁니다.
- `pnpm check:play:release -- --json`은 AAB를 필수로 요구하고 `proguard.map`, WAV 7개, 작물·밭 이미지 전체를 검사합니다. Google Play workflow는 이 검사를 업로드 전에 실행합니다.
- 로컬 mapping 원본은 `apps/mobile/android/app/build/outputs/mapping/release/mapping.txt`, AAB 내 사본은 `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`입니다. Android Gradle Plugin 4.1+로 만든 AAB는 Play가 이 파일을 자동으로 가져가므로 별도 수동 업로드가 필요하지 않습니다.

R8 적용 릴리스는 내부 테스트에서 익명 로그인(Platform 세션), 광고, 알림, 앱 재시작 후 로컬 저장 복원과 WAV 7개 재생을 smoke test합니다. 라이브러리 전체를 보존하는 광범위 `-keep` 규칙은 최적화 효과를 없앨 수 있으므로 실제 런타임 문제가 확인된 경우에만 추가합니다.

2026-05-29 공식 Play Console Help 확인 기준 Google Play 신규 앱/업데이트 제출은 Android 15, API level 35 이상을 요구합니다. 현재 `apps/mobile`의 `targetSdkVersion`은 36이라 이 기준은 충족합니다.

Google 공식 문서 기준으로, Google Play 제출에는 Android App Bundle을 만들고 release bundle은 개인 키로 서명되어야 합니다.

### Android 15 edge-to-edge 지원 중단 API 경고

2026-06-04 확인 기준 Play Console의 1.0.0 경고는 Android 15 edge-to-edge 변경사항과 관련된 `Window.getStatusBarColor`, `Window.setStatusBarColor`, `Window.setNavigationBarColor`, `LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES`, `LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT` 사용입니다.

현재 앱 코드 대응:

- `apps/mobile/App.tsx`에서 RN `StatusBar` 컴포넌트를 제거해 앱 JS가 `StatusBarModule.setColor` 경로를 호출하지 않게 했습니다.
- `apps/mobile/android/build.gradle`에서 Kotlin Gradle Plugin `2.3.21`과 Google Maven 기준 최신 stable Google Mobile Ads SDK `25.3.0`을 명시합니다.
- `FarmGame`은 `react-native-safe-area-context`의 top/bottom inset을 실제 UI padding에 반영합니다.

남는 범위:

- `com.facebook.react:react-android:0.85.0` AAR 내부에는 `StatusBarModule`과 `WindowUtilKt`의 deprecated API 참조가 남아 있습니다.
- RN `0.85.3` patch source도 같은 참조를 유지하므로 단순 RN patch 업데이트만으로는 이 경고가 완전히 사라진다고 볼 수 없습니다.
- 새 AAB 업로드 후 Play Console 경고가 계속 남으면 RN upstream 수정 또는 repo-local patched `react-android` AAR 전략을 별도 작업으로 진행해야 합니다.

release signing 상태:

- release build는 `apps/mobile/android/key.properties`를 통해 upload key를 읽습니다.
- `play-store/secrets/happy-farm-upload-key.jks`와 `apps/mobile/android/key.properties`는 gitignore 대상입니다.
- Play Console의 Play App Signing 최초 설정은 수동 승인 단계입니다.

## 3단계: Play Console 앱 생성

첫 앱 shell 생성은 Play Console에서 수동으로 진행합니다.

- 기본 언어
- Google Play 표시 앱 이름
- 앱 또는 게임 여부
- 무료 또는 유료 여부
- 사용자 문의 이메일
- 정책/수출법 선언
- Play App Signing 약관

주의: package name은 고유하고 영구적입니다. 이 앱의 Google Play package name은 `com.seorilabs.happyfarm`으로 확정했습니다.

## 4단계: 앱 콘텐츠와 정책 선언

필수로 확정할 항목:

- 콘텐츠 등급 설문
- 타겟 연령 및 앱 콘텐츠
- 데이터 보안 섹션
- 개인정보 처리방침 URL: `https://www.seorilabs.com/privacy`
- 광고 포함 여부: `yes`
- 한국 배포 여부: `yes`

데이터 보안 답변에는 AdMob/Firebase 분석 데이터 외에 Firebase Anonymous Auth의 앱 생성 사용자 식별자를 포함합니다. 이 식별자는 Seorilabs Platform 세션(광고 정책·claim, analytics relay)에 쓰입니다. **게임 진행 데이터는 기기 밖으로 나가지 않습니다** — Firestore 클라우드 저장을 제거해 저장은 로컬 하나뿐입니다.

모바일 앱은 첫 수확 뒤 농장 알림 안내에서 사용자가 명시적으로 수락하거나 설정에서 개별 토글을 켠 경우 Android 13+ `POST_NOTIFICATIONS` 런타임 권한을 요청합니다. 수락 시 수확 시점과 데일리 보너스·오늘의 작물 복귀 리마인더가 함께 활성화되며, 설정에서 각각 끌 수 있습니다. 이 알림은 Notifee 기반 기기 로컬 알림이며 FCM token, 서버 push campaign, 추가 개인정보 전송을 사용하지 않으므로 Google Play 데이터 보안 답변에는 별도 수집 데이터로 추가하지 않습니다.

이 앱은 게임이므로 한국에 배포하려면 GRAC 등급 인증 필요 여부를 별도로 확인해야 합니다. 한국 배포를 보류하고 다른 국가 internal/closed test부터 시작하는 선택지도 유지합니다.

## 5단계: 내부 테스트 업로드

첫 자동화 목표는 production이 아니라 internal track draft입니다.

권장 순서:

1. Play Console에 앱 shell 생성
2. Play App Signing 설정
3. service account 생성 및 권한 부여
4. signed `.aab` 생성
5. Google Play Developer API로 edit 생성
6. bundle upload
7. internal track release draft 생성
8. edit commit

개인 개발자 계정이 2023-11-13 이후 생성된 경우, production 공개 전 최소 12명 tester가 14일 연속 opt-in한 closed test 요구사항이 있을 수 있습니다.

### GitHub Actions AAB 업로드

workflow:

```bash
.github/workflows/deploy-google-play.yml
```

이 workflow는 명시적 실행 전용입니다: `workflow_dispatch` 또는 `deploy-all.yml`/Backoffice·Telegram `/deploy`가 `workflow_call`로 호출합니다. 태그 push로는 자동 실행되지 않습니다. `release_tag` 입력으로 빌드·업로드할 `vX.Y.Z` 릴리즈 태그를 지정하고, 비우면 실행한 ref를 사용합니다.

- `release_tag` 지정 실행: 해당 릴리즈 태그를 checkout 후 signed AAB 빌드(업로드 여부는 아래 옵션으로 제어)
- 수동 실행 + `send_to_google_play=false`: 같은 릴리즈 태그로 signed AAB만 빌드하고 artifact로 보관
- 수동 실행 + `send_to_google_play=true`: Google Play Developer API로 내부 테스트 트랙에 업로드
- `after_upload=초안만 만들기`: 첫 자동화 검증용 초안 릴리스 생성
- `after_upload=내부 테스터에게 배포하기`: 내부 테스터에게 배포 가능한 릴리스 생성
- `versionName`: `docs/release-versioning.md` 기준의 태그 SemVer numeric core, 예: `v1.27.0` -> `1.27.0`
- `versionCode`: 중앙 migration epoch를 포함한 태그 파생값, 예: `v1.27.0` -> `1001027000`
- 업로드 실행 시 Play API에서 기존 max `versionCode + 1`보다 작은 중앙 파생값은 실패 처리합니다.
- 광고 활성화는 빌드에 고정됩니다. 원격 kill switch가 없으므로 광고를 멈추려면 새 빌드를 올려야 합니다.

필수 GitHub Actions secrets:

```bash
gh secret set GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64
gh secret set GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD
```

keystore base64 값은 로컬에서 다음처럼 만들 수 있습니다.

```bash
base64 -i play-store/secrets/happy-farm-upload-key.jks | tr -d '\n' | gh secret set GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64
```

key password가 keystore password와 다르면 추가로 설정합니다.

```bash
gh secret set GOOGLE_PLAY_UPLOAD_KEY_PASSWORD
```

key alias가 기본값 `happy-farm-upload`이 아니면 repository variable로 설정합니다.

```bash
gh variable set GOOGLE_PLAY_UPLOAD_KEY_ALIAS --body "<key-alias>"
```

Google Play API 업로드까지 켜려면 Workload Identity Federation용 repository variables가 필요합니다.

```bash
gh variable set GOOGLE_WORKLOAD_IDENTITY_PROVIDER --body "projects/<project-number>/locations/global/workloadIdentityPools/<pool-id>/providers/<provider-id>"
gh variable set GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL --body "<service-account>@<project-id>.iam.gserviceaccount.com"
```

service account는 Play Console에서 이 앱에 대한 최소 권한을 받아야 합니다. 첫 목표는 internal testing track release 관리 권한입니다.

### 로컬 Android Publisher API 인증

2026-05-29에 로컬 ADC(Application Default Credentials)를 생성해 스토어 등록값 apply/verify를 완료했습니다.

```bash
gcloud auth application-default login --no-browser --scopes=https://www.googleapis.com/auth/androidpublisher,https://www.googleapis.com/auth/cloud-platform
gcloud auth application-default print-access-token >/dev/null
python3 -m pip install --user google-api-python-client google-auth
```

현재 gcloud 계정 토큰이 stale이면 일반 `application-default login`이 실패할 수 있습니다. 이 경우 `--no-browser`가 출력한 `--remote-bootstrap` 명령을 브라우저가 있는 셸에서 실행하고, 반환된 localhost URL을 대기 중인 명령에 붙여 넣습니다.

수동 실행 예:

```bash
gh workflow run release-tag.yml -f bump=minor
gh workflow run deploy-google-play.yml --ref v1.27.0 -f send_to_google_play=false
gh workflow run deploy-google-play.yml --ref v1.27.0 -f send_to_google_play=true -f after_upload='초안만 만들기'
```

`review_later_in_console`은 기본값 `false`입니다. 이 값을 켜면 검토 제출을 자동으로 하지 않고 Play Console에서 나중에 처리하도록 요청합니다. 업로드에는 해당 태그의 GitHub Release에 첨부된 비어 있지 않은 `release-notes.json`이 반드시 필요합니다.

검증된 AAB 업로드는 exact 중앙 workflow SHA에 포함된 `scripts/release/upload-google-play-aab.py`만 수행합니다. 저장소의 `scripts/upload-google-play-internal.py`는 다음 versionCode 조회와 exact versionCode 승격만 담당하며 AAB 업로드 기능은 없습니다.

참고: Google Play Developer API 문서 일부는 internal testing track 식별자를 `qa`로 설명하지만, Play API 예제와 기존 자동화에서는 `internal`도 사용됩니다. 업로드 스크립트는 `tracks.list` 결과를 확인해 `internal`/`qa`를 자동 보정합니다.

### 로컬 릴리즈 업로드 금지

로컬 `pnpm build:android`는 개발용 build-only 검증입니다. 중앙 release binding, artifact digest readback, WIF 업로드 경계를 거치지 않으므로 마켓 릴리즈에 사용할 수 없습니다.

릴리즈 후보 생성과 내부 트랙 업로드는 태그를 지정한 중앙 workflow만 사용합니다.

```bash
gh workflow run deploy-google-play.yml --ref main \
  -f release_tag=v1.27.0 \
  -f send_to_google_play=true \
  -f after_upload='초안만 만들기'
```

## 자동화 범위

자동화 가능:

- `.aab` 존재와 Gradle 설정 검사
- Play Store listing text 검사
- 이미지 파일 존재/규격 검사
- Google Play Developer API를 통한 bundle upload
- internal/closed/production track release draft 생성
- localized listing text/image 업데이트

자동화 보류 또는 수동:

- 최초 Play Console 앱 생성
- package name 최종 선택
- Play App Signing 최초 약관/키 선택
- 콘텐츠 등급/데이터 보안/정책 설문 최종 제출
- 한국 게임물 등급 인증 판단

스토어 등록 문구, 이미지 경로, API 자동화 범위는 `docs/google-play-store-listing.md`를 기준으로 관리합니다.

2026-05-29 적용 결과:

- Android Publisher API `edits.details`: 기본 언어와 고객지원 이메일 적용 및 검증 완료
- Android Publisher API `edits.listings`: `ko-KR` title/short/full description 적용 및 검증 완료
- Android Publisher API `edits.images`: icon, feature graphic, phone/7-inch/10-inch screenshots 적용 및 검증 완료
- `changesNotSentForReview=true`는 현재 앱 상태에서 API가 거부해 플래그 없이 commit했습니다.
- Android Publisher API `edits.bundles`/`edits.tracks`: `versionCode=1` AAB를 `internal` track에 `0.1.0-internal` draft release로 업로드하고 readback 검증 완료

## 공식 참고 문서

- [Create and set up your app](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en)
- [Build your app from the command line](https://developer.android.com/build/building-cmdline?hl=en)
- [Enable app optimization with R8](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization)
- [Customize which resources to keep](https://developer.android.com/topic/performance/app-optimization/customize-which-resources-to-keep)
- [Deobfuscate or symbolicate crash stack traces](https://support.google.com/googleplay/android-developer/answer/9848633?hl=en)
- [Use Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en)
- [Target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- [Google Play Developer API](https://developer.android.com/google/play/developer-api?hl=en)
- [APKs and Tracks](https://developers.google.com/android-publisher/tracks)
- [Content ratings](https://support.google.com/googleplay/android-developer/answer/9898843?hl=en)
- [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
