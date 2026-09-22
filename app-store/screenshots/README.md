# App Store Screenshots

이 폴더는 App Store Connect 업로드용 iOS 스크린샷만 보관합니다.

경로와 장수의 정본은 `app-store/app-store.config.json`입니다. 캡처 절차와 장면 정의는
`scripts/store-screenshots/README.md`에 있습니다.

## 구성

언어별로 4장씩, 8개 언어(`ko-KR`, `en-US`, `ja`, `zh-Hans`, `zh-Hant`, `de`, `fr`, `es`)를 둡니다.

| 슬롯 | 경로 | 해상도 |
| --- | --- | --- |
| 6.9형 iPhone | `<locale>/iphone-6.9/iphone-<n>.png` | 1320x2868 |
| 6.5형 iPhone | `<locale>/iphone-6.5/iphone-<n>.png` | 1284x2778 |
| 13형 iPad | `<locale>/ipad-13/ipad-<n>.png` | 2064x2752 |

로케일 폴더가 없는 `iphone-6.9/`, `iphone-6.5/`, `ipad-13/`는 `assets` 키가 참조하는 기본 언어
(`ko-KR`) 세트입니다.

4장의 장면은 순서대로 초기 농장 / 수확 직전 / 복귀 보상 시트 / 진행된 대형 농장입니다.

## 규격

App Store Connect가 받는 6.9형 portrait:

- `1260x2736`, `1290x2796`, `1320x2868`

6.5형 슬롯:

- `1242x2688`, `1284x2778`

iPad 13형:

- `2064x2752`, `2048x2732`

실제로 업로드되는 슬롯은 `APP_IPHONE_65`와 `APP_IPAD_PRO_3GEN_129`입니다. 6.9형은 원본 보관용이며
6.5형은 `install.py`가 이 원본을 리사이즈해 만듭니다.

## 원칙

- 실제 `apps/mobile` iOS 앱 화면을 캡처합니다.
- Google Play, AppsInToss, mockup, 비율이 다른 이미지를 조용히 재사용하지 않습니다.
- 첫 3장의 스크린샷이 설치 시트에 사용되므로 실제 플레이 흐름이 보이는 순서로 배치합니다.
- UI가 바뀌면 함께 다시 캡처합니다. 스크린샷은 조용히 낡습니다.
