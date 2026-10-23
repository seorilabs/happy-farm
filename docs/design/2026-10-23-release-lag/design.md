# 태그 미발행 커밋 지연 감시

- 설계 ID: 2026-10-23-release-lag, v1
- 기준 소스: fe69cd5883f7cc096f153852318db4c2e4a222f0
- 접수: [#478](https://github.com/seorilabs/happy-farm/issues/478)
- 관련 목록: [18건 상태와 처리 순서](../2026-10-23-open-issues/README.md)
- 검증 계획: [test-plan.json](test-plan.json), L1, dev, redesign=false

## 목적과 결정

evaluateReleaseLag({commitsAhead, oldestUnreleasedAgeHours})와 RELEASE_LAG_COMMITS=1, RELEASE_LAG_AGE_HOURS=48을 export한다. 두 조건을 모두 만족할 때만 lag=true다. 판정은 채널 드리프트와 별도이며 어느 하나라도 경고면 기존 이슈를 생성 또는 갱신한다.

기본 브랜치는 원격 default branch를 사용한다. 최신 유효 SemVer 태그와 기본 브랜치 비교를 완전 수집하고 가장 오래된 미발행 커밋 시각으로 경과를 계산한다. 비교 불가와 API 실패는 확인 불가로 표시하며 최신이라고 쓰지 않는다. 문서 커밋도 현재 인수조건의 커밋 수에 포함한다. 제품 변경 여부를 임의로 분류하는 필터를 추가하지 않는다.

## 흐름, 구조와 실패 처리

scripts/deploy-drift.js는 순수 판정과 렌더링, deploy-drift-run.js는 태그와 compare IO를 맡는다. 기존 마커, 중복 이슈 방지와 채널 업로드 판정을 재사용한다. workflow를 바꿔야 하면 최신 global-versions.yaml과 공식 action stable major를 확인한다. 서명과 홍보 문구를 새 본문에 넣지 않는다.

## 변경 범위의 인수조건과 실행

0커밋, 3커밋 12시간, 1커밋 47.999시간과 48시간, 3커밋 72시간, 미래 시각, 비교 실패, pagination을 테스트한다. 채널 최신+태그 지연만 있는 경우 이슈가 갱신되고 커밋 제목이 포함되는지 확인한다. 저장소 API와 Issue write를 대체한 서비스 런타임에서 실제 run 진입점을 실행한다. 자동 태그, 새 릴리스나 배포는 하지 않는다. 운영 workflow dispatch는 이슈 쓰기만 수행하는 감시로 한정하고 배포를 호출하지 않는다.

각 원 인수조건은 구현 PR에서 AC-번호로 순서대로 옮겨 실패와 통과 근거에 연결한다. 공개나 외부 운영 확인은 Refs로 남기고 코드 병합만으로 닫지 않는다. #575는 시작 화면, 상태와 접근성, 겹침으로 나누며 개인정보 항목은 조사 보류다. 범위 밖 항목은 원 이슈에서 유지한다.

### 접수 이슈의 원 인수조건

- [ ] `scripts/deploy-drift.js`에 순수 함수 `evaluateReleaseLag({ commitsAhead, oldestUnreleasedAgeHours })`를 추가하고 `module.exports`에 포함한다. `commitsAhead >= RELEASE_LAG_COMMITS`(기본 1) **이면서** `oldestUnreleasedAgeHours >= RELEASE_LAG_AGE_HOURS`(기본 48)일 때 `lag: true`를 반환한다.
- [ ] 임계 상수 `RELEASE_LAG_COMMITS`, `RELEASE_LAG_AGE_HOURS`를 export 해 테스트에서 고정할 수 있게 한다.
- [ ] `scripts/deploy-drift-run.js`가 최신 태그와 `main`을 비교해(`repos.compareCommitsWithBasehead` 또는 동등한 git 명령) `commitsAhead`와 가장 오래된 미릴리즈 커밋의 경과 시간을 수집하고 `evaluateReleaseLag()`에 넘긴다.
- [ ] `renderDriftTable()`(또는 `buildIssueBody()`)이 채널 표 위에 "릴리즈 지연: main이 `<최신태그>`보다 N커밋 앞섬 / 가장 오래된 미릴리즈 커밋 M시간 경과" 한 줄을 렌더링하고, 지연이 감지되면 미릴리즈 커밋 제목 목록을 함께 싣는다.
- [ ] 채널 드리프트가 없어도 릴리즈 지연만으로 드리프트 이슈가 생성/갱신된다(`chooseIssueAction` 입력에 릴리즈 지연이 반영된다).
- [ ] `scripts/__tests__/deploy-drift.test.ts`에 케이스 4종 추가: (1) `commitsAhead=0` → `lag:false`, (2) `commitsAhead=3` & 경과 12시간 → `lag:false`(신선한 머지는 경고하지 않음), (3) `commitsAhead=3` & 경과 72시간 → `lag:true`, (4) 릴리즈 지연만 있고 채널은 최신일 때 이슈 본문에 지연 줄이 포함된다.
- [ ] `scripts/__tests__/deploy-drift-run.test.ts`에 비교 API 응답을 목킹해 `commitsAhead`/경과 시간이 판정으로 전달되는지 검증한다.

위 원문 중 SDK 0.5.0, Firebase Remote Config, 배포 및 기기 검증 등 현재 구조 또는 이번 요청과 달라진 항목은 이 문서의 목적과 결정에서 차이를 밝혔으며 자동 충족으로 표시하지 않는다. 원문을 수정된 인수조건으로 몰래 대체하지 않는다.

운영 감시를 기능 목록의 release-observability로 등록하고 scripts/deploy-drift 경로를 연결한다. 제품 Platform 이벤트 기능의 통과로 대신 세지 않는다.

## 실행과 승인

[공통 실행 범위, 검수와 복구](../2026-10-23-open-issues/execution-scope.md)를 따른다. 설계와 같은 커밋의 test-plan.json은 사람 검토 대기이며, 배포 실행은 승인 범위에서 제외한다.
