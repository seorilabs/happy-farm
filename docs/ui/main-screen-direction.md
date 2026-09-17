# 메인 농장 화면 시각 방향 — Warm Wood

2026-09-17 확정. 대상 화면은 메인 농장 화면 하나이며, 여기서 정한 기준을 상점·시트 등 다른 화면으로 파생한다.

## 확정 범위

**밭 격자 영역은 이번 개편 대상이 아니다.** 타일의 배치·크기·상태 표현(빈칸, 성장 4단계, 잠금, 수확 가능)은 현행을 그대로 둔다. 바꾸는 것은 격자 위아래의 크롬뿐이다.

| 대상 | 변경 |
| --- | --- |
| 상단 헤더·골드 카드 | 크림+나무 톤으로 재디자인 |
| 하단 필드 탭·작물 툴바 | 같은 톤으로 재디자인 |
| 작물 아이콘 | **변경 없음 — 이미 연결되어 있었다** (아래 정정 참고) |
| 밭 격자 | **변경 없음** |

밭 격자를 제외한 이유는 타일을 새 시각 언어로 바꾸면 모든 타일 상태와 작물 49종 렌더링을 함께 다시 만들어야 해서다. `packages/farm-ui/src/FarmGame.tsx`가 9400줄 규모로 격자 렌더링과 게임 로직이 얽혀 있다.

## 기준 이미지에 대한 정정

시안을 만들 때 밭 격자 배경으로 쓴 `app-store/screenshots/iphone-6.9/iphone-1.png`는 **2026-06-05 캡처**로, clay 아트를 도입한 `d7df7d6`(2026-07-23)보다 7주 앞선다. 그래서 시안에는 작물이 시스템 이모지로 보이지만, 실제 코드는 이미 clay 아트를 쓰고 있었다.

- `packages/farm-ui/src/farmArt.tsx` — `FarmArtProvider` / `CropGlyph` 아트 계약 (이모지 폴백 포함)
- `apps/mobile/src/art/farmArt.ts` — 정적 `require` 매핑
- `apps/ait/src/farm/platform/appsInTossArt.ts` — 원격 URL 매핑
- `FarmGame.tsx:8878` — 툴 버튼도 `CropGlyph`를 쓴다

따라서 "작물 아이콘을 clay 아트로 교체"는 이번 구현 범위가 아니다. 기준 이미지의 밭 격자 부분은 현재 화면과 다르므로, **크롬(상단 HUD·하단 툴바)의 목표 외형으로만** 읽어야 한다.

## 선택 경위

세 시각 방향(디오라마 / 종이공예 / 아케이드 팝)을 밭 격자까지 포함해 먼저 제안했으나 전부 반려됐고, 밭을 건드리지 않는 조건이 제시됐다. 이어서 크롬만 교체한 두 톤(Warm Wood / Fresh Mint)을 제안해 **Warm Wood**가 선택됐다.

잠금 칸 14개를 3개로 접는 축약 레이아웃도 함께 제안했으나 **이번 범위에서는 채택하지 않았다.** 화면 중앙의 상당 부분이 회색 잠금 칸이라는 문제는 그대로 남아 있으며, 이후 별도로 다룰 여지가 있다.

## 시각 규칙

| 항목 | 값 |
| --- | --- |
| 패널 배경 | `#fbf3e0` → `#f3e6c9` 세로 그라데이션 |
| 패널 경계 | `#d8bd8c` 4px |
| 카드 면 | `#fffdf5` → `#fdf2d6`, 테두리 `#e8c976` 3px |
| 카드 그림자 | `box-shadow: 0 4px 0 <테두리보다 한 단계 어두운 색>` (블러 없는 오프셋) |
| 주요 텍스트 | `#6b4a22` |
| 보조 텍스트 | `#a98a4e` |
| 강조 수치 | `#c07a12` |
| 긍정 액션 | `#8fd158` → `#68b035`, 테두리 `#4d8a22` |
| 생산량 텍스트 | `#2f8a4a` |
| 연구 배지 | `#b98cf0` → `#9a63e0` |
| 서체 | Baloo 2 (700/800). 미설치 환경은 시스템 둥근 산세리프로 대체 |
| 라운드 | 카드 20px, 버튼 15~19px, 배지 12px |

형태의 핵심은 **블러 없는 세로 오프셋 그림자**다. 눌린 상태는 이 오프셋을 줄이고 요소를 같은 양만큼 내려 물리적으로 눌리는 느낌을 만든다.

## 기준 이미지

- `reference/main-screen-warmwood.png` — 확정 시안 (1320×2868, iPhone 6.9")
- `reference/main-screen-warmwood.html` — 위 시안의 재현 소스. 밭 격자는 `app-store/screenshots/iphone-6.9/iphone-1.png`를 잘라 깔고 크롬만 CSS로 그린 것이라, 실제 구현 코드가 아니라 **목표 외형의 기준**이다
- `reference/compare-stage1.png` — 현재 화면 / Warm Wood / Fresh Mint 비교

시안은 실제 문구(`packages/farm-ui/src/i18n/messages/en-US.ts`)와 진행된 플레이 상황(Gold 1,250G, Research Lv.3, Profit ×1.4, Growth ×1.2)으로 그렸다.

## 구현 내역 (2026-09-17)

`packages/farm-ui/src/farmGameStyles.ts`의 19개 스타일 블록만 수정했다. 밭 격자 스타일(`plotTile`, `lockedPlot`, `emptyPlot`, `growingPlot`, `readyPlot`, `plotGrid`)과 작물 아트 경로는 건드리지 않았다.

상단: `header` `title` `subtitle` `navButton` `navButtonHighlight` `navButtonText` `settingsButton`/`settingsButtonText` `statsPanel` `coinIcon` `label`/`money` `productivityText`
하단: `toolStrip` `toolHint` `harvestAllButton` `areaTab` 계열 `toolButton` `activeToolButton` `toolName`/`toolCost` `toolRoi`

실행 화면을 보고 한 가지를 더 고쳤다. `NavButton` 하나를 Shop·Missions·More 세 곳이 공유하고 있어서, `navButton`을 초록으로 바꾸자 헤더에 초록 버튼이 3개가 되고 수확 CTA와 경쟁했다. `navButtonPrimary` / `navButtonTextPrimary`를 추가하고 `FarmGame.tsx`의 `NavButton`에 `primary` prop을 넣어 **Shop에만** 적용했다. 나머지 둘은 크림 카드로 남는다.

구현상의 제약:

- **그라데이션 없음.** 저장소에 `react-native-linear-gradient` 계열 의존성이 없어, 시안의 세로 그라데이션은 중간값 단색으로 근사했다 (패널 `#f7ecd4`, 카드 `#fff9e8`).
- **입체감은 그림자가 아니라 두꺼운 아래 테두리로 낸다.** 처음에는 iOS의 `shadowRadius: 0` + 세로 오프셋으로 블러 없는 그림자를 썼으나, Android 실기기에서 이 조합이 `elevation`의 블러 그림자로 대체되어 방향성이 사라지는 것을 확인했다. 플랫폼 분기를 두는 대신 `borderBottomWidth`로 통일해 양쪽이 같게 보이도록 했다. 예외는 `harvestAllButton` 하나로, 알약 형태의 초록 CTA라 Material 계열 부드러운 그림자(`shadowRadius: 6`)를 쓴다.
- `toolButton`은 작물 글리프가 상자를 넘지 않도록 `overflow: 'hidden'`이 필요한데(#237) iOS에서 이 속성은 그림자를 잘라낸다. 테두리 방식은 이 제약도 함께 해결한다.

### 구성요소 상태

반복 구성요소 4종(`navButton` `settingsButton` `areaTab` `toolButton`)에 pressed를 파생했다. 눌리면 아래 테두리가 얇아지고 요소가 같은 양만큼 내려앉아, 물리적으로 눌리는 느낌을 만든다. 상태를 색 하나로만 전달하지 않는다.

시트의 구매 불가 카드(`disabledCard`)도 마찬가지로 투명도만 쓰던 것을 고쳤다. `opacity: 0.45` → `0.7`로 올려 글자를 읽을 수 있게 하고, 배경과 테두리를 무채색으로 내려 상태를 형태로도 전달한다.

### 시트 계열

`sheet` `sheetHandle` `sheetTitle` `sheetDescription` `sheetSectionTitle` `shopTabBar` `shopTabButton*` `lockedNotice*`와 `SheetParts.tsx`의 `shopCard` `settingRow` `shopTitle` `shopDesc` `shopPrice` `settingTitle` `settingDesc`에 같은 기준을 적용했다. 시트 상단 라운드는 8 → 24로 키우고 나무색 상단 경계를 넣었다.

## 실행 검증 (2026-09-17)

iPhone 17 Pro Max 시뮬레이터(iOS 26.5), Debug 빌드, 1320×2868 — 기준 시안과 같은 해상도.

- `reference/runtime-main-screen.png` — 실행 화면 캡처
- `reference/compare-runtime.png` — 6/5 스크린샷 / 기준 시안 / 실행 화면 3단 비교

적용이 확인된 것: 헤더 패널과 하단 툴바의 크림+나무 톤, 골드 카드의 두꺼운 테두리와 오프셋 그림자, 필드 탭과 작물 툴 카드의 크림 배경·두꺼운 아래 테두리, 활성 상태의 연두, 텍스트 색 위계(갈색 주요 / 옅은 갈색 보조 / 주황 수치 / 초록 생산량). 작물 아이콘은 clay 아트로 정상 렌더된다.

시안이 담지 못한 실제 화면 요소: 오늘의 작물 칩, 해금 진행 바, Missions·More 버튼, `Harvest All` / `Harvest & Replant` 두 초록 CTA, 정렬 토글. 시안을 6/5 캡처로 그린 탓이다.

**밭 영역 배경의 연보라는 이번 변경과 무관하다.** `EnvironmentBackdrop`이 `environmentTone.backgroundColor`(구역 테마)와 시간대 팔레트로 그리는 색이며, phase를 `day`로 임시 고정해 확인해도 같은 바탕색이 유지됐다(확인 후 원복). 크림 크롬과 완벽히 어울리지는 않으므로 구역 테마 색을 조정할지는 별도 판단이 필요하다.

### CTA 위계

초록은 **수확 행동에만** 쓴다. 헤더의 Shop을 초록으로 올렸더니 `NavButton`을 Shop·Missions·More가 공유하는 탓에 초록 버튼이 3개가 되고, 하단의 `Harvest All` / `Harvest & Replant`와도 경쟁했다. Shop을 크림 카드로 되돌려 초록 CTA는 수확 둘만 남겼다. Shop은 빨간 배지로 구분된다. 이 결정으로 `navButtonPrimary` / `primary` prop은 쓰이지 않게 되어 함께 제거했다.

## 검증 범위

| 항목 | 결과 | 증거 |
| --- | --- | --- |
| iOS (iPhone 17 Pro Max, iOS 26.5, 1320×2868) | 통과 | `reference/runtime-main-screen.png` |
| Android 실기기 (Solana Mobile Seeker, Android 16, 1200×2670) | 통과 | `reference/runtime-android-device.png` |
| 작은 화면 (iPhone SE 3세대, 750×1334) | 통과 | `reference/runtime-iphone-se.png` |
| 한국어 | 통과 | `reference/runtime-ko.png` |
| 독일어 (`Ernten & Nachpflanzen` 등 최장 문구) | 통과 | `reference/runtime-de.png` |
| 시트 — 구매 불가 상태 | 통과 | `reference/runtime-sheet-disabled.png` |
| 시트 — 활성/광고 보상 카드 | 통과 | `reference/runtime-sheet-active.png` |

typecheck 0건, lint 0건, 테스트 1487개 전부 통과(93 스위트).

언어 검증은 `FarmGame.tsx`의 locale 소비 지점을 임시로 고정해 캡처한 뒤 원복했다. 시뮬레이터 시스템 로케일로는 바뀌지 않는데, Hermes의 `Intl`이 이를 반영하지 않고 실제 언어는 `gameSettings.locale`에서 오기 때문이다.

## 남은 작업

1. 밭 영역 구역 테마 배경색과 크림 크롬의 조화 — 밭을 건드리지 않기로 해 이번 범위에서 제외했다
2. 태블릿(iPad) 확인
3. 시트 중 자체 스타일을 가진 것들(`WheelSheet`, `LabSheet`, `ChainMapSheet` 등)의 개별 점검 — 공통 스타일만 적용한 상태다
4. 일본어·중국어(번체/간체) 문구 확인
