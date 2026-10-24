# 앱인토스 배포 제어 L1 실행 기록

- 승인 설계: PR #595의 c4bf1b816544f617fa03a88a26043a42913bc9bc, 사용자 답변 `설계 승인, 구현과 병합 진행`.
- 연결 이슈: #592. 구현 기준은 설계 병합 18a20e61497f3e63e1b045215c4be10897de3c2f이다.
- 범위: release-observability 서비스와 중앙 caller 연결. 작성자가 격리 worktree에서 개발 환경 검사를 실행했다. 제품 후보는 v1.13.0의 c75ccddd82e883dd12c71b32a07f56ebae1a7046을 유지한다.
- 정본: 중앙 a43f2c401855f23171a4a759beb277950928505e의 rn-deploy-ait.yml과 개발 계약, Node 24.16.0 및 pnpm 11.3.0 정본을 대조했다.

| 인수조건 | 실행 | 결과 |
|---|---|---|
| AC-1 | YAML 파싱, actionlint, 입력 이름과 타입, 명시 Secret, 두 진입점의 upload 기본값 | 통과 |
| AC-1, AC-2 | 기존 설치와 빌드 명령 순서, 중앙 SEORI_RELEASE_* 전달, before-build 및 before-deploy 검사와 정확한 파일 업로드 경로 확인 | 정적 대조 통과 |
| AC-2 | deploy-drift, deploy-drift-run, app-store-lookup 기존 서비스 테스트 | 3개 묶음, 81건 통과 |
| AC-4 | git diff --check, 자체 업로드 분기 제거, 서비스 기능 경로 연결 | 통과 |
| AC-2, AC-3 | 실제 v1.13.0 AIT 빌드, 업로드, 콘솔 배포 ID 및 메모 대조 | 병합 후 실행 대상, 아직 통과 아님 |

중앙 caller를 호출하는 설정 변경이므로 제품 실행을 흉내 내는 테스트는 추가하지 않았다. 설정의 입력 계약과 실제 중앙 처리 순서를 직접 대조하고, 기존 서비스 테스트 및 PR CI로 확인한다. 실제 업로드는 main의 새 workflow 정의에서 release_tag=v1.13.0으로 실행하며, 제품 L3 근거는 태그의 기존 실행 원본을 그대로 사용한다. 새 버전 발급, 태그 이동, 기기 사용, 운영 설정 변경은 없다. 실행 원본은 릴리스 작업 증적과 함께 NAS로 검증해 보관한다.
