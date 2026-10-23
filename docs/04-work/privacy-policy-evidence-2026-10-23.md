# 행복농장타이쿤 개인정보 처리방침 근거

2026-10-23 확인. 구현 및 개발 검수, 공식 사이트 Ready PR까지 승인됐으며 공개, 운영 설정과 스토어 URL 변경은 제외한다. 이 문서는 공개용 개인정보 처리방침이 아니다.

## 범위와 확인 수준

Happy Farm의 SDK 및 앱 소스는 `3cb6e7b7e4ae8c3fe06268ec521104cfc21f5603`, Platform 서버의 읽기 전용 근거는 `b0e053423f74f107b5fb7d3c991c924fd9370b49`다. 소스에 있는 기능, 실행 설정 및 실제 서비스 상태는 서로 구분한다. SDK 공식 문서의 수집 가능 항목을 이번 앱의 실제 전송 실측으로 표시하지 않는다. 이번 조사는 집계와 설정만 조회했으며 개인별 분석 정보와 사용자 데이터를 수집하지 않았다.

| 항목 | 확인된 사실 | 코드 또는 설정 근거 | 한계 |
|---|---|---|---|
| 게임 기록 | 전체 농장 진행과 설정은 로컬 저장 경로를 쓴다. 게임 행동과 재화 변화의 일부는 분석으로 전송한다 | `apps/mobile/src/storage/farmPersistence.ts`, `apps/ait/src/farm/storage.ts`, `packages/farm-core/src/analytics.ts` | “게임 진행은 기기를 떠나지 않음”은 실제 전송 범위를 설명하지 못한다 |
| 농장 초기화 | 농장 저장을 제거하고 초기 농장을 생성한다 | `packages/farm-ui/src/FarmGame.tsx`의 `confirmReset`, 각 persistence의 `removePersistedGameState` | 설정, Firebase 익명 계정, 서버 분석 및 광고 기록의 일괄 삭제가 아니다 |
| 네이티브 인증 | Firebase 익명 인증의 UID 및 ID token으로 Platform 세션을 교환한다 | `apps/mobile/src/firebase/auth.ts`, `apps/mobile/src/platformEvents.ts` | Firebase UID와 분석 앱 인스턴스 식별자는 다른 값이다. UID를 GA4에 직접 넘긴다고 추정하지 않는다 |
| 앱인토스 식별 | 플랫폼 제공 이용자 식별키로 Platform 세션을 만든다 | `apps/ait/src/platformEvents.ts`, 설치된 native-modules 2.10.13의 `getAnonymousKey` | 별도 Toss 로그인 호출이 없다는 사실이 식별 정보가 없다는 뜻은 아니다 |
| 앱인토스 분석 | 별도의 임의 client ID를 앱인토스 Storage에 보관하고 분석 서버로 보낸다 | `apps/ait/src/firebaseWeb/analyticsIdentity.ts`, 분석 어댑터 | 플랫폼 이용자 키와 별개의 식별값이다 |
| 분석 | 네이티브 Firebase Analytics, 앱인토스의 분석 서버와 GA4 전달 경로가 있다 | `apps/mobile/src/firebase/analytics.ts`, `apps/ait/src/farm/platform/analytics.ts`, `packages/farm-core/src/analytics.ts` | 앱 시작, 온보딩, 수확과 재화, 광고, 버전, 플랫폼, 언어 및 세션 정보가 포함된다. 앱 안에 분석 수집 끄기 설정이 있다고 쓰지 않는다 |
| Firebase 초기화 | 분석 수집이 켜져 있고 확인한 초기화 경로에 개발 모드 제외 조건은 없다 | `apps/mobile/src/firebase/index.ts` | 실제 사용자와 개발 실행 식별 공백을 #580에서 유지한다 |
| 광고 형식 | 보상형과 전면 광고의 구현 경로가 있다. 배너 호출은 찾지 못했다 | `apps/mobile/src/ads/adMobRewardedAd.ts`, `adMobInterstitialAd.ts`, `apps/ait/src/farm/platform/fullScreenAd.ts` | registry의 광고 지면 존재와 현재 실제 노출은 구분한다 |
| 네이티브 광고 요청 | `requestNonPersonalizedAdsOnly: true`로 요청한다 | 위 네이티브 광고 어댑터 | 비개인화 광고는 무식별 처리 또는 Limited Ads와 같지 않다 |
| 동의 처리 | Android는 UMP 및 canRequestAds 경로를 쓰고 iOS는 별도 분기를 쓴다 | `apps/mobile/src/ads/adMobConsent.ts` | iOS IABTCF 키 정리가 Firebase 자체 저장까지 삭제했다는 증거가 아니다. #575 개인정보 항목을 유지한다 |
| 광고 검증 기록 | 서버 소스에 이용자, 광고 지면과 제공자, 보상, 생성과 확인 및 수령 시각, 24시간 claim 만료와 90일 ttlAt가 있다 | Platform `server/internal/ads/service.go`, `model.go` | 운영 TTL, 배포 revision, 실제 삭제 주기를 확인하지 못했다. 90일 자동 삭제를 보장하지 않는다 |
| 서버 삭제 경로 | ads, events, identity의 삭제 구현이 있다 | Platform `server/internal/ads/deletion.go`, `events/deletion.go`, `identity/deletion_worker.go` | 현재 서비스에서 실행됐거나 이용자 삭제 요청 절차가 완성됐다는 증거가 아니다 |
| BigQuery | 내보내기 dataset 기본 만료 및 최신 일별 테이블 2개에 60일 만료 설정을 확인했다 | 읽기 전용 dataset 및 table 설정 응답 | GA4 속성 보관 기간, 서버 DB 및 로그 보관 기간과 구분한다 |
| GA4 속성 | 보관 설정 조회가 403으로 거절됐다 | Admin API의 원 응답 | 권한 우회나 계정 변경 없이 확인 불가로 남긴다 |
| 알림 | Notifee 기반 로컬 수확 알림을 쓴다 | `apps/mobile/src/notifications/harvestNotifications.ts` | 이 경로를 FCM 원격 푸시로 기술하지 않는다 |
| 결제 및 기타 SDK | 현재 앱 호출에서 실제 인앱 결제, Remote Config, Crashlytics, Firestore 클라우드 저장 경로는 확인되지 않았다 | 앱 초기화와 사용처, package 및 lock, 어댑터 검색 | 의존성 존재 또는 서버의 iap_ad_free 필드만으로 실제 판매 기능을 쓰지 않는다 |

## SDK 설정에서 주의할 부분

RN Firebase Analytics 25.1의 설치된 podspec과 Podfile.lock에는 FirebaseAnalytics IdentitySupport 12.15.0이 포함된다. Podfile에 `RNFirebaseAnalyticsWithoutAdIdSupport` 설정은 없다. 이는 실제 IDFA 수집 또는 전송을 측정한 결과가 아니다.

앱 자체 PrivacyInfo.xcprivacy의 tracking=false 및 비어 있는 수집 항목은 포함된 모든 SDK가 아무 정보도 수집하지 않는다는 증거가 아니다. Android 원본 Manifest에서 AD_ID 제거가 없다는 사실도 최종 병합된 권한이나 실제 광고 ID 전송을 확정하지 않는다. Android allowBackup=false와 iOS 백업 동작도 동일하게 취급하지 않는다.

설정 화면의 광고 안내에 있는 추적 관련 보장 문구는 실제 SDK 설정 및 수집 범위와 별도로 검토해야 한다. 이 작업에서 동의값, ATT, 분석 설정이나 SDK 저장소를 임의로 바꾸지 않았다.

## 공식 자료

- [Firebase 개인정보 및 보안](https://firebase.google.com/support/privacy): Firebase 인증, Google Analytics의 별도 약관, 서비스별 처리와 보관 정보를 구분한다. 인증 삭제 설명을 GA4 또는 자체 광고 서버의 보관 기간으로 적용하지 않는다.
- [AdMob 광고 제공 모드](https://developers.google.com/admob/ios/privacy/ad-serving-modes): 비개인화 광고에도 노출 횟수 및 집계 보고를 위한 식별 정보가 사용될 수 있다.
- [Google Mobile Ads의 App Store 데이터 고지](https://developers.google.com/admob/ios/privacy/data-disclosure): IP, 식별 정보, 광고와 상호작용, 진단 및 성능 정보의 처리 가능 항목을 설명한다. 앱별 최종 고지는 개발자가 확인해야 한다.
- [앱인토스 이용자 키 안내](https://developers-apps-in-toss.toss.im/documentation/common/authentication/hash-key.md): 설치된 2.10.13의 선언 및 구현도 함께 확인했다. 구문서의 API 구분만 보고 현재 getAnonymousKey 사용을 오류로 판정하지 않는다.
- [개인정보보호위원회 개인정보 처리방침 작성지침, 2026년 4월](https://www.privacy.go.kr/cmm/fms/FileDown.do?atchFileId=ATCH_000000000934742&fileSn=1): 목적 및 근거, 항목, 보관과 파기, 위탁, 해당 시 국외 이전과 아동 관련 항목을 대조했다. 이 사실표나 미완성 초안을 법률 검토가 끝난 방침으로 표시하지 않는다.

## 공개 전 남은 확인

사용자는 운영 확인 자료가 없다고 답했다. 다음 내용은 공개 전 조건으로 유지한다.

1. GA4 속성의 실제 보관 기간 및 분석 원본과 식별 정보의 삭제 절차.
2. Platform 광고 보상 및 이벤트 기록의 운영 TTL, 실제 삭제 주기와 성공, 요청 시 삭제 절차.
3. 처리 수탁사와 역할, 국외 처리 국가, 이전 항목, 목적, 시점과 방법, 보관 기간 및 적용 근거.
4. 대상 연령과 해당되는 아동 처리 의무, 처리 근거, 이용자 권리 행사 절차의 운영 가능성. App Store 등급만으로 대상 연령을 정하지 않는다.
5. iOS 분석과 광고 SDK의 실제 설정에 맞는 고지 및 #575 TCF 조사. 비개인화 광고 설정을 “식별 정보 없음” 또는 “모든 추적 없음”으로 바꾸어 쓰지 않는다.
6. 한국어와 영어 방침의 확정 검토, 공식 사이트 공개 URL 2개의 실제 200 응답, 그 뒤 앱 및 스토어 URL의 별도 변경과 읽기 확인.

공식 사이트는 main 병합 즉시 배포되므로 이번에는 Ready PR에서 멈춘다. 현재 회사 공통 방침과 앱, Console의 개인정보 URL은 유지한다. 보관 기간이나 국가를 임의로 채워 완결된 공개 방침으로 만들지 않는다.

## 이후 수정과 근거의 연속성

첫 수확과 시트 수정 후보 `3adc700ac06362b6417e8298d6a0400411cb772a`에서도 위 근거의 인증, 분석, 광고, 저장 어댑터와 Pod 설정 15개 파일은 근거 후보와 바이트가 같다. FarmGame의 초기화 코드는 온보딩과 팝업 순서를 수정했으며, 같은 로컬 농장 저장 제거 호출을 유지한다. 이를 서버 계정 또는 서버 기록 삭제로 확대하지 않는다. 실제 운영 보관과 삭제의 미확인 상태도 그대로다.

## 준비한 문서와 실행 근거

[공식 사이트 Ready PR #89](https://github.com/seorilabs/seorilabs-official/pull/89)은 병합하지 않았다. 공식 사이트 초안 후보는 `084dd51b1bc383bd32fc898b6663f17c9d8b3ae5`다. KO/EN 각 13개 본문 및 실제 화면, 언어 전환, 목차와 legal 인덱스, npm check 및 build와 정적 CI를 확인했다. 검토 PR은 Ready에서 멈추며 공식 제품 URL의 공개 200이나 스토어 URL 변경을 완료로 표시하지 않는다.

원본 174개, 21,900,323바이트를 SHA256과 크기로 대조해 NAS에 보관했다: `/Volumes/Data/Backup/agent-artifacts/happy-farm/2026-10-23/084dd51b1bc383bd32fc898b6663f17c9d8b3ae5/issue-520-113708Z`. 원본 manifest와 단계별 후보/검토/실패 및 관측 경계 기록을 같이 남겼다. 개인정보 처리 및 삭제의 운영 성공을 개발 화면 검수로 대체하지 않는다.
