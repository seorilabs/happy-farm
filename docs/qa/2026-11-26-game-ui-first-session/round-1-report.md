# 재설계 UI 검수 1회차 결과

- 검수자: `claude-qa-round1` (구현에 참여하지 않은 별도 리뷰 에이전트, 제품 코드와 데이터는 고치지 않음)
- 계획: [round-1.md](round-1.md), 설계 [design.md](../../design/2026-11-26-game-ui-first-session/design.md), 시안 `docs/ui/reference/game-ui/B-*.jpg`
- 시작 2026-11-26T14:04:12Z, 종료 2026-11-26T15:18:17Z (UTC)

## 결론

| 구분 | 판정 | 핵심 근거 |
|---|---|---|
| 기능 | **실패** | 복귀 보상 수령에서 계획이 요구한 코인 연출이 보이지 않는다(#5). 진행된 농장에서 도구 줄의 모두 수확 버튼이 iPhone SE에서 글자 없는 조각으로 찌그러지고 Pro Max에서도 "모두 수 / 확"으로 깨진다(#1) |
| UX | **실패** | 첫 수확 보상과 스포트라이트가 선택한 B 시안의 구도와 다르다(#2, #3). 첫 밭 해금 전에 광고 제안 시트가 자동으로 뜬다(#4). 골드가 모자란 상태에서 목표 칩이 강조한 상점 줄을 눌러도 아무 반응이 없다(#11) |

통과한 것도 분명하다. 온보딩 중 밝힌 칸 밖 탭 차단, 배지 숨김, 건너뛰기와 취소, 출석과 알림 안내의 미루기 순서, 목표 칩 강조와 구매 뒤 강조 해제, 첫 세션 전면 광고 미노출, 저장 복원(강제 종료 포함), 농장 초기화, 하단 탭 5개와 헤더 칩의 시트 연결, 토스트 순차 표시, 금액의 G 표기 제거는 기대대로 동작했다.

## 실행 환경

| 항목 | 값 |
|---|---|
| 실제 SHA | 앱 Debug 빌드 `26e1bf787dcbbfd1b8b5bc3bc8028a5e7bd89797`. 작업 트리 HEAD는 시작 때 `76d343c`, 검수 중 다른 작업자가 `b929665`, `9f70373`을 더했다. `git diff --name-only 26e1bf7 HEAD`는 문서 3개뿐이라 Metro가 서빙한 앱 코드는 후보 SHA와 같다 |
| 기기 | iPhone 16 Pro Max 시뮬레이터 `509650D1-4B35-45C3-BB2F-4C10FDD6C759`(1320×2868, iOS 18.1), iPhone SE 3세대 시뮬레이터 `BCC17F16-57F7-489D-AA07-041EAEB4AB0E`(750×1334, iOS 18.1). 기기 언어 ko-KR |
| 구동 | Metro `localhost:8081`, Maestro CLI. 흐름 파일은 증거 폴더의 `flows/` |
| 데이터 | QA 도구 `seed.py`(fresh, reward-step, 2-harvest, 3-return, 4-grown, daily-available)와 검수자가 만든 보조 시드 두 개(언어 설정만 넣은 새 세이브, 2-harvest에 무료 룰렛을 연 세이브). 계정 없음 |
| 언어 | ko-KR, en-US(주), de(SE 1장) |
| 글자 크기 | SE에서 `accessibility-extra-large`로 2장 찍고 `large`로 되돌렸다(확인함) |
| 시간대 | 현지 23시~다음 날 0시라 밭 배경이 밤 색(연보라)으로 나온다. 시안은 낮 장면이라 배경색 차이는 판정에서 뺐다 |

개발 빌드 흔적: 14:08Z 무렵 화면 위쪽에 Metro의 "Refreshing..." 배너가 2초쯤 떴다(다른 작업자의 문서 커밋이나 Android 빌드 파일 변경으로 Fast Refresh가 돈 것으로 보이며 상태는 유지됐다, E44). LogBox 배너는 이번 회차 캡처에는 거의 나오지 않았다. 둘 다 제품 판정에서 뺐다.

효과음과 진동은 시뮬레이터에서 판정할 수 없어 판정하지 않았다(AC-7, AC-8의 효과음 부분).

## 항목별 결과

증거 번호(E01~E45)는 아래 [증거 목록](#증거-목록)의 절대 경로다.

| 항목 | 실제 관찰·증거 | 기능/UX 문제·사용자 영향 | 수정 제안 | 판정 |
|---|---|---|---|---|
| app-launch-shell, title-startup | Pro Max ko-KR 새 세이브. 타이틀 "행복 농장"과 "농장으로 가기" 버튼이 뜨고 누르면 농장으로 들어간다. 앱을 종료하고 다시 열어도 타이틀 → 농장이 같은 상태(온보딩 2/3)로 열린다. SE en-US, ko-KR도 같다 (E01, E40) | 없음 | 없음 | 통과 |
| onboarding (AC-1, AC-2) | 새 세이브에서 다 자란 당근 칸만 밝고 나머지는 어둡다. 상점, 미션, 목장, 요리 탭, 더보기, 골드 칩, 목표 칩, 부스트, 구역 칩, 빈 칸을 차례로 눌러도 아무 시트가 열리지 않았다. 메뉴 배지는 없다. 밝힌 칸을 누르면 수확, 💰 입자가 골드 칩으로 날아가며 50→62→64로 올라가고, 위쪽 카드가 "첫 수확 완료! 3/3 계속하기"로 바뀐다. 계속하기를 누르면 끝나고 배지가 나타난다. 손가락은 칸 아래에서 위를 가리켜 작물을 가리지 않는다. 건너뛰기 → 확인 카드 → "계속 안내받기"는 안내로 돌아가고 탭 차단이 유지된다. 다시 건너뛰기 → "안내 건너뛰기"는 메인으로 간다. 보상 카드는 아무것도 안 누르면 약 8초 뒤 닫힌다(기존 동작) (E02~E07, E10) | 계획의 기능 기대 결과는 모두 만족한다. 다만 안내 카드와 보상 단계가 선택한 시안과 다르다(발견 #2, #3, AC-12 행에서 판정). 건너뛰기 확인 카드가 펼쳐지면 밭이 아래로 밀리는데 노란 강조 테두리는 예전 자리에 남는다(#3). 스포트라이트 구멍이 둥근 노란 테두리보다 약간 큰 직사각형이라 모서리가 비친다(#16) | #2, #3, #16 참고 | 통과 |
| 첫 세션 팝업(AC-4), 다음 목표 칩(AC-5) | 온보딩 직후 목표 칩은 "🌱 밭 개간까지 236 🪙 더"와 진행 막대를 보인다. reward-step 세이브(330골드)에서는 "새 밭을 개간할 수 있어요! [가기 !]"가 뜨고, 누르면 상점 확장 탭의 "밭 개간하기 300" 줄이 노란 테두리로 강조된다. 사지 않고 닫으면 출석, 알림 안내가 뜨지 않는다. 다시 열어 사면 강조가 사라지고 "밭을 넓혔어요." 토스트, 골드 330→30, 밭 7칸. 상점을 닫자 출석 보너스 시트, 받았어요를 누르자 알림 안내가 차례로 떴다. 골드가 모자란 상태(64)에서 목표 칩을 눌러도 상점 줄이 강조되어 열린다 (E11~E16, E21) | 계획의 AC-4, AC-5 기대 결과는 만족한다. 그러나 en-US 새 세이브에서 온보딩 뒤 첫 수동 수확(감자)을 하자 첫 밭 해금 전인데도 "Harvest Bonus — Watch ad for 1.5x" 광고 제안 시트가 자동으로 열렸다(#4, E23). 첫 밭 해금 뒤에는 출석 → 알림 → 광고 제안 → "공방이 열렸어요" 안내가 약 3분 안에 이어졌다(E20). 골드가 모자랄 때 강조된 줄을 누르면 아무 반응이 없다(#11) | 광고 제안 자동 시트와 기능 해금 안내도 첫 세션 팝업 순서에 넣어 첫 밭 해금 전에는 막고, 해금 뒤에도 한 번에 하나씩 간격을 둔다. #11 참고 | 실패 |
| planting, growth-harvest | 수확 도구로 빈 칸을 누르면 "아래에서 씨앗을 선택해 주세요." 토스트가 1.7초쯤 뜬다. 당근을 고르면 "모두 심기 6 · 60 🪙"가 나오고 심기, 개별 수확(+14), 모두 수확(+28, "2곳 한 번에 수확했어요!"), 재심기 아이콘(7칸 수확 후 바로 재심기)이 모두 동작한다. 감자 55를 골드 9로 심으려 하면 "You need 46 🪙 more. Harvest ready crops to earn gold." 토스트가 뜬다. 씨앗 카드에 가격과 ×배수가 보인다 (E17~E19, E21, E22) | 3-return·4-grown처럼 비료를 줄 수 있는 진행된 농장에서는 도구 줄에 구역 칩, 모두 수확, 재심기, 전체 비료가 한 줄에 들어가며 깨진다. Pro Max ko-KR에서 "모두 수 / 확 15"로 단어 중간이 잘리고 전체 비료의 코인 아이콘이 둘째 줄로 떨어진다. SE에서는 모두 수확 버튼이 글자 없는 50px 남짓의 초록 조각이 되어 구역 칩과 재심기 버튼에 가려진다(ko, en, de 모두, #1, E27, E41). 토스트가 가리키는 씨앗 카드 위를 토스트가 덮는다(#15) | 행동이 셋 이상이면 전체 비료를 아이콘 버튼이나 둘째 줄로 내리고, 모두 수확에 최소 너비와 한 줄 표시(`numberOfLines={1}`, 글자 축소)를 준다. 375pt 폭 세 행동 상태를 회귀 캡처에 넣는다 | 실패 |
| shop | 확장, 업그레이드, 꾸미기, 보상 탭이 모두 열린다. 밭 구매가 골드와 칸 수에 반영된다. 가격은 "300 🪙", "30만 🪙", "8.62K 🪙"처럼 코인 표기이고 G나 KG처럼 읽히는 표기는 없다 (E11, E12, E24, E31) | 골드 124로 "Clear a plot 300" 줄을 누르면 줄이 비활성이라 아무 반응이 없고 토스트도 없다. 비활성 가격 버튼이 무채색이 아니라 옅은 초록이라 살 수 있는 것처럼 보인다(#11, E24). 가격 옆 코인이 iOS 🪙 이모지라 은색 동전으로 보여 HUD의 금색 새싹 코인과 다른 재화처럼 읽힌다(#9, E25). 탭을 바꿀 때마다 시트 높이가 달라 탭 줄 위치가 최대 약 260pt 움직인다(#18) | 부족할 때도 누를 수 있게 하고 "N 🪙 더 필요해요"를 토스트로 알리거나 줄에 남은 금액을 표시한다. 비활성은 회색 스킨으로 바꾼다. 인라인 금액 코인을 아이콘 이미지로 통일한다 | 실패 |
| welcome-back-offline (AC-3, AC-7) | 3-return(8시간 1분 부재) ko-KR. "다시 오셨네요!" 시트에 +21.7억, 수확 대기 13칸, "바로 수확하기", "광고 보고 2배 받기 · 총 43.5억", "+21.7억 🪙 받고 시작하기"가 있다. 받고 시작하기를 누르자 0.2초 안에 전면 광고(AdMob 테스트)가 떴고 코인 연출은 보이지 않았다. 광고를 닫으면 HUD 95.7억, 저장 골드 9,573,102,642로 잔액과 일치한다. 시트를 바깥 탭으로 닫으면 1배가 즉시 지급되고(74억→95.7억) 연출과 광고가 없다. 다시 실행하면 시트가 다시 뜨지 않고 잔액이 유지된다 (E26~E28) | 계획의 "수령하면 코인 연출 뒤 HUD 금액이 실제 잔액과 같다" 중 코인 연출이 두 경로 모두에서 보이지 않는다. 보상 순간이 광고로 바뀌어 "연출이 보상을 분명히 알린다"를 만족하지 못한다(#5) | 받고 시작하기에서는 보상 연출을 먼저 끝낸 뒤 전면 광고를 띄우고, 바깥 탭으로 닫을 때도 같은 연출을 낸다 | 실패 |
| save-restore | 초기화한 새 농장에서 온보딩 뒤 감자 두 칸을 심고(골드 4) 곧바로 `kill -9`로 강제 종료, 다시 실행하자 골드 4와 감자 두 칸이 그대로였다(종료 중 익어 GET 표시). 3-return에서도 강제 종료와 재실행 뒤 95.7억이 유지됐다. 재실행 때 "농장 기록을 불러왔어요." 토스트가 뜬다 (E29, E28) | 없음. 선택한 씨앗 도구는 재실행 뒤 수확 도구로 돌아간다(기존 동작으로 보임) | 없음 | 통과 |
| reset-farm | 더보기 > 설정 맨 아래 "농장 기록 초기화"가 있다. 확인 시트에서 "초기화"를 입력하기 전에는 삭제 버튼이 회색이고, "계속 이어서 할게요"를 누르면 메인으로 돌아가며 골드가 그대로다. 입력 후 빨간 삭제 버튼을 누르면 골드 50, 6칸, 온보딩 2/3의 새 농장으로 돌아간다 (E30) | 초기화 뒤 같은 실행에서 온보딩을 끝내면 출석 시트, 알림 안내, 공방 안내가 바로 이어진다. 첫 세션 판단이 "새 세이브로 시작한 실행"이라 초기화 사용자는 미루기 대상이 아니다(설계 정정 기록과 일치, #23) | 초기화도 새 세이브 시작으로 볼지 결정한다 | 통과 |
| hud-goals-status, menus-sheets (AC-12) | 헤더 두 줄(골드 칩, 별 칩, 더보기 / 목표 칩, 출석(받을 수 있을 때만), 부스트)과 하단 탭 5개가 있다. 상점→농장 관리소, 미션→오늘의 미션, 목장→생산, 요리→요리 솥, 농장→메인, 골드 칩→농장 현황, 별 칩→개척 지도, 구역 칩→구역 선택 목록, 부스트→수확 보너스, 더보기→더보기 메뉴가 ko, en 모두 열린다. 바깥 탭과 빠른 아래 스와이프로 닫힌다 (E31, E33, E34). 시안 비교 (E08, E09, E32) | AC-12 구도·위계 차이가 남는다. (1) 첫 수확 보상이 딤·나무 패널·리본·큰 코인·+14 카운트업 팝업이 아니라 흰 안내 카드다(#2). (2) 스포트라이트 안내가 칸 옆 나무 말풍선이 아니라 위쪽의 앱식 흰 카드이고 밭을 밀어낸다(#3). (3) 한국어 버튼·탭·씨앗 이름이 굵은 글씨와 외곽선 없이 보통 굵기다(#7). (4) 씨앗 카드와 수확 카드가 나무 테두리 스킨이 아니라 평평한 크림 카드이고 작물 그림이 작다(#8). (5) 준비 완료 목표 칩에 진행 막대가 없고 🔒 이모지가 붙으며 문구가 길어 en에서 두 줄, SE에서 잘린다(#10). (6) 손잡이에서 끌어내리기는 두 번 모두 닫히지 않았다(#17) | 각 발견의 제안 참고 | 실패 |
| missions, daily-bonus-wheel (AC-7) | 미션: 수확·심기 미션 3개를 채운 뒤 보상 받기를 누르면 💰 입자와 "+337" 글자가 위로 날아가고 HUD가 5.87만→5.89만→5.9만으로 올라가며 "수령 완료 ✓"와 토스트가 뜬다. 세 개 합계 +967이 저장 골드 59,649에 반영됐다. 미완료 미션은 진행 막대만 있다. 출석: daily-available 세이브로 들어가면 시트가 열리는 순간 골드가 48,500→48,905로 오르고 코인 입자가 딤 아래에서 날아간다. "받았어요"를 누르면 시트만 닫힌다. 받은 뒤에는 헤더 출석 버튼이 사라진다. 룰렛: 무료 스핀 → 슬롯 강조가 돌다가 450에 멈추고 "룰렛에서 +450 획득!"(48,950 반영), 버튼이 광고 스핀으로 바뀐다 (E13, E15, E16, E35, E36) | 출석 보상은 확인 전에, 딤 아래에서 연출이 끝나 보상 순간이 흐리다. 확인 버튼에는 아무 피드백이 없다(#6). 룰렛은 바퀴가 도는 중에 HUD와 시트 골드가 먼저 4.89만으로 바뀌어 결과를 미리 알려 준다(#13). 미션 토스트가 다음 "보상 225 받기" 버튼을 덮는다(#15). 연출 양은 과하지 않다 | #6, #13 참고 | 실패 |
| interstitial-ads (AC-6) | en-US 새 세이브, 첫 밭 해금 전, 첫 세션 약 3분 안에 모두 수확을 5번 했다. 전면 광고는 한 번도 뜨지 않았다. 같은 시뮬레이터에서 복귀 경로의 전면 테스트 광고가 실제로 떴으므로(E26) 광고 SDK가 동작하는 상태에서의 미노출이다 (E37) | 없음. 10분 경과와 첫 밭 해금 뒤 다시 뜨는지(양성 경로)는 계획 범위가 아니라 실행하지 않았다 | 없음 | 통과 |
| AC-8, AC-9, AC-10 | 눌림: SE에서 모두 수확을 길게 누르는 동안 버튼이 아래로 살짝 내려앉고 아래 두께가 준다(E38). 토스트: 정렬 전환, 빈 칸 탭, 정렬 전환, 빈 칸 탭을 약 1초 간격으로 연달아 하자 "정렬: 수익효율" → "아래에서 씨앗을…" → "정렬: 성장시간" → "아래에서 씨앗을…"이 덮어쓰기 없이 차례로 보였다(E39). 금액: 확인한 모든 화면에서 G 표기가 없고 ko·en 문구 catalog에도 숫자 뒤 G가 없다 | 기대 결과는 만족한다. 눌림 변화가 작아 큰 화면에서는 잘 안 보인다. 초록 버튼의 3분할 스킨 이음매가 세로선으로 보인다(#14). 코인 표기는 아이콘 이미지와 🪙 이모지가 섞인다(#9). 효과음은 판정 불가 | #9, #14 참고 | 통과 |
| 작은 화면(SE) | 2-harvest ko·en에서 헤더, 도구 줄, 씨앗 카드, 탭 바가 한 화면에 들어가고 밭만 안에서 스크롤된다. 씨앗 줄은 가로로 스크롤된다 (E40) | en 목표 칩이 "🔒 Bloom Field is ready to unlock! Ope..."로 잘리고, ko는 "상 / 점에서"처럼 단어 중간에서 줄이 바뀐다(#10, #21). 4-grown에서는 모두 수확 버튼이 사라지다시피 한다(#1, E41). 큰 글자(accessibility-extra-large)에서는 골드 칩 수입이 "+2..."로 잘리고 밭이 한 줄에 한 칸짜리 큰 칸으로 바뀌어 첫 화면에 한 칸만 보인다(#22, E42) | #1, #10 참고 | 실패 |

## 발견 목록

심각도: P1 출시를 막음, P2 출시 전 고쳐야 함, P3 작은 문제.

1. **P1 도구 줄의 행동이 셋이면 주 행동 버튼이 깨진다.** 진행된 농장(익은 칸과 비료 가능한 성장 칸이 함께 있는 상태)에서 Pro Max ko-KR은 "모두 수 / 확 15", 전체 비료 코인이 둘째 줄로 떨어진다. SE는 ko, en, de 모두 모두 수확 버튼이 글자 없는 초록 조각으로 줄어 구역 칩과 재심기 버튼에 가려진다. 메인 화면의 주 행동이 읽히지 않는다(SE에서 탭 가능 여부는 확인하지 못했다). 증거 E27, E41.
2. **P2 첫 수확 보상이 설계의 보상 연출이 아니다.** 시안 B-reward는 딤, 나무 패널, 리본 제목, 큰 코인, "+14" 카운트업, 확인 버튼 하나다. 실행 화면은 위쪽 흰 안내 카드("첫 수확 완료! 3/3")이고 얼마를 받았는지 숫자가 없다. 💰 입자가 골드 칩으로 날아가는 연출은 있다. 증거 E08, E05, E07.
3. **P2 스포트라이트 안내 형태가 시안과 다르다.** 시안 B-ftue는 밝힌 칸 옆 나무 말풍선 "Tap the ripe carrot!"과 오른쪽 위 Skip 링크다. 실행 화면은 흰 앱식 카드(제목, 두 줄 설명, 2/3, Skip 칩)가 밭 위에 끼어들어 밭을 아래로 민다. 건너뛰기 확인 카드가 펼쳐지면 밭이 더 내려가고 노란 강조 테두리는 예전 위치에 남는다. 증거 E09, E06.
4. **P2 첫 밭 해금 전에 광고 제안 시트가 자동으로 뜬다.** en-US 새 세이브, 온보딩 뒤 첫 수동 수확에서 "Harvest Bonus" 광고 제안이 열렸다(골드 91, 6칸). 설계의 GA4 근거가 첫 1분 방해 요소로 든 "광고 제안 48초"가 그대로 남는다. 해금 뒤에는 출석, 알림, 광고 제안, 공방 안내가 약 3분 안에 연달아 뜬다. 증거 E23, E20, E12, E13.
5. **P2 복귀 보상 수령의 코인 연출이 보이지 않는다(AC-3, AC-7 오프라인 1배).** "받고 시작하기"는 곧바로 전면 광고를 띄우고, 바깥 탭으로 닫으면 연출 없이 금액만 바뀐다. 금액 자체는 정확하다. 증거 E26, E27, E28.
6. **P2 출석 보상이 확인 전에 딤 아래에서 지급·연출된다.** 시트가 열리는 순간 골드가 오르고 입자가 어두운 막 아래로 날아간다. "받았어요"를 누를 때는 반응이 없다. 설계의 보상 상태(나무 패널, 리본, 카운트업, 확인 하나)도 적용되지 않았다. 증거 E15, E16, E13.
7. **P2 한국어 글자가 굵은 글씨와 외곽선 없이 보통 굵기다.** 사용자 결정은 "한중일은 시스템 굵은 글씨와 외곽선"인데 "모두 수확", "가기", 탭 이름, 씨앗 이름, "4.85만"의 "만"이 보통 굵기라 숫자(Baloo 2 굵게)와 굵기가 섞이고 초록 버튼 위 흰 글자가 약하다. 증거 E32(ac12-ko-top, ac12-ko-bottom), E38(skin-seam-zoom).
8. **P2 씨앗 카드와 수확 카드가 시안의 스킨과 위계를 따르지 않는다.** 시안은 두꺼운 나무 테두리 카드에 큰 작물 그림과 굵은 이름이다. 실행 화면은 얇은 테두리의 평평한 크림 카드, 작은 그림, 작은 이름이고 선택된 수확 카드는 평평한 연두 판이다. 증거 E32.
9. **P2 같은 재화의 코인이 두 가지로 보인다.** HUD와 씨앗 카드는 금색 새싹 코인 이미지, 목표 칩·상점 가격·시트 골드 칩·토스트·미션 보상은 iOS 🪙 이모지(은색 동전), 날아가는 보상 입자는 💰 돈주머니 이모지다. 설계는 catalog 이모지를 아이콘 이미지로 옮기기로 했다. 은색 동전은 다른 재화로 읽힐 수 있다. 증거 E25, E05, E35.
10. **P2 목표 칩 준비 완료 상태가 잘리고 모순된다.** "🔒 풍요 밭 해금 준비 완료! 상점에서 열기"처럼 잠금 이모지와 "준비 완료"가 함께 있고, en은 Pro Max에서 두 줄, SE에서 "…Ope..."로 잘린다. 시안의 진행 막대도 없다. 증거 E40, E32, E31.
11. **P2 골드가 모자랄 때 강조된 상점 줄을 눌러도 반응이 없다.** 목표 칩(미달 상태)을 누르면 상점 줄이 강조되어 열리지만, 그 줄은 비활성이라 눌러도 아무 일이 없고 남은 금액 안내도 없다. 비활성 가격 버튼은 옅은 초록이라 살 수 있어 보인다("비활성은 무채색" 설계 위반). 처음 사용자가 가장 먼저 만날 수 있는 막다른 탭이다. 증거 E21(r4d-02-zoom), E24.
12. **P3 새 농장 HUD의 "+27.5만/시(+275K/h)"가 실제 수입처럼 읽힌다.** 골드 50인 새 농장에서 시간당 27.5만을 보여 주지만 이는 계속 탭할 때의 이론 생산성이고 자동 수입이 아니다(방치해도 골드는 늘지 않았다). 예전에는 "생산성 … ⓘ" 설명이 있었다. 증거 E45, E06.
13. **P3 룰렛이 멈추기 전에 결과가 드러난다.** "두근두근… 어디에 멈출까요?" 동안 HUD와 시트 골드가 이미 4.85만→4.89만으로 바뀐다. 증거 E36(r10w2-sheet의 g_01).
14. **P3 3분할 스킨 이음매가 보인다.** 초록 버튼의 왼쪽과 오른쪽 조각 경계에 옅은 세로선이 보인다. 증거 E38(skin-seam-zoom).
15. **P3 토스트가 관련 조작 위치를 덮는다.** "아래에서 씨앗을 선택해 주세요."와 골드 부족 토스트가 씨앗 카드 위에, 미션 수령 토스트가 다음 "보상 225 받기" 버튼 위에 뜬다. 증거 E18, E22, E35.
16. **P3 스포트라이트 구멍과 테두리가 맞지 않는다.** 밝힌 영역이 직각 사각형이라 둥근 노란 테두리 바깥 모서리가 비치고, 탭 바 윗선이 딤 위로 밝게 남는다. 증거 E10, E09.
17. **P3 시트 손잡이에서 끌어내려도 닫히지 않았다(확인 필요).** 손잡이(`sheet-drag-handle`)에서 아래로 스와이프 두 번(요소 기준, 700ms 긴 끌기)은 닫히지 않았고, 제목 쪽에서 300ms로 빠르게 튕기면 닫혔다. Maestro 제스처 한계일 수 있어 사람 손 확인이 필요하다. 증거 E34.
18. **P3 상점 탭을 바꿀 때 시트 높이가 바뀌어 탭 줄이 움직인다.** 업그레이드, 꾸미기, 보상 탭 사이에서 탭 줄 위치가 최대 약 260pt 달라져 다음 탭을 잘못 누르기 쉽다. 시트 개별 재스킨은 범위 밖이지만 시트 컨테이너 모션은 범위 안이다. 증거 E24.
19. **P3 탭 이름과 시트 제목이 다르다.** "목장/Ranch" 탭이 "생산/Production" 시트를 연다. 증거 E31.
20. **P3 구역 해금 목표에서는 상점의 해당 줄이 강조되지 않는다.** "풍요 밭 해금 준비 완료! [가기]"를 누르면 확장 탭은 열리지만 풍요 밭 줄에 강조가 없다(첫 밭 목표만 강조). 증거 E33.
21. **P3 한국어 줄바꿈이 단어 중간에서 일어난다.** 상점 줄 "연 / 구 Lv.3 필요", "필 / 요", SE 목표 칩 "상 / 점에서", 큰 글자 "완 / 료!". 증거 E33, E40, E42.
22. **P3 큰 글자에서 HUD 수입이 "+2..."로 잘리고 밭이 한 줄 한 칸으로 커진다(기존 동작 여부 확인 필요).** 밭 격자는 범위 밖이지만 첫 화면에 밭 한 칸만 보이고 도구 줄은 스크롤해야 보인다. 증거 E42.
23. **P3 초기화 뒤 같은 실행에서는 첫 세션 팝업 미루기가 적용되지 않는다.** 온보딩 직후 출석, 알림, 공방 안내가 이어진다. 설계 정정 기록의 "새 세이브로 시작한 실행" 기준과 일치하므로 의도인지 확인만 필요하다. 증거 E43.
24. **P3 오늘의 작물 배지 "⭐×2"가 명성 별 아이콘과 같다.** 밀 카드의 ×2 배지가 HUD 명성 별과 같은 별이라 별을 2배로 주는 것처럼 읽힐 수 있다(접근성 라벨은 "오늘의 작물 ×2"). 증거 E32.

## 실행하지 못한 것과 이유

- 효과음, 버튼 탭음, 진동, 효과음 끄기 설정(AC-7, AC-8의 소리 부분): 시뮬레이터에서 들을 수 없어 판정하지 않았다.
- 오프라인 2배(광고), 광고 보상, 숙련, 졸업 보상 연출(AC-7의 나머지): 계획 행에 없어 실행하지 않았다.
- 전면 광고 양성 경로(첫 밭 해금과 10분 경과 뒤 다시 뜨는지): 계획에 "해당 없음"으로 되어 있어 실행하지 않았다.
- AC-12의 ja, zh 언어 비교, Pro Max 큰 글자, 동작 줄이기(reduce motion): 이번 회차 계획 범위(ko, en, SE)를 넘어 실행하지 않았다. de는 SE 4-grown 1장만 찍었다(E41).
- 계측 5종(AC-11): 화면에서 관찰할 수 없어 확인하지 않았다.
- 손잡이 끌어내리기(#17): Maestro 제스처로는 결론을 내지 못했다.

## 증거 목록

모든 증거는 아래 폴더에 있다. 저장소에는 넣지 않았다. 원본 Maestro 출력은 같은 폴더의 `maestro/`, 흐름 파일은 `flows/`, 보조 스크립트는 `tools/`에 있다.

`smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/`

| 번호 | 절대 경로 | 내용 |
|---|---|---|
| E01 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r1-sheet.jpg | 타이틀, 첫 진입, 재실행 |
| E02 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r2-sheet-a.jpg | 스포트라이트, 칸 밖 10곳 탭 뒤 |
| E03 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r2-sheet-b.jpg | 수확 직후, 보상 카드, 계속하기 뒤 |
| E04 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/r2-onboarding-ko-pm.mp4 | 온보딩 전체 녹화(ko, Pro Max) |
| E05 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/frames/r2b-sheet.jpg | 첫 수확 코인 입자 프레임 |
| E06 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r2s-sheet.jpg | en 건너뛰기, 취소, 확정 |
| E07 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r2e-sheet.jpg | en 보상 카드와 자동 닫힘, 시안 |
| E08 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/ac12-reward-en-vs-mock.jpg | 보상 시안 대 실행 |
| E09 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/ac12-ftue-en-vs-mock.jpg | 스포트라이트 시안 대 실행 |
| E10 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r1-02-cell-zoom2.png | 스포트라이트 구멍과 테두리 확대 |
| E11 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r3-sheet-a.jpg | 가기 칩, 상점 강조, 사지 않고 닫기 |
| E12 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r3-sheet-b.jpg | 구매, 강조 해제, 출석 시트 |
| E13 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r3c-sheet.jpg | 출석 다음 알림 안내 |
| E14 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/r3-popups-ko-pm.mp4 | 팝업 순서 녹화 |
| E15 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/frames/r3e-daily-open-sheet.jpg | 출석 시트가 열리며 딤 아래 지급 |
| E16 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/frames/r3b-sheet.jpg | 받았어요 탭 때 반응 없음 |
| E17 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r4-sheet-a.jpg | 씨앗 선택, 심기, 모두 심기 |
| E18 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/frames/r4b-toast.jpg | 씨앗 선택 토스트 |
| E19 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r4c-sheet.jpg | 모두 수확, 모두 심기, 재심기 |
| E20 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r4c-popups.jpg | 광고 제안 뒤 공방 안내 |
| E21 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r4d-02-zoom.jpg | 골드 64에서 목표 탭, 옅은 초록 비활성 가격 |
| E22 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/frames/r4d-shortage-toast.jpg | 골드 부족 토스트 |
| E23 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r4e-sheet.jpg | 첫 밭 해금 전 광고 제안 자동 시트 |
| E24 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r9f-sheet.jpg | 상점 네 탭, 부족 구매 시도 |
| E25 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/coin-icons-zoom.jpg | 은색 🪙 이모지 대 금색 코인 |
| E26 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r6a-sheet.jpg | 복귀 시트, 받고 시작하기 뒤 전면 광고 |
| E27 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r6a-toolrow-zoom.jpg | Pro Max 도구 줄 "모두 수 / 확" |
| E28 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/frames/r6b2-sheet.jpg | 바깥 탭으로 닫을 때 즉시 지급 |
| E29 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r7d-sheet.jpg | 강제 종료 전후 |
| E30 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r8b-sheet.jpg | 초기화 입력 확인과 새 농장 |
| E31 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r9en-sheet-a.jpg | 헤더 칩과 탭이 여는 시트(en, ko는 r9ko-sheet-a/b.jpg) |
| E32 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/ac12-ko-main-vs-mock.jpg | 메인 시안 대 실행(ko, en은 ac12-en-main-vs-mock.jpg, 확대는 ac12-ko-top/bottom) |
| E33 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r9-ko-06-goal-zoom2.jpg | 구역 목표 탭 뒤 강조 없음, 단어 중간 줄바꿈 |
| E34 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r9e-sheet.jpg | 끌어내리기 시도(앞 시도는 r9d-sheet.jpg) |
| E35 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/frames/r10e-mission-burst.jpg | 미션 수령 입자, 카운트업, 토스트 |
| E36 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/frames/r10w2-sheet.jpg | 룰렛 결과 미리 노출 |
| E37 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r11-sheet.jpg | 첫 세션 모두 수확 5회, 전면 광고 없음 |
| E38 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/frames/r12b-press-sheet.jpg | 눌림 상태 프레임(스킨 이음매는 shots/skin-seam-zoom.png) |
| E39 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/frames/r12c-sheet.jpg | 토스트 순차 표시 |
| E40 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r13-se-en-sheet.jpg | SE en 메인과 시안(ko는 r13-se-ko-sheet.jpg) |
| E41 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r13b-se-sheet.jpg | SE 4-grown ko, en, de 도구 줄 붕괴(확대는 r13b-se-toolrow-zoom.png) |
| E42 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r13b-axl-sheet.jpg | SE 큰 글자 |
| E43 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r7-sheet.jpg | 초기화 뒤 팝업 연쇄(공방 안내는 r7c-sheet.jpg) |
| E44 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/frames/r2-sheet.jpg | Metro "Refreshing..." 배너(개발 빌드 흔적) |
| E45 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-1/shots/r1-02-top.jpg | 새 농장 HUD "+27.5만/시" |
