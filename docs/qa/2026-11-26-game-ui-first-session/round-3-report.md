# 재설계 UI 검수 3회차 결과 (최종 후보 L3 전체 회귀)

- 검수자: `claude-qa-round3` (구현과 1·2회차 검수에 참여하지 않은 별도 리뷰 에이전트, 제품 코드와 저장소 상태는 바꾸지 않음)
- 계획: [round-3.md](round-3.md), 이전 결과 [round-1-report.md](round-1-report.md), [round-2-report.md](round-2-report.md), 설계 [design.md](../../design/2026-11-26-game-ui-first-session/design.md)(맨 끝 "구현 중 정정" 포함), 시안 `docs/ui/reference/game-ui/B-*.jpg`, 기능 목록 `docs/qa/feature-inventory.json`(26개, 핵심 9개)
- 시작 2026-11-26T18:35:25Z, 종료 2026-11-26T19:54:20Z (UTC)
- 출시 근거용 기능별 실행 기록: [round-3-runs.json](round-3-runs.json)

## 결론

| 구분 | 판정 | 핵심 근거 |
|---|---|---|
| 기능 | **통과** | UI 기능 25개가 계획의 기능 기대 결과를 모두 만족했다. 2회차 기능 실패 근거였던 은색 🪙(#9 잔여)는 메인 모두 심기·전체 비료, 복귀 시트, 미션 받기 버튼, 생산·룰렛·개척 지도·농장 현황 시트, 토스트 모두 금색 그림 코인으로 바뀌었고, "10만G"(N5)는 "10만"으로 고쳐졌다. 서비스 기능 release-observability 테스트 84개와 update-gate 계약 테스트 22개(12+10)가 후보 SHA에서 통과했다. 기능 실패는 없고 기능 쪽 P3는 3건(N10 복귀 2배 HUD 깜빡임, N12 바로 수확하기의 오프라인 금액 연출 없음, N13 업그레이드 골드 부족 무반응)이다 |
| UX | **통과** | 다음 행동을 이해하지 못하거나 잘못 누르게 되는 문제, 글자가 잘려 뜻을 잃는 문제는 찾지 못했다. 1·2회차 발견 중 다시 나타난 것은 1회차 #21과 같은 종류인 상점 탭 이름의 단어 중간 줄바꿈(P3)뿐이다. 2회차 P3 9건 중 N7(SE 밭 노출)만 계획대로 그대로 남았고 나머지 8건은 해결됐다. 새 발견은 모두 P3 7건이다(복원 토스트가 기능 안내에 가려짐, SE 복귀 시트 행동 버튼이 첫 화면 밖, 상점 탭 이름의 단어 중간 줄바꿈(de·fr·es "보상" 탭, 큰 글자 전체) 등) |

출시를 막는 P1, 출시 전에 고쳐야 할 P2는 없다. 효과음과 진동은 지시대로 판정하지 않았다.

## 실행 환경

| 항목 | 값 |
|---|---|
| 실제 SHA | 시작(18:35:25Z)과 종료(2026-11-26T19:54:20Z) 모두 `git -C /Users/syous/Repositories/seorilabs/happy-farm rev-parse HEAD` = `7c44df7da12f32c496e7620134334906c5311b2a`, `git status --short` 출력 없음(깨끗함). Metro `localhost:8081`(`packager-status:running`)이 이 트리를 서빙. 앱 바이너리는 `26e1bf7` Debug(README 기록, 그 뒤 네이티브 변경 없음) |
| 기기 | iPhone 16 Pro Max 시뮬레이터 `509650D1-4B35-45C3-BB2F-4C10FDD6C759`(1320×2868, iOS 18.1), iPhone SE 3세대 시뮬레이터 `BCC17F16-57F7-489D-AA07-041EAEB4AB0E`(750×1334, iOS 18.1). 기기 시스템 언어 ko-KR. 실기기는 조회·연결하지 않았다 |
| 구동 | Maestro CLI(흐름 파일은 증거 폴더 `flows/`), `xcrun simctl io recordVideo`(h264) 녹화와 ffmpeg 프레임 분석(가변 프레임이라 짧은 현상은 pts로 잼). 두 기기에서 서로 다른 흐름을 동시에 돌렸다 |
| 데이터 | 계정 없음. 시뮬레이터 AsyncStorage를 장면마다 덮어씀. QA 도구 `seed.py`(fresh 대신 언어만 넣은 새 세이브 `seed_settings.py`, reward-step, 1-initial, 2-harvest, 3-return, 4-grown, daily-available)와 검수자 보조 시드 `tools/seed_custom.py`(late: 졸업 가능·연구 포인트·동물·공방·도감·업적·주간 미션 수령 가능, late-daily, return-full: 복귀 시트 모든 줄, landmark: 명성 레벨 1, rich-mid: 업그레이드 +10·최대, reward-step-inv: 첫 세션 기능 안내 대상, lab-low), `tools/seed_wheel.py`, `tools/weekly.mjs` |
| 언어 | en-US(주, Pro Max), ko-KR(주, SE), SE en, Pro Max de·ja·zh-Hans·fr·es(메인과 상점) |
| 글자 크기 | 시작 때 두 기기 `large`. SE를 `accessibility-extra-large`로 바꿔 2장면을 찍고 `large`로 되돌렸다(종료 확인 아래) |
| 동작 줄이기 | 시작 때 Pro Max `ReduceMotionEnabled=0`, SE는 키 없음(기본 꺼짐). SE에서 `defaults write ... -bool true`로 켜고 확인(1) 뒤 실행, 끝나고 `defaults delete`로 원래 상태(키 없음)로 되돌렸다. Pro Max는 바꾸지 않았다 |
| 광고 | AdMob 테스트 광고(전면 "This is an interstitial test ad.", 보상형 "Flood-It!" 테스트 광고, 보상형은 시작 약 4초 안에 "리워드 지급됨" 표시) |
| 로그 | Metro 로그(`metro.log`) 세션 중 추가분 130줄이 모두 `BUNDLE ./index.js` 줄이고 오류·경고 없음. RN 0.85 Metro는 JS 콘솔을 전달하지 않아 시뮬레이터 통합 로그(`log stream --predicate 'process == "HappyFarmMobile"'`)를 두 기기에서 함께 받았다 |
| 시간대 | 현지 새벽 3~5시라 밭 배경이 밤 색이다. 시안은 낮 장면이라 배경색 차이는 판정에서 뺐다 |

## 항목별 결과

증거 번호(E01~)는 아래 [증거 목록](#증거-목록)의 절대 경로다.

| 계획 항목 | 실제 조작·관찰·증거 | 기능 판정 | UX 판정·문제 | 오류·복구 재현 |
|---|---|---|---|---|
| app-launch-shell, title-startup | Pro Max en 새 세이브: 스플래시 → 타이틀 "Happy Farm / Enter Farm" → 누르면 농장(E01). 세션 동안 앱 프로세스 69번(Pro Max 25, SE 44) 시작, 통합 로그에 RCTFatal·Unhandled JS Exception·비정상 종료 0건, Metro 로그 추가분에 오류 없음(E60) | 통과 | 통과. 진입 버튼 하나, 준비 막대 "Your farm is ready" | SE에서 `kill -9`로 강제 종료 뒤 재실행 → 타이틀 → 같은 농장(골드 14, 밀 4칸)(E67, E68). 재실행 첫 시도 1건은 Maestro 드라이버 시작 시간 초과(앱 무관)로 다시 돌렸다 |
| onboarding (AC-1, AC-2) | Pro Max en: 타이틀을 누른 첫 프레임(14.605s)부터 화면 전체가 딤이고 배지·탭 아이콘이 숨어 있다가 70ms 뒤(14.675s) 당근 칸 스포트라이트와 말풍선 "Tap the ripe crop to harvest!", 오른쪽 위 Skip(E02, E03). 스포트라이트 동안 가운데 농장 탭은 솟은 원 없이 다른 탭과 같은 모양(`game-tab-current-disc` 없음), "Farm records loaded" 토스트 없음, 상점·미션·더보기·골드 칩·목표 칩·부스트·구역 칩·빈 칸 2개·생산·요리·농장 탭·씨앗·별 칩을 눌러도 시트가 열리지 않음(E02). 밝힌 칸을 누르면 HUD 딤이 유지된 채 보상 팝업(리본 "First harvest complete!", 큰 코인, +14, Continue)이 페이드인하고 옛 안내 카드는 없다(E04). Continue로 끝나고 배지가 나타난다. SE ko: 건너뛰기 → 확인 창(계속 안내받기/건너뛰기, 밭 밀림 없음) → 취소 → 상점 막힘 → 건너뛰기 확정(E05) | 통과 | 통과. 알려진 문제대로 수확 순간 HUD가 64를 3프레임(146.410~146.453s, 약 58ms) 보였다가 50으로 돌아간 뒤 연출이 시작된다(E04) | 보상 팝업 방치: 15.45s에 뜬 팝업이 23.5s에 닫힘(약 8.0초, 기존 동작)(E06) |
| planting, growth-harvest | Pro Max en 4-grown: 개별 수확(수박 칸 → Empty, 이어서 수확 보너스 광고 제안 자동 시트, No thanks), 당근 개별 심기, 성장 칸(아보카도) → "Grow Now" 시트 → "Grow now with fertilizer (6.95M)" → 7.4B→7.39B, 즉시 익음, 재심기 🔁(7.39B→7.47B), 전체 비료 한 번 누름 → "❗ Tap again to confirm · 7 · 186M 🪙" 토스트와 "!" 배지, 5초 뒤 해제, 두 번 누름 → "Grew 7 plots instantly with fertilizer! (-182M 🪙)"(7.47B→7.29B), Harvest All 24 → "×24 COMBO!"와 "+434M 🪙 · harvested 24 plots at once!"(7.72B), Plant All 24 · 240 🪙 → 당근 24칸(E07~E09). Pro Max en 첫 세션에서 수동 심기·수확 3회전(18칸)과 일괄 5회전(E10) | 통과 | 통과. 도구 줄은 [구역 칩][Harvest All N][🔁][비료 아이콘] 한 줄. 모든 금액 코인은 금색 그림 | SE ko 골드 14에서 밀(25)을 빈 칸에 심으려 하면 "11 🪙 더 필요해요. 씨앗에서 당근을 골라 심어 보세요." 토스트가 도구 줄 위에 약 2초(E11) |
| shop | Pro Max en 2-harvest: 목표 칩 Go → 확장 탭 "Open Bloom Field 9K" 줄 강조. 앞 구역이 안 열린 과수원 → "Open the previous area first.". 밭 개간 8.62K → 48.5K→39.9K, 13칸, 다음 15.1K(구매 직후 기존 진행 마일스톤 전면 광고, 첫 세션 밖). 업그레이드 1회(Growth Fertilizer 6.37K, Lv.4→5, "Research complete."). rich-mid(골드 10억): +10 speed Lv4→14, 최대 profit +16(Lv5→21), 1B→240M. 꾸미기 Signpost 1.2K → Owned(21.3K→20.1K). 보상 탭 "Watch ad for a plot discount 8.62K → 4.31K" → 광고 → 48.5K→44.2K, 13칸(E12~E15). 네 탭 전환 때 시트 윗변과 탭 줄 위치가 같다 | 통과 | 통과(P3 N13). 확장 탭의 부족 줄은 남은 금액 토스트가 뜨지만, 업그레이드 탭의 부족 카드는 눌러도 반응이 없다(회색 카드와 진행 막대로는 보인다) | 골드 부족 구매: 확장 탭 "You need 236 🪙 more."(E10), 업그레이드 탭 SE ko 180골드로 900 카드 → 토스트 없음(N13, E14) |
| welcome-back-offline (AC-3, AC-7) | SE ko 3-return(8시간 1분): 시트 금액 세 곳 모두 금색 그림 코인. "+21.7억 🪙 받고 시작하기" → 시트가 닫히고 코인이 골드 칩으로 날아가며 74억→76.1억→85.4억→94.2억→95.7억, 그 뒤 전면 광고 페이드인(E16). 바깥(배경) 탭 → 74억→86.4억→95.7억, 광고 없음(E17). Pro Max en 2배 광고: "Watch ad for 2× · 4.35B 🪙 total" → 보상형 광고 → 닫기 → 7.4B→11.7B(저장 11,746,269,696, 2배 한 번)(E18). SE en return-full: 모으는 수익·익은 작물 14칸·동물 생산 "1 animal · Open ranch ›"·공방 "1 item · Open workshop ›"·출석 "Ready to claim" 다섯 줄. 동물 줄 → 생산 시트 동물 탭(200B→202B 수령)(E19). "Harvest now" → 202B, ×15 콤보와 "+24.9M 🪙 · harvested 15 plots at once!" 뒤 약 1초에 전면 광고(E20). "Claim daily bonus" → 출석 시트 +4.5B → Got it → 207B(E21) | 통과 | 통과(P3 N10, N11, N12). 보상 순간은 광고에 가려지지 않는다. 2배 광고를 닫으면 HUD가 최종 금액 11.7B를 약 110ms(76.917~77.027s) 보였다가 7.4B로 돌아간 뒤 카운트업한다(N10). SE에서 줄이 다섯 개면 행동 버튼이 첫 화면 아래로 밀린다(N11). "Harvest now" 경로는 오프라인 금액이 코인 연출 없이 바로 더해진다(N12) | 2배 광고 취소: 테스트 보상형 광고가 4초 안에 "리워드 지급됨"이 되어 보상 없는 닫기를 만들 수 없음(미실행, 아래). 보조로 `fullScreenAd.test.tsx` 20개 통과(시간 초과 시 보상 없음 포함) |
| save-restore | SE ko: 초기화한 새 농장 → 온보딩 → 출석(같은 실행이라 미루기 미적용, 1회차 #23 의도) → 밀 4칸 심기(골드 14) → `kill -9` → 재실행 → 골드 14, 밀 4칸 그대로(E67, E68) | 통과 | 통과(P3 N9). "농장 기록을 불러왔어요." 토스트가 뜨는 순간 "공방이 열렸어요" 기능 안내가 함께 떠서 토스트가 바로 가려진다(N9, E68) | 강제 종료 재현함 |
| reset-farm | SE ko 1-initial(180): 더보기 → 설정 → 농장 기록 초기화 → "계속 이어서 할게요" → 180 그대로. 다시 열어 입력 없이 삭제 → 회색 버튼, 변화 없음. "초기화" 입력 → 빨간 버튼 → 골드 50, 6칸, 온보딩 스포트라이트(E22) | 통과 | 통과. 확인 문구 입력 요구 | 취소 재현함 |
| hud-goals-status | 골드 칩 → 농장 현황(en Farm Status, ko 농장 현황 "2.68억 🪙/시간"), 별 칩 → 개척 지도, 목표 칩: 진행 "236 🪙 more to clear a new plot"과 막대, 준비 "Ready to clear a new plot! Go !", 구역 해금 "Bloom Field is ready to unlock!", 졸업 "Ready to graduate!", 랜드마크 "Ready to build Foundation!"이 각각 상점 줄·개척 지도로 안내. 출석 버튼(late-daily, return-full에서 🎁), 부스트 버튼 → 수확 보너스 시트, 광고 뒤 "30m" 표시(E23, E24, E10) | 통과 | 통과. HUD "4.85만", "74억"의 단위가 숫자와 같은 굵기(1회차 #7 해결)(E25). SE en은 출석 버튼이 있으면 목표 칩 "Ready to / graduate!"가 두 줄이 되지만 잘리지 않음 | 해당 없음 |
| menus-sheets (AC-12) | Pro Max en 2-harvest: Shop → Farm Office, Missions → Daily Missions, Production 탭 → Production, Cooking → Cooking Pot, Farm → 메인, 골드 칩·별 칩·더보기·구역 칩(Choose Area)·부스트 각 시트(E26). 더보기 항목: Daily Bonus(첫 세션 보유 상태 SE), Wheel, Collection, Production, Cooking, Lab, Pioneer, Achievements, Farm Status, Settings 모두 해당 시트(E26, E27). 닫기: Close 버튼, 바깥 탭, 손잡이 끌기. Pro Max 좌표 끌기 6/6, SE 손잡이 요소(`sheet-drag-handle`)에서 시작한 끌기 6/6(300~800ms, 미션·상점·생산·요리) 모두 닫힘, 화면 60%까지 느리게 끈 경우도 닫힘(E28) | 통과 | 통과(P3 N15). "생산" 탭 → "생산" 시트는 맞다. "상점/Shop" 탭은 "농장 관리소/Farm Office" 시트를 연다(2회차부터 같은 상태, N15) | 시트 연타: 미션 탭 80ms 간격 3번 → 시트 하나(E29) |
| missions (AC-7) | SE ko 2-harvest: 수확·심기 뒤 "작물 20회 수확하기 20/20" → "보상 337 🪙 받기"(금색 코인) → HUD 5.84만→5.88만, "수령 완료 ✓", 토스트 "미션 보상 337 🪙 받았어요!"가 목표 칩 높이에 떠서 HUD 숫자와 다음 받기 버튼을 덮지 않음(E30). 주간: SE en late 세이브(이번 주 키로 진행을 채움)에서 "Harvest 150 crops this week 150/150" → "Claim 15B 🪙" → "Claimed ✓", 200B→215B(E31) | 통과 | 통과 | 수령 불가: 진행 0/1 미션은 막대만, 버튼 없음(E30) |
| daily-bonus-wheel (AC-7) | 출석: SE ko daily-available 시트에 큰 코인 +405, HUD 4.85만 그대로 → "받았어요" → 코인이 날아가며 4.89만, 헤더 출석 버튼 사라짐(E32). 무료 룰렛: 도는 동안 HUD 4.85만 → 멈춘 뒤 토스트(목표 칩 높이)와 코인 → 5.03만(E33). 광고 보너스 룰렛: Pro Max en late-daily, 무료 +7.5B 뒤 "📺 Watch an ad for one more spin" → 광고 → 닫으면 바퀴가 돌고 HUD 208B 유지 → 멈춘 뒤 +5B, 211B→213B, 버튼 사라짐(E34) | 통과 | 통과. 결과는 멈출 때 드러남(1회차 #13 유지 해결), 토스트가 골드 칩을 가리지 않음(2회차 N6 해결) | 광고 취소: 테스트 광고 특성상 미실행(위와 같음) |
| collection-achievements | SE en late: 도감 "Claim 500 🪙" → "Claimed +500 🪙 from your collection.", "Claimed ✓"(골드 200,000,000,500). 업적 "Claim ★1" → ★10→11, "Claim all · ★13" → ★24, 버튼 "Claim all · ★0" 비활성(E35) | 통과 | 통과 | 이미 받은 보상: "Claimed ✓" 줄 탭 → 변화 없음, Claim all ★0 비활성(E35) |
| production | SE en late: 동물 탭 닭 "Collect · +400" → "Collected Chicken produce!", "Feed · 30" → "Fed your Chicken.", "Ready in 20m", 오리 "Build coop · 7K" → "Built the Duck coop!". 공방 탭 빵 "Collect · +300"(골드 +300), "Start crafting" → 밀 30→27, "Done in 5m", "Cancel · Refund ingredients" → "Canceled Bread and refunded its ingredients.", 밀 30/3(E36, E37) | 통과 | 통과. 진행 표시 "Ready in 20m", "Done in 5m"가 읽힘 | 재료 부족: Pie "Strawberry 0/1 · Not enough ingredients. Harvest more crops.", Start crafting 비활성(E37) |
| research-automation | SE en late(10B RP): "Donation Amplifier 5MRP" → "'Donation Amplifier' reached Lv.1!", Done(E38). Auto Harvest 켜기 → 시트를 닫자 익은 칸이 자동으로 수확되어 Empty(E39) | 통과 | 통과. 해금 조건 "Requires Donation Amplifier", "Complete the 'Auto Replant' research first."가 읽힘 | 조건 미달: lab-low(6RP)와 late에서 Market Studies 등 "Requires Donation Amplifier" 카드는 눌러도 변화 없음(E38) |
| prestige-map-landmark | Pro Max en late: 목표 칩 "Ready to graduate! Go" → 개척 지도. "Prepare to pioneer (★3)" → 확인 시트(초기화 범위, 새 체인 농장 수입 6.58B/hr, 다음 시작 골드 50) → "Maybe later" → 지도. 다시 → "Pioneer and earn ★3" → "PIONEERED! Plains ★ +3" 연출 → 새 농장 골드 50, ★13(E40). 졸업 뒤 랜드마크 "Foundation" 단계 18B 필요로 막힘 안내. landmark 세이브(레벨 1, 200B): 목표 칩 "Ready to build Foundation!" → Build Foundation → "Confirm Foundation"(4초 안 재확인 안내) → "Foundation construction complete!" 200B→182B, 1/5 단계, 다음 단계 부족 재료 빨간 안내(E41). ko 명성 스킬 "개척 후 시작 골드가 레벨당 10만 늘어나요."(G 없음)(E42) | 통과 | 통과. 목표 칩이 지도로 안내 | 졸업 취소 재현함(E40) |
| settings | Pro Max en: 더보기 → Settings → Effects 끔, Music 켬, Weather effects 끔 → `kill -9` → 재실행 → 같은 상태 유지 → 원래대로 되돌림(E43). SE en 알림 거절 뒤 Harvest reminders·Comeback reminders 꺼짐(E44), SE ko 알림 수락 뒤 둘 다 켜짐(E45). 언어 선택 버튼 8개 | 통과 | 통과. 설정은 더보기 "Settings & status" 섹션에 있음 | 끄고 켜기 재현함 |
| rewarded-ads | 테스트 보상형 광고 4지면: 수확 보너스(부스트 30m, 시간당 수입 3.36B→5.17B, E46), 복귀 2배(7.4B→11.7B, E18), 룰렛 보너스(+5B, E34), 상점 밭 할인(48.5K→44.2K, 13칸, E15). 모두 닫은 뒤 보상 한 번만 반영 | 통과 | 통과. 광고를 닫으면 원래 화면으로 돌아오고 연출이 이어짐(N10 제외) | 광고 닫기(보상 없음): 미실행(테스트 광고가 즉시 보상 지급). 보조 단위 테스트 통과 |
| interstitial-ads (AC-6) | Pro Max en 새 세이브 첫 세션: 농장 진입 18:39:57Z, 첫 밭 해금 전 수동 수확 18칸과 Harvest All 5회(마지막 18:50:14Z, 진입 10분 17초 뒤)까지 전면 광고 없음(해금 전 유예). 18:50:4x 첫 밭 구매 때 마일스톤 광고 없음. 해금 뒤 첫 Harvest All(18:51:44Z, 진입 11분 47초)에 전면 테스트 광고(E47). 첫 세션 밖: 상점 밭 구매·업그레이드 +10 직후 마일스톤 광고, 복귀 1배 수령·바로 수확하기 뒤 복귀 광고(E16, E20, E12) | 통과 | 통과. 광고는 시트를 닫은 뒤에 뜨고 시트 위에 겹치지 않음 | 광고 실패: 시뮬레이터에서 실패를 만들 수 없어 미실행. 보조 `fullScreenAd.test.tsx` 20개 통과(로드 실패 시 false, 시간 초과 시 보상 없음) |
| ad-consent | 개발 환경에서 보이는 범위: 매 실행 동의 흐름 뒤 광고 요청이 이어짐(googleads.g.doubleclick.net 연결 로그 Pro Max 319줄, SE 415줄, pubads·pagead2 포함, 404는 광고 미할당 응답), 전면·보상형 테스트 광고 표시 정상. 통합 로그에 `[ads] consent update failed`/`initialize failed` 경고 없음, UMP 동의 폼은 뜨지 않음(테스트 지역). 보조 `adMobConsent.test.ts` 8개 통과(E48, E49) | 통과 | 해당 없음 | 해당 없음 |
| notifications | 첫 수확 뒤가 아니라 첫 밭 해금 뒤 출석 → 알림 안내 순서(AC-4). SE ko 수락: "알림 켜기" → iOS 권한 창("'행복 농장 타이쿤'에서 알림을 보내고자 합니다", 허용 안 함/허용) → 허용 → 설정 두 알림 켜짐(E45). SE en 거절: "Maybe later" → 두 알림 꺼짐(E44). 기능 안내 간격: SE ko 알림 안내가 39.2s에 뜨고 공방 기능 안내가 99.8s에 떴다(60.6초, 그 사이 다른 팝업 없음)(E50). Pro Max 첫 세션에서도 알림 안내(18:51:06Z) 뒤 39초 동안 기능 안내 없음 | 통과 | 통과. 안내가 다른 팝업과 겹치지 않고 하나씩 뜸 | 거절 재현함 |
| firebase-auth-analytics | 개발 환경에서 보이는 범위: 매 실행 `Analytics v.12.15.0 started`, `Analytics collection enabled`(Pro Max 24회, SE 43회), 분석 수집 서버 app-analytics-services(-att).com 연결 로그 Pro Max 80줄, SE 56줄. Firebase ID 토큰이 필요한 플랫폼 세션 교환 `platform-api …/v1/auth/session`과 `platform-ads …/v1/auth/session`이 매 실행 연결되고 실패 작업 없음(익명 사용자는 이미 키체인에 있어 identitytoolkit 호출은 관찰되지 않음). `[analytics] … failed`, `[auth] anonymous sign-in failed` 경고 없음. 시작 때 `I-COR000003`(configure 전 접근), `I-ACS023268`(conversion service) 오류 줄이 매 실행 1줄씩 있으나 이후 수집이 켜짐(네이티브 변경 없음, 이번 범위 밖)(E48) | 통과 | 해당 없음 | 네트워크 없이 시작: 시뮬레이터가 맥 네트워크를 공유해 끊을 수 없어 미실행 |
| platform-session-events | 개발 환경에서 보이는 범위: `platform-ingest …/v1/events` 전송이 세션 내내 주기적으로 일어남(연결 시작 시각 Pro Max 27개, SE 46개), 플랫폼·Firebase 호스트 실패 작업 없음(CFNetwork 실패는 앱 종료 때 Metro 자산 취소 -999와 광고 동영상 취소뿐). SE에서 설정 앱으로 전환(04:32:37 현지) 직후 04:32:36에 events 전송, 돌아오면 같은 화면·상태(E51). 이벤트 이름과 내용은 개발 빌드에서 볼 수 없음 | 통과 | 해당 없음 | 백그라운드 전환 재현함 |
| update-gate | `pnpm exec jest packages/farm-ui/src/__tests__/FarmUpdateGate.test.tsx` 12개 통과(18:37:49Z~18:37:52Z), `apps/mobile`에서 `pnpm exec jest src/__tests__/updateGateContract.test.ts` 10개 통과(18:37:52Z~18:37:53Z). 실행 화면에서 게이트는 뜨지 않음(서버 상태 ok)(E52) | 통과 | 해당 없음 | 해당 없음 |
| AC-8, AC-9, AC-10 공통 부품 | 눌림: SE ko 모두 수확을 길게 누르는 동안 버튼이 어두워지고(평균 밝기 149.8→143.5) 아래 두께가 줄어듦(E53). 토스트 차례: 정렬 → 빈 칸 → 정렬 → 빈 칸을 연달아 누르면 "정렬: 수익효율" → "아래에서 씨앗을 선택해 주세요." → "정렬: 성장시간" → 같은 안내가 덮어쓰지 않고 차례로(E53). 연타: 미션 탭 3번 → 시트 하나(E29). 금액: 메인 Plant All·Fertilize All 주 버튼, 전체 비료 확인·완료 토스트, 수확 토스트, 복귀 시트 세 곳(ko·en), 미션 받기 버튼, 미션 수령 토스트, 생산(Feed·Collect·Build coop), 룰렛 상품, 개척 지도 "100B 🪙 required", 농장 현황 "2.68억 🪙/시간", 도감 Claim, 상점 가격·시트 골드 칩 모두 금색 그림 코인이고 금액 뒤 G 없음. catalog 8개 언어에 숫자 뒤 G 없음(grep 0건)(E07~E09, E16, E30, E36, E42, E54) | 통과 | 통과. 숫자와 코인이 함께 읽힘. 효과음 판정 안 함 | 연타 재현함 |
| 동작 줄이기 | SE en, 동작 줄이기 켬: 스포트라이트 손가락 부근 프레임 차이 0.0~0.7(일반 실행 0.9~4.3), 보상 팝업 빛살 영역 차이 0.00(일반 0.37), 밝힌 칸을 누르면 날아가는 코인 없이 HUD 50→64, 팝업 +14가 바로 보임. 출석 Got it → 코인 없이 48.5K→48.9K 바로(같은 기기 일반 실행은 코인과 48.5K→48.6K→…→48.9K)(E55, E56) | 통과 | 해당 없음 | 해당 없음 |
| 작은 화면, 큰 글자, 언어 (AC-12) | SE ko·en(2-harvest, 4-grown) 메인·상점 확장·업그레이드, Pro Max de·ja·zh-Hans·fr·es 4-grown 메인·상점, Pro Max ko 2-harvest에서 헤더, 목표 칩, 도구 줄, 씨앗 카드, 탭 바, 상점 탭이 잘리지 않음. SE 모두 수확 글자는 오른쪽 곡선 앞에 여백(2회차 N8 해결). SE `accessibility-extra-large` ko 2-harvest, en 4-grown: HUD와 목표 칩은 잘리지 않음(수입 줄은 빠짐), 밭은 한 칸(1회차 #22 범위 밖 동작)(E57~E59) | 통과 | 통과(P3 N14). 기본 글자 크기 Pro Max de·fr·es에서 상점 "보상" 탭 이름이 배지 때문에 "Belohnunge/n", "Récompens/es", "Recompens/as"로 마지막 글자만 둘째 줄로 넘어간다. 큰 글자에서는 모든 상점 탭 이름이 "업그/레이/드", "Up/gra/de"처럼 음절 단위로 끊기고 선택 테두리 밖으로 넘치며 탭 배지 숫자가 반쯤 잘린다(N14). ja·zh-Hans 상점 탭과 모든 언어의 메인은 정상 | 해당 없음 |
| release-observability(서비스) | `pnpm exec jest scripts/__tests__/deploy-drift scripts/__tests__/app-store-lookup` → 4개 스위트 84개 통과(deploy-drift, deploy-drift-run, deploy-drift-check-workflow, app-store-lookup), 18:37:46Z~18:37:49Z, 후보 SHA(E61) | 통과 | 해당 없음 | 해당 없음 |

### 시안 대 실행 화면 (AC-12)

| 쌍 | 관찰 |
|---|---|
| 메인 Pro Max en(E62) | 구도와 위계가 같다(재화 칩·목표 칩, 밭, [구역 칩][Harvest All 12][🔁], 씨앗 카드, 하단 탭 5개). 차이: 시안의 출석 선물 버튼 자리에 부스트 버튼(설계 정정), 탭 "Ranch" 대신 "Production"(설계 정정), 씨앗 카드가 시안보다 약간 넓어 3.5장이 보임, 밤 배경 |
| 메인 SE en(E63) | 구조는 같다. 밭이 약 1.6줄(시안 약 2.4줄), 씨앗 카드 2.5장(시안 4장), en 목표 칩 두 줄. 2회차 N7과 같고 계획에서 바꾸지 않은 범위 |
| 메인 Pro Max ko(E64) | 구조와 굵은 한글 글씨가 시안과 같다. 단위 "만"이 숫자와 같은 굵기 |
| 첫 수확 스포트라이트 en(E65) | 칸 옆 한 줄 말풍선, 오른쪽 위 Skip, 사각 테두리. 차이: 손가락이 칸 아래에서 위를 가리킴(시안은 오른쪽 아래에서), 가운데 탭이 솟지 않음(3회차 정정), 시안은 익은 칸 3개로 Harvest All 3이 보이지만 새 세이브는 익은 칸 1개라 도구 줄에 버튼 없음 |
| 보상 팝업 en(E66) | 리본 제목, 빛살 큰 코인, +14, 설명, Continue 하나로 같다. 설명 문구가 시안("Your farm is up and running.")보다 길다 |

## 1·2회차 발견 재발 여부

| 출처 | 내용 | 3회차 | 근거 |
|---|---|---|---|
| 1회차 #1 | 도구 줄 주 버튼 깨짐 | 재발 없음 | SE·Pro Max 모든 언어 한 줄(E07, E57, E58) |
| 1회차 #2, #3 | 보상·스포트라이트가 시안과 다름 | 재발 없음 | E65, E66 |
| 1회차 #4 | 해금 전 광고 제안·자동 팝업 | 재발 없음 | 첫 세션 해금 전 10분 넘게 자동 팝업·광고 없음(E10, E47) |
| 1회차 #5, #6 | 복귀·출석 연출 | 재발 없음 | E16, E17, E32 |
| 1회차 #7 | 한국어 굵기(2회차 잔여: HUD 만/억) | **해결** | "4.85만", "74억", "+337만/시" 단위가 굵게(E25) |
| 1회차 #8 | 씨앗 카드 스킨 | 재발 없음 | E57 |
| 1회차 #9 | 코인 두 가지(2회차 잔여 P2) | **해결** | 위 AC-10 행의 모든 위치가 금색 그림 코인(E54) |
| 1회차 #10, #11 | 목표 칩 준비 완료, 부족 줄 무반응 | 재발 없음 | 목표 칩 정상, 확장 탭 부족 토스트(E10). 업그레이드 탭 부족 카드 무반응은 별도 N13 |
| 1회차 #12 | 새 농장 "+27.5만/시" | 의도(동작 기록) | 새 농장 "+275K/h", "+27.5만/시" 그대로(E02, E05) |
| 1회차 #13 | 룰렛 결과 미리 드러남 | 재발 없음 | E33, E34 |
| 1회차 #14 | 3분할 스킨 이음매(2회차 4배 확대에서만) | 변경 없음(확대 재측정 안 함) | 계획대로 바꾸지 않음. 1배 화면에서는 보이지 않음 |
| 1회차 #15 | 토스트가 조작 위치를 덮음 | 재발 없음 | 미션·룰렛 토스트가 목표 칩 높이(E30, E33) |
| 1회차 #16 / 2회차 N1 | 스포트라이트 중 가운데 탭 머리가 밝음 | **해결** | 스포트라이트 동안 솟은 원 없음(`game-tab-current-disc` 없음)(E02, E05) |
| 1회차 #17 | 손잡이 끌기(2회차 6번 중 4번) | **해결**(합성 제스처) | Pro Max 6/6, SE 손잡이 요소 시작 6/6 닫힘(E28). 사람 손 확인은 하지 않음 |
| 1회차 #18~#20 | 상점 탭 높이, 탭 이름, 구역 목표 강조 | 재발 없음 | E12, E26 |
| 1회차 #21 | 단어 중간 줄바꿈 | 한국어 일반 크기 재발 없음, 같은 종류 부분 재발(P3) | 상점 탭: 기본 크기 de·fr·es "보상" 탭과 큰 글자의 모든 탭(N14, E58, E59) |
| 1회차 #22 | 큰 글자 밭 한 칸 | 범위 밖 잔여(같음) | E59 |
| 1회차 #23 | 초기화 뒤 같은 실행 미루기 미적용 | 의도(동작 기록) | 초기화 → 온보딩 직후 출석 시트(E22) |
| 1회차 #24 | 오늘의 작물 배지 | 재발 없음 | 📅×2(E57) |
| 2회차 N2 | 진입 직후 0.48초 딤 없는 화면, 배지 노출 | **해결** | 첫 프레임부터 전체 딤, 배지·탭 아이콘 숨김, 70ms 뒤 스포트라이트(E03) |
| 2회차 N3 | 수확 직후 딤 풀림과 옛 안내 카드 깜빡임 | **해결** | HUD 영역 밝기 94로 유지, 옛 카드 없음(E04). HUD 64 3프레임은 계획의 알려진 문제 |
| 2회차 N4 | 새 세이브에 "기록을 불러왔어요" 토스트 | **해결** | 스포트라이트 동안 `toast-main` 없음(E02). 저장 세이브 재실행 때는 뜸(E68) |
| 2회차 N5 | "10만G" | **해결** | ko "레벨당 10만"(E42), catalog grep 0건 |
| 2회차 N6 | 시트 토스트가 HUD를 가림 | **해결** | 목표 칩 높이(E30, E33) |
| 2회차 N7 | SE 씨앗 카드가 커서 밭이 덜 보임 | 그대로(P3, 계획 범위 밖) | E63 |
| 2회차 N8 | SE 모두 수확 글자 오른쪽 여백 | **해결** | E58 |
| 2회차 N9 | 해금 뒤 기능 안내가 바로 뜸 | **해결** | 알림 안내 뒤 60.6초에 기능 안내(E50) |

## 새 발견

심각도: P1 출시를 막음, P2 출시 전 고쳐야 함, P3 작은 문제. 모두 P3이며 기능·UX 판정을 실패로 바꾸지 않는다.

1. **N9 P3 강제 종료 뒤 재실행에서 "농장 기록을 불러왔어요." 토스트가 뜨는 순간 "공방이 열렸어요" 기능 안내가 같이 떠서 토스트를 가린다.** SE ko에서 타이틀을 누른 직후 프레임에 토스트와 페이드인하는 기능 안내가 겹치고 다음 프레임부터 토스트는 기능 안내의 딤 아래로 사라진다. 복원 안내를 읽을 시간이 거의 없다. 기능 안내를 토스트가 끝난 뒤로 미루거나, 실행 직후 첫 자동 팝업에도 짧은 간격을 둔다. 증거 E68.
2. **N10 P3 복귀 2배 광고를 닫으면 HUD가 최종 금액을 약 110ms 보였다가 이전 금액으로 돌아간 뒤 카운트업한다.** Pro Max en에서 시트가 닫히는 76.917s~77.027s에 11.7B, 이후 7.4B, 77.52s부터 8.24B→…→11.7B. 계획의 알려진 첫 수확 깜빡임(66ms)과 같은 종류이며 1배 수령·바깥 닫기 경로에는 없다. 지급 상태 반영과 연출 시작 금액 고정을 같은 프레임에 한다. 증거 E18.
3. **N11 P3 iPhone SE에서 복귀 시트에 줄이 다섯 개(수익, 익은 작물, 동물, 공방, 출석)면 행동 버튼 네 개가 모두 첫 화면 아래에 있다.** 스크롤해야 "Harvest now"와 "Collect … and play"가 보인다. 바깥을 눌러도 1배 수령이라 막히지는 않는다. 좁은 화면에서는 정보 줄을 접거나 행동 버튼을 시트 아래에 고정한다. 증거 E19.
4. **N12 P3 복귀 시트의 "Harvest now"(바로 수확하기)는 오프라인 금액을 코인 연출 없이 즉시 더한다.** 200B→202B가 시트가 닫히는 프레임에 바뀌고, 그 뒤 수확 콤보 연출만 나온다. 1배 수령·바깥 닫기·2배 광고 경로는 코인 연출이 있다. AC-7 "오프라인 1배" 연출과 경로별로 다르다. 증거 E20.
5. **N13 P3 상점 업그레이드 탭에서 골드가 모자란 카드를 누르면 아무 반응이 없다.** `ShopCard`가 `disabled`를 `GamePressable`에 넘겨 눌림 자체가 막히므로, `ShopUpgradeRow` onPress 안의 `insufficientGoldToast` 분기에 도달하지 못한다. 확장 탭의 부족 줄은 남은 금액 토스트가 뜬다(1회차 #11 수정 범위). 회색 카드와 진행 막대로 부족은 보인다. 업그레이드 카드도 확장 줄처럼 `unaffordable`로 흐리게만 하고 누르면 부족 금액을 알린다. 증거 E14.
6. **N14 P3 상점 탭 이름이 단어 중간에서 줄을 바꾼다.** 기본 글자 크기의 Pro Max에서도 de·fr·es의 "보상" 탭은 오른쪽 배지 자리 때문에 "Belohnunge/n", "Récompens/es", "Recompens/as"처럼 마지막 1~2글자만 둘째 줄로 넘어간다. 큰 글자(accessibility-extra-large) SE에서는 모든 탭이 "업그/레이/드", "꾸미/기", "Exp/and", "Up/gra/de", "Dec/ora/te", "Re/war/ds"로 끊기고 선택 테두리 밖으로 넘치며 배지 숫자가 반쯤 잘린다. 뜻은 읽힌다. 1회차 #21(단어 중간 줄바꿈)과 같은 종류다. 탭 글자를 한 줄로 두고 `adjustsFontSizeToFit`로 줄이거나 배지를 글자 위로 띄우고, 큰 글자에는 스킨 틀 1.3배 상한을 적용한다. SE de·fr·es 상점은 이번에 보지 않았다(더 좁아 같은 문제가 예상됨). 증거 E58, E59.
7. **N15 P3 "상점/Shop" 탭이 "농장 관리소/Farm Office" 시트를 연다.** 1회차 #19(목장 → 생산)와 같은 종류의 이름 차이다. 2회차부터 같은 상태라 회귀는 아니다. 증거 E26.

관찰(결함으로 세지 않음): 4-grown·late 같은 시드에서 첫 세션 밖 개별 수확 직후 수확 보너스 광고 제안 시트가 자동으로 뜬다(기존 규칙, E07). 첫 세션 밖 밭·업그레이드 구매 직후 기존 진행 마일스톤 전면 광고가 바로 뜬다(E12, E13). 4-grown 시드의 연구 노드 레벨(시장 연구 12 등)이 앱에서 Lv.0으로 보이는데, 시드에 선행 노드(Donation Amplifier)가 없어 정규화된 것으로 보인다(시드 구성 문제로 판단, 제품 판정에서 뺌).

## 실행하지 못한 것과 이유

- 효과음, 탭음, 진동, 효과음 끄기 설정의 소리 부분(AC-7, AC-8): 지시대로 시뮬레이터에서 판정하지 않았다.
- 보상형 광고를 보상 없이 닫기(복귀 2배 광고 취소, 룰렛 광고 취소 포함): AdMob 테스트 보상형 광고가 시작 약 4초 안에 "리워드 지급됨"이 되어 보상 전 닫기를 만들 수 없었다. 보조로 `apps/ait/src/farm/__tests__/fullScreenAd.test.tsx` 20개가 통과했다(시간 초과 시 보상 없음, 중복 완료 이벤트 한 번만 보상). 실행 판정을 대신하지 않는다.
- 전면 광고 실패: 시뮬레이터에서 로드·표시 실패를 만들 수 없었다. 위 단위 테스트(로드 실패·시간 초과 시 false)를 보조로 남겼다.
- iOS 권한 창의 "허용 안 함": SE는 이번 회차에 허용해 다시 물을 수 없고, 앱 재설치는 환경 변경이라 하지 않았다. 앱 안의 "나중에" 거절은 실행했다.
- firebase-auth-analytics의 네트워크 없이 시작: 시뮬레이터가 맥 네트워크를 공유해 끊을 수 없었다. 이벤트 이름·파라미터와 익명 로그인 호출 자체는 개발 빌드 로그에서 보이지 않아 오류 부재와 연결 성공까지만 확인했다.
- platform-session-events의 이벤트 이름·내용: 개발 빌드에서 전송 본문을 볼 수 없어 `/v1/events` 연결과 실패 부재만 확인했다.
- 계측 5종(AC-11): 화면에서 관찰할 수 없어 확인하지 않았다.
- 3분할 스킨 이음매 4배 확대(1회차 #14): 계획에서 바꾸지 않은 항목이라 다시 재지 않았다.
- 손잡이 끌기의 사람 손 확인: Maestro 합성 제스처로만 시험했다.
- 실기기(Android, iPhone): 지시대로 조회·연결하지 않았다.

## 증거 목록

모든 증거는 아래 폴더에 있고 저장소에는 넣지 않았다. 원본 Maestro 출력 `maestro/`, 흐름 `flows/`, 보조 스크립트·시드 `tools/`, 녹화 `video/`, 프레임 분석 `frames/`, 시안 비교 `compare/`, 로그·테스트 출력 `logs/`.

`smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/`

| 번호 | 절대 경로 | 내용 |
|---|---|---|
| E01 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/a1-en-pm-01-title.png | 타이틀(Pro Max en) |
| E02 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/a1-en-pm-sheet-1.jpg | 진입 직후, 스포트라이트, 칸 밖 탭 뒤(시트 없음, 가운데 탭 솟지 않음, 토스트 없음). 원본 녹화 video/a1-onboarding-en-pm.mp4 |
| E03 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/a1/entry-full-frames.jpg | 타이틀 → 농장 진입 프레임(14.605s 첫 프레임부터 전체 딤, 14.675s 스포트라이트) |
| E04 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/a1/harvest-full-frames.jpg | 첫 수확 순간 딤 유지와 보상 팝업 페이드인. HUD 64 3프레임은 frames/a1/harvest-hud-frames.jpg, 보상 팝업은 shots/a1-en-pm-sheet-2.jpg |
| E05 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/a2-ko-se-sheet.jpg | 건너뛰기 → 확인 창 → 계속 안내받기 → 막힘 → 건너뛰기 확정(SE ko) |
| E06 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/a3-ko-se-sheet.jpg | 보상 팝업 방치 약 8초 뒤 닫힘(녹화 video/a3-reward-wait-ko-se.mp4) |
| E07 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/d1-en-pm-sheet-a.jpg | 개별 수확·수확 보너스 제안·개별 심기·성장 시트·칸별 비료·재심기·전체 비료 무장(Pro Max en 4-grown) |
| E08 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/d1-en-pm-sheet-b.jpg | 전체 비료 두 번·Harvest All 24·Plant All 24(도구 줄 확대 shots/d1-toolrow-toasts-zoom.png) |
| E09 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/d1/fert-armed-101-107.jpg | 전체 비료 확인 토스트(두 번 누름 frames/d1/fert-double-116-121.jpg, 모두 수확 콤보 frames/d1/harvestall-135-140.jpg, 녹화 video/d1-grown-en-pm.mp4) |
| E10 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/c1-en-pm-sheet.jpg | 첫 세션 목표 칩 진행, 부족 줄 토스트, 수동·일괄 수확, 목표 준비 완료(Pro Max en) |
| E11 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/g2/short-gold-toast-zoom.png | 골드 부족 심기 토스트(SE ko, 전체 프레임 frames/g2/overview-44-69.jpg) |
| E12 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/e1-en-pm-sheet-a.jpg | 상점 목표 강조, 앞 구역 토스트, 밭 구매와 마일스톤 광고, 업그레이드 1회 |
| E13 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/e1-en-pm-sheet-b.jpg | 꾸미기 구매, 보상 탭, 탭 높이. +10·최대는 shots/e2-en-pm-sheet.jpg |
| E14 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/e3-ko-se-sheet.jpg | 업그레이드 탭 골드 부족 카드 탭 뒤 반응 없음(N13) |
| E15 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/q4-en-pm-sheet.jpg | 상점 밭 할인 보상형 광고 → 48.5K→44.2K, 13칸 |
| E16 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/f1/claim-10fps.jpg | 복귀 1배 수령 코인 연출 뒤 전면 광고(캡처 shots/f1-ko-se-sheet.jpg, 녹화 video/f1-welcome-claim-ko-se.mp4) |
| E17 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/f2/close-10fps.jpg | 복귀 바깥 닫기 코인 연출, 광고 없음(캡처 shots/f2-ko-se-sheet.jpg) |
| E18 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/q2-en-pm-sheet.jpg | 복귀 2배 광고 수령 7.4B→11.7B, HUD 깜빡임 frames/q2/hud-blip.jpg(N10) |
| E19 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/f4-en-se-sheet.jpg | 복귀 시트 다섯 줄, 동물 줄 → 생산 시트(SE en, 행동 버튼이 첫 화면 밖 N11) |
| E20 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/f5-en-se-sheet.jpg | 바로 수확하기 → 콤보 → 전면 광고(프레임 frames/f5/harvest-now-10fps.jpg, N12) |
| E21 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/f6-en-se-sheet.jpg | 복귀 시트 출석 받기 → 출석 시트 → 207B |
| E22 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/g1-ko-se-sheet.jpg | 농장 초기화 취소·입력·확정(초기화 뒤 출석 즉시 shots/g2-ko-se-sheet.jpg) |
| E23 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/o1-en-pm-sheet.jpg | 목표 칩 "Ready to graduate!" → 개척 지도 |
| E24 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/o5-bg1-sheet.jpg | ko 개척 지도 명성 스킬, 농장 현황 "2.68억 🪙/시간" |
| E25 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/hud-ko-unit-weight-zoom.png | HUD "4.85만", "74억" 단위 굵기 |
| E26 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/h1-en-pm-sheet-a.jpg | 하단 탭·헤더 칩이 여는 시트(나머지 shots/h1-en-pm-sheet-b.jpg) |
| E27 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/h2-en-pm-sheet.jpg | 더보기 항목별 시트(Daily Bonus·Production은 shots/h5-h4-sheet.jpg) |
| E28 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/h3-en-pm-sheet.jpg | 좌표 끌기 6회 닫힘(Pro Max). 손잡이 요소 끌기 6회 shots/h4-en-se-sheet.jpg, 녹화 video/h4-handle-drag-en-se.mp4 |
| E29 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/k1/rapid.jpg | 미션 탭 연타 → 시트 하나(캡처 shots/k1-03-after-rapid-missions.png) |
| E30 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/j2-ko-se-sheet.jpg | 일일 미션 수령, 토스트 위치, 수령 불가 상태 |
| E31 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/j4-en-se-sheet.jpg | 주간 미션 수령 200B→215B |
| E32 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/j1/overview-28-48.jpg | 출석 받았어요 → 코인과 4.89만(캡처 shots/j1-ko-se-sheet.jpg) |
| E33 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/j3/spin-4fps.jpg | 무료 룰렛 도는 동안 HUD 고정, 멈춘 뒤 상승(캡처 shots/j3-ko-se-sheet.jpg) |
| E34 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/q3/bonus-spin-after-ad.jpg | 광고 보너스 룰렛(캡처 shots/q3-en-pm-sheet.jpg, shots/q3-close-sheet.jpg) |
| E35 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/l1-en-se-sheet-a.jpg | 도감 보상 수령(업적 shots/l1-en-se-sheet-b.jpg) |
| E36 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/m1-en-se-sheet-a.jpg | 동물 수확·먹이·우리 짓기 |
| E37 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/m2-en-se-sheet.jpg | 공방 수령·시작·취소·재료 부족 |
| E38 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/n1-buy-sheet.jpg | 연구 Donation Amplifier 해금(조건 미달 shots/n1-late-sheet.jpg, shots/n1-low-sheet.jpg) |
| E39 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/n2-en-se-sheet.jpg | 자동 수확 켜기 → 익은 칸 자동 수확 |
| E40 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/o2-en-pm-sheet.jpg | 졸업 확인·취소·확정·PIONEERED 연출·새 농장 |
| E41 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/o4-en-pm-sheet.jpg | 랜드마크 Foundation 건설(졸업 직후 막힘 안내 shots/o3-en-pm-sheet.jpg) |
| E42 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/o5-ko-se-map-skills.png | ko "레벨당 10만"(G 없음) |
| E43 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/p-en-pm-sheet.jpg | 설정 기본값 → 변경 → 강제 종료 뒤 유지 → 되돌림 |
| E44 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/b5-en-se-sheet.jpg | 알림 "Maybe later" 뒤 설정 두 알림 꺼짐(안내 shots/b4-en-se-sheet.jpg) |
| E45 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/b1-ko-se-sheet.jpg | 알림 켜기 → iOS 권한 창 → 허용 → 설정 켜짐 |
| E46 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/q1-en-pm-sheet.jpg | 수확 보너스 보상형 광고(닫은 뒤 shots/q1-en-pm-close-sheet.jpg) |
| E47 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/c2-en-pm-sheet.jpg | 첫 밭 해금 → 출석 → 알림 안내 → 해금 뒤 첫 모두 수확에 전면 광고(이후 shots/c3-en-pm-sheet.jpg, shots/c4-en-pm-sheet.jpg) |
| E48 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/logs/log-summary.txt | 시뮬레이터 통합 로그 요약(원본 logs/simlog-pm.log, logs/simlog-se.log) |
| E49 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/logs/supp-admob-consent.txt | 보조 단위 테스트 adMobConsent 8개 통과(fullScreenAd 20개 logs/supp-fullscreen-ad.txt) |
| E50 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/b3/gap-60s.jpg | 알림 안내 39.2s → 기능 안내 99.8s(녹화 video/b3-coachmark-gap-ko-se.mp4) |
| E51 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/bg1-en-se-sheet.jpg | 백그라운드 전환과 복귀(전송 시각은 logs/log-summary.txt) |
| E52 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/logs/svc-update-gate-farm-ui.txt | FarmUpdateGate 12개 통과(계약 10개 logs/svc-update-gate-contract.txt) |
| E53 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/k1/toasts-20-50s.jpg | 토스트 차례(눌림 frames/k1/press-compare.png, 녹화 video/k1-feedback-ko-se.mp4) |
| E54 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/coin-audit-sheet.jpg | 금액 코인 모음(메인 Plant All, 복귀 시트 ko·en, 미션 버튼, 생산, 룰렛, 농장 현황, 개척 지도) |
| E55 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/rm/harvest-15fps.jpg | 동작 줄이기 첫 수확: 코인 비행·카운트업 없음(녹화 video/rm1-onboarding-en-se.mp4) |
| E56 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/rm/daily-rm-vs-normal.jpg | 동작 줄이기 출석(위) 대 일반(아래), 일반 카운트업 frames/rm/daily-normal-later.jpg |
| E57 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/z-se-sheet.jpg | SE en·ko 2-harvest 메인·상점(4-grown shots/z-se-4grown-sheet.jpg) |
| E58 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/z-pm-main-sheet.jpg | Pro Max de·ja·zh-Hans·fr·es 메인(상점 shots/z-pm-shop-sheet.jpg, 보상 탭 줄바꿈 shots/z-pm-shop-tabs-de-fr-es-zoom.png, SE 도구 줄 shots/z-se-4grown-toolrow-2x.png) |
| E59 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/z-se-axl-sheet.jpg | SE accessibility-extra-large(상점 탭 확대 shots/z-se-axl-shop-tabs-zoom.png) |
| E60 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/logs/metro-session-lines.txt | 세션 중 Metro 로그 추가분 130줄(모두 BUNDLE) |
| E61 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/logs/svc-release-observability.txt | release-observability 84개 통과 |
| E62 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/compare/ac12-main-en-pm.jpg | 시안 B-main-en 대 Pro Max en 2-harvest |
| E63 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/compare/ac12-main-se-en.jpg | 시안 B-main-se 대 SE en 2-harvest |
| E64 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/compare/ac12-main-ko-pm.jpg | 시안 B-main-ko 대 Pro Max ko 2-harvest |
| E65 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/compare/ac12-ftue-en.jpg | 시안 B-ftue-en 대 첫 수확 스포트라이트 |
| E66 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/compare/ac12-reward-en.jpg | 시안 B-reward-en 대 첫 수확 보상 팝업 |
| E67 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/shots/g2-ko-se-sheet.jpg | 초기화 뒤 온보딩·출석·밀 4칸 심기(녹화 video/g2-progress-ko-se.mp4) |
| E68 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-3/frames/g3-restore-toast-sheet.jpg | 강제 종료 뒤 재실행: 복원 토스트가 기능 안내에 가려짐(N9, 녹화 video/g3-relaunch-ko-se.mp4) |

폴더 크기는 약 3.3GB(녹화 1.7GB, 통합 로그 약 190MB)다. 원본 녹화와 로그는 검수 근거 이관 대상이다.
