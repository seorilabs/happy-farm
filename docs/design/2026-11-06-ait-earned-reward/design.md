# 앱인토스 광고 보상 획득 후 오류 처리

- 설계: `2026-11-06-ait-earned-reward`, v1, 승인 완료
- 승인 커밋: `e726658b5fac4f73245055b9ff68fa9d2529b59f`의 설계와 테스트 계획. 2026-11-06 대화에서 사용자가 구현·개발 검증·PR·병합 제안에 “진행해라”라고 승인했다.
- 실행 티켓: [#597](https://github.com/seorilabs/happy-farm/issues/597)
- 조사 기준: `origin/main` 및 HEAD `cd9cb9a631a49aa1da2bd3421f96302305272a80`
- 제품 비교 기준: `v1.13.0`, `c75ccddd82e883dd12c71b32a07f56ebae1a7046`
- 실행 계획: [test-plan.json](test-plan.json), L1, 개발 환경, 출시 범위 없음

## 확인한 문제와 조사 한계

2026-11-05 10:37 KST 문의는 번들 `20261024-55`, 토스 `5.283.0`, iPhone 13 Pro Max에서 “광고를표시하지못했어요가 지속적으로 나오고 보상이 안받아짐”이다. 디바이스 ID와 사용자 식별 키는 문서·코드·PR에 복사하지 않는다.

문의의 문구는 `packages/farm-ui/src/FarmGame.tsx`에서 보상형 광고의 최종 실패를 표시할 때 쓰는 `adFailedToast`다. 광고 미준비, SDK 오류, 시간 초과가 같은 문구로 합쳐진다. 이 문구만으로 광고 공급 부족이나 네트워크 오류를 확정할 수 없다.

실제 AIT 광고 훅에서 아래 결함을 개발 환경으로 재현했다. **문의 사용자에게 이 이벤트 순서가 발생했다는 증거는 아직 없다.**

| SDK 이벤트 순서 | 현재 결과 | 수정 후 결과 |
|---|---|---|
| `loaded`, 표시, `userEarnedReward`, `onError` | `failed`, 보상 미지급, 재시도 가능 | `earned` 1회, 추가 광고 재시도 없음 |
| `loaded`, 표시, `userEarnedReward`, `failedToShow` | `failed`, 보상 미지급, 재시도 가능 | `earned` 1회, 추가 광고 재시도 없음 |
| `loaded`, 표시, 보상 이벤트 없이 오류 | `failed` | `failed` |
| `loaded`, 표시, `userEarnedReward`, `dismissed` | `earned` 1회 | `earned` 1회 |

공식 [showFullScreenAd 문서](https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/ads/showfullscreenad)는 `userEarnedReward`를 보상 획득 이벤트로 정의한다. 현재 코드는 이 이벤트를 받으면 `rewardGranted`를 true로 바꾸지만, 뒤따른 `onError`와 `failedToShow`는 이 상태를 확인하지 않고 실패로 확정한다. 시간 초과와 unmount 경로는 이미 획득한 보상을 보존한다.

이전 로그인 선행 장애와는 구분한다. 현재 훅은 공식 SDK를 직접 호출하며, 분석 세션은 광고 로드·표시의 선행 조건이 아니다. `v1.13.0`과 현재 HEAD의 `fullScreenAd.ts` SHA-256은 모두 `4527ed1dcb529c6c97c7ab347b1e1726019b8e04c99aab3a43fd917063d0481d`다. [2026-10-24 업로드 실행](https://github.com/seorilabs/happy-farm/actions/runs/40046508098)은 제품 소스 `c75ccdd`, deployment `01a16b5f-eb94-7492-815d-836606f48736`을 확인해 준다. 문의의 번들 번호와 이 deployment의 일대일 매핑은 Console readback 전까지 미확인이다.

## 운영 근거

- GA4 BigQuery `happy-farm-tycoon.analytics_539626577`의 `events_20261105`까지 테이블이 존재한다. 2026-10-30~11-05 조회에서 AIT/WEB 및 `app_market=apps_in_toss` 행을 관측하지 못했다. 이는 AIT 이벤트가 해당 내보내기에 없다는 뜻이며 광고 실패 0건을 뜻하지 않는다.
- 위 기간 집계 job: `job_wigFFLR4eaVjHEMeez35v4Le7iO2`, `asia-northeast3`, 20,182,775 bytes processed. 11-04~05 광고 파라미터 조회 job: `job_1tnc1xKA3WF5OWll5fOLTy2eQhLq`, 12,570,433 bytes processed.
- 제공받은 익명 키로 기존 Platform 사용자 매핑은 읽었다. 해당 사용자의 광고 이벤트와 완료 여부는 아직 읽지 못했다. `seorilabs-platform.platform.events`에 대해 등록된 GA4 reader와 provisioner 모두 조회 권한이 없어 HTTP 403을 반환했다. 권한 변경·새 자격증명 생성은 수행하지 않았다.
- 현재 로컬 Platform registry의 Happy Farm GA4 설정에는 measurement ID가 없고 이벤트 허용 목록에 `ad_load_result`가 없다. 이는 로컬 소스 관찰이며 운영 registry 값은 미확인이다. GA4 누락의 확정 원인이나 이번 광고 실패의 원인으로 단정하지 않는다.
- 현재 광고 훅 기존 테스트 14개 통과. 조사 전용 테스트에서 보상 획득 후 `onError`·`failedToShow` 두 조건은 모두 기대 `earned` 대신 `failed`를 반환해 실패했다. SDK 이벤트를 주입한 개발 환경 재현이며 실제 토스 SDK·기기 실행 증거가 아니다.
- 재현 테스트 원본·실패 로그·조사 receipt는 `/Volumes/Data/Backup/agent-artifacts/happy-farm/2026-11-06/cd9cb9a631a49aa1da2bd3421f96302305272a80/support-ad-reward-20261106T052030Z-fe605237`에 보존했다. 각 파일을 직접 읽어 크기·SHA-256을 대조한 뒤 로컬 조사 테스트와 로그를 삭제했다. `verification-manifest.json` SHA-256은 `d4e35920fca35a455028c94187253b0b411c1008d15798e6007fc97c7d4350d6`이다. 보관 만료 삭제는 승인되지 않았다.

## 수정 범위와 책임

`apps/ait/src/farm/platform/fullScreenAd.ts`의 최종 결과 확정 지점에서 해당 표시 요청의 `rewardGranted`가 true이면 획득 결과를 우선한다. 보상 완료를 받지 않은 요청은 기존 실패·취소 처리를 따른다. 광고가 열려 있는 동안에는 기존 종료 대기를 유지한다. 요청 token과 settled 가드, 콜백 해제, 다음 광고 로드는 유지한다. 표시가 종료된 뒤 공통 UI가 기존 보상·저장 경로를 한 번 실행한다.

공통 종료 함수가 보상형·전면형에 공유되므로 전면 광고의 종료·실패·재로드도 회귀 확인한다. 보상 이벤트를 받지 않은 전면 광고를 성공한 보상으로 바꾸지 않는다. API·광고 그룹·의존성·타임아웃·저장 형식·보상 수치·사용자 문구를 바꾸지 않으며 모바일 AdMob 경로도 수정하지 않는다. i18n과 스토어 문구 영향은 없다. 별도 리팩토링이나 임시 호환 계층은 필요 없다.

## 인수조건과 개발 검증

1. 획득 뒤 `onError` 또는 `failedToShow`가 와도 `earned`를 한 번만 반환하고, 후속 콜백은 무시한다.
2. 보상 완료가 없는 오류·취소·시간 초과에서는 보상을 지급하지 않는다.
3. 획득 뒤 오류가 와도 공통 UI는 광고를 다시 시청시키지 않고 보상·사용 횟수·저장을 한 번 처리한다. 다음 요청은 새 광고를 사용한다.
4. 기존 timeout·unmount 보상 보존, 중복 콜백 방어, 오래된 요청 콜백 격리와 전면 광고 종료 처리를 유지한다.
5. 훅의 이벤트 순서 테스트를 먼저 추가해 실패를 확인하고 최소 수정으로 통과시킨다. RN 개발 테스트에서 실제 `FarmGame` UI의 광고 버튼 입력부터 보상 상태·저장·재시도 횟수까지 확인한다. SDK 경계만 대체한다.
6. `pnpm lint`, `pnpm typecheck`, `pnpm check:i18n`, `pnpm test`를 실행한다. 필요 시 AIT 전용 검증을 순차 실행한다. 중앙 검증기의 개발 환경 하한을 확인하며 미실행·차단을 통과로 기록하지 않는다.

## 적용, 운영과 승인

이번 승인 요청은 위 결함의 구현·개발 검증·Ready PR 및 규정에 따른 병합까지다. `release: null`이며 배포·심사·공개·보상 수동 지급은 포함하지 않는다. 기기 사용도 포함하지 않는다. 변경은 SDK 연결이나 OS 동작이 아니라 이미 도착한 이벤트의 결과 확정 로직이므로 개발 환경에서 인수조건을 확인한다. 기기 사용이 필요한 필수 항목이 새로 생기면 이유와 최소 범위를 별도로 소명한다.

기능 목록 v1의 광고 기반 기능 하한은 `test-plan.json`의 foundation override 사유와 함께 검토받는다. 실제 광고 표시 성공·실기기 이벤트 도달·문의 사용자의 원인·수정 배포 후 회복률은 이번 개발 검증의 완료 주장에 포함하지 않는다.

문의의 정확한 원인을 확정하려면 기존 권한을 가진 운영 경로에서 해당 사용자의 문의 시점 전후 광고 로드·표시·실패·보상 이벤트를 읽어야 한다. 조회 결과에 따라 공급 부족·네트워크·표시 실패·획득 후 오류를 구분한다. 운영 조회 복구는 별도 조사이며 이 결함 수정의 성공을 실제 문의 해결로 바꾸어 보고하지 않는다.

승인 후 실행 이슈와 PR에 이 설계·원 인수조건·실패/통과 근거를 연결한다. 회귀 발견 시 해당 수정 PR을 되돌리고, 운영 설정이나 사용자 저장을 수정해 보상하지 않는다. 정확한 승인 응답과 설계 커밋은 구현 착수 전에 기록한다.
