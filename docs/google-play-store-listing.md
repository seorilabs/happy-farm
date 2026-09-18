# Google Play 스토어 등록값

## Source of truth

- 설정 파일: `play-store/google-play.config.json`
- 등록 자동화 스키마: `storeListing.appName`, `storeListing.shortDescription`, `storeListing.fullDescription`를 locale map으로 관리합니다.
- Android 대상: `apps/mobile`
- AppsInToss 대상: `apps/ait`는 Google Play 등록/업로드 대상이 아닙니다.

## 확정된 값

- Package name: `com.seorilabs.happyfarm`
- 기본 언어: `ko-KR`
- 앱 분류: `game`
- 가격: `free`
- 고객지원 이메일: `cs@seorilabs.com`
- 개인정보 처리방침 URL: `https://www.seorilabs.com/privacy`
- 첫 목표 트랙: `internal`
- 릴리스 이름: `1.3.2`

## 스토어 문구

### ko-KR

- 앱 이름: `행복 농장 타이쿤`
- 짧은 설명: `작물을 심고 수확하며 농장을 확장하는 방치형 농장 게임`
- 전체 설명: 작은 밭에서 시작해 작물을 심고 수확하며 골드를 모으는 방치형 농장 타이쿤 게임입니다. 골드로 밭을 넓히고 성장 속도와 판매 수익을 업그레이드하세요.

  작물 도감을 채우고, 연구소에서 자동 수확·자동 파종과 신품종 교배를 해금할 수 있습니다. 농장을 졸업시키면 새 지역을 개척하고 체인 농장이 오프라인 수익을 만들어 줍니다.

  업적과 칭호, 마스터리와 희귀 변이 수확까지 이어지는 장기 성장 목표를 즐겨보세요.

### en-US

- App name: `Happy Farm Tycoon`
- Short description: `Plant, harvest, research, and expand your idle farm`
- Full description: Start with a small field, plant crops, harvest gold, and build a cozy idle farm tycoon. Spend gold to clear more plots and upgrade growth speed and sale profit.

  Complete your crop collection, unlock auto harvest, auto replanting, and hybrid breeding in the Research Lab. Graduate a farm to pioneer a new region while chain farms keep producing offline income.

  Keep growing through achievements, titles, crop mastery, and rare harvest mutations.

## 릴리스 노트

### ko-KR

```text
Android 내부 테스트 빌드를 다시 만들고, 무한 엔드게임 시스템(마스터리, 변이 도감, 연구소, 교배/자동화, 농장 체인 개척, 업적/칭호)이 Android bundle에 포함되도록 수정했습니다.
```

### en-US

```text
Rebuilt the Android internal test build so the endless endgame systems, including mastery, mutation collection, Research Lab, breeding, automation, farm-chain pioneering, achievements, and titles, are included in the Android bundle.
```

## 이미지 경로

- 원본 앱 아이콘: `assets/행복농장앱아이콘_600x600.png`
- Play 앱 아이콘: `play-store/assets/icon-512.png`
- 피처 그래픽 기본값(ko-KR): `play-store/assets/feature-graphic-1024x500.png`
- 피처 그래픽 ko-KR: `play-store/assets/ko-KR/feature-graphic-1024x500.png`
- 피처 그래픽 en-US: `play-store/assets/en-US/feature-graphic-1024x500.png`
- 기본 phone screenshot(ko-KR):
  - `play-store/screenshots/phone/phone-1.png`
  - `play-store/screenshots/phone/phone-2.png`
- 기본 7-inch tablet screenshot(ko-KR):
  - `play-store/screenshots/tablet-7/tablet-7-1.png`
  - `play-store/screenshots/tablet-7/tablet-7-2.png`
- 기본 10-inch tablet screenshot(ko-KR):
  - `play-store/screenshots/tablet-10/tablet-10-1.png`
  - `play-store/screenshots/tablet-10/tablet-10-2.png`

locale별 실제 Android 캡처 경로:

- ko-KR phone:
  - `play-store/screenshots/ko-KR/phone/phone-1.png`
  - `play-store/screenshots/ko-KR/phone/phone-2.png`
- ko-KR 7-inch tablet:
  - `play-store/screenshots/ko-KR/tablet-7/tablet-7-1.png`
  - `play-store/screenshots/ko-KR/tablet-7/tablet-7-2.png`
- ko-KR 10-inch tablet:
  - `play-store/screenshots/ko-KR/tablet-10/tablet-10-1.png`
  - `play-store/screenshots/ko-KR/tablet-10/tablet-10-2.png`
- en-US phone:
  - `play-store/screenshots/en-US/phone/phone-1.png`
  - `play-store/screenshots/en-US/phone/phone-2.png`
- en-US 7-inch tablet:
  - `play-store/screenshots/en-US/tablet-7/tablet-7-1.png`
  - `play-store/screenshots/en-US/tablet-7/tablet-7-2.png`
- en-US 10-inch tablet:
  - `play-store/screenshots/en-US/tablet-10/tablet-10-1.png`
  - `play-store/screenshots/en-US/tablet-10/tablet-10-2.png`

현재 Play 스크린샷은 `com.seorilabs.happyfarm` Play 설치본 `1.3.2 / 1003002`를 Android 기기에서 실행해 캡처한 실제 게임 화면입니다. phone은 `1080x1920`, tablet 슬롯은 Android `wm size 1440x2560`으로 앱을 다시 렌더링해 캡처했습니다.

## API 자동화 범위

2026-06-12에 Android Publisher API로 다음 항목을 적용하고 readback 검증까지 완료했습니다.

- 기본 언어: `ko-KR`
- 고객지원 이메일: `cs@seorilabs.com`
- `ko-KR`, `en-US` title/short/full description
- 앱 아이콘 1장
- 피처 그래픽 1장
- `ko-KR`, `en-US` phone screenshot 각 2장
- `ko-KR`, `en-US` 7-inch tablet screenshot 각 2장
- `ko-KR`, `en-US` 10-inch tablet screenshot 각 2장

Android Publisher API로 자동 반영 가능한 항목:

- 기본 언어
- 고객지원 이메일
- locale별 title/short/full description
- 앱 아이콘, 피처 그래픽, 스크린샷 이미지

Play Console에서 직접 확인해야 하는 항목:

- 최초 앱 생성
- 앱/게임 및 무료/유료 선언
- 개인정보 처리방침 URL 입력 및 검토
- 타겟 연령 및 앱 콘텐츠
- Data safety
- IARC 콘텐츠 등급
- 한국 배포 시 GRAC 등급 판단: 별도 진행 불필요로 확인
- production access

Data safety는 Firebase Anonymous Auth의 앱 생성 사용자 식별자 수집을 반영해야 합니다. 이 식별자는 Platform 세션(광고 정책·claim, analytics relay, IAP) 목적이며 광고 추적 목적 데이터로 취급하지 않습니다. 게임 진행 데이터는 클라우드 저장 제거로 기기 밖에 나가지 않으므로 답변에서 뺍니다.

## 현재 blocker

- Play Console production access

## 검증 명령

```bash
pnpm check:play -- --json
python3 /Users/syous/.codex/skills/google-play-store-registration/scripts/validate_play_store_config.py --root .
python3 /Users/syous/.codex/skills/google-play-store-registration/scripts/validate_play_store_config.py --root . --allow-console-gates
```

콘솔 전용 gate가 아직 남아 있고 스토어 문구/이미지만 적용할 때는 `--allow-console-gates`를 함께 씁니다.

```bash
python3 /Users/syous/.codex/skills/google-play-store-registration/scripts/apply_play_store_listing.py --root . --dry-run --allow-console-gates
python3 /Users/syous/.codex/skills/google-play-store-registration/scripts/apply_play_store_listing.py --root . --apply --replace-images --allow-console-gates
python3 /Users/syous/.codex/skills/google-play-store-registration/scripts/apply_play_store_listing.py --root . --verify --allow-console-gates
```

## 다국어 리스팅 업로드(repo-local)

`google-play.config.json`의 `storeListing`(제목/간단한 설명/자세한 설명)과
`localizedAssets`(언어별 폰 스크린샷 등)를 Android Publisher API로 라이브 콘솔에
반영한다. config 로케일 키(`ja`, `zh-Hans`, `zh-Hant`, `de`, `fr`, `es`)는
Play 언어 코드(`ja-JP`, `zh-CN`, `zh-TW`, `de-DE`, `fr-FR`, `es-ES`)로 매핑된다.

```bash
# 미리보기(편집 폐기, 콘솔 미반영)
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON="$(cat ~/.config/seorilabs/play-store/seorilabs-play-publisher.json)" \
  python3 scripts/upload-google-play-listing.py --dry-run
# 텍스트+이미지 라이브 반영
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON="$(cat ~/.config/seorilabs/play-store/seorilabs-play-publisher.json)" \
  python3 scripts/upload-google-play-listing.py --with-images --commit
```

## 공식 기준

- Target API level: https://support.google.com/googleplay/android-developer/answer/11926878
- Preview assets: https://support.google.com/googleplay/android-developer/answer/9866151
- Android Publisher API edits: https://developers.google.com/android-publisher/edits
