# Android 광고 닫힘과 보상 이벤트 순서 처리

- 설계 ID: 2026-10-23-android-reward-events, v1
- 기준 소스: fe69cd5883f7cc096f153852318db4c2e4a222f0
- 접수: [#479](https://github.com/seorilabs/happy-farm/issues/479)
- 관련 목록: [18건 상태와 처리 순서](../2026-10-23-open-issues/README.md)
- 검증 계획: [test-plan.json](test-plan.json), L1, dev, redesign=false

## 목적과 결정

Android 광고 CLOSED 뒤 EARNED_REWARD가 늦게 도착하는 순서를 처리한다. Android에만 닫힘 뒤 500ms 유예를 적용하고, 보상을 받으면 광고가 닫힌 뒤 earned로 한 번만 확정한다. 유예가 끝나면 dismissed로 확정한다. 500ms 경계와 이후 이벤트 무시는 테스트로 고정한다. iOS 및 AIT의 결과 계약은 유지한다.

준비 상태에서 정책 허용, claim 준비 및 SDK loaded를 구분한다. production은 placement별 SSV customData를 load 전에 받아야 하므로 익명 사전 load를 추가하지 않는다. 한 요청이 claim 생성과 load를 진행하는 동안 CTA를 로딩으로 막고 loaded 후에만 SDK show를 호출한다. 서버 검증 전에는 보상을 주지 않고 claimId 기반 중복 지급 방지를 유지한다.

## 흐름, 구조와 실패 처리

apps/mobile/src/ads/adMobRewardedAd.ts의 production adapter와 개발 경로를 함께 확인한다. platformRewardedAd.ts의 policy, createClaim, SSV, claim polling 순서는 유지한다. 결과 타입에는 필요한 진단 필드만 추가한다. 실패 이벤트에 normalizeAdFailureFamily 결과, 정리한 SDK 코드와 show부터 close까지 duration_ms를 전달한다. 원시 오류 payload, token, user ID, customData는 계측하지 않는다. 열려 있는 광고의 시간 제한을 되살리지 않는다.

## 변경 범위의 인수조건과 실행

가짜 SDK 이벤트와 시계로 reward→close, close→reward 0/499/500ms, close만 발생, error, show 거부, 열림 뒤 120초 이상, 중복 close 및 reward, unmount, 다음 요청을 확인한다. 정책 차단과 load 실패에는 SDK show 0회, SSV 미검증은 지급 0회, 확인된 claim의 재처리는 지급 1회 이하여야 한다. RN 개발 화면에서 기다림, 닫기, 실패 후 재시도를 실제 입력으로 확인한다. native SDK 실제 이벤트 도달과 운영 광고 비율은 이번 완료 주장에 포함하지 않는다.

각 원 인수조건은 구현 PR에서 AC-번호로 순서대로 옮겨 실패와 통과 근거에 연결한다. 공개나 외부 운영 확인은 Refs로 남기고 코드 병합만으로 닫지 않는다. #575는 시작 화면, 상태와 접근성, 겹침으로 나누며 개인정보 항목은 조사 보류다. 범위 밖 항목은 원 이슈에서 유지한다.

### 접수 이슈의 원 인수조건

- [ ] Android 경로에서 `CLOSED`가 `EARNED_REWARD`보다 먼저 도착해도 최종 결과가 `earned`로 확정된다(단위 테스트로 이벤트 순서를 뒤집어 검증).
- [ ] 광고가 준비되지 않은 상태에서는 보상 CTA가 노출 시도를 하지 않는다(비활성 또는 로딩 상태). 준비 완료 후에만 show가 호출된다.
- [ ] `ad_reward_failed` 이벤트에 `failure_family` 파라미터가 실린다(값은 `normalizeAdFailureFamily`의 반환값).
- [ ] `ad_reward_failed`의 `dismissed` 케이스에 show 시작부터 종료까지의 경과 시간(ms) 파라미터가 실린다.
- [ ] 위 변경이 iOS 기존 동작(`:339-361`의 보상 보정)과 WEB(AIT) 경로 동작을 바꾸지 않는다.
- [ ] `pnpm test`가 통과하고, 새 동작(순서 역전 / not_ready 게이트 / failure_family 파라미터)에 대한 테스트가 추가된다.

위 원문 중 SDK 0.5.0, Firebase Remote Config, 배포 및 기기 검증 등 현재 구조 또는 이번 요청과 달라진 항목은 이 문서의 목적과 결정에서 차이를 밝혔으며 자동 충족으로 표시하지 않는다. 원문을 수정된 인수조건으로 몰래 대체하지 않는다.

## 실행과 승인

[공통 실행 범위, 검수와 복구](../2026-10-23-open-issues/execution-scope.md)를 따른다. 설계와 같은 커밋의 test-plan.json은 사람 검토 대기이며, 배포 실행은 승인 범위에서 제외한다.
