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
- 릴리스 이름: `1.1.2`

## 스토어 문구

- 앱 이름: `행복 농장 타이쿤`
- 짧은 설명: `작물을 심고 수확하며 농장을 확장하는 방치형 농장 게임`
- 전체 설명: 작은 밭에서 시작해 작물을 심고, 성장 시간을 기다린 뒤 수확해 골드를 모으는 농장 타이쿤 게임입니다. 골드로 밭을 넓히고 성장 속도와 판매 수익을 업그레이드하며, 조건을 채우면 새 구역을 순서대로 열 수 있습니다.

## 릴리스 노트

### ko-KR

```text
배경음악과 수확 효과음 재생 안정성을 개선했습니다. 광고 보상 설정이 더 안정적으로 반영되도록 개선했고, 구역 해금에 필요한 현재 연구 레벨을 화면에서 바로 확인할 수 있게 했습니다.
```

### en-US

```text
Improved background music and harvest sound playback reliability. Improved rewarded ad setting refresh, and added a visible research level indicator for area unlock progress.
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

현재 `apps/mobile/App.tsx`는 전체 게임 플레이 UI가 아니라 소개형 shell입니다. Play 스크린샷은 게임 UI 포팅 후 실제 앱 화면을 캡처해서 채워야 합니다.

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
