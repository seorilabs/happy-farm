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
- 릴리스 이름: `1.1.4`

## 스토어 문구

### ko-KR

- 앱 이름: `행복 농장 타이쿤`
- 짧은 설명: `작물을 심고 수확하며 농장을 확장하는 방치형 농장 게임`
- 전체 설명: 작은 밭에서 시작해 작물을 심고, 성장 시간을 기다린 뒤 수확해 골드를 모으는 농장 타이쿤 게임입니다. 골드로 밭을 넓히고 성장 속도와 판매 수익을 업그레이드하며, 조건을 채우면 새 구역을 순서대로 열 수 있습니다.

### en-US

- App name: `Happy Farm Tycoon`
- Short description: `Plant, harvest, and expand your cozy idle farm`
- Full description: Start with a small field, plant crops, wait for them to grow, and harvest gold in a cozy farm tycoon game. Use gold to clear more plots, improve growth speed and sale profit, and unlock new areas in order as your farm expands.

## 릴리스 노트

### ko-KR

```text
새 구역을 여는 표현을 더 쉬운 용어로 바꾸고, 현재 농장의 예상 생산성을 시간당 골드로 볼 수 있게 했습니다. 작물 선택 화면에는 작물별 투자효율을 추가해 어떤 작물을 심을지 더 쉽게 판단할 수 있습니다.
```

### en-US

```text
Updated area-opening copy to simpler wording, added an estimated gold-per-hour productivity readout, and added crop efficiency indicators to help players choose what to plant.
```

## 이미지 경로

- 원본 앱 아이콘: `assets/행복농장앱아이콘_600x600.png`
- Play 앱 아이콘: `play-store/assets/icon-512.png`
- 피처 그래픽: `play-store/assets/feature-graphic-1024x500.png`
- phone screenshot:
  - `play-store/screenshots/phone/phone-1.png`
  - `play-store/screenshots/phone/phone-2.png`
- 7-inch tablet screenshot:
  - `play-store/screenshots/tablet-7/tablet-7-1.png`
  - `play-store/screenshots/tablet-7/tablet-7-2.png`
- 10-inch tablet screenshot:
  - `play-store/screenshots/tablet-10/tablet-10-1.png`
  - `play-store/screenshots/tablet-10/tablet-10-2.png`

현재 `apps/mobile/App.tsx`는 AIT와 같은 게임 플레이 UI를 사용합니다. 기존 Play 스크린샷은 마케팅형 이미지로 남아 있으므로, 글로벌 공개 전에는 Android 영문 화면 캡처 또는 영문 마케팅형 이미지로 교체해야 합니다.

## API 자동화 범위

2026-05-29에 Android Publisher API로 다음 항목을 적용하고 readback 검증까지 완료했습니다.

- 기본 언어: `ko-KR`
- 고객지원 이메일: `cs@seorilabs.com`
- `ko-KR` title/short/full description
- 앱 아이콘 1장
- 피처 그래픽 1장
- phone screenshot 2장
- 7-inch tablet screenshot 2장
- 10-inch tablet screenshot 2장

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

## 공식 기준

- Target API level: https://support.google.com/googleplay/android-developer/answer/11926878
- Preview assets: https://support.google.com/googleplay/android-developer/answer/9866151
- Android Publisher API edits: https://developers.google.com/android-publisher/edits
