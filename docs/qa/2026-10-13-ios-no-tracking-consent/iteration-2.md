# UI 검수 2/3

## 실행 전 계획

- 설계 ID·조건 ID·후보 SHA·변경점: `2026-10-13-ios-no-tracking-consent` v3, AC-3·AC-5·AC-8·AC-10·AC-11·AC-12. 후보 코드는 `26e3df4d26f6c4389e6ef7650e9fb0958b6097ff`다. 1회차 이후 바뀐 점은 네 가지다. (1) 설정 시트에 "광고 정보" 고지와 Google 안내 링크가 생겼다. (2) 동의 기록 삭제가 네이티브 `deleteValues`로 바뀌었다(1회차 방식은 New Architecture에서 키를 지우지 못함). (3) 추적 신고 검사가 좁아졌다. (4) R1-2 수정: 알림 권한 안내가 남아 있는 동안 기능 안내를 올리지 않고, iOS에서는 시트 모달이 완전히 닫힌 뒤(`onDismiss`)에만 안내 모달을 띄운다.
- 계획 작성 시각·실행 순서·통과 기준: 최초 2026-10-13T09:01:00Z. 실행 전인 11:00Z경 후보를 `bdbae86`에서 `26e3df4`로 바꾸고 14·15번 항목을 추가했다. 표 순서대로 실행하고, 모든 항목의 기능·UX 기대 결과를 충족하면 통과다.
- 구현자·다른 리뷰 에이전트·페르소나: 구현자는 작성 세션이다. 검수자는 1회차와 별도로 새로 띄운 리뷰 에이전트다. 페르소나는 사용자 관점 검수자와 UX 관점(새 고지 문단의 이해·가독성)이다.
- 실제 환경·격리 계정·데이터·저장 경로: iOS 시뮬레이터 `iPhone SE (3rd generation)`(iOS 18.1, `BCC17F16-57F7-489D-AA07-041EAEB4AB0E`, 작은 화면). 같은 Debug 앱을 새로 설치한다. Metro는 후보 SHA 전용 worktree(`scratchpad/hf-candidate`)에서 8081로 띄운다. 이것으로 구현자 작업 트리의 코드가 섞이지 않는다(1회차 혼입 재발 방지). 저장 경로는 1회차와 같다. 큰 글자는 `simctl ui content_size`로 바꾼다.
- 핵심 기능 전체 목록: `app-launch-shell`, `title-startup`, `onboarding`, `planting`, `growth-harvest`, `shop`, `welcome-back-offline`, `save-restore`, `reset-farm`
- 이어받는 영향 없는 기반 기능: 없음

| 항목 | 기능 기대 결과 | UX 기대 결과 | 오류·복구 재현 | 남길 증거 |
|---|---|---|---|---|
| 1. 새 설치 실행·타이틀 (`app-launch-shell`, `title-startup`) | 작은 화면에서 크래시 없이 타이틀 → 진입 | 진입 버튼·문구가 잘리지 않음 | Metro를 끈 상태에서는 개발 빌드 오류 화면이 뜨는 것을 확인만 하고 다시 켠다 | 캡처 |
| 2. 동의 기록 실제 삭제 (AC-3) | 1회차와 같은 키 3개를 주입한 뒤 진입하고, 앱을 종료한 뒤 다시 읽으면 키가 없다. 다시 실행해도 키가 생기지 않는다 | — | — | defaults 전후 출력 |
| 3. 동의 창 없음 (AC-5) | 진입 후 30초 동안 Google 동의 창·웹 시트가 없다. 로그에 UMP 활동이 없다 | — | — | 캡처, 로그 |
| 4. 온보딩 건너뛰기·바로 시작 (`onboarding`) | 건너뛰기 → 취소 → 다시 건너뛰기 확인. 새 설치 흐름의 수확 → 보상 → 심기 | 작은 화면에서 코치마크가 버튼을 가리지 않음 | 취소 시 상태 유지 | 캡처 |
| 5. 심기 실패·복구 (`planting`) | 골드가 모자란 씨앗을 고르면 안내가 나오고, 살 수 있는 씨앗으로 바꾸면 심어진다 | 안내 문구가 다음 행동을 알려 줌 | 그대로 | 캡처 |
| 6. 성장·수확·비료 (`growth-harvest`) | 성장 중인 밭 탭 → 성장 시트 → 기다리기(취소) → 수확 | 시트 닫기·드래그가 자연스러움 | 시트 취소 | 캡처 |
| 7. 상점 (`shop`) | 탭 전환, 잔액 부족 항목 비활성, 구매 1회 | 작은 화면에서 가격·버튼이 겹치지 않음 | 잔액 부족 탭 | 캡처 |
| 8. 보상 광고 취소 (AC-5) | 테스트 광고를 열고 끝나기 전에 닫으면 보상이 없고 안내가 나온다. 다시 보면 보상이 들어온다 | 실패 안내가 이해됨 | 광고 중도 닫기 | 캡처, 로그 |
| 9. 설정 광고 정보 (AC-8) | "광고 정보" 고지와 "Google의 데이터 사용 방식" 버튼이 보이고, "광고 개인정보 설정" 버튼은 없다. 버튼을 누르면 Safari에 `policies.google.com/technologies/partner-sites?hl=…`이 열리고, 앱으로 돌아오면 설정이 유지된다 | 고지 문단이 읽히고 잘리지 않음 | 링크 후 앱 복귀 | 캡처, Safari URL |
| 10. 긴 문구·큰 글자 (AC-8) | 언어를 English·Deutsch로 바꿔 설정 시트를 본다. 큰 글자(`extra-extra-large`)에서도 고지·버튼이 넘치거나 겹치지 않는다. 확인 뒤 기본 크기·언어로 되돌린다 | 스크롤로 모두 읽을 수 있음 | — | 캡처 |
| 11. 복귀 요약 (`welcome-back-offline`) | `lastSeen` 8시간 전 → 재실행 → 복귀 요약 → 받기 | 작은 화면에서 버튼이 보임 | — | 캡처 |
| 12. 저장 복원 (`save-restore`) | 종료 후 재실행 시 상태가 그대로 | — | 백그라운드 → 복귀 시 유지 | 캡처 |
| 13. 초기화 (`reset-farm`) | 틀린 단어는 막히고, 맞는 단어를 넣으면 초기화된 뒤 새 온보딩이 나온다 | 위험 동작 안내가 분명함 | 틀린 단어 | 캡처 |
| 14. 온보딩 완료 연결 흐름 (`onboarding`, AC-12) | 새 설치 → 첫 수확 → Continue → 출석 시트 → 닫기 → 알림 권한 안내 → "나중에" → 기능 안내 → "보러 가기" → 시트 → 닫기 → 설정 열기까지 모든 탭이 반응한다. 로그에 `Attempt to present`가 없다 | 안내가 하나씩 차례로 뜬다 | 각 단계 탭 반응 | 캡처, 로그 |
| 15. 8초 자동 완료 경로 (`onboarding`, AC-12) | 초기화 또는 새 설치 뒤 첫 수확 보상 단계에서 아무것도 누르지 않고 8초를 기다린다 → 이후 흐름이 14와 같이 반응한다 | — | — | 캡처, 로그 |

## 실행 후 관찰·판정

- 검수자: 구현에 참여하지 않은 별도 리뷰 에이전트(1회차 검수자와 다른 세션). 페르소나: 사용자 관점 검수자 + UX 관점(새 고지 문단의 이해·가독성).
- 시작: 2026-10-13T10:51:36Z(계획 확인), 첫 실행 10:55:24Z. 관찰 종료: 11:30:16Z(앱 종료). 보고서 작성: 11:32Z~.
- 후보 확인: Metro(8081)의 작업 디렉터리가 `scratchpad/hf-candidate/apps/mobile`이고, 그 체크아웃의 HEAD가 `26e3df4d26f6c4389e6ef7650e9fb0958b6097ff`, 변경 파일 없음(시작·종료 시 모두 확인). 검수 중 작업 트리에 `4dbc34e`(App Store 설정·문서만 변경)가 추가됐지만 실행 코드와 무관하다. 1회차 R1-4(작업 트리 혼입)는 이번 회차에 없다.
- 환경: iPhone SE (3rd generation), iOS 18.1, `BCC17F16-…`. 기기 언어 ko-KR이지만 새 설치 앱은 English(`en-US`)로 시작했다. 시작 언어(English)와 글자 크기(large)로 되돌렸다.
- 설치 이력: 설치 #1(준비된 새 설치) → 항목 1~13, 설치 #2(11:22:21Z) → 항목 14 1차(8초 자동 완료로 바뀜, 15a로 기록), 설치 #3(11:24:14Z) → 항목 14, 설치 #4(11:27:29Z) → 항목 15.
- 증거 폴더: `~/.local/share/seorilabs/evidence/happy-farm/2026-10-13-ios-no-tracking-consent/round-2/`(파일명은 항목 번호로 시작). 앱 로그는 `log stream`(process == HappyFarmMobile)으로 세션 전체를 받았고 필요한 줄만 `*-applog*.txt`, `99-session-applog-scan.txt`에 남겼다(로그 시각은 KST = UTC+9).
- 계획 밖 조작 공개: (1) 항목 1의 "Metro 끈 상태"는 Metro 중지 금지 지시 때문에 앱 자체 개발 설정(`RCT_packager_scheme=https`)으로 대신 시도했다가 효과가 없어 즉시 지웠다(백업 후 삭제 확인). (2) 항목 13에서 시뮬레이터 하드웨어 키보드 입력 소스를 Caps Lock으로 영문 전환해 `RESET`을 입력했고, 종료 전에 같은 방법으로 한국어 입력으로 되돌렸다(확인함). (3) 디버거 연결이나 앱 상태 직접 변경은 하지 않았다. 저장 데이터는 계획대로 `lastSeen`만 고쳤고 고치기 전에 백업했다.

| 항목 | 실제 관찰·증거 | 기능/UX 문제·사용자 영향 | 수정 제안 | 판정 |
|---|---|---|---|---|
| 1. 새 설치 실행·타이틀 | 10:55:24Z 첫 실행, 3초 안에 타이틀("Your farm is ready", Enter Farm) → 진입. 크래시 없음. 작은 화면에서 진입 버튼·문구 잘림 없음. `01-launch-t3s.png`, `01-farm-entered.png`. Metro 끈 상태 확인: Metro 중지 금지 지시로 대체 시도(`RCT_packager_scheme=https`)를 했으나 번들이 그대로 로드돼 오류 화면을 재현하지 못함 `01-metro-sim-attempt-bundle-still-loaded.png` | 기능·UX 문제 없음. 범위 밖: 기기 언어가 ko-KR인데 앱이 영어로 시작함(설정 저장값 `locale=en-US`, 1회차도 동일) | 언어 자동 선택이 의도인지 확인 | 통과(기능·UX). "Metro 끈 상태 오류 화면" 하위 확인은 **차단**(Metro 중지 금지, 대체 수단 무효) |
| 2. 동의 기록 실제 삭제 (AC-3) | 종료 상태에서 `IABTCF_TCString=CQtestTCString`, `IABTCF_gdprApplies=1`, `IABTCF_PurposeConsents=11111111111` 주입·확인(10:56:54Z) → 10:57:00Z 실행·진입 → 실행 중 10:57:52Z에 이미 키 없음 → 종료 후 3개 키 모두 "does not exist", 디스크 plist에도 없음 → 10:58:12Z 재실행·진입 20초 → 종료 후에도 키 없음. `02-defaults-before-launch.txt`, `02-defaults-while-running.txt`, `02-defaults-after-terminate-run1.txt`, `02-defaults-after-terminate-run2.txt` | 1회차 R1-1 해결 확인. 별도 관찰(R2-3): 주입한 첫 실행에서 Firebase Analytics가 정리 전에 키를 읽어 자체 파일 `com.google.gmp.measurement.tcf.userdefaults.plist`에 `gdprApplies=1`, `purposeConsents=11111111111`을 저장했고, 키가 없는 다음 실행 뒤에도 그대로 남았다(같은 두 증거 파일 하단) | GMP의 TCF 캐시가 GA4 동의 신호로 계속 쓰이는지 확인하고, 필요하면 함께 정리하거나 설계에 "범위 밖" 근거를 남김 | 통과 |
| 3. 동의 창 없음 (AC-5) | 진입(10:57:09Z) 후 t01·t10·t20·t30 캡처에서 Google 동의 창·웹 시트 없음, 농장 바로 조작 가능. 세션 전체 로그 301,433줄에서 `fundingchoices`·`UMP*`·`ConsentForm` 0건, `requestTrackingAuthorization` 0건(ATT 상태 조회만 있음), 광고 SDK 통신은 정상. 이후 전면 광고 1회·보상형 광고 2회 앞에도 동의 창 없음. `03-farm-t01s.png`~`03-farm-t30s.png`, `03-applog-ump-scan.txt`, `99-session-applog-scan.txt` | 없음 | — | 통과 |
| 4. 온보딩 건너뛰기·바로 시작 | 2/3 단계 Skip → "Skip the guide?" → Keep guiding me → 2/3·당근 GET·50G 그대로 → Skip → Skip guide → 출석 보너스 시트 → Got it → 당근 수확 → 알림 안내 → Maybe later → 작업장 안내 → Take a look → 생산 시트 → 닫기 → 설정 열림(건너뛰기 경로도 막힘 없음). 새 설치 흐름의 수확 → 보상(Continue) → 심기는 설치 #3에서 확인(감자 심기 115G→60G). `04-skip-confirm.png`, `04-after-cancel.png`, `04-skip-confirm-2nd.png`, `04-after-skip-t2s.png`, `04-after-first-harvest-skip-path.png`, `04-after-maybe-later.png`, `04-after-take-a-look.png`, `04-settings-open.png`, `14b-celebration-dismissed.png`, `04-plant-after-onboarding.png` | 기능 문제 없음. 평상시 코치마크는 버튼을 가리지 않음. 경미(R2-5): Skip 확인 패널이 펼쳐지면 작은 화면에서 밭이 모두 가려짐(결정 순간이라 허용 범위). 보상 단계에서 "First Harvest!" 축하 카드가 Continue 버튼을 최대 3.2초 덮고, "NEW CROP! Carrot" 배너와 "Harvested +15G." 토스트가 서로 겹침 `14-first-harvest-reward-step.png` | 축하 카드가 떠 있는 동안 8초 자동 완료 타이머를 멈추거나, 축하 카드를 코치마크 밖에 배치. 배너와 토스트 위치 분리 | 통과 |
| 5. 심기 실패·복구 | 115G에서 Sweet Potato(135G) 선택 → 가격이 빨간색, 빈 밭 탭 → 토스트 "Not enough gold."만 표시, 골드·밭 변화 없음 → Potato(55G)로 바꿔 심기 → 60G, 성장 중. `05-unaffordable-seed-tap.png`, `05-unaffordable-plant-attempt.png`, `05-planted-potato.png` | 기능 정상. **UX 기대 미충족(R2-2)**: 안내가 문제만 말하고 다음 행동(더 싼 씨앗 고르기, 수확해 골드 모으기)을 알려 주지 않음. 온보딩 밖에서는 살 수 있는 씨앗 강조도 없음. 한 줄 안내 "Plant Sweet Potato · 135G · ROI…"도 잘림 | 토스트를 "골드가 부족해요. 더 싼 씨앗을 고르거나 수확해 골드를 모아 보세요"처럼 바꾸고, 온보딩 넛지(살 수 있는 씨앗 강조)를 일반 상황에도 적용 | **실패(UX·경미, 이번 변경 전부터의 동작)** |
| 6. 성장·수확·비료 | 1차(설치 #1): 감자 심고 바로 탭 → "Grow Now" 시트(광고·비료·I will wait) → I will wait → 닫힘 → 11:02:17Z 첫 감자 수확(5G→93G) **직후 화면 전체 입력 멈춤**(두 번째 밭 수확·심기·설정·상점 모두 무반응), 로그 `Attempt to present <RCTFabricModalHostViewController> … while a presentation is in progress.`(20:02:17.994 KST). 강제 종료 후 재실행하면 "The cooking pot is open" 기능 안내가 정상으로 뜸 → 수확으로 요리 안내 조건(재료 2종)이 충족되는 순간 iOS가 안내 모달 표시를 거부한 것. 2차(재실행 뒤): 고구마 성장 시트 → I will wait → 수확(46G→272G) 정상. 같은 멈춤을 설치 #3에서 다시 재현(R2-1 재현 2/2, 11:26:10Z). 시트 드래그 닫기는 idb 드래그 3회 모두 닫히지 않음. `06-growth-sheet.png`, `06-after-i-will-wait.png`, `06-plot1-not-harvesting.png`, `06-freeze-after-shop-tap.png`, `06-freeze-applog.txt`, `06-freeze-save-snapshot/`, `06-relaunch-after-freeze.png`, `06b-*.png`, `06c-*.png`, `06c-freeze-repro2-applog.txt` | **P0(R2-1)**: 첫 세션 2~3분 안에 두 번째 작물을 수확하는 거의 모든 새 사용자가 화면 멈춤을 겪을 수 있음. 경미(R2-4): 작물이 다 자란 뒤에도 성장 시트가 "needs about 10s"와 "Watch ad to grow now"를 그대로 보여 다 자란 작물에 광고를 보게 할 수 있음 `06b-sheet-after-ready.png`. 드래그 닫기는 도구 한계일 수 있어 판단 보류 | R2-1 수정 제안은 아래 표. 성장 시트는 작물이 다 자라면 닫거나 "수확하기"로 바꿈. 드래그 닫기는 실기기나 XCUITest로 확인 | **실패(P0 R2-1)**. 드래그 닫기 하위 확인은 차단(도구) |
| 7. 상점 | Expand·Upgrade·Decorate·Rewards 탭 전환 정상. 272G에서 "Clear a plot 300G"·지역 해금 등 비활성(탭해도 변화 없음). 454G에서 Clear a plot 구매 → 직후 전면 테스트 광고(진행 이정표 배치) → 닫기 → 154G, "7 plots now", 다음 525G 비활성. 광고 전에 동의 창 없음. `07-shop-open.png`, `07-disabled-clear-plot-tap.png`, `07-tab-upgrade.png`, `07-tab-decorate.png`, `07-tab-rewards.png`, `07-expand-enabled.png`, `07-after-purchase.png`, `07-ad-t6s.png`, `07-after-interstitial-close.png` | 기능 문제 없음. 가격·버튼 겹침 없음. 경미: 탭마다 시트 높이가 크게 바뀜(1회차와 같음), Rewards 탭 배지가 선택 테두리에 붙음 | 시트 높이 고정 | 통과 |
| 8. 보상 광고 취소 (AC-5) | 수확 부스트 보상형 테스트 광고: 2·4초 시점 닫기 버튼 없음, 10초 시점 "리워드 지급됨" 뒤에만 닫기 노출 → 닫기 → "Harvest rewards are 1.5x for 30m.", 수익 표시 2배(이후 고구마 수확 19G→359G로 1.5배 확인). 취소 시도 2회: (1) 위 광고에서 보상 전 닫기 수단 없음, (2) 성장 광고 재생 약 2초에 HOME → 3초 → 앱 복귀: 광고가 그대로 이어지고 보상 뒤에만 닫힘. `08-rewarded-t2s.png`, `08-rewarded-t4s.png`, `08-rewarded-t10s.png`, `08-after-rewarded-close.png`, `08-cancel1-ad-open.png`, `08-cancel1-foreground.png`, `08-cancel1-reward-granted-state.png` | 보상 경로 정상, 동의 창 없음. "끝나기 전에 닫으면 보상 없음 안내"는 테스트 광고가 보상 전 닫기를 주지 않아 관찰 불가 | 취소 경로는 광고 객체를 흉내 내는 단위 테스트나 실광고 단위의 실기기 확인으로 대신 | **차단**(테스트 광고에 보상 전 닫기 없음, 앱 전환으로도 닫히지 않음) |
| 9. 설정 광고 정보 (AC-8) | 설정 아래쪽 "Ads and your data" 제목, 고지 문단 6줄, "How Google uses data" 버튼. "Advertising privacy choices"(`ad-privacy-options`) 없음. 버튼 → Safari에 `https://policies.google.com/technologies/partner-sites?hl=en`(앱·SpringBoard 로그로 확인) → 상태 표시줄 "◀ 행복 농장 타이쿤"으로 복귀 → 설정 시트가 같은 스크롤 위치로 유지. 앱이 비개인화 광고만 요청하는 것은 코드(`requestNonPersonalizedAdsOnly: true`)와 고지 문구가 일치. `09-settings-ad-section.png`, `09-safari-opened.png`, `09-safari-url-en.txt`, `09-back-to-app.png` | 기능 문제 없음. 고지가 잘리지 않고 무엇을·왜·추적 안 함을 한 문단에 담아 이해하기 쉬움. 경미(R2-6): 고지 본문 글자색 대비가 약 3.2:1(배경 #FFFDF5, 글자 #A98A4E, 화면 픽셀 측정)로 일반 텍스트 권장 4.5:1보다 낮아, 긴 문단이 흐리게 읽힘 | 고지 문단은 더 진한 색(예: 제목 갈색)으로 표시 | 통과 |
| 10. 긴 문구·큰 글자 (AC-8) | English·Deutsch, 기본 크기와 `extra-extra-large` 모두에서 재실행 후 고지 전문(영어 8줄, 독일어 9줄)과 버튼이 넘치거나 겹치지 않고 스크롤로 모두 읽힘. 독일어 버튼은 `hl=de`를 엶. 확인 뒤 English·large로 되돌림. `10-en-xxl-settings-relaunch.png`, `10-de-xxl-settings.png`, `10-de-default-settings.png`, `10-safari-url-de.txt`, `10-reverted-english.png` | 기능 문제 없음. 경미(R2-7): 앱이 떠 있는 동안 글자 크기를 바꾸면 레이아웃이 다시 계산되지 않아 재실행 전까지 고지·버튼 글자가 잘림 `10-en-xxl-ad-section.png`, `10-en-xxl-live-after5s.png`. 범위 밖: XXL에서 농장 씨앗 카드의 ROI·배지가 카드 밖으로 넘침 `10-en-xxl-farm.png` | 글자 크기 변경 시 다시 그리기(또는 최대 배율 제한) | 통과 |
| 11. 복귀 요약 | 1차: 밀 7칸 심고 종료 → 백업 → `lastSeen` −8h → 재실행 → "Welcome Back! … away for 8h 1m", "Crops ready to harvest 7 plots", 버튼 2개가 작은 화면에 모두 보임 → "Harvest now" 탭(184G→1.04KG) **직후 입력 멈춤**, 로그 `Attempt to present … which is already presenting <RCTFabricModalHostViewController>`(20:16:03.206 KST), 이후 접근성 트리에 앱 노드만 남음. 재실행하면 "You can build a coop"(동물) 안내가 뜸(359G 때는 뜨지 않았고 1,045G에서 뜸) → 수확으로 동물 구매 가능 골드를 넘은 순간 안내 모달이 닫히는 시트와 겹친 것으로 추정. 2차: 고구마 7칸 성장 중 종료 → `lastSeen` −8h → "Earnings while you were away +619KG", 버튼 3개 모두 보임 → "Collect +619KG and play" → 100G→619KG, 이후 조작 정상. `11-welcome-back.png`, `11-after-harvest-now.png`, `11-tap-settings-after-harvest-now.png`, `11-freeze-applog.txt`, `11-freeze-save-snapshot/`, `11-relaunch-after-freeze2.png`, `11b-welcome-back.png`, `11b-after-collect.png`, `11-lastseen-edit.txt`, `11b-lastseen-edit.txt`, `11*-save-backup-before-edit/` | **P0(R2-1, 시트 경로)**: 복귀 요약의 주 버튼이 앱을 멈추게 할 수 있음. 범위 밖: 보유 100G에 오프라인 +619KG(1회차와 같은 균형 문제) | R2-1과 같음 | **실패(P0 R2-1)** |
| 12. 저장 복원 | 619KG·고구마 7칸 수확 가능 상태로 종료 → 재실행·진입 → 동일. HOME으로 백그라운드 5초 → 복귀(같은 프로세스) → 동일. `12-before-terminate.png`, `12-restored-1s.png`, `12-foreground-resumed.png`, `12-state-*.txt` | 없음 | — | 통과 |
| 13. 초기화 | 설정 → "Reset farm save" → "Start Over"(빨간 경고, "Type 'RESET' to confirm reset.") → 틀린 단어(ㄲㄸㄴㅆㄸ) 입력 시 삭제 버튼 비활성, 탭해도 619KG 유지 → `RESET` 입력 시 활성 → 삭제 → 100G, 새 온보딩 2/3(자동 당근) | 기능 문제 없음. 위험 동작 안내 분명. 경미: 초기화 직후 출석 보너스 시트가 새 온보딩 위에 바로 뜸(1회차 R1-5와 같음) | 1회차 제안과 같음 | 통과 |
| 14. 온보딩 완료 연결 흐름 (AC-12) | 설치 #3: 당근 수확 → 축하 카드를 탭해 닫고 Continue(보상 단계 3초째) → 출석 시트 → Got it → 알림 안내 → Maybe later → 작업장 안내 → Take a look → 생산 시트 → 배경 탭으로 닫기 → 설정 열림·닫힘. 모든 탭 반응, 안내가 하나씩 차례로 뜸, 설치 뒤 로그 `Attempt to present` 0건·UMP 0건. 설치 #2의 1차 시도는 축하 카드가 Continue를 가린 사이 8초가 지나 자동 완료로 바뀌었고(15a로 기록) 그 흐름도 모두 반응. `14b-*.png`, `14-applog-scan.txt`, `14-attempt1-auto-completed-then-notification-prompt.png`, `15a-*.png` | 계획에 적힌 단계(설정 열기까지)는 모두 통과. 다만 같은 설치에서 이어서 감자를 심고 수확하자 R2-1로 멈춤(항목 6 재현 2) | R2-1 | 통과(계획 범위). 첫 세션 전체로는 R2-1로 미완 |
| 15. 8초 자동 완료 경로 (AC-12) | 설치 #4: 당근 수확(11:28:00Z) 뒤 입력 없이 대기 → 보상 단계 자동 완료 → 출석 시트(11:28:31Z 확인) → Got it → 알림 안내 → Maybe later → 작업장 안내 → Take a look → 시트 닫기 → 설정 열림·닫힘. 모든 탭 반응, 설치 뒤 `Attempt to present` 0건. 설치 #2의 15a 흐름도 같은 결과 | 없음 | — | 통과 |

항목 밖 관찰:

- AC-5 종합: 세션 전체(전면 광고 1, 보상형 광고 2, 설정)에서 Google 동의 창이 한 번도 없었고 UMP 흔적 0건, ATT 요청 0건이다.
- R1-2의 원래 경로(온보딩 완료 Continue·8초 자동 → 출석 → 알림 → 기능 안내)는 고쳐졌다(항목 14·15, 건너뛰기 경로 포함 3회 모두 정상). 그러나 같은 종류의 멈춤이 "기능 안내 조건이 수확 같은 사용자 동작으로 새로 충족되는 순간"에 남아 있다(R2-1, 3회 재현).
- HUD "About 308K G/hr"가 50G 시작 상태에서도 표시된다(1회차와 같음, 범위 밖).

## 수정·재확인·남은 문제

| 번호 | 문제 | 정확한 재현 | 상태 | 다음 조치 |
|---|---|---|---|---|
| R2-1 (P0) | 기능 안내 모달이 사용자 동작 직후 새로 표시 조건을 만족하면 iOS가 표시를 거부하고, 이후 화면 전체 입력이 막힌다(강제 종료 전까지 복구 불가) | (a) 요리 안내: 새 설치 → Enter Farm → 당근 수확 → Continue → 출석 Got it → 알림 Maybe later → 작업장 안내 Take a look → 시트 닫기 → Potato 선택 → 빈 밭에 심기 → 약 7초 뒤 수확 → 멈춤. 로그 `Attempt to present <RCTFabricModalHostViewController> … while a presentation is in progress.` 재현 2/2(설치 #1 11:02:17Z, 설치 #3 11:26:10Z). (b) 동물 안내: 작업장·요리 안내를 본 상태에서 밀 7칸을 심어 184G가 남은 채 종료 → `lastSeen` −8h → 재실행 → 복귀 요약 "Harvest now"(184G→1.04KG, 동물 안내 조건 충족으로 추정) → 멈춤. 로그 `… which is already presenting <RCTFabricModalHostViewController>`. 재현 1/1(11:16:03Z). 두 경우 모두 재실행하면 해당 안내가 정상으로 뜬다. 멈춘 순간의 저장 데이터: `06-freeze-save-snapshot/`, `06c-freeze-save-snapshot/`, `11-freeze-save-snapshot/` | 미수정 | 안내 모달 표시를 하나의 순서 관리로 묶어, 표시 중이거나 닫히는 중인 모달이 있으면 기다리게 하고 조건 충족 직후 짧게 지연해 한 번만 마운트되게 한다. (b)는 시트 닫힘(`onDismiss`) 대기가 이 경로에서 적용되지 않은 것으로 보인다. 모달이 일정 시간 안에 `onShow`를 받지 못하면 내려 입력이 막히지 않게 하는 안전장치도 권한다. 원인 확정은 모달 마운트·`onShow`·`onDismiss` 로그로 구현자가 확인. 재확인은 위 (a)(b)를 새 설치에서 |
| R2-2 (경미, UX) | 골드 부족 안내가 다음 행동을 알려 주지 않음 | 115G에서 Sweet Potato(135G) 선택 → 빈 밭 탭 → "Not enough gold."만 표시 | 미수정(기존 동작) | 문구에 다음 행동 추가 또는 살 수 있는 씨앗 강조. 이번 범위에서 제외하려면 근거를 남기고 계획 기대 결과를 조정 |
| R2-3 (확인 필요, AC-3 인접) | Firebase Analytics가 정리 전 동의 기록을 자체 캐시에 남김 | 항목 2 절차 → 앱 데이터 `Library/Preferences/com.google.gmp.measurement.tcf.userdefaults.plist`에 `gdprApplies=1`, `purposeConsents=11111111111`, 키가 사라진 다음 실행 뒤에도 유지 | 판단 필요 | GA4가 이 값을 동의 신호로 쓰는지 확인 후 정리 여부 결정 |
| R2-4 (경미, UX) | 다 자란 작물에 성장 시트가 남아 광고 시청을 권함 | 고구마 심고 바로 탭 → 시트를 연 채 10초 대기 → 밭은 GET인데 시트는 "needs about 10s"·"Watch ad to grow now" | 미수정(기존 동작) | 작물이 다 자라면 시트를 닫거나 수확 버튼으로 바꿈 |
| R2-5 (경미, UX) | 첫 수확 축하 카드가 Continue를 가리고, 8초 자동 완료와 겹쳐 실제로 누를 시간이 약 5초. "NEW CROP" 배너와 토스트가 겹침 | 새 설치 → 첫 당근 수확 직후 화면 | 미수정 | 축하 카드 표시 중 자동 완료 타이머 정지, 배너·토스트 위치 분리 |
| R2-6 (경미, 접근성) | 광고 정보 고지 본문 대비 약 3.2:1 | 설정 → Ads and your data(`09-settings-ad-section.png` 픽셀 측정) | 미수정 | 고지 문단 글자색을 진하게 |
| R2-7 (경미) | 앱 실행 중 글자 크기 변경 시 재실행 전까지 글자 잘림, XXL에서 씨앗 카드 넘침 | 설정 시트를 연 채 `simctl ui … content_size extra-extra-large` | 미수정 | 글자 배율 변경 대응 또는 최대 배율 제한 |
| R2-8 (도구 한계) | 시트 드래그 닫기 확인 불가 | idb 합성 드래그 3회(손잡이에서 아래로) 무반응 | 차단 | 3회차에서 다른 입력 수단(XCUITest 또는 실기기)으로 확인 |
| R1-1 | 동의 기록 미삭제 | 1회차 절차 | **해결 확인**(항목 2) | — |
| R1-2 (P0) | 온보딩 완료 시 입력 멈춤 | 1회차 절차(Continue·8초) | **원래 경로 해결 확인**(항목 14·15), 같은 종류가 R2-1로 남음 | R2-1 수정 후 재확인 |
| R1-3 | 보상 전 광고 닫기 미관찰 | 테스트 광고가 보상 전 닫기를 주지 않음 | 여전히 차단(항목 8) | 단위 테스트나 실광고 실기기로 대체 |
| R1-4 | 검수 환경 혼입 | — | **해결 확인**(후보 전용 체크아웃) | — |

이번 회차 결론: AC-3(동의 기록 삭제), AC-5(동의 창 없음), AC-8(광고 정보 고지·링크·긴 문구)은 통과했다. AC-12에 적힌 온보딩 완료 연결 흐름(Continue·8초 자동)도 통과했다. 그러나 같은 종류의 P0 입력 멈춤(R2-1)이 첫 세션의 일반 플레이(두 번째 작물 수확, 복귀 요약 수확)에서 3회 재현돼 항목 6·11이 실패했고, 항목 5는 UX 기대 미충족, 항목 8은 차단이다. R2-1 수정 전에는 출시·재제출 후보로 볼 수 없다.

## 추가 진행 품의

해당 없음.
