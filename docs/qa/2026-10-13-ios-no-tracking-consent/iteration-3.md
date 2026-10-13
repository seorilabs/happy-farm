# UI 검수 3/3

## 실행 전 계획

- 설계 ID·조건 ID·후보 SHA·변경점: `2026-10-13-ios-no-tracking-consent` v3(보강 포함). 조건은 AC-3·AC-5·AC-8·AC-10~15이고, 후보 코드는 `864734476187a0c3f892ac4a001f4b1fccd43e7b`다. 2회차 이후 바뀐 점은 네 가지다.
  - 안내 모달(알림 권한·졸업 안내·기능 안내)을 한 자리로 묶었다. 표시를 시작한 안내는 `onShow` 전에 내리지 않고, 그동안 시트는 기다린다.
  - 시트·전면 광고가 화면에 있으면 안내를 올리지 않고, 안내 중에는 기회형 전면 광고를 건너뛴다.
  - 전면 광고가 진행 중이면 시트 모달의 표시 상태를 바꾸지 않는다(R2-1의 "바로 수확" 경로).
  - 광고 정보 고지의 글자 대비를 높였다(R2-6).
- 계획 작성 시각·실행 순서·통과 기준: 2026-10-13T13:07:00Z. 표 순서대로 실행한다. 이번이 마지막 회차이므로 모든 핵심 기능의 기능·UX가 통과해야 한다. 실패하면 4회차는 사람 승인 뒤에만 진행한다.
- 구현자·다른 리뷰 에이전트·페르소나: 구현자는 작성 세션이다. 검수자는 1·2회차와 별도로 새로 띄운 리뷰 에이전트다. 페르소나는 회귀·복구 검수자와 반복 사용자다.
- 실제 환경·격리 계정·데이터·저장 경로: iOS 시뮬레이터 `iPhone 18 Pro`(iOS 27.0, `7F3E769F-A3B7-4D5C-832D-9FB17C249DBC`). Debug 앱을 새로 설치한다. Metro는 후보 SHA 전용 worktree에서 띄운다. 저장 경로는 1·2회차와 같다.
- 핵심 기능 전체 목록: `app-launch-shell`, `title-startup`, `onboarding`, `planting`, `growth-harvest`, `shop`, `welcome-back-offline`, `save-restore`, `reset-farm`
- 이어받는 영향 없는 기반 기능: 없음

| 항목 | 기능 기대 결과 | UX 기대 결과 | 오류·복구 재현 | 남길 증거 |
|---|---|---|---|---|
| 1. 새 설치 첫 사용자 흐름 (`app-launch-shell`, `title-startup`, `onboarding`, AC-12) | 실행 → 진입 → 첫 수확 → Continue → 출석 시트 → 닫기 → 알림 안내 → 나중에 → 기능 안내(작업장) → 보러 가기 → 시트 → 닫기까지 모든 탭이 반응한다 | 안내가 하나씩 차례로 뜬다 | — | 캡처, `Attempt to present` 검색 결과 |
| 2. 수확 직후 기능 안내와 수확 보너스 시트 (`growth-harvest`, `planting`, AC-13·14) | 감자를 심고 다 자라면 수확한다. 요리 안내와 수확 보너스 시트가 함께 조건을 만족해도 입력이 멈추지 않는다. 시트를 닫으면 요리 안내가 뜬다 | 안내나 시트가 잠깐 바뀌어도 이해할 수 있다 | 시트 "No thanks", 안내 "나중에" | 캡처, 로그 |
| 3. 복귀 요약 "바로 수확"과 복귀 광고 (`welcome-back-offline`, AC-14·15) | 밀을 심고 종료 → `lastSeen` 8시간 전 → 재실행 → 복귀 요약 "바로 수확" → 테스트 전면 광고 → 닫기 → 이어지는 안내와 농장 조작이 모두 반응한다 | 광고 전후로 화면이 자연스럽게 이어진다 | 광고 닫기 | 캡처, 로그, 저장 수정 기록 |
| 4. 상점 구매와 전면 광고 (`shop`) | 상점에서 밭 개간·업그레이드를 연속 구매한다. 전면 테스트 광고가 뜨면 닫은 뒤 상점 시트가 그대로 조작된다. 시트를 닫으면 농장이 반응한다 | 잔액·버튼이 읽힌다 | 잔액 부족 항목 탭 | 캡처, 로그 |
| 5. 시트 안 보상 광고 | 성장 중인 밭의 광고 단축, 또는 상점 보상 탭 광고를 끝까지 본다. 보상이 반영되고 시트가 닫히거나 유지되는 동작 뒤에도 입력이 반응한다 | 보상 결과가 보인다 | — | 캡처, 로그 |
| 6. 동의 창·기록 재확인 (AC-3·AC-5) | 키 3개를 주입하고 재실행 → 진입 후 키 삭제, 동의 창 없음, 로그에 UMP 흔적 없음 | — | — | defaults 출력, 로그 |
| 7. 설정 광고 정보 (AC-8) | 고지·Google 링크가 있고 "광고 개인정보 설정"은 없다. 링크가 Safari에서 열리고 앱으로 돌아온다. 고지 글자가 읽기 쉽다 | 대비 개선 확인 | 링크 후 복귀 | 캡처 |
| 8. 재시작·저장 복구 (`save-restore`) | 위 흐름 뒤 앱을 강제 종료하고 재실행하면 골드·밭·확인한 안내 상태가 그대로이고, 확인한 안내는 다시 뜨지 않는다 | — | 백그라운드 → 복귀 | 캡처, 저장 파일 |
| 9. 초기화 후 다시 시작 (`reset-farm`) | 초기화 → 새 온보딩 → 8초 자동 완료 경로로 다시 진행해도 반응한다 | 위험 동작 확인이 분명하다 | 틀린 확인 단어 | 캡처, 로그 |

## 실행 후 관찰·판정

- 검수자: 구현과 1·2회차 검수에 참여하지 않은 별도 리뷰 에이전트. 페르소나: 회귀·복구 검수자 + 반복 사용자.
- 시작: 2026-10-13T13:07:51Z(계획 확인), 첫 실행 13:09:53Z. 관찰 종료: 14:00:38Z(앱 종료). 보고서 작성: 14:01Z~.
- 후보 확인: Metro(8081)의 작업 디렉터리가 `scratchpad/hf-candidate/apps/mobile`이고, 그 체크아웃의 HEAD가 `864734476187a0c3f892ac4a001f4b1fccd43e7b`, 변경 파일 없음(시작·종료 시 모두 확인).
- 환경: iPhone 18 Pro, iOS 27.0, `7F3E769F-…`. 기기 언어는 ko-KR이지만 새 설치 앱은 English(`en-US`)로 시작했다(1·2회차와 같음). 검수 중 호스트 부하가 매우 높았다(load average 280~590, 8코어, 다른 프로세스). 그래서 idb 탭 1회 왕복이 3~4초, 화면 캡처가 2~30초 걸렸다.
- 설치 이력: 설치 #1(준비된 새 설치) → 항목 1 1차. 설치 #2(13:15:51Z, 안내된 재설치 명령) → 항목 1 2차, 이어서 같은 설치에서 항목 2~9.
- 증거 폴더: `~/.local/share/seorilabs/evidence/happy-farm/2026-10-13-ios-no-tracking-consent/round-3/`(파일명은 항목 번호로 시작, 100개). 앱 로그는 세션 전체를 `log stream`(process == HappyFarmMobile, 363,064줄)으로 받았다. 항목별 요약은 `0N-applog-scan.txt`, 전체 요약은 `99-session-applog-scan.txt`에 있다(로그 시각은 KST = UTC+9).
- 세션 전체 로그: `Attempt to present` 0건, `already presenting`·`presentation is in progress`·`Unbalanced calls` 0건, UMP·동의 창 패턴 0건, 크래시 패턴 0건. 앱 프로세스 6개(실행 6회) 모두 정상 종료했다.
- 계획 밖 조작 공개:
  1. 빠른 연속 탭 도구 `scratchpad/qa-r3/ftap.py`(idb gRPC 연결 하나로 탭 여러 번)를 만들어 광고 닫기 등에 썼다.
  2. 항목 8의 백그라운드 전환은 HOME 대신 iOS 설정 앱 실행으로 했다. 복귀 뒤 같은 프로세스(pid 14033)가 이어졌다.
  3. 계획보다 범위를 넓혀 동물 기능 안내(수동 수확으로 조건 충족), 성장 시트 보상 광고, 일괄 수확 전면 광고도 확인했다.
  4. 저장 데이터는 항목 3에서 `lastSeen`만 고쳤고 고치기 전에 백업했다.
  5. 개발 빌드 전용 오버레이("Fast Refresh disconnected" 배너, LogBox "Open debugger to view warnings")가 13:18Z·13:33Z에 떴다. 버튼을 가려서 닫고 진행했다. 앱 로그에는 `Cannot connect to Metro` 3건이 남았지만 번들은 계속 로드돼 있었다. 부하로 HMR 연결이 끊긴 것으로 보이며 Release 빌드와는 무관하다.
  6. 디버거 연결이나 앱 상태 직접 변경은 하지 않았다. 키보드 입력 소스도 바꾸지 않았다(`idb ui text`로 영문이 그대로 입력됨).

| 항목 | 실제 관찰·증거 | 기능/UX 문제·사용자 영향 | 수정 제안 | 판정 |
|---|---|---|---|---|
| 1. 새 설치 첫 사용자 흐름 (AC-12) | **1차**(설치 #1): 13:09:53Z 실행 → 타이틀 → Enter Farm → 13:11:21Z 당근 수확 → 보상 단계(Continue). 화면 캡처가 약 8초 걸려 그사이 **8초 자동 완료**로 넘어감 → 출석 보너스 시트 → Got it → 알림 안내 → Maybe later → 작업장 기능 안내 → Take a look → 생산 시트 → 배경 탭으로 닫기 → 설정 열기·닫기. 모든 탭이 반응했다. **2차**(설치 #2): 수확 터치 22:18:20.401 KST, Continue 좌표 터치 22:18:28.511 KST(8.1초 뒤, 부하로 탭 지연). 이미 출석 시트가 떠 있어 이번에도 자동 완료 경로였다 → Got it → 알림 안내 → Maybe later → 작업장 안내 → Take a look → 생산 시트 → 닫기 → 설정 열기·닫기. 모두 반응했다(13:21~13:22Z). 두 번 모두 안내가 하나씩 차례로 떴고, 겹치거나 깜박이지 않았다. `Attempt to present` 0건. `01-title.png`, `01-farm-entered.png`, `01-first-harvest-t0.png`, `01a-*.png`, `01-reward-step-t1s.png`, `01b-daily-*.png`, `01-notification-prompt.png`, `01-workshop-coachmark.png`, `01-workshop-sheet.png`, `01-after-sheet-close.png`, `01-applog-scan.txt`(터치 시각) | 연결 흐름에 기능·UX 문제는 없다. 다만 계획의 "Continue 탭" 단계는 두 번 모두 실행하지 못했다. 원인은 도구 지연이다(Continue 탭이 8초 안에 도달하지 못함). 참고로 코드상 Continue와 자동 완료는 모두 `completeOnboarding('confirm' / 'auto')`를 부르므로 이후 흐름은 같다. 하지만 이번 회차에서 관찰하지는 못했다. 기존 경미 문제(R2-5)도 다시 보였다. 첫 수확 축하 카드가 Continue를 약 3초 덮고, "NEW CROP" 배너와 "Harvested +15G." 토스트가 겹친다(`09-reward-step.png`) | Continue 단계는 빠른 탭 도구(`ftap.py`: 수확 탭 뒤 약 3.5초에 Continue 탭)로 1회 재확인을 권한다. 시도 상한(2회)에 도달했으므로 승인 뒤에 진행한다 | 연결 흐름 **통과**(2/2). Continue 탭 하위 단계는 **차단**(도구 지연, 2회 시도 소진) |
| 2. 수확 직후 기능 안내와 수확 보너스 시트 (AC-13·14) | 설치 #2의 첫 세션에서 이어 진행했다(작업장 안내 확인 뒤). 감자 심기(115G→60G) → 13:22:43Z 수확(→148G). 재료 2종 조건 충족과 동시에 "Harvest Bonus" 시트가 떴다(3초 안 캡처) → "No thanks" → "The cooking pot is open" 요리 안내 → Later → 감자 심기(93G), 상점 열기·닫기까지 모두 반응했다. `Attempt to present` 0건. 2회차 R2-1(a)의 같은 경로(2/2 멈춤)가 재현되지 않았다. 설계에 적힌 "안내가 약 0.3초 보였다가 시트로 바뀜"은 캡처 지연 때문에 포착하지 못했다. 화면에는 시트가 바로 보였다. `02-potato-planted.png`, `02-potato-ready.png`, `02-harvest-t0.png`, `02-harvest-t3.png`, `02-after-no-thanks.png`, `02-after-later.png`, `02-shop-responds.png`, `02-applog-scan.txt` | 없음. 시트 → 닫기 → 안내 순서로 이어져 이해하기 쉽다 | — | **통과** |
| 3. 복귀 요약 "바로 수확"과 복귀 광고 (AC-14·15) | 밀 6칸 심기(31G 남음) → 13:27:12Z 종료 → 저장 백업 → `lastSeen` −8h(13:27:24Z) → 재실행 → Enter Farm → "Welcome Back! … away for 8h 1m", "Crops ready to harvest 6 plots", 버튼 2개 → 15초 대기(광고 준비) → 13:28:42Z "Harvest now" → 13:28:46Z 테스트 전면 광고 → 13:29:02Z 닫기(X) → 시트 잔여물 없이 농장, 31G→523G, 6칸 빈 밭 → 설정 열기·닫기, 밀 심기(498G) 모두 반응했다. `Attempt to present` 0건. 2회차 R2-1(b) 경로(1/1 멈춤)가 재현되지 않았다. "이어지는 안내"는 수확 뒤 골드(523G)가 동물 안내 조건(닭 600G)에 못 미쳐 이 항목에서는 뜨지 않았다. 복귀 광고 재노출 대기가 6시간이라 같은 설치에서 다시 할 수 없었다. 대신 항목 4 시작 전 수동 수확으로 637G가 되자 동물 안내가 떴고, Take a look → 생산 시트 → 닫기까지 반응했다(`04-pre-animals-coachmark.png`, `04-animals-sheet.png`). `03-wheat-planted.png`, `03-lastseen-edit.txt`, `03-save-backup-before-edit/`, `03-welcome-back.png`, `03-after-harvest-now-t2.png`, `03-after-harvest-now-t5.png`, `03-after-ad-close.png`, `03-farm-responds-after-ad.png`, `03-applog-scan.txt` | 기능 문제 없음. 광고 앞뒤 화면은 자연스럽게 이어졌다(광고 닫은 뒤 바로 농장, 골드 반영). 경미한 관찰(기존 배치, 이번 변경과 무관): "Harvest now"를 누르자마자 광고가 떠서 수확 결과를 보기 전에 화면이 가려진다. 광고를 닫은 뒤에는 수확 토스트가 보이지 않아 얼마를 벌었는지 골드 숫자로만 알 수 있다 | 수확 결과(토스트·골드 증가 연출)를 보여 준 뒤 광고를 띄우거나, 광고를 닫은 뒤 결과 토스트를 보여 준다(후속 이슈 후보) | **통과**(광고 뒤 안내 연결은 항목 4 시작 전 동물 안내로 따로 확인) |
| 4. 상점 구매와 전면 광고 (`shop`) | 637G에서 상점 → "Open Bloom Field 9KG"(잔액·조건 부족) 탭: 변화 없음 → "Clear a plot 300G" 구매(13:32:44Z) → 진행 이정표 전면 광고 → X → **상점 시트가 그대로 열려 있고** 337G, "7 plots now" → Upgrade 탭 → "Growth Fertilizer 900G"(잔액 부족) 탭: 변화 없음 → 상점을 닫고 밀 2회전으로 1.18KG → "Clear a plot 525G" 구매(13:35:11Z, 광고 간격 제한으로 광고 없음) → 658G → 2회전으로 1.63KG → "Growth Fertilizer 900G" 구매(13:36:11Z) → 전면 광고 → X → 상점 시트 유지, Growth Lv.2, 734G → Expand 탭 전환 → 시트 닫기 → Plant All 반응. `Attempt to present` 0건. `04-shop-open.png`, `04-unaffordable-tap.png`, `04-after-buy-t2.png`, `04-after-buy-t5.png`, `04-after-ad-close-shop.png`, `04-upgrade-tab.png`, `04-unaffordable-upgrade-tap.png`, `04-shop-before-2nd-buy.png`, `04-after-buy2-t3.png`, `04-after-upgrade-buy.png`, `04-upgrade-ad-t7.png`, `04-after-upgrade-ad-close.png`, `04-farm-after-shop.png`, `04-applog-scan.txt` | 기능 문제 없음. 잔액·가격·버튼이 읽힌다. 기존 경미 문제(2회차와 같음): 잔액이 부족한 항목을 탭하면 아무 안내가 없다. 비활성 카드의 가격 배지는 활성 카드와 비슷한 진한 색이다 | 잔액 부족 탭에 "골드가 부족해요" 같은 안내 추가(후속) | **통과** |
| 5. 시트 안 보상 광고 | 상점 Rewards 탭 "Watch ad for a plot discount"(Next plot 918G → 459G) → 보상형 테스트 광고 → "리워드 지급됨" 뒤 X(13:38:06Z) → 상점 시트가 닫히고 토스트 "Discount applied — unlocked 1 plot for 459G!", 1.22KG→763G, 9칸 → Plant All·Harvest All·설정 반응. 추가로 성장 시트(감자) "Watch ad to grow now"(13:39:10Z) → 보상 → X → 시트 닫힘, 감자 즉시 GET → 수확(1.26KG→1.34KG). `Attempt to present` 0건. `05-rewards-tab.png`, `05-rewarded-t3.png`, `05-rewarded-t15.png`, `05-after-rewarded-close-t1.png`, `05-after-rewarded-close-t3.png`, `05-farm-responds.png`, `05b-growth-sheet.png`, `05b-growth-ad-t16.png`, `05b-after-growth-ad-close.png`, `05-applog-scan.txt` | 기능 문제 없음. 보상 결과가 토스트·골드·밭 수로 보인다. 기존 경미 문제: 보상 토스트가 지역 탭 줄을 덮는다(1회차 "토스트 가림"과 같음) | — | **통과** |
| 6. 동의 창·기록 재확인 (AC-3·AC-5) | 종료 상태에서 `IABTCF_TCString=CQtestTCString`, `IABTCF_gdprApplies=1`, `IABTCF_PurposeConsents=11111111111` 주입·확인(13:42:31Z) → 13:44:36Z 실행 → 13:45:59Z 진입 → 13:46:36Z(실행 중) 3개 키 모두 없음 → 진입 뒤 60초 이상 동의 창·웹 시트 없음, 농장 조작 가능 → 종료 뒤에도 3개 키 없음, 디스크 plist의 `IABTCF` 0건. 이번 실행 로그(pid 95727, 29,511줄)에서 UMP·`fundingchoices`·`ConsentForm`·`ConsentInformation`·ATT 요청 0건이었다. 광고 SDK 통신은 97줄로 정상. `06-defaults-before-launch.txt`, `06-defaults-while-running.txt`, `06-defaults-after-terminate.txt`, `06-applog-ump-scan.txt`, `06-farm-t02.png`, `06-farm-t45.png`, `06-farm-t60.png` | 없음. 참고(R2-3, 설계상 범위 밖): Firebase Analytics 자체 캐시 `com.google.gmp.measurement.tcf.userdefaults.plist`에 `gdprApplies=1`, `purposeConsents=11111111111`이 그대로 남는다(`06-gmp-tcf-cache.txt`) | R2-3은 설계대로 후속 이슈로 추적 | **통과** |
| 7. 설정 광고 정보 (AC-8) | 설정 아래쪽에 "Ads and your data" 제목, 고지 문단("This game shows ads from Google AdMob. … We only request non-personalized ads and don't use this data to track you."), "How Google uses data" 버튼(`ad-data-policy`)이 있다. 접근성 트리에서 "privacy"가 들어간 요소는 0개로, "광고 개인정보 설정" 버튼이 없다. 13:50:42Z 버튼 → Safari에 `https://policies.google.com/technologies/partner-sites?hl=en`(앱 로그) → 상태 표시줄 "◀ 행복 농장 타이쿤" → 앱 복귀, 설정 시트가 같은 스크롤 위치로 유지됐다. 대비(화면 픽셀 측정): 고지 본문 #6B4A22 / 배경 #FFFDF5 = **7.85:1**(2회차 3.2:1). `07-settings-ad-section.png`, `07-settings-ax.txt`, `07-notice-contrast.txt`, `07-safari-opened.png`, `07-safari-url.txt`, `07-back-to-app.png` | 기능 문제 없음. 고지가 또렷하게 읽힌다(R2-6 해결). 기존 경미 문제(접근성): 섹션 제목 "Ads and your data"는 #A98A4E로 약 3.2:1이다. "Language", "Game Data" 등 다른 섹션 제목과 같은 공용 스타일이라 이번 변경에서 생긴 문제는 아니다 | 섹션 제목 공용 색을 4.5:1 이상으로 올리는 것은 후속으로 검토 | **통과** |
| 8. 재시작·저장 복구 (`save-restore`) | 종료 전 상태: 1.12KG(저장값 1120), 9칸 밀 수확 가능, 업그레이드 speed 2 / profit 1, 확인한 안내 `[workshop, cooking, animals]`, 알림 안내 확인됨 → 13:53:24Z 강제 종료(저장 파일 복사) → 13:53:38Z 재실행 → 진입 → 골드·밭·작물 동일. 15초 이상 지켜봐도 기능 안내·알림 안내가 다시 뜨지 않음 → 13:55:06Z 다른 앱(설정)으로 전환 → 5초 → 13:55:20Z 복귀(같은 pid) → 상태 동일 → Harvest All 반응 → 일괄 수확 전면 광고 → X → 1.89KG, 상점 열기·닫기 반응. `08-before-terminate.png`, `08-save-after-terminate/`, `08-state-before-relaunch.txt`, `08-restored.png`, `08-restored-t15.png`, `08-foreground-resumed.png`, `08-after-harvest-all.png`, `08-harvest-batch-ad.png`, `08-after-batch-ad-close.png` | 없음 | — | **통과** |
| 9. 초기화 후 다시 시작 (`reset-farm`) | 설정 → "Reset farm save" → "Start Over"(빨간 경고, "Type 'RESET' to confirm reset.") → "RESTE" 입력 시 삭제 버튼 비활성(접근성 enabled=false), 탭해도 1.89K G 유지 → "RESET" 입력 시 활성 → 13:57:41Z 삭제 → 출석 보너스 시트가 곧바로 뜸 → Got it → 새 온보딩 2/3(100G, 당근) → 13:58:15Z 수확 → 입력 없이 대기 → 8초 자동 완료 → 13:58:28Z 알림 안내 → Maybe later → 작업장 안내 → Take a look → 생산 시트 → 닫기 → 설정 열기·닫기 → 당근 심기. 모두 반응했다. `Attempt to present` 0건. `09-reset-dialog.png`, `09-wrong-word.png`, `09-correct-word.png`, `09-after-reset.png`, `09-onboarding-after-daily.png`, `09-reward-step.png`, `09-after-auto-complete.png`, `09-after-maybe-later.png`, `09-farm-responds.png`, `09-applog-scan.txt` | 기능 문제 없음. 위험 동작 안내가 분명하다. 기존 경미 문제: 초기화 직후 출석 보너스 시트가 새 온보딩보다 먼저 뜬다(R1-5와 같음) | 1회차 제안과 같음 | **통과** |

항목 밖 관찰:

- 2회차 P0 R2-1의 두 경로(요리 안내 + 수확 보너스 시트, 복귀 요약 "바로 수확" + 복귀 광고)를 각각 1회 실행했다. 둘 다 입력 멈춤이나 `Attempt to present`가 없었다. 이 밖에 전면 광고 4회(복귀·진행 이정표 2·일괄 수확), 보상형 광고 2회, 기능 안내 3종 표시 5회(작업장 ×3, 요리, 동물), 알림 안내 3회, 시트 열기·닫기 20회 이상에서도 모두 0건이었다.
- AC-5 종합: 세션 전체(실행 6회, 전면 광고 4회, 보상형 광고 2회, 설정 링크)에서 Google 동의 창이 한 번도 뜨지 않았다. UMP 흔적 0건, ATT 요청 0건.
- 이번 후보에서 새로 생긴 기능·UX 문제는 발견하지 못했다. 위 경미 항목은 모두 이전부터 있던 동작이다.
- 범위 밖·미실행: R2-8(시트 드래그 닫기), R1-3(보상 전 광고 닫기)은 이번 계획에 없어 확인하지 않았다. R2-2·R2-4는 이번 회차에서 다시 재현하지 않았다.

## 수정·재확인·남은 문제

| 번호 | 문제 | 정확한 재현 | 상태 | 다음 조치 |
|---|---|---|---|---|
| R3-1 (차단, 도구) | 항목 1의 "Continue 탭" 단계를 관찰하지 못함 | 새 설치 → Enter Farm → 당근 수확 → (8초 안에) Continue 탭. 이번 회차 2회 모두 Continue 터치가 8초 자동 완료보다 늦게 도달했다(2차: 수확 22:18:20.401 → Continue 22:18:28.511 KST, `01-applog-scan.txt`). 호스트 부하(load average 최대 약 590)로 idb 탭 1회가 3~4초 걸렸다. 축하 카드가 처음 약 3초간 Continue를 덮으므로, 수확 뒤 3.5~6초 사이에 탭해야 한다 | 차단(시도 2회 소진) | 승인되면 `scratchpad/qa-r3/ftap.py`로 새 설치(또는 초기화) 뒤 `ftap 58 420 3.5 200 377`(수확 → 3.5초 뒤 Continue)을 1회 실행해 이후 흐름을 확인한다. 약 3분 걸린다. 같은 리뷰 에이전트에 이어서 요청하거나 4회차 범위로 둔다 |
| R2-1 (P0) | 기능 안내·시트·전면 광고 표시가 겹칠 때 입력 멈춤 | (a) 항목 2 절차 1회, (b) 항목 3 절차 1회 | **재현 안 됨**(이번 회차 각 1/1 정상. 2회차에는 (a) 2/2, (b) 1/1 멈춤) | — |
| R1-2 (P0) | 온보딩 완료 시 입력 멈춤 | 8초 자동 완료 경로 3회(항목 1 ×2, 항목 9) | 자동 완료 경로 **해결 유지**. Continue 경로는 R3-1로 미확인 | R3-1과 같음 |
| R2-6 (경미, 접근성) | 광고 정보 고지 본문 대비 부족 | 항목 7 | **해결 확인**(3.2:1 → 7.85:1) | — |
| R3-2 (경미, 접근성, 기존) | 설정 섹션 제목 공용 색 #A98A4E 대비 약 3.2:1 | 설정 → "Language", "Ads and your data", "Game Data" 제목 | 기존 동작(이번 변경 전부터 있음) | 후속 이슈로 공용 제목 색 조정 검토 |
| R3-3 (경미, UX, 기존) | 복귀 요약 "Harvest now" 직후 광고가 떠서 수확 결과를 확인하지 못함 | 항목 3 절차. 광고를 닫으면 골드만 바뀌어 있고 수확 토스트는 보이지 않음 | 기존 동작(복귀 광고 배치) | 결과를 보여 준 뒤 광고를 띄우거나, 광고 뒤 결과 토스트 표시(후속) |
| R2-5 / R1-5 / 토스트 가림 (경미, 기존) | 축하 카드가 Continue를 가림·배너와 토스트 겹침 / 초기화 직후 출석 시트 먼저 표시 / 보상 토스트가 지역 탭 줄을 덮음 | `09-reward-step.png`, `09-after-reset.png`, `05-after-rewarded-close-t1.png` | 미수정(설계상 이번 범위 밖) | 설계 v3 보강에 적힌 대로 후속 이슈 |
| R2-3 (범위 밖) | Firebase Analytics 자체 TCF 캐시가 남음 | 항목 6 절차 → `06-gmp-tcf-cache.txt` | 설계상 범위 밖으로 유지 | 후속 이슈 |
| 환경 (개발 빌드 전용) | "Fast Refresh disconnected" 배너·LogBox 경고 토스트가 버튼을 가림 | 고부하 상태에서 Metro HMR 연결이 끊길 때(13:18Z·13:33Z) | 제품 결함 아님(Release에는 없음) | — |

이번 회차 결론: 계획 9개 항목 중 8개(항목 2~9)가 기능·UX 모두 통과했다. 2회차의 P0 R2-1 두 경로는 재현되지 않았고, AC-3·AC-5·AC-8·AC-13·AC-14·AC-15를 실제 실행으로 확인했다. 항목 1의 연결 흐름(출석 → 알림 → 기능 안내 → 시트 → 설정)도 2/2 통과했다. 다만 계획에 적힌 "Continue 탭" 단계는 도구 지연으로 두 번 모두 8초 자동 완료가 먼저 일어나 관찰하지 못했다(R3-1, 차단). 그래서 핵심 기능 `onboarding`의 Continue 경로는 이번 회차 근거가 없다. 이 단계 하나를 승인받아 재확인하기 전에는 "모든 핵심 기능 통과"로 보지 않는다. 새로 생긴 기능·UX 결함은 없다.

## 추가 진행 품의

- 문제·근거: 항목 1의 "Continue 직접 탭" 단계가 두 번 모두 호스트 부하(load 280~590)로 탭이 늦어 8초 자동 완료가 먼저 일어나 관찰하지 못했다(R3-1, 차단). 나머지 8개 항목과 R2-1 두 경로는 통과했다.
- 추가 회차·범위: 4회차 1회. Continue 직접 탭 단계와 핵심 기능 9개 빠른 재확인. 후보는 v1.12.1 태그 SHA `5fb1981ff01cb9eddd23282504f6c29aa0b8c062`(3회차 후보 `8647344`와 앱 코드 동일, 문서·config만 추가).
- 시간·비용: 약 20~30분, 리뷰 에이전트 1회.
- 검수자·환경: 새 리뷰 에이전트, iPhone 18 Pro 시뮬레이터(iOS 27.0), 태그 SHA 전용 worktree의 Metro.
- 중단 영향: 승인하지 않으면 마지막 회차 기능 판정이 차단으로 남아 중앙 iOS 빌드 전 검증이 실패하고, 재제출이 멈춘다.
- 사람 승인: 저장소 소유자(Ilhwan Seo)가 2026-10-13T14:57Z경 대화에서 "4회차 승인"을 선택했다(최대 4회차).
