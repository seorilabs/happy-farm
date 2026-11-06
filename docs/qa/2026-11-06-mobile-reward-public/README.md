# v1.13.1 광고 보상 수정과 출시 기록

2026-11-06 18:23 KST 기준 앱인토스는 **공개 완료**, Google Play와 App Store는 **심사 중**이다. [출시 원장](../../../release/market-launch-state.json)은 `complete=false`, 구조 오류 0건이며 공개 승인과 운영 확인을 통과로 바꾸지 않았다.

| 마켓 | 후보와 식별자 | 현재 확인 | 다음 gate |
|---|---|---|---|
| AppsInToss | `20261106-56`, deployment `01a1b001-7cbf-70c0-87bc-cd215406b775` | 18:22 KST 출시. Console 현재 공개 버전·소스·전체 번들 해시 일치 | 운영 광고 보상과 효과 관측 |
| Google Play | `1.13.1`, `1001011014`, 제출 `35` | 내부 배포 완료, 프로덕션 전체 출시 요청 검토 중 | 승인 후 자동 공개, 공개 버전 확인 |
| App Store | `1.13.1(1013001)`, 제출 `2db4ea6b-6716-4f50-b4c7-a7c3cd453c90` | VALID, 내부 TestFlight 제공, WAITING_FOR_REVIEW | 승인 후 AFTER_APPROVAL 공개, storefront 확인 |

[GitHub Release](https://github.com/seorilabs/happy-farm/releases/tag/v1.13.1)의 태그 소스는 `a8fb296b20c48be3501b7879ef8a85c6cc86e034`이다. 이 기록을 추가하는 문서 커밋으로 태그를 이동하지 않는다. 기존 국가·지역과 무료·광고 지원 방식을 유지했다. Play는 177개 명시 국가와 restOfWorld(Console 178곳), App Store는 175개 지역이다.

## 변경과 검증

앱인토스 [#598](https://github.com/seorilabs/happy-farm/pull/598), Android·iOS [#601](https://github.com/seorilabs/happy-farm/pull/601)로 획득 뒤 오류가 와도 획득 상태를 보존한다. 모바일 지급에는 원래 claim의 `confirmed|delivered` 및 `server_verified`가 계속 필요하다. 서버 미확인·명시적 취소·이전 요청은 지급하지 않는다. SDK·광고 단위·SSV 설정·권한·보상 수치·저장 형식·제품 UI 문구는 유지했다.

실제 출시 어댑터·서버 검증 wrapper·FarmGame 버튼·저장·ack·복원을 연결한 모바일 테스트 30개를 더했다. 보상과 사용량은 1회 증가하고 같은 claim을 다시 지급하지 않으며 저장 완료 뒤 ack를 보낸다. Android 500ms 유예, 열린 광고 대기, 전면 광고와 기존 실패 계약도 회귀 확인했다.

[최종 SHA CI](https://github.com/seorilabs/happy-farm/actions/runs/42187536386)는 공통 99 suites/1,614 tests와 모바일 13 suites/150 tests를 통과했다. 같은 SHA의 격리 checkout에서 모바일 150개, 앱인토스 UI·어댑터 325개, 서비스 81개를 직접 실행했다. 이 수치는 전체 1,764개에 중복 포함되므로 더하지 않는다. lint·타입·i18n·balance·아키텍처·마켓 설정·Firebase·광고 계약과 중앙 3개 마켓의 3개 단계 검증 9개를 통과했다.

SDK callback·시계·HTTP·저장소 경계를 대체한 승인된 L1 개발 실행이다. 실제 광고 공급·SDK 보상 전달·운영 서버 지급 증거로 기록하지 않는다. 최초 로컬 전체 실행의 기존 toast 시점 실패 1건은 변경 없이 직렬 실행과 CI에서 통과했다. 로컬 모델 리뷰는 10분 제한과 허용된 1회 재시도 3분 제한 모두 timeout으로 끝나 사유와 직접 점검을 PR에 남겼다.

[승인 기록](../../design/2026-11-06-mobile-reward-public/approval.md)의 원래 v1과 계획을 main `f0eac63849f020d1077c6a5732bfdd191f2299c2`에 동일 Git blob으로 옮겼다. 정적 CI를 실행 근거로 넣은 첫 문서는 CI_RUN_WORKFLOW로 거절되어 원본을 보존하고 실제 L1 실행으로 대체했다. 최종 `plannedAt`은 원 설계 커밋의 정확한 기록 시각 `2026-11-06T07:19:41.000Z`로 고쳤다. 후보·실제 실행 시각·결과는 유지했고 원래 수락 문서도 보존했다. [#599](https://github.com/seorilabs/happy-farm/issues/599)는 공개 gate가 남아 닫지 않는다.

## 승인된 토스 최소 실행

토스앱 테스트 1회는 공급자 제출 요건이다. 별도 승인을 받아 처음 연결된 Seeker를 조회했지만 토스가 없어 실행하지 못했다. 소유자가 로그인된 기기로 교체한 뒤 SM-S931N에서 정확한 private deployment를 한 번 열어 AppsInTossActivity와 `행복 농장`, `농장으로 가기`를 확인하고 Back·Home으로 복귀했다.

설치·초기화·로그인·설정 변경과 광고 시청·오류 주입·기기 보상 검수는 하지 않았다. 화면 트리는 게임 문구만 추려 확인했고 임시 기기 파일은 제거했다. 원시 화면·스크린샷·logcat과 개인 금융 화면 정보는 보관하지 않았다. 이 실행은 공개 전 후보 진입이며 공개 후 광고 흐름 검수를 대신하지 않는다.

## 메타데이터와 해시 범위

출시노트는 8개 언어로 작성하고 Release에서 재다운로드해 해시를 대조했다. App Store의 실제 저장값과 What’s New, 이미지 64장의 COMPLETE 상태·순서·원본 체크섬을 확인했다. 새 버전에서 비어 있던 홍보 문구는 검수한 기존 문구로 복원했다. Google Play 등록 문구·이미지와 8개 언어 출시노트도 대조했다. 앱인토스는 기존 문구·분류·600×600 로고·1932×828 썸네일을 확인하고 유지했으며 새 스크린샷을 추가했다고 주장하지 않는다.

[산출물 식별 기록](../../../release/history/v1.13.1/artifact-identities.json)은 다음 범위를 구분한다.

- Play: AAB 전체 SHA-256을 CI와 Publisher readback으로 대조했다. upload=true 워크플로가 원본 다운로드 자산을 제공하지 않아 로컬 AAB 원본 보관은 주장하지 않는다.
- AIT: 다운로드 ZIP과 내부 .ait 전체를 직접 해시해 Console canonical memo와 대조했다.
- iOS: 중앙 해시는 정규화된 앱 Info.plist JSON 범위이며 전체 xcarchive·IPA 해시가 아니다. 현재 업로드 경로는 원본 archive·IPA 자산을 제공하지 않으므로 NAS에 원본을 이관했다고 주장하지 않는다.

Play 첫 승격의 rollout=1은 API가 userFraction=1을 거절했다. 기존 프로덕션이 유지됨을 재조회하고 기존 워크플로의 완전 출시 표현인 completed와 빈 비율 입력으로 다시 요청했다. 승인한 100% 범위는 유지했으며 파이프라인 코드를 바꾸지 않았다.

## 남은 확인과 증적

원 문의의 실제 이벤트 순서는 개별 로그 조회 403 때문에 미확정이다. AIT GA4 미도착은 0건이 아니다. Console의 문의 당일 광고 요청 169건·노출 25건은 사전 로드가 섞여 있어 오류율로 해석하지 않는다. 새 버전의 운영 광고 보상과 효과는 아직 관측하지 못했다.

등록된 release-ops 웹훅은 HTTP 403으로 알림 전송에 실패했다. 다른 키·권한·채널을 사용하지 않았고 반복 모니터를 설정하지 않았다. Google Play·App Store 승인·공개와 live 확인이 남았다. 기존 공개 승인은 그 끝 지점까지 유지된다.

QA 원본: `/Volumes/Data/Backup/agent-artifacts/happy-farm/2026-11-06/a8fb296b20c48be3501b7879ef8a85c6cc86e034/release-v1.13.1-qa-083400Z-4e9239e1` (`manifest.json`, 14개 파일 직접 검증).

운영 원본: `/Volumes/Data/Backup/agent-artifacts/happy-farm/2026-11-06/a8fb296b20c48be3501b7879ef8a85c6cc86e034/release-v1.13.1-ops-093129Z-81a7e31c`. 직접 스트림 복사 후 366개 파일과 기존 QA 14개 참조의 크기·SHA-256을 검증했다. manifest SHA-256: `fe0b23766624a9217fc60d1ea7206a2c0b0de96636244cc0f60e6f7261129ed0`.
