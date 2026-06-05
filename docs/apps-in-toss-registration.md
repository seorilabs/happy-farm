# AppsInToss 등록 정보

## 기본값

- appName: `happy-farm`
- 진입 URL: `intoss://happy-farm/`
- 한글 앱 이름: `행복한 농장 타이쿤`
- 영문 앱 이름: `Happy Farm Tycoon`
- 카테고리: 게임
- 앱 유형: `game`
- 브랜드 컬러: `#2F8747`
- 아이콘 URL: `https://static.toss.im/appsintoss/38345/7cb5596a-ee72-43c3-b899-7d3a494b0602.png`
- Firebase Web App: `행복한 농장 타이쿤 (AppsInToss)` / `1:1874344437:web:a34abb444eae2baa6c48bc`
- Firebase Web SDK: `apps/ait/src/firebaseWeb/*`에서 `firebase/app`, `firebase/analytics` import
- 보상형 광고 그룹 ID: `ait.v2.live.6fc77adf3f034cd6`

## 설명 초안

### ko-KR

사용자는 작은 밭에서 작물을 심고, 성장 시간을 기다린 뒤 수확해 골드를 얻습니다. 골드로 밭을 넓히고 성장 속도와 판매 수익을 업그레이드하며, 조건을 채우면 채소 밭, 풍요 밭, 과수원, 온실 같은 새 구역을 순서대로 열 수 있습니다.

### en-US

Users start with a small field, plant crops, wait for growth, and harvest gold. Gold can be used to clear more plots, upgrade growth speed and sale profit, and unlock new areas such as Vegetable Field, Bloom Field, Orchard, and Greenhouse in order.

## 업데이트 노트 후보

### ko-KR

```text
새 구역을 여는 표현을 더 쉬운 용어로 바꾸고, 현재 농장의 예상 생산성을 시간당 골드로 볼 수 있게 했습니다. 작물 선택 화면에는 작물별 투자효율을 추가해 어떤 작물을 심을지 더 쉽게 판단할 수 있습니다.
```

### en-US

```text
Updated area-opening copy to simpler wording, added an estimated gold-per-hour productivity readout, and added crop efficiency indicators to help players choose what to plant.
```

## 출시 전 확정 필요

- 썸네일, 스크린샷 이미지
- 고객지원 이메일 또는 문의 URL
- 개인정보 처리방침 URL 필요 여부
- 전면형 광고 그룹 ID

## 보상형 광고 등록값

현재 게임에서 가장 대표적인 보상형 광고 보상은 골드 보상입니다.

```text
광고명: 행복한 농장 타이쿤 보상형 광고
서비스 내 보상 단위: 골드
수량 및 금액: 100
```

추후 보상형 광고 그룹을 용도별로 분리할 경우 후보는 다음과 같습니다.

```text
골드 보상 광고: 골드 / 100
밭 확장 보상 광고: 밭 확장 / 1
작물 성장 보상 광고: 성장 완료 / 1
수확 보너스 광고: 수확 보너스 / 2배
```
