# Apple App Store 등록값

## Source of truth

- 설정 파일: `app-store/app-store.config.json`
- 대상 앱: `apps/mobile` iOS React Native 앱
- Bundle ID: `com.seorilabs.happyfarm`
- SKU: `happy-farm-ios`
- 기본 언어: `ko-KR`

## 등록 화면 입력값

| 항목                     | 입력값                              |
| ------------------------ | ----------------------------------- |
| Platform                 | iOS                                 |
| 앱 이름                  | 행복 농장 타이쿤                    |
| 기본 언어                | Korean (`ko-KR`)                    |
| Bundle ID                | `com.seorilabs.happyfarm`           |
| SKU                      | `happy-farm-ios`                    |
| 앱 유형                  | 게임                                |
| 가격                     | 무료                                |
| 카테고리                 | Games                               |
| 게임 하위 카테고리       | Simulation, Casual                  |
| Game Center              | 사용 안 함                          |
| 로그인 필요              | 아니오                              |
| 콘텐츠 권한              | 예, 타사 콘텐츠 표시 및 권한 있음   |
| 수출 규정/암호화         | 비면제 암호화 사용 안 함            |
| 디지털 서비스법(DSA)     | 거래자                              |
| 라우팅 앱 적용 범위 파일 | 해당 없음                           |
| 버전                     | `1.0`                               |
| 빌드 번호                | `1`                                 |
| 저작권                   | `2026 Seorilabs`                    |
| 고객지원 이메일          | `cs@seorilabs.com`                  |
| 지원 URL                 | `https://www.seorilabs.com/support` |
| 마케팅 URL               | 확정 필요                           |
| 개인정보 처리방침 URL    | `https://www.seorilabs.com/privacy` |
| 심사 연락처 이름         | Seorilabs Support                   |
| 심사 연락처 이메일       | `cs@seorilabs.com`                  |
| 심사 연락처 전화번호     | 확정 필요                           |

## 스토어 문구

### 프로모션 텍스트

작물을 심고 수확해 골드를 모으세요. 밭을 넓히고 성장 속도와 판매 수익을 업그레이드하는 가벼운 방치형 농장 타이쿤입니다.

### 설명

행복 농장 타이쿤은 작은 밭에서 시작해 작물을 심고, 성장 시간을 기다린 뒤 수확해 골드를 모으는 농장 성장 게임입니다.

감자, 딸기, 수박처럼 단계별 작물을 키우고 수확 수익으로 밭을 개간하세요. 성장 속도와 판매 수익을 업그레이드하면 같은 시간에도 더 빠르게 농장이 커집니다.

새 구역을 열면 재배 공간과 목표가 늘어나고, 저장된 진행 상황은 다음 접속 때 이어집니다. 짧게 확인해도 보상이 쌓이는 가벼운 방치형 플레이에 맞췄습니다.

로그인 없이 바로 시작할 수 있으며, 복잡한 경쟁이나 과금 압박 없이 농장이 커지는 흐름에 집중합니다.

### 키워드

```text
작물,수확,농사,성장,방치형,타이쿤,시뮬레이션,게임
```

## 앱 심사 정보

- 로그인 필요: 아니오
- 테스트 계정: 없음
- 연락처: Seorilabs Support / `cs@seorilabs.com` / 전화번호 확정 필요
- 메모:

```text
로그인 없이 바로 시작 가능한 농장 타이쿤 게임입니다. 앱 진입 후 빈 밭을 누르고 씨앗을 선택하면 작물을 심을 수 있으며, 성장 시간이 지난 뒤 수확해 골드를 얻습니다. 상점에서 밭 개간, 구역 해금, 성장 속도/판매 수익 업그레이드를 확인할 수 있습니다. 선택형 보상 광고는 운영 설정에 따라 노출되지 않을 수 있습니다.
```

## 스크린샷과 미리보기

앱 미리보기는 선택 항목이므로 1차 제출에서는 비워 둡니다. iOS 앱은 screenshot이 필수입니다.

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

현재 `apps/mobile` Xcode target은 iPhone과 iPad를 모두 지원하므로 iPad 13형 스크린샷도 필요합니다. Apple Watch 앱은 없으므로 Apple Watch 스크린샷은 해당 없습니다.

## 확정 필요

- App Store Connect 앱 개인정보 상세 답변
- 연령 등급 설문 결과
- 심사 연락처 전화번호
- 마케팅 URL 사용 여부와 실제 URL
- DSA 제품 페이지 표시용 전화번호
- Apple Team ID 정합성: `app-store/app-store.config.json`과 Xcode `DEVELOPMENT_TEAM` 값 확인
- App Store archive/upload 자동화 workflow

## 콘텐츠 권한 답변 근거

앱 자체의 게임 이미지, 문구, 오디오는 자체 제작 또는 프로젝트 자산입니다. 다만 iOS 빌드는 AdMob 보상형 광고를 표시할 수 있으므로 App Store Connect의 콘텐츠 권한 질문에는 다음으로 답변합니다.

```text
예, 타사 콘텐츠가 포함 또는 표시되거나 앱에서 타사 콘텐츠에 액세스하며 필요한 권한이 있습니다.
```

근거: AdMob 광고 SDK/계약을 통해 타사 광고 콘텐츠가 표시될 수 있고, 해당 광고 표시는 광고 네트워크 권한 범위에서 이뤄집니다.

## 수출 규정/암호화 답변 근거

이 앱은 Firebase, AdMob, App Store Connect, HTTPS/TLS 등 Apple OS 또는 표준 SDK가 제공하는 통신 암호화만 사용하며 자체/비표준 암호화 알고리즘을 구현하지 않습니다.

App Store Connect 암호화 질문에는 다음 취지로 답변합니다.

```text
앱은 암호화를 사용하지만, Apple 운영체제 또는 표준 SDK/HTTPS 통신 범위의 면제 암호화만 사용합니다. 비면제 암호화는 사용하지 않습니다.
```

`Info.plist`에는 반복 질문을 줄이기 위해 다음 값을 둡니다.

```text
ITSAppUsesNonExemptEncryption = false
```

## 앱 개인정보 - 대략적인 위치

현재 iOS 빌드는 AdMob과 Firebase Analytics를 포함합니다. 앱 자체의 농장 게임 기능은 위치를 쓰지 않지만, Google Mobile Ads SDK는 IP 주소를 통해 기기의 대략적인 위치를 추정할 수 있습니다.

App Store Connect의 `대략적인 위치` 사용 목적은 다음만 선택합니다.

- 타사 광고
- 분석

추적 목적 사용 여부는 다음으로 답변합니다.

```text
예, 추적 목적으로 대략적인 위치 데이터를 사용합니다.
```

근거: AdMob 광고 SDK는 광고 타깃팅 또는 광고 측정 목적으로 앱에서 수집된 데이터와 타사 데이터를 결합할 수 있는 타사 SDK에 해당합니다.

제출 전 확인: 이 답변을 유지하면 App Tracking Transparency/IDFA 동의 흐름 또는 비개인화 광고 제한 여부를 별도로 확정해야 합니다.

선택하지 않습니다.

- 개발자의 광고 또는 마케팅
- 제품 개인 맞춤화
- 앱 기능
- 기타 목적

## 디지털 서비스법(DSA) 답변 근거

EU 포함 전세계 배포를 목표로 하고, iOS 앱은 AdMob 광고 수익화를 사용하며, Seori Labs 조직 계정으로 배포합니다. 따라서 App Store Connect의 DSA 질문에는 다음으로 답변합니다.

```text
디지털 서비스법에 따른 거래자임
```

조직 계정 기준으로 D-U-N-S 번호와 연결된 주소가 표시되고, App Store 제품 페이지 표시용 전화번호와 이메일을 제공해야 합니다. 이메일은 `cs@seorilabs.com`을 사용하고, 표시용 전화번호는 확정 필요입니다.

## 검증

```bash
pnpm check:app-store -- --json
```
