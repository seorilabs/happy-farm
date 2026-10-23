# 공식 의존성 업데이트로 보안 감사 차단 줄이기

- 설계 ID: 2026-10-23-dependency-audit, v1
- 기준 소스: fe69cd5883f7cc096f153852318db4c2e4a222f0
- 접수: [#494](https://github.com/seorilabs/happy-farm/issues/494)
- 관련 목록: [18건 상태와 처리 순서](../2026-10-23-open-issues/README.md)
- 검증 계획: [test-plan.json](test-plan.json), L3, dev, redesign=false

## 목적과 결정

현재 pnpm 11.3.0 감사는 critical 1, high 22, moderate 20, low 6이다. 원본과 전체 경로는 NAS로 보존한다. 현재 저장소에 이미 있는 override를 신규 승인으로 보지 않는다. 새 override, 감사 무시, 임계 완화는 추가하지 않는다.

지원되는 정식 direct dependency와 같은 semver 범위의 전이 의존성 업데이트를 우선한다. AppsInToss와 Granite는 peer와 고정 의존성 계약을 함께 확인한다. 서로 다른 major를 강제로 섞는 변경은 제외한다. 공식 수정이 없는 경로는 남은 advisory, parent pin, 제품 번들 포함 여부를 적고 #494를 열린 상태로 둔다. 재현되지 않은 취약점 도달성을 안전하다고 단정하지 않는다.

## 흐름, 구조와 실패 처리

package.json, apps/ait/package.json, apps/mobile/package.json, pnpm-lock.yaml을 대상으로 한다. root의 RN 0.84.0과 mobile의 0.85.0은 각 shell 계약으로 조사하고 임의로 통일하지 않는다. install 단계는 토큰 없는 격리 경로에서 수행한다. 잠금 파일과 workspace manifest가 다른 경우 설치 성공으로 판정하지 않는다.

## 변경 범위의 인수조건과 실행

깨끗한 설치, lint, root 및 shell 타입 검사, 전체 테스트, i18n, core, architecture, markets, AIT 빌드와 runtime compatibility, 모바일 개발 실행을 확인한다. 기존 보안 차단을 완화하지 않고 Org Contract와 Android build-only의 exact source dependency stage를 확인한다. build-only 실행 전 중앙 before-build 검증을 수행한다. 감사가 남으면 실패를 그대로 기록하고 불필요한 빌드를 실행하지 않는다.

각 원 인수조건은 구현 PR에서 AC-번호로 순서대로 옮겨 실패와 통과 근거에 연결한다. 공개나 외부 운영 확인은 Refs로 남기고 코드 병합만으로 닫지 않는다. #575는 시작 화면, 상태와 접근성, 겹침으로 나누며 개인정보 항목은 조사 보류다. 범위 밖 항목은 원 이슈에서 유지한다.

### 접수 이슈의 원 인수조건

- [ ] advisory별 dependency path와 실제 도달 가능성을 현재 lockfile에서 기록한다.
- [ ] 지원되는 direct dependency/toolchain upgrade와 lockfile 갱신으로 critical/high 34건을 제거한다.
- [ ] 근거 없는 `pnpm.overrides`, audit ignore, threshold 완화를 추가하지 않는다.
- [ ] `pnpm audit --audit-level high`가 0으로 통과한다.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm check:i18n`, `pnpm check:core`, `pnpm check:architecture`, `pnpm check:markets`가 통과한다.
- [ ] WorkflowBundle v5 exact-source Org Contract와 Android build-only가 dependency stage를 통과한다.
- [ ] build-only와 마켓 업로드·심사·공개 배포를 별도 gate로 유지한다.

위 원문 중 SDK 0.5.0, Firebase Remote Config, 배포 및 기기 검증 등 현재 구조 또는 이번 요청과 달라진 항목은 이 문서의 목적과 결정에서 차이를 밝혔으며 자동 충족으로 표시하지 않는다. 원문을 수정된 인수조건으로 몰래 대체하지 않는다.

## 실행과 승인

[공통 실행 범위, 검수와 복구](../2026-10-23-open-issues/execution-scope.md)를 따른다. 설계와 같은 커밋의 test-plan.json은 사용자가 승인했다. 정확한 승인 커밋과 응답은 위 공통 실행 범위에 기록했다. 배포 실행은 승인 범위에서 제외한다.
