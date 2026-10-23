# App Store 공개 버전을 배포 감시에 포함

- 설계 ID: 2026-10-23-ios-public-drift, v1
- 기준 소스: fe69cd5883f7cc096f153852318db4c2e4a222f0
- 접수: [#483](https://github.com/seorilabs/happy-farm/issues/483)
- 관련 목록: [18건 상태와 처리 순서](../2026-10-23-open-issues/README.md)
- 검증 계획: [test-plan.json](test-plan.json), L1, dev, redesign=false

## 목적과 결정

app-store/app-store.config.json의 bundleId로 한국 App Store 공개 Lookup API를 조회한다. 성공한 version을 v 접두어만 정규화해 최신 SemVer 태그와 비교하고 공개일을 표에 표시한다. Xcode Cloud 실행 성공을 공개 버전으로 대신 쓰지 않는다.

조회 실패, timeout, 빈 결과, bundleId 불일치, 잘못된 version과 공개일은 확인 불가로 표시한다. external=true의 비경고 fallback을 유지하되 최신으로 표시하지 않는다. 조회 실패가 다른 채널 경고와 태그 지연을 감추지 않게 한다. 공개 버전이 태그보다 앞서거나 태그 목록에 없으면 확인 불가의 구체적인 이유를 남긴다.

## 흐름, 구조와 실패 처리

순수 응답 정규화와 IO를 나누고 fetch와 시계를 주입한다. 네트워크 timeout은 10초다. 공개 read-only API만 사용하고 Apple 자격증명을 workflow에 추가하지 않는다. buildChannelRow가 external=false일 때 공개 버전, releasedAt, source URL을 유지하게 한다. 최신 상태와 unknown을 서로 다른 표시로 렌더링한다.

## 변경 범위의 인수조건과 실행

최신 공개 버전, 두 태그 뒤, 72시간 경계, 결과 없음, HTTP 및 JSON 오류, timeout, 잘못된 bundle ID, 비교 불가능 버전을 검증한다. 배포 감시 run 전체를 가짜 GitHub API와 실제 공개 API 각각으로 읽기 전용 실행한다. 공개 readback의 현재 값은 1.12.2, 공개일 2026-10-15T02:35:00Z다. 조회 성공 자체를 제품 실행 완료로 세지 않는다.

각 원 인수조건은 구현 PR에서 AC-번호로 순서대로 옮겨 실패와 통과 근거에 연결한다. 공개나 외부 운영 확인은 Refs로 남기고 코드 병합만으로 닫지 않는다. #575는 시작 화면, 상태와 접근성, 겹침으로 나누며 개인정보 항목은 조사 보류다. 범위 밖 항목은 원 이슈에서 유지한다.

### 접수 이슈의 원 인수조건

- [ ] `scripts/deploy-drift.js`(또는 신규 헬퍼)에 App Store 라이브 버전 조회 함수를 추가한다 — 입력 `bundleId`, 출력 `{ version, releasedAt }` 또는 `null`
- [ ] `deploy-drift-run.js`가 `app-store/app-store.config.json`에서 `bundleId`를 읽어 조회하고, 성공하면 iOS 행을 `external: false`로 만들어 판정 대상에 포함한다
- [ ] 라이브 버전 → 태그 비교는 `v` 접두어를 제거한 뒤 기존 태그 정렬 로직으로 gap을 계산한다
- [ ] 조회 실패·`resultCount=0`·네트워크 오류이면 기존 `external: true` + note 폴백을 유지하고 드리프트로 판정하지 않는다
- [ ] 드리프트 표에 iOS의 라이브 버전과 공개일이 표시된다
- [ ] 테스트: (a) lookup 응답이 최신 태그와 같으면 드리프트 없음 (b) 2개 뒤처지면 드리프트 (c) lookup 실패 시 external 폴백이고 이슈를 만들지 않는다
- [ ] `pnpm test`가 통과한다

위 원문 중 SDK 0.5.0, Firebase Remote Config, 배포 및 기기 검증 등 현재 구조 또는 이번 요청과 달라진 항목은 이 문서의 목적과 결정에서 차이를 밝혔으며 자동 충족으로 표시하지 않는다. 원문을 수정된 인수조건으로 몰래 대체하지 않는다.

운영 감시를 기능 목록의 release-observability로 등록하고 scripts/deploy-drift 경로를 연결한다. 제품 Platform 이벤트 기능의 통과로 대신 세지 않는다.

## 실행과 승인

[공통 실행 범위, 검수와 복구](../2026-10-23-open-issues/execution-scope.md)를 따른다. 설계와 같은 커밋의 test-plan.json은 사용자가 승인했다. 정확한 승인 커밋과 응답은 위 공통 실행 범위에 기록했다. 배포 실행은 승인 범위에서 제외한다.
