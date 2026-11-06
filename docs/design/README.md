# 설계 목록

저장소 Wiki가 꺼져 있어 이 파일이 설계 목록을 대신한다. 본문은 각 설계 파일이 정본이다.

| 날짜 | 설계 ID | 요약 | 상태 | 승인 커밋 | 티켓·PR·검수 |
|---|---|---|---|---|---|
| 2026-10-13 | [ios-no-tracking-consent](2026-10-13-ios-no-tracking-consent/design.md) | App Review 5.1.2(i) 대응: iOS를 추적 안 함으로 정리하고 Google 광고 동의 창 제거 | 승인(v3) | v1 `0a0967d`, v2 `03f8172`, v3 `0eb4c9e` | #573, #574 |

## 2026-10-23

- [열린 이슈 18건 순차 처리](2026-10-23-open-issues/README.md): 현황 재확인과 작업별 설계 10건 승인. 실행 결과와 남은 조건은 [처리 기록](../04-work/open-issues-execution-2026-10-23.md)에 있다. 이번 범위는 PR 병합까지이며 공식 사이트 방침은 Ready PR까지다.

## 2026-10-24

- [최신 main의 3개 마켓 공개 출시](2026-10-24-main-release/design.md): 사용자 새 출시 지시에 따라 별도 출시용 L3 전체 회귀와 마켓별 공개 끝 지점을 기록한다. 게임 코드는 변경하지 않으며 이전 검수의 SHA와 판정을 보존한다. 실행 티켓은 [#592](https://github.com/seorilabs/happy-farm/issues/592)다.

## 2026-11-06

- [앱인토스 광고 보상 획득 후 오류 처리](2026-11-06-ait-earned-reward/design.md): `e726658`의 v1 설계·테스트 계획을 사용자가 승인했다. L1 개발 환경에서 보상 보존을 검증하고 PR 병합까지 진행한다. 출시 범위는 없으며 실행 티켓은 [#597](https://github.com/seorilabs/happy-farm/issues/597)다.
- [모바일 광고 보상 보존과 3개 마켓 공개](2026-11-06-mobile-reward-public/design.md): v1 사람 검토 대기. Android·iOS의 획득 뒤 오류를 수정하고 서버 검증을 유지한다. 제안 버전은 v1.13.1이며 L1 개발 환경 검증부터 세 마켓 공개까지를 하나의 계획으로 검토한다.
