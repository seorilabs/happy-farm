# 재설계 UI 검수 2회차 결과

- 검수자: `claude-qa-round2` (구현과 1회차 검수에 참여하지 않은 별도 리뷰 에이전트, 제품 코드와 저장소 상태는 바꾸지 않음)
- 계획: [round-2.md](round-2.md), 1회차 결과 [round-1-report.md](round-1-report.md), 설계 [design.md](../../design/2026-11-26-game-ui-first-session/design.md)(맨 끝 "구현 중 정정" 포함), 시안 `docs/ui/reference/game-ui/B-*.jpg`
- 시작 2026-11-26T16:35:53Z, 종료 2026-11-26T17:46:27Z (UTC)

## 결론

| 구분 | 판정 | 핵심 근거 |
|---|---|---|
| 기능 | **실패** | 계획의 AC-8/9/10 행이 기능 기대 결과로 요구한 "코인이 한 가지 그림이다"와 "금액에 G 없음"을 만족하지 못한다. 메인 화면 주 행동 버튼(모두 심기, 전체 비료), 복귀 시트 금액 세 곳, 미션 "보상 N 받기" 버튼에 은색 🪙 이모지가 남았고(#9 잔여, P2), 개척 지도의 명성 스킬 설명에 "10만G"가 남았다(N5). 그 밖의 핵심 기능과 바뀐 기능은 기대대로 동작했다. 시트 손잡이 끌기는 6번 중 4번만 닫혔다(#17 잔여, P3) |
| UX | **통과** | 계획의 통과 기준(다음 행동을 이해하지 못하거나 잘못 누르게 되는 문제, 글자가 잘려 뜻을 잃는 문제)에 걸리는 문제는 찾지 못했다. 1회차 UX 실패 근거였던 보상 팝업(#2), 스포트라이트 형태(#3), 해금 전 광고 제안(#4), 부족 금액 막다른 탭(#11)은 모두 고쳐졌다. 남은 차이는 P3(스포트라이트 중 가운데 탭 버튼 머리가 밝게 남음, 진입 직후 0.5초 딤 없는 화면, 수확 직후 옛 안내 카드 깜빡임, SE에서 씨앗 카드가 시안보다 커서 밭이 덜 보임 등)다 |

1회차 발견 24건 중 16건이 해결됐다. 부분 해결 6건(#7, #9, #14, #16, #17, #22)과 의도로 남긴 2건(#12, #23, 동작만 기록)이 있다. 새 발견은 P3 9건이다. 기능 판정을 통과로 바꾸려면 #9의 남은 은색 코인을 그림 코인으로 바꾸고 "10만G" 문구 4개 언어를 고치면 된다.

## 실행 환경

| 항목 | 값 |
|---|---|
| 실제 SHA | 시작과 종료 모두 `git -C /Users/syous/Repositories/seorilabs/happy-farm rev-parse HEAD` = `a182fedf7795e9fbcf5c9c8dd88d7c6696001464`, 작업 트리 깨끗함. Metro `localhost:8081`이 이 트리를 서빙(앱 바이너리는 `26e1bf7` Debug, 그 뒤 네이티브 변경 없음) |
| 기기 | iPhone 16 Pro Max 시뮬레이터 `509650D1-4B35-45C3-BB2F-4C10FDD6C759`(1320×2868, iOS 18.1), iPhone SE 3세대 시뮬레이터 `BCC17F16-57F7-489D-AA07-041EAEB4AB0E`(750×1334, iOS 18.1). 기기 언어 ko-KR. 실기기는 쓰지 않았다 |
| 구동 | Maestro CLI(흐름 파일은 증거 폴더 `flows/`), `xcrun simctl io recordVideo`(h264) 녹화와 ffmpeg 프레임 추출. 두 기기에서 Maestro를 동시에 돌린 구간이 있으며 충돌은 없었다 |
| 데이터 | QA 도구 `seed.py`(fresh, 1-initial, 2-harvest, 3-return, 4-grown, daily-available)와 보조 스크립트(`seed_settings.py` 언어만 넣은 새 세이브, `seed_wheel.py` 무료 룰렛). 계정 없음 |
| 언어 | ko-KR, en-US(주), de, es(SE·Pro Max 4-grown 메인), ja, zh-Hans(Pro Max 2-harvest·4-grown 메인) |
| 글자 크기 | SE에서 `accessibility-extra-large`로 3장 찍고 `large`로 되돌렸다(종료 때 두 기기 모두 `large` 확인) |
| 동작 줄이기 | Pro Max에서 `defaults write com.apple.Accessibility ReduceMotionEnabled -bool true` 뒤 앱을 다시 실행하자 효과가 확인됐다(아래 행). 끝난 뒤 false로 되돌렸고 `0`을 확인했다 |
| 시간대 | 현지 새벽 1~3시라 밭 배경이 밤 색(연보라)이다. 시안은 낮 장면이라 배경색 차이는 판정에서 뺐다 |

효과음과 진동은 지시대로 판정하지 않았다. 녹화는 화면이 바뀔 때만 프레임을 남기는 가변 프레임이라 짧은 깜빡임의 길이는 프레임 시각(pts)으로 쟀다.

## 항목별 결과

증거 번호(E01~E41)는 아래 [증거 목록](#증거-목록)의 절대 경로다.

| 항목 | 실제 관찰·증거 | 기능/UX 문제·사용자 영향 | 수정 제안 | 판정 |
|---|---|---|---|---|
| app-launch-shell, title-startup | Pro Max ko 새 세이브와 en 새 세이브에서 타이틀 "행복 농장/Happy Farm"과 "농장으로 가기/Enter Farm"이 뜨고 누르면 농장으로 들어간다. SE에서 `kill -9`로 강제 종료 뒤 다시 실행하면 타이틀 → 같은 농장으로 들어간다 (E01, E36) | 없음 | 없음 | 통과 |
| onboarding (AC-1, AC-2, 1회차 #2, #3, #16) | 새 세이브에서 다 자란 당근 칸만 밝고 칸 오른쪽에 나무 말풍선 "다 자란 작물을 눌러 수확해요!", 오른쪽 위에 "건너뛰기" 링크가 있다. 상점, 미션, 더보기, 골드 칩, 목표 칩, 부스트, 구역 칩, 빈 칸 2개, 생산, 요리, 씨앗 카드, 별 칩을 눌러도 시트가 열리지 않고 "밭을 눌러 수확할 수 있어요." 토스트만 뜬다. 밝힌 칸을 누르면 코인이 칸에서 골드 칩으로 날아가며 HUD 50→53→58→64, 팝업 숫자 +0→+6→+14로 오르고, 리본 "첫 수확 완료!", 큰 코인과 빛살, +14, 설명, "계속하기" 하나인 보상 팝업이 뜬다. 계속하기로 끝나고 배지가 나타난다. 건너뛰기 → 확인 창("계속 안내받기"/"건너뛰기") → 계속 안내받기 → 상점 탭(막힘) → 다시 건너뛰기 → 건너뛰기 확정이 기대대로 동작하고, 확인 창은 가운데 모달이라 밭과 노란 테두리가 제자리다. 보상 팝업을 그대로 두면 약 8초(21.5초→29.5초) 뒤 닫힌다(기존 동작) (E01~E08) | 기능 기대 결과는 모두 만족한다. 말풍선은 밭을 밀지 않고, 밝힌 칸은 노란 사각 테두리와 같은 사각 구멍이라 모서리가 비치지 않으며 탭 바 윗선도 어둡게 덮인다. 다만 가운데 "농장" 탭 버튼의 위로 솟은 머리 부분이 딤 위로 원래 밝기(크림 테두리와 초록)로 남는다(N1). 진입 직후 약 0.48초 동안 딤 없는 메인 화면이 보였다가 스포트라이트가 덮이고(N2), 수확 직후 약 4프레임 동안 딤이 풀린 메인과 예전 흰 안내 카드("2/3")가 깜빡인다(N3). 새 세이브인데 "농장 기록을 불러왔어요." 토스트가 스포트라이트 위에 뜬다(N4) | N1~N4 참고 | 통과(P3 4건) |
| 첫 세션 팝업 (AC-4, 1회차 #4), 다음 목표 칩 (AC-5, #10, #11, #20) | en 새 세이브로 첫 세션 약 9분 동안 수동 심기·수확 3회전(수동 수확 18번), 모두 심기와 모두 수확 각 7번을 했다. 그동안 딤이 생긴 구간은 시작 스포트라이트와 보상, 상점, 당근 숙련 "Bronze" 연출(2.5초)뿐이고 출석, 알림 안내, 수확 보너스 광고 제안, 기능 안내는 뜨지 않았다(녹화 2fps 밝기 분석과 3초 간격 프레임). 골드 304에서 목표 칩이 "Ready to clear a new plot!", 가득 찬 막대, "Go !"로 바뀌고, 누르면 상점 "Clear a plot 300" 줄이 강조되며 가격표가 초록이다. 사서 닫자 출석 시트(+50, HUD 4 그대로) → "Got it" 뒤 코인이 날아가며 4→25→46→54 → 1초 뒤 알림 안내 → "Maybe later" 직후 "The workshop is open" 기능 안내가 하나씩 떴다. 진행 중 목표 칩은 "236 🪙 more to clear a new plot"과 막대, 골드 64로 강조 줄을 누르면 "You need 236 🪙 more." 토스트가 뜨고 가격표는 회색이다. 사지 않고 닫으면 아무 팝업도 없다. ko 2-harvest에서 "풍요 밭 열 수 있어요! 가기"를 누르면 "풍요 밭 열기" 줄이 강조된다 (E11~E17, E24, E27) | 기능·UX 기대 결과를 만족한다. SE ko "풍요 밭 열 수 있어요!"는 한 줄, SE·Pro Max en "Bloom Field is ready to unlock!"은 두 줄이지만 잘리지 않고 자물쇠 이모지가 없다. 해금 뒤 기능 안내는 알림 안내를 닫자마자 떴다(설계상 60초 간격은 광고 제안에만 적용). 숙련 연출은 보상 연출이라 미루기 대상이 아니며 막지 않았다 | 없음 | 통과 |
| planting, growth-harvest (1회차 #1, #7, #8, #24, Android ▾) | 수동 심기·개별 수확(c1), 모두 심기·모두 수확(c1, d1), 수확 후 재심기(4-grown 12칸 → 38초 성장 칸, 74억→74.2억), 전체 비료 아이콘 한 번 누르기("! 한 번 더 눌러 실행 · 9 · 3.53억" 토스트와 "!" 배지, 4초 뒤 해제), 확인 창 안에 두 번 누르기(74억→70.5억, 성장 9칸이 익음)가 모두 동작한다. SE 골드 14에서 밀(25)을 심으려 하면 "11 🪙 더 필요해요. 씨앗에서 당근을 골라 심어 보세요." 토스트가 도구 줄 위에 뜬다. 4-grown 도구 줄은 SE ko·en·de·es와 Pro Max ko·en·de·es·ja·zh-Hans 모두 [구역 칩 ▾ ⇅][모두 수확 N][🔁][비료 아이콘] 한 줄이고 모두 수확 글자가 읽힌다. 한국어 버튼, 탭, 씨앗 이름은 굵은 글씨와 아래 띠, 씨앗 카드는 주황 나무 테두리 카드, 오늘의 작물 배지는 "📅×2"다 (E18~E23, E26, E36) | 기능 기대 결과를 만족한다. SE에서 모두 수확 글자가 버튼 오른쪽 곡선 끝까지 붙고 es는 약 9pt까지 줄어든다(N8). 성장 칸이 없어 전체 비료가 초록 주 버튼이 되면 "전체 비료 9 · 3.44억 🪙"의 코인이, 모두 심기 버튼도 "Plant All 6 · 60 🪙"의 코인이 은색 이모지다(#9 잔여). HUD "74억", "4.85만"의 단위 글자가 숫자보다 가는 보통 굵기다(#7 잔여) | #9, #7 참고 | 통과(기능), 코인은 AC-10 행에서 판정 |
| shop (1회차 #9, #11, #18) | 확장, 업그레이드, 꾸미기, 보상 네 탭이 열리고 탭을 바꿔도 시트 윗변(손잡이 y=513px)과 탭 줄 위치가 그대로다. "밭 개간하기 8,616"을 사자 골드 4.85만→3.99만, "현재 13칸", 다음 가격 1.51만으로 반영됐다. 가격표와 시트 골드 칩, 설명 안 금액은 금색 그림 코인이다. 살 수 없는 줄은 회색 가격표, 앞 구역이 안 열린 "과수원 열기"를 누르면 "앞 구역부터 차례대로 열어 주세요." 토스트, 골드 부족 줄은 남은 금액 토스트(en)가 뜬다 (E11, E27) | 기대 결과를 만족한다. 밭 구매 직후 기존 진행 마일스톤 전면 광고(`progression_plot_unlock`)가 바로 떠 구매 토스트가 가려진다(관찰, 첫 세션 밖의 기존 지면이라 범위 밖) | 없음 | 통과 |
| welcome-back-offline (AC-3, AC-7, 1회차 #5) | SE ko 3-return(8시간 1분 부재). "+21.7억 받고 시작하기"를 누르면 시트가 닫히고 코인이 아래에서 골드 칩으로 날아가며 HUD 74억→89.5억→95.7억(저장 골드 9,573,019,675와 일치)으로 끝난 뒤 약 0.4초 지나 전면 테스트 광고가 페이드인했다. 바깥(배경)을 눌러 닫으면 시트가 내려가고 코인이 골드 칩으로 모이며 74억→79.1억→87.3억→95.7억, 광고는 뜨지 않았다 (E28, E29) | 기대 결과를 만족한다. 보상 순간이 광고에 가려지지 않는다. 시트 안 금액 세 곳의 코인은 은색 이모지다(#9 잔여) | #9 참고 | 통과 |
| save-restore | SE에서 초기화한 새 농장 → 온보딩 → 출석 → 밀 4칸 심기(골드 14) 뒤 `kill -9`, 다시 실행하자 골드 14와 밀 4칸(익음)이 그대로였고 "농장 기록을 불러왔어요." 토스트가 떴다 (E36) | 없음. 선택한 씨앗 도구는 재실행 뒤 수확 도구로 돌아간다(기존 동작) | 없음 | 통과 |
| reset-farm | SE 1-initial. 더보기를 아래로 스크롤해 "설정" → "농장 기록 초기화" 시트. "계속 이어서 할게요"를 누르면 골드 180 그대로 메인으로 돌아간다. 입력 없이 삭제 버튼은 회색이고 누르면 아무 일 없다. "초기화" 입력 뒤 빨간 버튼을 누르면 골드 50, 6칸, 온보딩 스포트라이트의 새 농장이 된다 (E35) | 없음. SE에서는 더보기 메뉴의 "설정"이 첫 화면 아래에 있어 스크롤해야 보인다 | 없음 | 통과 |
| hud-goals-status, menus-sheets (AC-12, 1회차 #17, #19) | Pro Max ko 2-harvest. 상점 → 농장 관리소, 미션 → 오늘의 미션, "생산" 탭 → "생산" 시트, 요리 → 요리 솥, 농장 → 메인, 골드 칩 → 농장 현황, 별 칩 → 개척 지도, 더보기 → 더보기, 구역 칩 → 구역 선택, 부스트 → 수확 보너스가 열린다(출석 버튼은 받을 것이 없어 없음). 손잡이(y 18%)에서 화면 아래(95%)까지 좌표 스와이프: 미션 400ms 실패, 미션 300ms 성공, 상점 500ms 성공, 미션 400ms 두 번 성공, 생산 400ms 실패. 실패 때는 시트가 조금 내려왔다가 되돌아갔다. 시안 비교는 메인 en·ko, SE en, 첫 수확, 보상 다섯 쌍 (E30, E31, E40) | 탭 이름과 시트 제목이 맞고 시트 연결은 모두 기능한다. 끌어 닫기는 6번 중 2번 닫히지 않았다(#17 잔여, Maestro 합성 제스처라 사람 손 확인 필요). 시안 대비 구도와 위계는 대부분 맞는다(보상 팝업, 스포트라이트 말풍선, 하단 탭, 목표 칩, 도구 줄). 남은 차이는 SE에서 씨앗 카드가 커서 밭이 약 1.6줄만 보임(시안 약 2.4줄, 씨앗 카드 2.5장 대 4장, N7), 은색 코인(#9), 한글 단위 굵기(#7), 시안의 출석 선물 버튼 자리에 부스트 버튼(설계 정정 기록대로)이다 | #17, N7 참고 | 통과(P3) |
| missions, daily-bonus-wheel (AC-7, 1회차 #6, #13, #15) | 미션: 2-harvest에서 수확·심기 뒤 "보상 337 받기"를 누르면 코인이 날아가고 HUD 5.84만→5.87만, "수령 완료 ✓", 토스트 "미션 보상 337 🪙 받았어요!"가 화면 위 HUD 줄에 뜬다. 다음 "보상 405 받기" 버튼은 가리지 않는다. 미완료 미션은 막대만 있고 버튼이 없다. 출석: daily-available에서 시트에 큰 코인, +405, "연속 5일 출석 🔥"가 보이고 HUD는 4.85만 그대로(저장 골드는 이미 48,905). "받았어요"를 누르면 시트가 닫히며 코인이 날아가 4.85만→4.88만→4.89만, 그 뒤 헤더 출석 버튼이 사라진다. 룰렛: 무료 스핀 동안 HUD와 시트 골드가 4.85만에 머물다 멈춘 뒤 코인과 함께 4.86만→4.87만으로 오른다 (E14, E32~E34) | 기능·UX 기대 결과를 만족한다. 다만 룰렛 결과와 미션 수령 토스트가 HUD 줄 위에 떠서 금액이 오르는 순간 골드 칩 숫자 일부나 수입 줄을 가린다(N6). 미션 받기 버튼의 코인은 은색 이모지다(#9 잔여) | N6, #9 참고 | 통과 |
| interstitial-ads (AC-6) | en 새 세이브 첫 세션, 첫 밭 해금 전 약 9분 동안 모두 수확 7번, 전면 광고 없음. 해금 뒤 첫 세션 시작 약 14.7분(10분 유예 경과)에 모두 수확하자 전면 테스트 광고가 떴다(기존 규칙으로 돌아오는 양성 경로) (E12, E16) | 없음 | 없음 | 통과 |
| AC-8, AC-9, AC-10 | 눌림: 모두 수확을 길게 누르는 약 2초 동안 버튼이 어두워지고 내려앉는다. 토스트: 정렬 → 빈 칸 → 정렬 → 빈 칸을 연달아 누르자 "정렬: 수익효율" → "아래에서 씨앗을 선택해 주세요." → "정렬: 성장시간" → "아래에서 씨앗을…"이 덮어쓰지 않고 차례로 보였다. 연타: 미션 탭을 80ms 간격 3번 눌러도 시트 하나만 열린다. 금액: 메인, 상점, 토스트, 시트 골드 칩은 금색 그림 코인이다. 그러나 메인 "모두 심기 · N 🪙", "전체 비료 · N 🪙"(주 버튼 상태), 복귀 시트 세 곳, 미션 "보상 N 🪙 받기", 미션 "골드 300 🪙 사용하기", 생산·룰렛·개척 지도·농장 현황 시트 금액은 은색 🪙 이모지다. 개척 지도 명성 스킬 "시작 자금" 설명에 "10만G"가 남아 있고 catalog에서 ko, ja, zh-Hans, zh-Hant 네 언어가 같다 (E17, E19, E37, E38) | 눌림, 토스트 차례, 연타는 만족한다. "코인이 한 가지 그림이다"는 메인 화면 주 행동 버튼과 잦은 보상 화면에서 만족하지 못한다(#9 잔여, P2). "금액에 G 없음"은 문구 하나에서 만족하지 못한다(N5, P3). 효과음은 판정 불가 | #9, N5 참고 | **실패** |
| 작은 화면, 큰 글자, 언어 (AC-12) | SE ko·en(1-initial, 2-harvest, 4-grown)과 SE de·es(4-grown), Pro Max ja·zh-Hans(2-harvest, 4-grown)에서 헤더, 목표 칩, 도구 줄, 씨앗 카드, 탭 바가 잘리지 않는다. ja·zh는 굵은 글씨로 보이고 탭 이름 "ショップ/ミッション/農場/生産/料理", "商店/任务/农场/生产/烹饪"이 한 줄이다. SE `accessibility-extra-large`에서 골드 칩의 수입 줄은 잘린 채 남지 않고 빠진다(ko 4.85만, en 7.4B, ko 180). 목표 칩 en은 두 줄로 다 보인다 (E22~E25) | 기대 결과를 만족한다. 큰 글자에서 밭이 한 줄 한 칸으로 커지는 것은 밭 격자(범위 밖) 동작으로 1회차 #22와 같다 | 없음 | 통과 |
| 동작 줄이기 (설계 접근성 행) | 켠 뒤 출석: "받았어요"를 누르면 코인 없이 HUD가 4.85만→4.89만으로 바로 바뀐다(같은 기기 일반 실행은 코인이 날아가며 4.88만을 거침). 온보딩: 손가락 위치 변화량이 일반 실행의 약 1/5(평균 픽셀 차 최대 1.4 대 6.8)로 흔들림이 없고, 수확하면 날아가는 코인 없이 HUD 64와 팝업 "+14"가 바로 보인다 (E39) | 기대 결과를 만족한다. 시트가 열린 동안 HUD를 지급 전 금액으로 붙잡는 동작은 동작 줄이기에서도 같았다(확인 뒤 바로 실제 잔액). 보상 팝업 빛살 회전, 가기 버튼 튕김, 룰렛과 복귀 연출은 개별로 보지 않았다 | 없음 | 통과(일부 미실행) |

## 1회차 발견 해결 여부

| # | 1회차 내용 | 2회차 판정 | 근거 |
|---|---|---|---|
| 1 | P1 도구 줄 행동이 셋이면 주 행동 버튼이 깨짐 | 해결 | 4-grown SE ko·en·de·es, Pro Max 6개 언어 모두 한 줄, 전체 비료는 아이콘(E18, E22, E23). 글자가 SE에서 버튼 끝에 붙는 점은 N8 |
| 2 | P2 첫 수확 보상이 설계 연출이 아님 | 해결 | 리본, 큰 코인과 빛살, +14 카운트업, 확인 하나. 시안과 같은 구성(E02, E04, E40 ac12-reward-en) |
| 3 | P2 스포트라이트 안내 형태가 시안과 다름 | 해결 | 칸 옆 한 줄 말풍선, 오른쪽 위 건너뛰기 링크, 확인 창은 가운데 모달이라 밭과 테두리 제자리(E05, E07, E40 ac12-ftue-en) |
| 4 | P2 첫 밭 해금 전 광고 제안 자동 시트 | 해결 | 첫 세션 9분, 수동 수확 18번과 모두 수확 7번 동안 자동 팝업 없음. 해금 뒤 출석 → 알림 → 기능 안내 하나씩(E12~E15). 광고 제안의 60초 간격은 양성 경로 미확인 |
| 5 | P2 복귀 보상 코인 연출 없음 | 해결 | 받고 시작하기와 바깥 탭 모두 코인 연출 뒤 실제 잔액, 광고는 받고 시작하기에서만 연출 뒤(E28, E29) |
| 6 | P2 출석 보상이 확인 전에 딤 아래에서 연출 | 해결 | 시트에는 큰 코인과 금액, HUD 그대로, 받았어요 때 코인과 HUD 상승(E14, E32) |
| 7 | P2 한국어 굵은 글씨와 외곽선 없음 | 부분 해결(P3) | 버튼, 탭, 씨앗 이름, 목표 칩은 굵은 글씨와 아래 띠. HUD 큰 금액의 "만/억"(ja "億", zh "亿")은 숫자보다 가는 보통 굵기로 남음(E26 d3-03-hud-zoom) |
| 8 | P2 씨앗 카드가 평평한 크림 카드 | 해결 | 주황 나무 테두리 카드, 큰 작물 그림, 굵은 이름(E26 d3-03-seed-zoom) |
| 9 | P2 같은 재화 코인이 두 가지 | **부분 해결(P2 유지)** | HUD, 씨앗 카드, 목표 칩, 상점, 토스트, 시트 골드 칩, 미션 보상 금액은 그림 코인. 메인 "모두 심기"/"전체 비료" 주 버튼, 복귀 시트 세 곳, 미션 "보상 N 받기" 버튼과 "골드 300 사용하기", 생산·룰렛·개척 지도·농장 현황 시트는 은색 🪙. 첫 세션 사용자가 온보딩 직후 보는 "Plant All 6 · 60 🪙"가 은색이다(E17 c1-08-toolrow-zoom, E19, E28, E33, E30) |
| 10 | P2 목표 칩 준비 완료가 잘리고 모순 | 해결 | "Ready to clear a new plot!"/"풍요 밭 열 수 있어요!", 가득 찬 막대, 가기와 "!", 자물쇠 없음, SE ko 한 줄·en 두 줄로 잘림 없음(E17 c1-08-goal-zoom, E24) |
| 11 | P2 골드 부족 강조 줄 무반응, 비활성 가격이 초록 | 해결 | "You need 236 🪙 more." 토스트, 회색 가격표(E11) |
| 12 | P3 새 농장 HUD "+27.5만/시"가 실제 수입처럼 읽힘 | 의도(동작 기록) | 새 농장에서 "+27.5만/시", "+275K/h"가 그대로 보인다(E01, E09) |
| 13 | P3 룰렛 결과가 멈추기 전 드러남 | 해결 | 도는 동안 HUD·시트 4.85만, 멈춘 뒤 상승(E34) |
| 14 | P3 3분할 스킨 이음매 | 부분 해결(P3) | 1배 화면에서는 거의 보이지 않지만 4배 확대 시 왼쪽·오른쪽 끝 조각 경계의 옅은 색 차이와 끝 조각 테두리 가운데 높이의 가로 단차가 보인다(E41) |
| 15 | P3 토스트가 관련 조작 위치를 덮음 | 해결 | 씨앗 선택·골드 부족 토스트는 도구 줄 위 밭 쪽, 미션 수령 토스트는 화면 위 HUD 줄에 떠서 씨앗 카드와 다음 받기 버튼을 덮지 않음(E19, E33, E36). 대신 HUD 숫자를 가리는 점은 N6 |
| 16 | P3 스포트라이트 구멍과 테두리 불일치, 탭 바 윗선 밝음 | 부분 해결(P3) | 사각 구멍과 사각 테두리가 맞고 탭 바 윗선도 어둡다. 가운데 농장 탭 버튼의 솟은 머리가 딤 위로 밝게 남는다(N1, E06) |
| 17 | P3 손잡이에서 끌어내려도 안 닫힘 | 부분 해결(P3) | 좌표 스와이프 6번 중 4번 닫힘, 2번은 조금 내려왔다가 되돌아감(E31). 사람 손 확인 필요 |
| 18 | P3 상점 탭 전환 때 시트 높이 변함 | 해결 | 네 탭 모두 시트 윗변과 탭 줄 위치 동일(E27) |
| 19 | P3 탭 이름과 시트 제목이 다름 | 해결 | "생산" 탭 → "생산" 시트, en "Production"(E30) |
| 20 | P3 구역 해금 목표에서 해당 줄 강조 없음 | 해결 | "풍요 밭 열기" 줄 강조(E27 e1-sheet-a) |
| 21 | P3 한국어 줄바꿈이 단어 중간에서 일어남 | 해결(확인 범위) | 상점 설명은 "연구 / Lv.3 필요"처럼 띄어쓰기에서 바뀜, SE 목표 칩 한 줄(E27, E24). 큰 글자 전체 화면은 보지 않음 |
| 22 | P3 큰 글자에서 HUD 수입 잘림, 밭 한 칸 | 부분 해결(범위 밖 잔여) | 수입 줄은 잘리지 않고 빠짐. 밭 한 줄 한 칸은 밭 격자 동작으로 그대로(E25) |
| 23 | P3 초기화 뒤 같은 실행에서 미루기 미적용 | 의도(동작 기록) | 초기화 → 온보딩 직후 출석 시트 → 공방 안내가 이어짐(E35 g-sheet-b) |
| 24 | P3 오늘의 작물 배지가 명성 별과 같음 | 해결 | "📅×2" 달력 배지(E18, E26) |

## 새 발견

심각도: P1 출시를 막음, P2 출시 전 고쳐야 함, P3 작은 문제. 1회차 #9의 남은 범위(P2)는 위 표에 적었고 여기서는 새로 찾은 것만 적는다.

1. **N1 P3 스포트라이트 중 가운데 "농장" 탭 버튼의 머리가 딤 위로 밝게 남는다.** 탭 바 위로 솟은 원형 버튼 윗부분(크림 테두리와 초록, 약 25px 높이)이 딤 없이 원래 색 그대로다(딤 아래 배경 RGB 115,101,81 대 해당 부분 255,243,214). 밝힌 칸 말고도 밝은 곳이 생겨 시선이 갈린다. 탭 바 차단막(`game-tab-bar-blocker`)이 가운데 버튼의 솟은 영역까지 덮게 한다. 증거 E06.
2. **N2 P3 새 세이브로 농장에 들어갈 때 약 0.48초 동안 딤 없는 메인 화면이 보였다가 스포트라이트가 덮인다.** ko(pts 14.65→15.13초)와 en(9.98→10.46초) 모두 같다. en에서는 이 사이 더보기 버튼에 배지 "2"가 보인다(AC-1의 배지 숨김과 어긋남). 깜빡임으로 보이고 그 사이 탭이 메뉴로 갈 수 있다. 온보딩 단계가 정해질 때까지 딤과 배지 숨김을 먼저 그린다. 증거 E09.
3. **N3 P3 첫 수확 직후 약 4프레임(60~70ms) 동안 딤이 풀린 메인과 예전 흰 안내 카드 "다 자란 작물을 눌러 수확해요! 2/3 건너뛰기"가 깜빡인 뒤 보상 팝업이 뜬다.** 일반 실행(pts 127.59~127.65초)과 동작 줄이기 실행(20.82~20.84초) 모두 보인다. 정정 기록상 "다 자란 칸이 없는 수확 단계"의 기존 카드가 보상 팝업이 뜨기 전 한순간 렌더되는 것으로 보인다. 수확 순간 보상 팝업과 딤을 같은 프레임에 그리거나 그 사이 카드 렌더를 막는다. 증거 E10.
4. **N4 P3 설치 직후 새 세이브인데 "농장 기록을 불러왔어요./Farm records loaded." 토스트가 스포트라이트 딤 위에 뜬다.** 불러올 기록이 없는 신규 사용자에게 사실과 다른 안내이고, 첫 안내 말풍선과 함께 읽을 것이 둘이 된다. 저장된 세이브를 실제로 불러왔을 때만 띄운다. 증거 E40(ac12-ftue-en), E09.
5. **N5 P3 개척 지도의 명성 스킬 "시작 자금" 설명에 금액 뒤 "G"가 남아 있다.** 화면 "개척 후 시작 골드가 레벨당 10만G 늘어나요."(ko). `packages/farm-core/src/i18n/labels/{ko-KR,ja,zh-Hans,zh-Hant}.ts` 284행 `starting_capital.description`이 "10만G/10万G/10 萬G"이다(en·de·es·fr은 G 없음). AC-10 "금액에 G 없음"에 걸린다. 증거 E38.
6. **N6 P3 시트에서 받은 보상의 토스트가 HUD 줄 위에 떠 금액이 오르는 순간 골드 칩을 가린다.** 룰렛 "룰렛에서 +225 🪙 획득!"은 골드 칩 숫자 오른쪽 절반과 단위를, 미션 "미션 보상 337 🪙 받았어요!"는 수입 줄과 별 칩을, 상점 부족 안내도 같은 자리를 덮는다. 코인이 골드 칩으로 날아가 숫자가 오르는 장면이 토스트에 일부 가려진다. 시트 토스트를 시트 윗변 바로 위나 HUD 아래 목표 칩 줄 높이로 내린다. 증거 E34(spin-4fps), E33(claim-5fps), E11(c1-03-short-row-tap).
7. **N7 P3 iPhone SE에서 씨앗 카드가 시안보다 커서 밭이 덜 보인다.** SE en 2-harvest에서 밭은 약 1.6줄, 씨앗 카드는 2.5장이 보인다. 시안 B-main-se는 약 2.4줄과 4장이다. en 목표 칩이 두 줄이 되는 것도 높이를 더한다. B안의 장점(밭이 크게 보임)이 작은 화면에서 줄어든다. 1회차 SE 캡처도 같아 이번 수정으로 생긴 것은 아니다. 좁은 화면에서 씨앗 카드 높이와 너비를 시안 비율로 줄인다. 증거 E40(ac12-main-se).
8. **N8 P3 SE에서 모두 수확 버튼 글자가 오른쪽 곡선 끝까지 붙는다.** ko "모두 수확 14", en "Harvest All 14", de "Alle 15 ernten"의 마지막 글자가 버튼 끝 곡선에 닿고, es "Cosechar todo 14"는 약 9pt까지 줄어든다. 읽을 수는 있다. 버튼 안쪽 오른쪽 여백을 곡선 반지름만큼 둔다. 증거 E22(l-se-harvestall-3x).
9. **N9 P3 첫 세션 해금 뒤 기능 안내가 알림 안내를 닫자마자 바로 뜬다.** 출석 → 알림 → 공방 안내가 약 20초 안에 세 번 이어진다. 설계 정정은 광고 제안에만 60초 간격을 두었으므로 결함이라기보다 확인 요청이다. 해금 직후 3연속 팝업이 첫 목표 달성의 여운을 끊을 수 있어 기능 안내에도 간격을 둘지 결정이 필요하다. 증거 E13, E15.

관찰(결함으로 세지 않음): 첫 밭이 아닌 밭 구매 직후 기존 진행 마일스톤 전면 광고가 바로 떠서 "밭을 넓혔어요" 토스트와 칸이 늘어나는 장면을 가린다(E27 e1-sheet-b, 기존 지면이라 범위 밖). 첫 세션 해금 전에 당근 숙련 "Bronze" 연출이 2.5초 뜬다(AC-7 숙련 보상 연출로 미루기 대상이 아님, E12).

## 실행하지 못한 것과 이유

- 효과음, 탭음, 진동, 효과음 끄기 설정(AC-7, AC-8의 소리 부분): 지시대로 시뮬레이터에서 판정하지 않았다.
- 수확 보너스 광고 제안의 "다른 자동 팝업 뒤 60초" 양성 경로: 해금 뒤 기능 안내를 닫고 약 27초 수확하는 동안 광고 제안은 뜨지 않았으나, 그 직후 전면 광고(10분 유예 경과)가 먼저 떠 60초 뒤 실제로 뜨는지는 확인하지 못했다.
- 동작 줄이기의 보상 팝업 빛살 회전, 가기 버튼 튕김, 룰렛·복귀·미션 연출: 출석과 첫 수확 보상만 확인했다.
- 시트 손잡이 끌기의 사람 손 확인: Maestro 합성 제스처로만 시험했다.
- Pro Max 큰 글자, de·es·ja·zh의 시트 내부 문구: 계획 범위(메인 화면, SE 큰 글자)를 넘어 보지 않았다.
- 계측 5종(AC-11): 화면에서 관찰할 수 없어 확인하지 않았다.
- 실기기(Android, iPhone): 지시대로 쓰지 않았다.

## 증거 목록

모든 증거는 아래 폴더에 있고 저장소에는 넣지 않았다. 원본 Maestro 출력은 `maestro/`, 흐름 파일은 `flows/`, 보조 스크립트는 `tools/`, 녹화는 `video/`에 있다. 폴더 크기는 약 2.5GB(대부분 녹화)다.

`smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/`

| 번호 | 절대 경로 | 내용 |
|---|---|---|
| E01 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/a1-sheet-1.jpg | 타이틀, 스포트라이트, 칸 밖 탭 뒤, 수확 직후(ko Pro Max) |
| E02 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/a1-sheet-2.jpg | 보상 팝업, 계속하기 뒤 메인 |
| E03 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/video/a1-launch-onboarding-ko-pm.mp4 | 온보딩 전체 녹화(ko Pro Max) |
| E04 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/a1/harvest-10fps.jpg | 코인이 골드 칩으로 날아가고 50→64, +0→+14 |
| E05 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/a1-02-spotlight-zoom-top.png | 말풍선, 사각 테두리와 구멍, 건너뛰기 링크(하단은 a1-02-spotlight-zoom-bottom.png) |
| E06 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/a1-02-farm-tab-undimmed-zoom.png | 가운데 탭 버튼 머리가 딤 위로 밝음(N1) |
| E07 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/a2-sheet.jpg | 건너뛰기 → 계속 안내받기 → 막힘 → 건너뛰기 확정 |
| E08 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/a3/wait2-2fps.jpg | 보상 팝업 무행동 약 8초 뒤 닫힘 |
| E09 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/enter-undimmed-ko-en.jpg | 진입 직후 딤 없는 0.48초 프레임 ko, en(N2) |
| E10 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/a1/tap-passthrough.jpg | 수확 직후 옛 안내 카드 깜빡임(N3, 동작 줄이기 실행은 frames/rm2/tap-passthrough.jpg) |
| E11 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/c1-sheet-a.jpg | en 진행 중 목표 칩, 상점 강조, 부족 토스트, 사지 않고 닫기 |
| E12 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/c1/overview-3s.jpg | 첫 세션 9분 3초 간격 프레임(원본 video/c1-first-session-en-pm.mp4) |
| E13 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/c2-sheet-a.jpg | 목표 준비 완료, 가기, 구매, 출석 시트(HUD 그대로) |
| E14 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/c2/daily-gotit-10fps.jpg | Got it 뒤 코인과 4→54, 알림 안내 |
| E15 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/c2-sheet-b.jpg | 알림 안내 → 공방 기능 안내 |
| E16 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/c3-sheet.jpg | 해금과 10분 경과 뒤 전면 광고(양성 경로) |
| E17 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/c1-08-toolrow-zoom.png | "Plant All 6 · 60" 은색 코인(목표 칩은 c1-08-goal-zoom.png) |
| E18 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/d1-ko-pm-sheet.jpg | 4-grown 도구 줄, 비료 한 번 누름과 해제, 모두 수확(확대 d1-ko-pm-02-toolrow-zoom.png) |
| E19 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/d1/toasts-crop.jpg | 비료 확인 토스트, 수확 토스트, 전체 비료 주 버튼 은색 코인 |
| E20 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/d3-sheet.jpg | 전체 비료 두 번 눌러 실행(74억→70.5억) |
| E21 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/d2-sheet.jpg | 수확 후 재심기 |
| E22 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/l-se-4grown-sheet.jpg | SE 4-grown ko·en·de·es(도구 줄 확대 l-se-4grown-toolrow-zoom.png, l-se-harvestall-3x.png) |
| E23 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/l-pm-4grown-sheet.jpg | Pro Max 4-grown en·de·es·ja·zh-Hans(2-harvest는 l-pm-2harvest-sheet.jpg, 확대 l-pm-4-grown-ja-zoom.png, l-pm-4-grown-zh-Hans-zoom.png) |
| E24 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/l-se-2h-1i-sheet.jpg | SE ko·en 2-harvest, 1-initial 목표 칩 |
| E25 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/l-se-axl-sheet.jpg | SE accessibility-extra-large |
| E26 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/d3-03-hud-zoom.png | HUD "70.5억" 단위 굵기(씨앗 카드는 d3-03-seed-zoom.png) |
| E27 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/e1-sheet-a.jpg | 구역 목표 강조, 상점 네 탭 높이 고정(구매·광고는 e1-sheet-b.jpg, 반영은 e1-ko-pm-10-after-ad-close.png) |
| E28 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/f1/claim-5fps.jpg | 받고 시작하기 → 코인 → 95.7억 → 광고(캡처 shots/f1-sheet.jpg, 녹화 video/f1-welcome-claim-ko-se.mp4) |
| E29 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/f2/close-10fps.jpg | 바깥 탭 닫기 → 코인 → 95.7억, 광고 없음(캡처 shots/f2-sheet.jpg) |
| E30 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/h1-sheet-a.jpg | 하단 탭과 헤더 칩이 여는 시트(나머지 h1-sheet-b.jpg) |
| E31 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/h2-sheet.jpg | 손잡이 끌기 400/300/500ms(추가 시도 h3-sheet.jpg, 되돌아감 frames/h3/last16s.jpg) |
| E32 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/j1/confirm-10fps.jpg | ko 출석 받았어요 → 코인과 4.85만→4.89만(캡처 shots/j1-sheet.jpg) |
| E33 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/j2/claim-5fps.jpg | 미션 수령 토스트 위치와 은색 받기 버튼(캡처 shots/j2-sheet.jpg) |
| E34 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/j3/spin-4fps.jpg | 룰렛 도는 동안 HUD 고정, 멈춘 뒤 상승, 토스트가 HUD를 가림(캡처 shots/j3-sheet.jpg) |
| E35 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/g-sheet.jpg | 설정 초기화, 취소, 입력 확인, 새 농장(초기화 뒤 팝업은 g-sheet-b.jpg) |
| E36 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/g6-sheet.jpg | 밀 4칸 심기, 강제 종료 뒤 복원(부족 토스트 frames/g8/short-toast-zoom.png) |
| E37 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/k1/toolrow-4fps.jpg | 눌림 상태(토스트 차례는 frames/k1/overview.jpg, 연타는 shots/k1-sheet.jpg) |
| E38 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/h1-ko-pm-06-stars-zoom.png | "10만G" 잔존(N5) |
| E39 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/frames/rm1/confirm-10fps.jpg | 동작 줄이기 출석(캡처 shots/rm1-sheet.jpg, 온보딩 frames/rm2/tap-10fps.jpg) |
| E40 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/compare/ | 시안 대 실행 ac12-main-en.jpg, ac12-main-ko.jpg, ac12-main-se.jpg, ac12-ftue-en.jpg, ac12-reward-en.jpg |
| E41 | smb://nas1dual/Data/Backup/agent-artifacts/happy-farm/2026-11-27/7c44df7/game-ui-review/round-2/shots/skin-seam-junction-r2.png | 3분할 스킨 경계 4배 확대(끝 조각은 skin-seam-zoom-r2.png) |
