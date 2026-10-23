# 구현과 검증의 공통 실행 범위

## 공통 실행 범위와 승인

설계 10건과 같은 커밋의 test-plan.json은 사용자가 승인했다. 승인 원본은 [PR #581의 46d3ac1965ce178f82632ffc0f3ca1b0219f3ea1](https://github.com/seorilabs/happy-farm/pull/581/commits/46d3ac1965ce178f82632ffc0f3ca1b0219f3ea1)이며, 병합 후 같은 트리의 조상은 2a3d1f4ea0755aa2a06690273e1976520f415695다. 승인 응답은 “설계 10건 승인, 구현과 병합 진행”이며 [승인 기록](https://github.com/seorilabs/happy-farm/pull/581#issuecomment-6355985613)에 연결한다. 승인 범위와 실행 결과는 [처리 기록](../../04-work/open-issues-execution-2026-10-23.md)에서 확인한다. 원래 설계 및 test-plan의 요구사항은 바꾸지 않았다.

중앙 보완 설계는 [seorilabs/.github PR #309의 f7c461c3898b0ca8ff2dcb883ddf4d2b9ac1c452](https://github.com/seorilabs/.github/pull/309/commits/f7c461c3898b0ca8ff2dcb883ddf4d2b9ac1c452)에서 승인받았다. 병합 후 같은 트리의 조상은 a457599425e6bd535e63d3df127a6546dfe0f7c6다. 사용자 응답 “승인, 중앙 보완과 추가 3회 진행”과 [승인 기록](https://github.com/seorilabs/.github/pull/309#issuecomment-6359421385)에 따라 중앙 계약 두 건과 #512 독립 검수 4, 5, 6회를 수행했다.

이번 끝 지점은 PR 병합이며 배포, 태그 발행, 업로드, 심사 제출, 운영 설정 변경과 기기 사용은 제외한다. #520의 공식 사이트 PR은 Ready에서 멈춘다. 중앙 test-plan schema는 release.markets 비어 있음과 병합 끝 지점을 지원하지 않으므로 시장은 영향 맥락, until은 허용 최소값 test-track으로 기록한다. **이 요청에서 release 필드는 실행 승인 대상에서 제외한다.** 향후 릴리스는 별도 명시 지시와 그 범위의 계획을 필요로 한다. 이를 근거로 테스트 채널 업로드를 시작하지 않는다.

L1은 작성자가 개발 환경에서 변경 기능을 실행한다. L3의 모든 실행은 다른 에이전트 또는 확인된 같은 후보 SHA CI가 담당한다. UI 새 화면은 매 회차 계획을 고정한 독립 검수 3회를 수행한다. 1회는 정상 상태와 처음 이용, 2회는 오류, 취소, 작은 화면과 큰 글자, 3회는 재실행과 전체 회귀를 확인한다. 각 회차는 전체 기능과 UX를 모두 확인하고 독립성을 기록한다. 세 회 뒤 미해결이면 다음 회를 임의로 시작하지 않는다.

기능 목록 v1의 기반 기능 하한은 현재 정의와 baseline 이후 변경 파일로 계산한다. 개발 환경 대체 사유는 test-plan.json에 적었다. 실제 SDK 및 OS 동작을 개발 대체 구현의 통과로 표시하지 않는다. 새 플랫폼 연결이 필요해지면 이 설계 범위를 다시 검토한다. 기기는 조회하지 않는다.

## 품질, 적용과 복구

새 문자열은 ko-KR, en-US, ja, zh-Hans, zh-Hant, de, fr, es의 key set을 함께 갱신한다. stable key, event name과 저장 key는 번역하지 않는다. 사용자 저장과 계정을 격리한다. 비밀값, 원시 사용자 식별자와 SDK payload는 증거와 계측에 남기지 않는다.

각 구현은 최신 origin/main의 별도 worktree에서 한 PR씩 진행한다. 실패 테스트, 최소 수정, 관련 회귀, 로컬 MiniMax 코드 리뷰, required check와 미해결 thread를 확인한 뒤 squash 병합한다. 검증은 lint, typecheck, test, check:i18n을 기본으로 작업별 실행을 더한다. 테스트용 대체 구현은 플랫폼 경계에만 두고 실제 FarmStartup과 FarmGame의 입력, 상태 전환, 오류와 재실행을 확인한다. 단위 테스트를 실행 화면 검수로 세지 않는다.

되돌리기는 해당 PR의 코드 revert PR로 수행한다. 실제 사용자 데이터 삭제와 복원, 운영 설정 변경은 하지 않는다. 새 데이터가 생기는 작업은 기존 저장에 없는 값의 기본값과 읽기 실패를 테스트한다. 근거 원본은 검수 중에만 로컬에 두고 NAS1dual로 스트림 복사한 뒤 크기와 SHA-256을 검증한다. Git에는 작은 텍스트 요약과 NAS 위치만 남긴다.
