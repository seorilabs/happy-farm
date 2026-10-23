# 기존 방향으로 시작 화면과 초기 언어 수정

- 설계 ID: 2026-10-23-ui-startup, v1
- 기준 소스: fe69cd5883f7cc096f153852318db4c2e4a222f0
- 접수: [#575](https://github.com/seorilabs/happy-farm/issues/575)
- 관련 목록: [18건 상태와 처리 순서](../2026-10-23-open-issues/README.md)
- 검증 계획: [test-plan.json](test-plan.json), L1, dev, redesign=false

## 목적과 결정

기존 아침 농장 타이틀 방향을 유지한다. LaunchScreen.storyboard의 RN 개발 템플릿 문구를 제품명과 기존 배경색으로 교체한다. 새 이미지와 시각 방향은 만들지 않는다. RN 런타임의 초기 locale은 shell이 실제 시스템 locale을 해석해 넘기고 저장된 사용자 선택을 우선한다. farm-core는 locale 감지와 플랫폼 SDK를 소유하지 않는다. Intl 기본 locale만으로 OS 언어라고 추정하지 않는다.

## 흐름, 구조와 실패 처리

LaunchScreen.storyboard, mobile App.tsx와 locale 감지 어댑터, FarmStartup의 preferredLocale 연결을 수정한다. 기본 locale과 지원 locale fallback은 기존 normalizeLocale을 재사용한다. 저장된 locale은 삭제하거나 덮어쓰지 않는다. OS 언어가 지원 밖이면 기존 기본값을 사용한다.

## 변경 범위의 인수조건과 실행

신규 저장 ko-KR, en-US 및 미지원 locale, 저장 선택 언어 우선, 재실행을 검증한다. 시작 화면 XML의 template 문구 제거와 constraint 유효성은 정적 검사와 개발 렌더링으로 확인한다. 네이티브 OS launch snapshot을 기기에서 확인했다고 주장하지 않는다. 스토리보드 수정 때문에 회귀 하한이 오르면 L3 개발 검수를 추가하고 기기는 사용하지 않는다.

각 원 인수조건은 구현 PR에서 AC-번호로 순서대로 옮겨 실패와 통과 근거에 연결한다. 공개나 외부 운영 확인은 Refs로 남기고 코드 병합만으로 닫지 않는다. #575는 시작 화면, 상태와 접근성, 겹침으로 나누며 개인정보 항목은 조사 보류다. 범위 밖 항목은 원 이슈에서 유지한다.

### 접수 이슈의 원 인수조건

원 이슈의 기능 및 접근성 항목을 아래 분할 범위에 따라 검증한다.

위 원문 중 SDK 0.5.0, Firebase Remote Config, 배포 및 기기 검증 등 현재 구조 또는 이번 요청과 달라진 항목은 이 문서의 목적과 결정에서 차이를 밝혔으며 자동 충족으로 표시하지 않는다. 원문을 수정된 인수조건으로 몰래 대체하지 않는다.

## 실행과 승인

[공통 실행 범위, 검수와 복구](../2026-10-23-open-issues/execution-scope.md)를 따른다. 설계와 같은 커밋의 test-plan.json은 사람 검토 대기이며, 배포 실행은 승인 범위에서 제외한다.
