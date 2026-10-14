# UI 검수 4/4 (승인된 추가 회차)

## 실행 전 계획

- 설계 ID·조건 ID·후보 SHA·변경점: `2026-10-13-ios-no-tracking-consent` v3(보강 포함). 조건은 AC-12와 AC-5·AC-13·AC-14이고, 후보는 v1.12.1 태그 SHA `5fb1981ff01cb9eddd23282504f6c29aa0b8c062`다. 3회차 후보 `8647344`와 앱 코드가 같고, 그 뒤로는 문서와 App Store config만 바뀌었다.
- 사람 승인: 저장소 소유자가 2026-10-13T14:57Z경 대화에서 4회차를 승인했다(최대 4회차). 범위·근거는 [3회차 추가 진행 품의](iteration-3.md#추가-진행-품의)에 있다.
- 계획 작성 시각·실행 순서·통과 기준: 2026-10-13T14:59:00Z. 표 순서대로 실행한다. 모든 핵심 기능의 기능·UX가 통과해야 하며, 입력 멈춤이나 `Attempt to present` 로그가 한 번이라도 나오면 실패다.
- 구현자·다른 리뷰 에이전트·페르소나: 구현자는 작성 세션이다. 검수자는 1~3회차와 별도로 새로 띄운 리뷰 에이전트다. 페르소나는 처음 사용자와 회귀 검수자다.
- 실제 환경·격리 계정·데이터·저장 경로: iOS 시뮬레이터 `iPhone 18 Pro`(iOS 27.0)에 Debug 앱을 새로 설치한다. Metro는 태그 SHA 전용 worktree에서 띄운다. 저장 경로는 이전 회차와 같다. 빠른 연속 탭에는 3회차 검수자가 만든 `ftap.py`를 쓸 수 있다.
- 핵심 기능 전체 목록: `app-launch-shell`, `title-startup`, `onboarding`, `planting`, `growth-harvest`, `shop`, `welcome-back-offline`, `save-restore`, `reset-farm`
- 이어받는 영향 없는 기반 기능: 없음

| 항목 | 기능 기대 결과 | UX 기대 결과 | 오류·복구 재현 | 남길 증거 |
|---|---|---|---|---|
| 1. 새 설치 → Continue 직접 탭 (`app-launch-shell`, `title-startup`, `onboarding`, AC-12) | 실행 → 진입 → 당근 수확 → 축하 카드가 걷힌 뒤 8초 안에 Continue를 직접 누른다 → 출석 시트 → 닫기 → 알림 안내 → 나중에 → 기능 안내 → 나중에 → 농장이 반응한다 | 안내가 하나씩 차례로 뜬다 | — | 캡처, 탭 시각과 완료 경로 로그 |
| 2. 심기·성장·수확 (`planting`, `growth-harvest`, AC-13·14) | 감자를 심고 다 자라면 수확한다. 수확 보너스 시트·요리 안내가 이어져도 반응한다 | — | 시트 "No thanks" | 캡처, 로그 |
| 3. 상점 (`shop`) | 밭 개간 1회, 업그레이드 1회. 전면 광고가 뜨면 닫은 뒤 상점이 그대로 조작된다 | 잔액·버튼이 읽힌다 | 잔액 부족 항목 탭 | 캡처 |
| 4. 복귀 요약 (`welcome-back-offline`, AC-15) | `lastSeen` 8시간 전 → 재실행 → 복귀 요약 → "바로 수확" 또는 받기 → 광고가 뜨면 닫기 → 반응한다 | — | 광고 닫기 | 캡처, 저장 수정 기록 |
| 5. 저장 복원 (`save-restore`) | 강제 종료 후 재실행 시 상태가 그대로이고, 확인한 안내는 다시 뜨지 않는다 | — | — | 캡처 |
| 6. 초기화 (`reset-farm`) | 틀린 단어는 막히고, RESET이면 초기화 후 새 온보딩이 나온다 | 위험 동작 확인이 분명하다 | 틀린 단어 | 캡처 |
| 7. 동의 창 없음 (AC-5) | 세션 로그에 UMP 흔적이 없고, 진입 후 동의 창이 없다 | — | — | 로그 검색 결과 |

## 실행 후 관찰·판정

- 검수자: 구현과 1~3회차 검수에 참여하지 않은 별도 리뷰 에이전트. 페르소나: 처음 사용자 + 회귀 검수자.
- 시작: 2026-10-13T15:00:41Z(계획 확인), 첫 실행 15:01:03Z. 관찰 종료: 15:12:26Z(앱 종료). 보고서 작성: 15:13Z~.
- 후보 확인: Metro(8081, pid 23304)의 작업 디렉터리가 `scratchpad/hf-candidate/apps/mobile`이고, 그 체크아웃의 HEAD가 `5fb1981ff01cb9eddd23282504f6c29aa0b8c062`, 변경 파일 없음(시작 15:00Z·종료 15:12Z 모두 확인).
- 환경: iPhone 18 Pro, iOS 27.0, `7F3E769F-…`. 준비된 새 설치(재설치 없음) 한 개로 항목 1~7을 이어서 했다. 앱은 English(`en-US`)로 시작했다. 시뮬레이터 시각이 KST 자정 직후라 밤 배경으로 보였다. 호스트 load average는 42~92였지만 idb 화면 조회 1회가 약 0.6초, 탭 왕복이 1초 안쪽이라 3회차 같은 탭 지연은 없었다.
- 증거 폴더: `~/.local/share/seorilabs/evidence/happy-farm/2026-10-13-ios-no-tracking-consent/round-4/`(파일명은 항목 번호로 시작, 60개). 앱 로그는 세션 전체를 `log stream`(process == HappyFarmMobile, 54,625줄)으로 받아 `99-session-applog.txt.gz`로 남겼다. 로그 시각은 KST(UTC+9)다.
- 세션 전체 로그: `Attempt to present`·`already presenting`·`presentation is in progress`·`Unbalanced calls` 0건, UMP·`fundingchoices`·`consent` 0건, 크래시 패턴 0건. 앱 프로세스 3개(실행 3회) 모두 정상 종료했다(`07-session-applog-scan.txt`).
- 계획 밖 조작 공개:
  1. Continue 탭에는 `ftap.py`를 바탕으로 만든 `scratchpad/qa-r4/item1.py`를 썼다. idb 연결 하나로 당근 수확 탭 → 1초 뒤 접근성 트리에서 `onboarding-reward-confirm` 좌표 확인 → 수확 4.0초 뒤 그 좌표를 탭 → 0.8초 뒤 캡처한다.
  2. 항목 6에서 화면 밖 좌표(설정 시트의 "Reset farm save" y=1383)를 바로 탭하는 검수자 실수가 있었다. 그 탭이 화면 아래쪽 "Comeback reminders" 스위치에 닿아 iOS 알림 권한 창이 떴다. "허용 안 함"으로 닫았고, 앱은 "Notification permission is off." 토스트를 띄우고 두 알림 스위치를 꺼진 채로 두었다(`06-after-deny-system-prompt.png`). 그 뒤 스크롤해서 정상 진행했다. 이 시스템 창 캡처는 같은 이름(`06-reset-dialog.png`)에 덮어써져 남아 있지 않다. 앱 동작으로는 정상이며 판정에 영향이 없다.
  3. 항목 6의 초기화 뒤 새 온보딩에서 Continue 직접 탭을 1회 더 했다(항목 1 보강 근거).
  4. 저장 데이터는 항목 4에서 `lastSeen`만 −8시간 고쳤다. 고치기 전에 백업했다.
  5. 디버거 연결이나 앱 상태 직접 변경은 하지 않았다. 개발 빌드 오버레이(Fast Refresh·LogBox)는 이번 회차에 뜨지 않았다.

| 항목 | 실제 관찰·증거 | 기능/UX 문제·사용자 영향 | 수정 제안 | 판정 |
|---|---|---|---|---|
| 1. 새 설치 → Continue 직접 탭 (`app-launch-shell`, `title-startup`, `onboarding`, AC-12) | 15:01:03Z 실행 → 약 6초 뒤 타이틀("Your farm is ready", Enter Farm) → 15:01:16Z 진입 → 온보딩 2/3 "Harvest when ready"(50G, 당근 수확 가능). **수확 탭 15:01:50.520Z → 2.16초 시점에 Continue(`onboarding-reward-confirm`, 201,377)가 접근성 트리에 있음 확인 → Continue 탭 15:01:54.530Z(수확 뒤 4.02초)**. 앱 로그의 터치 시각도 수확 00:01:50.533, Continue 00:01:54.542 KST로 4.009초 차이다. 그 뒤 0.11초 만에 새 시트가 뜬 로그(00:01:54.654)가 있고, **수확 5.55초 뒤 캡처에 출석 보너스 시트(115G, "+50G", Got it)가 이미 떠 있다**. 8초 자동 완료(수확 뒤 8초 = 00:01:58.5)보다 약 4초 빠르므로 Continue 탭으로 완료된 경로다 → Got it → 알림 안내 "Turn on farm reminders?" → Maybe later → 작업장 기능 안내 → Later → 당근 심기(Carrot, growing), 설정 열기·닫기 모두 반응했다(15:02:27Z~15:03:04Z). 안내는 출석 → 알림 → 기능 안내 순서로 하나씩 떴고 겹치거나 깜박이지 않았다. 보강: 항목 6 초기화 뒤 새 온보딩에서 같은 방법으로 수확 15:11:14.690Z → Continue 15:11:18.693Z(4.00초, 로그 00:11:14.693 → 00:11:18.709 KST) → 5.28초 캡처에 알림 안내(출석은 그날 이미 받음) → Maybe later → 작업장 안내 → Later → 심기·설정까지 반응했다. `Attempt to present` 0건. `01-title.png`, `01-farm-entered.png`, `01-continue-tap-timing.txt`, `01-applog-touch-times.txt`, `01-after-continue-t1.png`, `01-after-got-it.png`, `01-after-maybe-later.png`, `01-after-later.png`, `01-farm-responds.png`, `01-settings-open.png`, `06-continue-tap-timing.txt`, `06-after-continue-t1.png` | 없음. 3회차에 차단됐던 Continue 직접 탭 경로가 2/2 정상이다. 진입부터 농장 조작까지 막힘 없이 이어진다 | — | **통과** |
| 2. 심기·성장·수확 (`planting`, `growth-harvest`, AC-13·14) | 15:03:11Z 감자 심기(105G→50G, "About 6s left") → 다 자람 → 15:03:25Z 수확. 수확 직후 캡처(t0)에 "The cooking pot is open" 요리 안내와 "NEW CROP! Potato" 배너가 보이고, 약 2초 뒤(t2)에는 "Harvest Bonus" 시트(138G, "Watch ad for 1.5x harvest for 30m", "No thanks")로 바뀌어 있다 → 15:03:37Z "No thanks" → 요리 안내가 다시 뜸 → Later → 당근 수확, 감자 다시 심기(98G) 모두 반응했다. 이어서 밀 심기·수확을 여러 번 했고, 600G를 넘기자 동물 안내("You can build a coop")가 떠서 Later로 닫았다. `Attempt to present` 0건. `02-potato-planted.png`, `02-potato-ready.png`, `02-harvest-t0.png`, `02-harvest-t2.png`, `02-after-no-thanks.png`, `02-after-later.png`, `02-farm-responds.png`, `03-pre-coachmark.png` | 기능 문제 없음. 설계에 적힌 "요리 안내가 잠깐 보였다가 수확 보너스 시트로 바뀐 뒤, 시트를 닫으면 안내가 다시 뜸" 동작을 이번에는 캡처로 확인했다. 기존 경미 문제(R2-5와 같은 종류): 수확 순간 "NEW CROP" 배너가 기능 안내 카드 아래쪽과 겹쳐 보인다(`02-harvest-t0.png`) | 기존 후속 이슈와 함께 처리 | **통과** |
| 3. 상점 (`shop`) | 1.73KG에서 상점(Farm Office) → "Open Bloom Field 9KG"(비활성) 탭: 변화 없음 → 15:05:50Z "Clear a plot 300G" 구매 → 진행 이정표 테스트 전면 광고(진행 막대 뒤 X 표시) → 15:06:11Z X → **상점 시트가 그대로 열려 있고** 1.43K G, "7 plots now · 525G" → Upgrade 탭 → "Better Sales Route 1.5KG"(비활성) 탭: 변화 없음 → 15:06:29Z "Growth Fertilizer 900G" 구매(광고 간격 제한으로 광고 없음) → 532G, Growth Lv.2 → 시트 닫기 → Plant All 7칸 반응. `Attempt to present` 0건. `03-shop-open.png`, `03-unaffordable-tap.png`, `03-after-buy-t0.png`, `03-after-buy-t3.png`, `03-ad-before-close.png`, `03-after-ad-close-shop.png`, `03-upgrade-tab.png`, `03-unaffordable-upgrade-tap.png`, `03-after-upgrade-t0.png`, `03-after-upgrade-t3.png`, `03-farm-after-shop.png` | 기능 문제 없음. 잔액·가격·레벨이 읽힌다. 기존 경미 문제(2·3회차와 같음): 잔액 부족 항목을 탭하면 아무 안내가 없고, 비활성 카드의 가격 배지("1.73KG" 보라, "1.5KG" 주황)가 활성 카드처럼 진하다 | 잔액 부족 탭 안내 추가(후속) | **통과** |
| 4. 복귀 요약 (`welcome-back-offline`, AC-15) | 밀 7칸 심기(357G) → 15:06:57Z 종료 → 저장 백업 → `lastSeen` 1791904007039(15:06:47Z) → 1791875207039(07:06:47Z, −8h) 수정(15:07:04Z) → 15:07:09Z 재실행 → 진입 → "Welcome Back! … away for 8h 1m", "Crops ready to harvest 7 plots", "Harvest now"·"Back to the farm" → 약 18초 대기 → 15:07:36Z "Harvest now" → 테스트 전면 광고 → 15:07:52Z X → 시트 잔여물 없이 농장, 357G→1.3KG, 7칸 빈 밭 → 밀 심기, 설정 열기·닫기 반응. `Attempt to present` 0건. `04-before-terminate.png`, `04-save-backup-before-edit/`, `04-lastseen-edit.txt`, `04-welcome-back.png`, `04-after-harvest-now-t2.png`, `04-after-harvest-now-t5.png`, `04-ad-before-close.png`, `04-after-ad-close.png`, `04-farm-responds-after-ad.png` | 기능 문제 없음. 기존 경미 문제 R3-3이 다시 보였다. "Harvest now" 직후 광고가 떠서, 광고를 닫으면 수확 토스트 없이 골드 숫자만 바뀌어 있다 | 3회차 제안과 같음(후속) | **통과** |
| 5. 저장 복원 (`save-restore`) | 종료 전: 1.28KG, 밭 7칸(1칸 밀 수확 가능), Growth Lv.2, 저장값 `seenFeatureCoachmarks=[workshop, cooking, animals]` → 15:08:33Z 강제 종료(저장 파일 복사) → 15:08:47Z 재실행 → 진입 → 골드·밭·작물·다음 목표 동일. 17초 동안 기능 안내·알림 안내·복귀 요약이 다시 뜨지 않음 → 상점 Upgrade 탭 Growth Lv.2 유지 → 밀 수확 반응. `05-before-terminate.png`, `05-state-before-terminate.txt`, `05-save-after-terminate/`, `05-save-summary.txt`, `05-restored.png`, `05-state-after-relaunch.txt`, `05-restored-t17.png` | 없음 | — | **통과** |
| 6. 초기화 (`reset-farm`) | 설정 → 스크롤 → "Reset farm save" → "Start Over"(빨간 경고 "Starting over removes your gold, plots, upgrades, and planted crop records from this device.", "Type 'RESET' to confirm reset.") → "RESTE" 입력 시 "Delete farm save and start over" 비활성(접근성 enabled=false), 탭해도 1.36K G 그대로 → 지우고 "RESET" 입력 시 활성 → 15:10:55Z 삭제 → 출석 보너스 시트(100G) → Got it → 새 온보딩 2/3(100G, 당근, "Unlock Vegetable Field 0/4") → Continue 직접 탭 경로(항목 1 보강) → 알림 안내 → Maybe later → 작업장 안내 → Later → 당근 심기, 설정 열기·닫기 반응. `Attempt to present` 0건. `06-settings-bottom.png`, `06-reset-dialog.png`, `06-wrong-word.png`, `06-wrong-word-after-tap.png`, `06-correct-word.png`, `06-after-reset.png`, `06-onboarding-after-daily.png`, `06-after-continue-t1.png`, `06-after-maybe-later.png`, `06-farm-responds.png` | 기능 문제 없음. 위험 동작 안내가 분명하고, 틀린 단어에서는 버튼이 회색으로 바뀌어 막힌 것이 보인다. 기존 경미 문제 R1-5가 다시 보였다(초기화 직후 출석 시트가 새 온보딩보다 먼저 뜸) | 1회차 제안과 같음 | **통과** |
| 7. 동의 창 없음 (AC-5) | 세션 전체(실행 3회, 전면 광고 2회, 54,625줄)에서 `UMPConsent`·`UserMessagingPlatform`·단어 `UMP`·`fundingchoices`·`ConsentForm`·`ConsentInformation`·`consent`(대소문자 무시) 모두 0건이다. 대소문자를 무시한 "ump" 361건은 모두 광고 영상 재생의 CoreMedia `<SEGPUMP>`와 `piqca_gmstats_dump`였다. ATT는 상태 조회(`trackingAuthorizationStatus`, 결과 0)만 있었고 요청(`requestTrackingAuthorization`)은 0건이다. 앱 종료 뒤(15:14Z) 앱 컨테이너 `Library/Preferences`의 plist 6개 어디에도 `IABTCF` 키가 없다(새 설치라 3회차의 주입 시험은 하지 않음). 세 번의 실행 모두 타이틀 → 농장으로 바로 이어졌고 동의 창·웹 시트는 한 번도 뜨지 않았다. `07-session-applog-scan.txt`, `07-farm-no-consent.png`, `01-title.png`, `04-welcome-back.png`, `05-restored-t17.png` | 없음 | — | **통과** |

항목 밖 관찰:

- 수정 대상이던 입력 멈춤 경로 세 가지를 모두 실행했다. 온보딩 Continue 완료(2회), 수확 → 요리 안내 + 수확 보너스 시트(1회), 복귀 요약 "Harvest now" + 전면 광고(1회)다. 모두 입력 멈춤이나 `Attempt to present`가 없었다. 이 밖에 기능 안내 5회(작업장 ×2, 요리 ×2, 동물), 알림 안내 2회, 시트 열기·닫기 11회(설정 4, 상점 2, 출석 2, 수확 보너스, 복귀 요약, 초기화 확인)에서도 0건이었다.
- 이번 후보에서 새로 생긴 기능·UX 문제는 발견하지 못했다. 위 경미 항목은 모두 이전부터 있던 동작이다.

## 수정·재확인·남은 문제

| 번호 | 문제 | 정확한 재현 | 상태 | 다음 조치 |
|---|---|---|---|---|
| R3-1 (차단, 도구) | 3회차 항목 1의 "Continue 탭" 단계 미관찰 | 새 설치 → Enter Farm → 당근 수확 → 4초 뒤 Continue 탭 | **해소**. 4회차 2/2 관찰(수확 뒤 4.02초·4.00초 탭, 다음 안내가 5.3~5.6초에 표시. 자동 완료 8초보다 빠름) | — |
| R1-2 (P0) | 온보딩 완료 시 입력 멈춤 | Continue 경로 2회(항목 1, 항목 6) | **해결 확인**(Continue 경로 포함) | — |
| R2-1 (P0) | 기능 안내·시트·전면 광고 표시가 겹칠 때 입력 멈춤 | 항목 2 절차 1회, 항목 4 절차 1회 | **재현 안 됨**(3·4회차 모두 정상) | — |
| R3-3 (경미, UX, 기존) | 복귀 요약 "Harvest now" 직후 광고가 떠서 수확 결과를 확인하지 못함 | 항목 4 절차. 광고를 닫으면 골드만 바뀌어 있고 수확 토스트는 보이지 않음(`04-after-ad-close.png`) | 기존 동작 | 후속 이슈(3회차 제안과 같음) |
| R2-5 / R1-5 / 상점 잔액 부족 안내 (경미, 기존) | 수확 순간 "NEW CROP" 배너가 기능 안내 카드와 겹침 / 초기화 직후 출석 시트 먼저 표시 / 잔액 부족 탭에 안내 없음, 비활성 가격 배지가 진함 | `02-harvest-t0.png`, `06-after-reset.png`, `03-unaffordable-tap.png`, `03-after-upgrade-t3.png` | 미수정(설계상 이번 범위 밖) | 설계 v3 보강에 적힌 대로 후속 이슈 |
| R3-2 (경미, 접근성, 기존) | 설정 섹션 제목 공용 색 대비 약 3.2:1 | 설정 → "Ads and your data" 등 섹션 제목 | 이번 회차에는 다시 재지 않음(3회차 기록 유지) | 후속 이슈 |
| R2-3 (범위 밖) | Firebase Analytics 자체 TCF 캐시가 남음 | 3회차 항목 6 절차 | 이번 회차에는 다시 확인하지 않음 | 후속 이슈 |

이번 회차 결론: 계획 7개 항목이 모두 기능·UX 통과다. 3회차에 차단됐던 온보딩 "Continue 직접 탭" 경로를 2/2 관찰했다. 탭이 수확 4초 뒤에 들어갔고, 8초 자동 완료 전에 다음 안내가 떴다. 핵심 기능 9개(`app-launch-shell`, `title-startup`, `onboarding`, `planting`, `growth-harvest`, `shop`, `welcome-back-offline`, `save-restore`, `reset-farm`) 모두 이번 후보(`5fb1981`)에서 실제 실행으로 통과했다. 입력 멈춤·`Attempt to present`·동의 창은 세션 전체에서 0건이었다. 새로 생긴 기능·UX 결함은 없고, 남은 것은 이전부터 있던 경미 항목(후속 이슈)뿐이다.
