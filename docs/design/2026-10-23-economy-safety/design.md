# 경제 오버플로와 저장 손상 차단

- 설계 ID: 2026-10-23-economy-safety, v1
- 기준 소스: fe69cd5883f7cc096f153852318db4c2e4a222f0
- 접수: [#482](https://github.com/seorilabs/happy-farm/issues/482)
- 관련 목록: [18건 상태와 처리 순서](../2026-10-23-open-issues/README.md)
- 검증 계획: [test-plan.json](test-plan.json), L3, dev, redesign=false

## 목적과 결정

MAX_ECONOMY_VALUE를 1e300으로 export하고 경제 값 공통 정규화 함수를 둔다. 유한 양수는 min(value, 1e300), +Infinity는 상한, NaN과 음수 및 -Infinity는 0으로 만든다. 골드, 연구 포인트와 관련 누적 수익만 이 규칙을 따른다. 비용, 시간, 식별자, 카운터를 일괄 클램프하지 않는다.

비용은 상한으로 낮추지 않는다. 프레스티지 비용이 유한하지 않으면 goldSufficient와 allowed는 false다. 잘못된 저장의 null과 NaN은 0으로 처리하고 이전 금액을 추정 복원하지 않는다. 기존 정상 저장의 구조와 stable key를 유지한다. 수익의 표시값과 통계도 실제 지급된 차이로 맞춰 포화 후 허위 누적이 생기지 않게 한다.

## 흐름, 구조와 실패 처리

farm-core의 harvest, constants, research, prestige, returnSummary, production, missions, weeklyMissions 및 FarmGame의 직접 보상 지급 경로를 전수 확인한다. 공통 모듈은 SDK를 import하지 않는다. farm-ui/persistence.ts에서 직렬화 직전에 복사본의 경제 값을 정규화하고, migrateLoadedState와 연구 및 lifetimeStats 복원에서도 같은 규칙을 사용한다. 저장 원본을 변형하지 않는다. 기존 backup 키와 저장 실패 시 게임 지속 동작을 유지한다.

## 변경 범위의 인수조건과 실행

상한 직전 수확과 판매, 자동 수확, 공방 판매, 데일리 및 바퀴, 미션, 복귀 보상, 연구 지급, 연쇄 농장, 프레스티지 시작 자금에서 유한값과 상한을 확인한다. +Infinity 저장과 복원, null과 NaN 및 음수 복원, 정상 저장 왕복, 비유한 비용에서 프레스티지 차단을 실패 테스트부터 작성한다. 격리 농장에서 상한 지급, 종료, 재실행 및 복구를 실제 개발 화면으로 실행한다. 경제 곡선과 보상 배율은 바꾸지 않는다. 공개 관찰 전 #482의 운영 확인은 미완료로 남긴다.

각 원 인수조건은 구현 PR에서 AC-번호로 순서대로 옮겨 실패와 통과 근거에 연결한다. 공개나 외부 운영 확인은 Refs로 남기고 코드 병합만으로 닫지 않는다. #575는 시작 화면, 상태와 접근성, 겹침으로 나누며 개인정보 항목은 조사 보류다. 범위 밖 항목은 원 이슈에서 유지한다.

### 접수 이슈의 원 인수조건

- [ ] `farm-core`에 `MAX_ECONOMY_VALUE` 상수를 정의하고 export 한다(유한하며 `Number.MAX_VALUE`보다 충분히 작은 값)
- [ ] 골드 증가 경로(수확·판매·체인 수익·복귀 요약 수령·프레스티지 시작 자금)가 `MAX_ECONOMY_VALUE`를 넘지 않도록 클램프된다
- [ ] `research_points` 증가 경로에도 동일 클램프가 적용된다
- [ ] `getPrestigeRequirementStatus`가 `Number.isFinite(cost) === false`이면 `goldSufficient=false`, `allowed=false`를 반환한다
- [ ] 저장 직렬화 전에 상태의 숫자 필드 중 non-finite 값을 상한(양수 무한) 또는 0(NaN)으로 정규화하는 가드가 추가된다
- [ ] 역직렬화에서 `null`/`NaN`으로 들어온 골드·연구포인트가 0이 아닌 **직전 유효값 또는 상한**으로 복구되지 않고 최소한 NaN 전파는 차단된다
- [ ] 테스트: (a) 골드가 상한 근처일 때 수확해도 유한값 유지 (b) `gold=Infinity` 상태를 저장→복원해도 유한값 (c) `cost`가 `Infinity`인 레벨에서 `canPrestige().allowed === false` (d) `research_points` 클램프
- [ ] `pnpm test`(farm-core 포함)가 통과한다

위 원문 중 SDK 0.5.0, Firebase Remote Config, 배포 및 기기 검증 등 현재 구조 또는 이번 요청과 달라진 항목은 이 문서의 목적과 결정에서 차이를 밝혔으며 자동 충족으로 표시하지 않는다. 원문을 수정된 인수조건으로 몰래 대체하지 않는다.

## 실행과 승인

[공통 실행 범위, 검수와 복구](../2026-10-23-open-issues/execution-scope.md)를 따른다. 설계와 같은 커밋의 test-plan.json은 사용자가 승인했다. 정확한 승인 커밋과 응답은 위 공통 실행 범위에 기록했다. 배포 실행은 승인 범위에서 제외한다.
