# 앱인토스 배포의 중앙 결속 적용

## 문제와 적용 범위

v1.13.0의 제품 후보는 c75ccddd82e883dd12c71b32a07f56ebae1a7046이다. 현재 deploy-apps-in-toss.yml은 자체 빌드와 즉시 업로드를 수행한다. 중앙의 before-build, before-deploy 개발 증적 검사와 산출물 해시 검증, 태그와 소스 및 해시가 들어간 배포 메모를 거치지 않는다. 태그만 확인한 기존 메모로는 이번에 검증한 파일과 실제 업로드 파일을 대조할 수 없다.

보완 대상은 앱인토스 caller와 그 실행 분류, 검증 기록이다. 게임 코드와 UI, SDK, 식별자, Secret, 운영 설정은 바꾸지 않는다. 배포 작업은 기존 중앙 rn-deploy-ait.yml@main을 호출하는 얇은 caller로 바꾼다. 중앙 구현은 수정하지 않는다.

## 선택한 설계

1. workflow_dispatch와 workflow_call의 release_tag와 memo를 유지한다. upload 입력을 기본 true로 추가해 업로드 없는 점검도 지원한다.
2. 중앙 rn-deploy-ait.yml@main을 호출한다. ait_dir은 apps/ait, pnpm은 11.3.0, Node는 24.16.0이며 현재 중앙 버전 정본과 대조한다. 공개 저장소의 ubuntu-latest 선택과 apps-in-toss environment, 보존 기간은 중앙 구현에 맡긴다.
3. 기존 필터 설치와 releaseInfo 생성, lint, typecheck, core와 AIT 테스트, 광고와 분석 계약 검사, AIT 빌드를 중앙 install_command와 build_command로 보존한다. 런타임 버전 값은 중앙이 전달한 SEORI_RELEASE_*만 사용한다.
4. 기존 APPS_IN_TOSS_API_KEY만 명시적으로 매핑한다. inherit, 새 Secret, IAM 변경은 사용하지 않는다.
5. 산출물 파일 하나의 framing과 해시, 태그, 소스, 배포 메모, 업로드 직전 동일 파일 검증은 중앙 구현으로 수행한다. 앱인토스 콘솔에서 배포 ID와 실제 메모를 다시 읽는다.
6. feature-inventory의 release-observability 서비스 범위에 이 caller를 연결한다. 제품 기능의 실행 범위와 기반 기능 하한은 바꾸지 않는다.

## 현재 릴리스와의 관계

v1.13.0 태그를 이동하지 않는다. 런타임 소스와 버전은 그대로 c75ccdd, 1.13.0, 1001011013이다. 새 caller는 승인과 검증, PR 병합 뒤 main의 workflow 정의로 실행하되 release_tag=v1.13.0을 명시한다. 중앙은 태그 c75ccdd를 checkout하므로 main의 배포 제어 변경이 제품 바이너리에 섞이지 않는다. 기존 c75ccdd의 독립 L3와 공개 Release 자산을 그대로 검증한다. 새 main에서 제품을 빌드하거나 이전 실행을 새 SHA의 실행으로 바꾸지 않는다.

## 인수조건

- AC-1: caller의 모든 입력과 명시 Secret이 최신 중앙 workflow_call 계약에 맞고 기존 앱 식별자를 유지한다.
- AC-2: 중앙 버전 생성 후 기존 검사와 실제 AIT 빌드가 실행되고, before-build 및 before-deploy 검사와 산출물 결속을 통과한다.
- AC-3: 업로드는 검증한 같은 파일과 해시를 쓰고 콘솔의 deployment ID 및 canonical memo가 receipt와 일치한다.
- AC-4: 기존 앱인토스 자체 업로드 분기를 제거하고, 기기 사용과 운영 설정 변경 없이 구현 PR의 검사, 로컬 MiniMax 리뷰와 병합을 마친다.

AC-2와 AC-3의 실제 빌드 및 업로드 결과는 실행 뒤에만 통과로 기록한다. 심사와 공개는 기존 사용자 출시 승인으로 이어가되 외부 도구가 요구하는 실제 사용자 테스트 완료를 꾸미거나 건너뛰지 않는다.

## 테스트와 정지 조건

같은 폴더의 test-plan.json으로 L1 개발 환경의 배포 제어 변경을 검증한다. YAML과 actionlint, caller와 중앙 입력 및 Secret의 정합성, 설치와 빌드 순서, 기존 서비스 테스트, PR CI, 로컬 MiniMax 리뷰를 수행한다. 실제 업로드 실행에서는 기존 후보 L3 자산과 산출물 receipt 및 콘솔 메모 대조를 추가한다.

태그 또는 소스, 해시, 앱 식별자, 서명 및 권한이 다르면 멈춘다. 중앙 수정, 새 자격증명, 기기 사용, 다른 런타임 후보나 버전 발급이 필요해도 이 설계로 확대하지 않는다. App Store와 Google Play의 진행 중인 v1.13.0 작업은 취소하거나 다시 만들지 않는다. 공식 개인정보 사이트 PR89는 Ready로 유지한다.
