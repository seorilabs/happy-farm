# UI 검수 1/3

## 실행 전 계획

- 설계 ID·조건 ID·후보 SHA·변경점: `2026-10-13-ios-no-tracking-consent`, AC-5(AC-3 실제 실행 포함), 후보 `1366729e610d7a974fb75ff0299ebf9494e256e3`. iOS에서 Google 광고 동의 창(UMP)을 띄우지 않고 남은 `IABTCF_*` 기록을 지우며, 설정의 "광고 개인정보" 섹션이 사라진다.
- 계획 작성 시각·실행 순서·통과 기준: 2026-10-13T08:25:00Z. 아래 표 순서대로 실행한다. 모든 항목의 기능·UX 기대 결과를 충족하면 통과다. 하나라도 어긋나면 해당 항목 실패로 기록하고 범위 안에서 수정한 뒤 그 문제만 재확인한다.
- 구현자·다른 리뷰 에이전트·페르소나: 구현자는 작성 세션이다. 검수자는 별도로 띄운 리뷰 에이전트이며, 이 회차의 페르소나는 요구사항 검수자와 처음 사용자다. 새 화면·문구가 없어 UX 전문 역할은 두지 않는다.
- 실제 환경·격리 계정·데이터·저장 경로: iOS 시뮬레이터 `iPhone 18 Pro`(iOS 27.0, `7F3E769F-A3B7-4D5C-832D-9FB17C249DBC`), Debug 빌드와 Metro 8081. 앱을 새로 설치해 쓴다. 저장 경로는 `simctl get_app_container … data` 아래 `Library/Application Support/com.seorilabs.happyfarm/RCTAsyncLocalStorage_V1/`이고, 동의 기록은 `Library/Preferences/com.seorilabs.happyfarm.plist`다. 조작은 `~/.local/share/seorilabs/idb/venv`의 idb다. 사용자 기기·계정은 쓰지 않는다. 개발 빌드는 AdMob 테스트 광고 단위를 쓴다.
- 핵심 기능 전체 목록: `app-launch-shell`, `title-startup`, `onboarding`, `planting`, `growth-harvest`, `shop`, `welcome-back-offline`, `save-restore`, `reset-farm`
- 이어받는 영향 없는 기반 기능: 없음(기준 실행 없음)

| 항목 | 기능 기대 결과 | UX 기대 결과 | 오류·복구 재현 | 남길 증거 |
|---|---|---|---|---|
| 1. 새 설치 실행 (`app-launch-shell`) | 크래시 없이 스플래시 → 타이틀 | 노치·홈 표시줄과 겹치지 않음 | — | 캡처, 시스템 로그 |
| 2. 동의 기록 주입 후 진입 (`title-startup`, AC-3) | 첫 실행 뒤 앱을 끄고 `IABTCF_TCString`·`IABTCF_gdprApplies`·`IABTCF_PurposeConsents`를 plist에 넣는다. 재실행 → 로딩 완료 → 진입 | 진행 표시와 진입 버튼이 읽힘 | — | plist 전후 출력 |
| 3. 동의 창 없음 (AC-5) | 진입 후 30초 동안 Google 동의 창이나 웹 시트가 뜨지 않고, plist에서 `IABTCF_*` 키가 사라짐 | 농장 화면이 바로 조작 가능 | — | 캡처, plist 출력, 로그 |
| 4. 온보딩 (`onboarding`) | 자동으로 심은 당근 수확 → 보상 확인 → 심기 단계 | 안내 문구가 다음 행동을 알려 줌 | 15초 방치 시 힌트 | 캡처 |
| 5. 심기 (`planting`) | 씨앗 선택 → 빈 밭 탭 → 골드 차감·새싹 | 선택 상태가 보임 | 골드 부족 씨앗 탭 시 안내 | 캡처 |
| 6. 성장·수확 (`growth-harvest`) | 성장 완료 후 탭 → 골드 증가·연출 | 수익이 눈에 띔 | — | 캡처 |
| 7. 상점 (`shop`) | 밭 개간 1회와 업그레이드 1회 구매 | 탭·가격·잔액이 읽힘 | 잔액 부족 항목이 비활성 | 캡처 |
| 8. 보상 광고 (AC-5) | 성장 중 밭의 광고 단축 또는 수확 부스트 → 테스트 광고 시청 → 보상 반영 | 광고 전후 상태 변화가 이해됨 | 광고를 닫았을 때 보상 없음 안내 | 캡처, 로그 |
| 9. 설정 (AC-5) | 설정 시트에 "광고 개인정보" 섹션이 없음. 소리·진동 토글이 동작함 | 섹션 누락으로 빈 간격이 생기지 않음 | — | 캡처 |
| 10. 저장 복원 (`save-restore`) | 앱 종료 후 재실행 시 골드·밭이 그대로 | "저장 불러옴" 안내 | — | 캡처, 저장 파일 |
| 11. 복귀 요약 (`welcome-back-offline`) | 종료 상태에서 `lastSeen`을 8시간 전으로 바꾸고 재실행 → 복귀 요약과 오프라인 골드 | 받을 보상이 명확함 | — | 캡처 |
| 12. 초기화 (`reset-farm`) | 설정 → 초기화 → 확인 단어 입력 → 새 온보딩 | 파괴적 동작 전에 확인을 요구함 | 틀린 단어는 삭제 안 됨 | 캡처 |

## 실행 후 관찰·판정

- 검수자: 별도로 띄운 리뷰 에이전트(구현에 참여하지 않음). 페르소나: 요구사항 검수자 + 처음 사용자.
- 시작: 2026-10-13T08:31:27Z(새 설치 08:31Z, 첫 실행 08:32:07Z). 관찰 종료: 2026-10-13T09:10:07Z(앱 종료). 보고서 작성 완료: 2026-10-13T09:12:49Z.
- 후보 SHA: `1366729e610d7a974fb75ff0299ebf9494e256e3`. 시작 시 작업 트리 HEAD는 `340d23b`(후보 이후 이 계획 문서만 추가)였다.
- **후보 SHA 불일치(작업 트리 코드 혼입)**: Metro가 구현자 작업 트리를 서빙했다. 08:43:40Z~08:44:21Z에 미커밋 코드가 바뀌었고(설정 "Ads and your data" 섹션, `FarmGame.tsx`, `App.tsx`, `adDataPolicy.ts`, 8개 언어 문구 → 이후 커밋 `40af0d4`), 08:51:11Z에 `apps/mobile/src/ads/adMobConsent.ts`도 바뀌었다(이후 커밋 `bdbae86` "동의 기록 삭제를 네이티브 deleteValues로…").
  - 08:43:40Z 이전 관찰(후보 코드): 항목 1, 2, 3(1·2차), 4의 1차(수확·보상·멈춤 08:41Z).
  - 08:43:40Z 이후 관찰(혼입 코드): 항목 4의 대기 힌트·2차 재현, 5~12. 이 중 8(08:53Z~)·9·10·11·12는 `adMobConsent.ts` 변경(08:51Z) 이후다.
- 증거 폴더: `~/.local/share/seorilabs/evidence/happy-farm/2026-10-13-ios-no-tracking-consent/round-1/` (파일명은 항목 번호로 시작).
- 계획 밖 조작 공개: 항목 3 원인 확인을 위해 08:39Z 타이틀 화면에서 Metro 디버거 연결(Runtime.evaluate)로 RN 내장 `SettingsManager`를 직접 호출해 QA 앱의 테스트 키 2개(`IABTCF_TCString`에 `setValues(null)`, `IABTCF_gdprApplies`에 `deleteValues`)만 건드렸다. 그 외 디버거 사용은 읽기 전용(콘솔 버퍼, React 모달 상태 조회)이다.

| 항목 | 실제 관찰·증거 | 기능/UX 문제·사용자 영향 | 수정 제안 | 판정 |
|---|---|---|---|---|
| 1. 새 설치 실행 | 08:31Z 삭제·재설치 후 08:32:07Z 실행. 흰 런치 화면 → 20초 안에 타이틀("Your farm is ready", Enter Farm). 크래시 없음(로그 E/F 줄은 시뮬레이터 잡음뿐). 노치·홈 표시줄과 겹침 없음. `01-launch-splash.png`, `01-title.png`, `02-launch-screen.png`, `01-applog-errors.txt` | 기능 문제 없음. 범위 밖 기존 문제: 런치 화면이 RN 템플릿 그대로("HappyFarmMobile / Powered by React Native", `LaunchScreen.storyboard`). 처음 사용자가 매 실행마다 개발용 화면을 본다 | 브랜드 런치 화면으로 교체(별도 티켓) | 통과 |
| 2. 동의 기록 주입 후 진입 (AC-3 준비) | 첫 실행 뒤 종료, `defaults write`로 `IABTCF_TCString=CQtestTCString`, `IABTCF_gdprApplies=1`, `IABTCF_PurposeConsents=11111111111` 주입·확인. 08:33:49Z 재실행 → 약 3초 만에 진행 막대 완료·"Your farm is ready" → 08:34:15Z 진입. `02-plist-before-launch.txt`, `02-title-ready.png` | 없음 | — | 통과 |
| 3. 동의 창 없음 (AC-5, AC-3) | 진입 후 30초(t02·t10·t20·t30) 동안 Google 동의 창·웹 시트 없음, 농장 바로 조작 가능. 전체 로그에서 UMP 흔적(fundingchoices·UMP 클래스) 0건, 광고 요청(doubleclick 98건)은 정상. **그러나 `IABTCF_*` 3개 키가 남음**: 1차(08:37:04Z 종료 후)·2차(08:39:31Z 종료 후) 모두 plist·cfprefsd 양쪽에 그대로. 광고 SDK 초기화는 됨(`__gads__.plist` 08:34Z 생성, JS 콘솔에 전면 광고 로드 시도), `[ads] consent record cleanup failed` 경고 없음. 진단: 같은 앱에서 `SettingsManager.setValues({IABTCF_TCString:null})`은 키가 남고 `deleteValues(['IABTCF_gdprApplies'])`는 즉시 삭제됨. `03-farm-t*.png`, `03-plist-after-enter*.txt`, `03-diagnostic-setValues-null-vs-deleteValues.txt`, `03-applog-ump-att-scan.txt`, `03-js-console-attempt2.txt` | **AC-3 미충족.** RN 0.85 새 아키텍처(TurboModule)는 객체 인자 안의 `null`을 버린다(`RCTTurboModule.mm` `convertJSIObjectToNSDictionary`, 기본값 `enableModuleArgumentNSNullConversionIOS=false`). 그래서 `Settings.set({key:null})`은 네이티브에 빈 사전으로 도착해 아무것도 지우지 못한다. 단위 테스트는 `Settings.set` 호출 인자만 봐서 통과했다. 영향: 1.11.x에서 동의한 EEA·영국·스위스 iOS 사용자의 오래된 동의 기록이 계속 남아 광고 SDK가 읽는다(설계 목적 위반, 사용자는 바꿀 방법 없음) | `NativeSettingsManager.deleteValues(keys)`로 삭제(구현자가 08:51Z 작업·커밋 `bdbae86`으로 이미 반영 중). 단위 테스트는 mock 인자 대신 "삭제 API 호출"을 고정하고, 다음 회차에 후보 SHA 전용 체크아웃에서 같은 주입·확인을 다시 실행 | 실패 |
| 4. 온보딩 | 08:40:06Z 진입(2/3 "Harvest when ready") → 당근 수확: "First Harvest! +15G", "NEW CROP! Carrot" → 3/3 "First harvest complete!" Continue. **08:41:09Z Continue 직후 화면은 정상처럼 보이지만 모든 탭이 무반응**(씨앗 선택, 설정 톱니), 접근성 트리는 앱 요소 1개만 남음, 홈으로 나갔다 돌아와도 그대로. 로그: `17:41:10.437 KST Attempt to present <RCTFabricModalHostViewController> … while a presentation is in progress`. React 상태: 알림 안내 모달(`NotificationPromptOverlay`) visible=true인데 화면에 없음. 앱 강제 종료·재실행 후에야 알림 안내("Turn on farm reminders?")와 "The workshop is open" 안내가 정상 표시. 2차(초기화 후, 혼입 코드): 수확 09:07:24Z → 보상 단계 8초 자동 완료(09:07:32Z) 때 `… which is already presenting …` 로그와 함께 같은 증상(탭 무반응, 알림 모달 visible=true·미표시). 대기 힌트: 재실행 후 수확 단계에서 약 16초에 "Tap a plot to harvest." 토스트와 밭 테두리 강조 확인(혼입 코드). `04-reward-confirm.png`, `04-stuck-after-continue-2min.png`, `04-stuck-after-background-foreground.png`, `04-stuck-evidence.txt`, `04-relaunch-after-stuck.png`, `04-stall-hint-16s.png`, `04-attempt2-stuck-evidence.txt`, `04-attempt2-stuck-gear-tap.png` | **P0 기능·UX 결함**: 처음 사용자가 튜토리얼을 마치는 순간(버튼 또는 8초 자동 완료) 게임이 멈춘 것처럼 보이고 어떤 조작도 안 된다. 앱을 강제 종료해야만 복구된다. 온보딩 완료 시 알림 권한 안내 모달과 다른 모달(지연된 출석 보너스 시트 또는 기능 안내로 추정, 미확정)이 거의 동시에 표시되며 두 번째 표시가 실패하고, 남은 투명 모달 계층이 터치를 막는 것으로 보인다. 후보 변경과 직접 관련은 없어 보이나 1차는 후보 코드에서 재현됐다. 부수: en-US 안내 한 줄이 "Pick a seed below and plant it in an…"으로 잘려 다음 행동이 끝까지 안 읽힌다 | 전면 모달을 한 번에 하나만 띄우는 큐(앞 모달의 `onShow`/`onDismiss` 이후 다음 표시)로 직렬화하고, 알림 안내는 다른 모달·시트가 완전히 닫힌 뒤에만 띄운다. 새 설치 → 첫 수확 → Continue와 8초 자동 완료 두 경로를 E2E로 고정. 안내 문구는 두 줄 허용 또는 짧은 en-US 문구 | 실패 |
| 5. 심기 | (혼입 코드) Carrot 선택 시 초록 강조·"Plant Carrot · 10G · ROI +50%"·"Plant All 6 · 60G" 표시 → 빈 밭 탭: 115G→105G, 새싹·남은 1초 표시. 골드 부족 Sweet Potato(135G) 선택 후 빈 밭 탭: "Not enough gold." 토스트, 골드 변화 없음. `05-seed-selected-carrot.png`, `05-planted.png`, `05-unaffordable-plot-tap.png` | 기능 문제 없음. 경미: 씨앗 카드 이름 "Sweet P…" 잘림 | 씨앗 카드 이름 2줄 허용 또는 글자 축소 | 통과 — 후보 SHA 불일치(작업 트리 코드 혼입) |
| 6. 성장·수확 | (혼입 코드) 성장 완료(GET) 후 탭: 110G→125G, "Harvested +15G." 토스트, HUD 즉시 반영. 첫 수확 때는 "First Harvest! +15G" 연출. `06-ready-before-harvest.png`, `06-harvest-effect-2a.png`, `04-harvest-tap-0_6s.png` | 기능 문제 없음. 관찰: 두 번째 수확 직후 "Harvest Bonus"(광고 시청 권유) 시트가 자동으로 떠 수익 피드백을 가렸다(`06-harvest-effect.png`) | 자동 권유 시트는 수확 토스트가 끝난 뒤 띄우거나 빈도 제한 | 통과 — 후보 SHA 불일치(작업 트리 코드 혼입) |
| 7. 상점 | (혼입 코드) 125G일 때 "Clear a plot 300G"·"Open Vegetable Field" 흐리게, 접근성 enabled=false, 탭해도 변화 없음. 밀 재배로 1.83KG 확보 후 Clear a plot: 1.83K→1.53K, "7 plots now", "Your farm got a new plot." / Growth Fertilizer 900G: 1.53K→632G, Lv.2, "Research complete." 구매 후 Better Sales Route(1.5KG)는 흐림 처리. `07-shop-open.png`, `07-disabled-clear-plot-tap.png`, `07-after-clear-plot.png`, `07-after-upgrade.png` | 기능 문제 없음. 경미: 탭을 바꿀 때 시트 높이가 크게 바뀌어 위치가 튄다 | 시트 높이 고정 또는 부드러운 전환 | 통과 — 후보 SHA 불일치(작업 트리 코드 혼입) |
| 8. 보상 광고 (AC-5) | (혼입 코드, 08:51Z `adMobConsent.ts` 변경 이후) 수확 부스트 → 테스트 보상 광고 2편 → 닫기 → "Harvest rewards are 1.5x for 30m.", 칩 "30m", ROI 갱신. 상점 Rewards "plot discount" 광고 → "Discount applied — unlocked 1 plot for 262G!". 행운 바퀴 추가 회전 광고 → +150G. 모두 수확 3회 뒤 전면 테스트 광고도 표시·닫힘. 어떤 광고 전에도 동의 창 없음. 보상 없이 닫기: 2회 시도 모두 테스트 광고가 "리워드 지급됨" 전까지 닫기 버튼을 주지 않아 재현 불가. `08-rewarded-ad-showing.png`, `08-after-rewarded-close.png`, `08-after-discount-ad.png`, `08-wheel-bonus-spin-result.png`, `08-interstitial-test-ad-after-3-harvest-all.png`, `08-dismiss-attempt2-no-close-button-6s.png` | 보상 경로 문제 없음. "광고를 닫았을 때 보상 없음 안내"는 관찰하지 못함 | 2회차(광고 실패·취소·재시도)에서 네트워크 차단·광고 로드 실패·앱 전환 등으로 취소 경로 확인 | 차단(보상 경로는 정상) — 후보 SHA 불일치(작업 트리 코드 혼입) |
| 9. 설정 (AC-5) | (혼입 코드) "Ad privacy options" 버튼(`ad-privacy-options`) 없음, 빈 간격 없음. 대신 계획 밖 새 섹션 "Ads and your data"(고지 문단 + "How Google uses data")가 있음 — 범위 밖이라 관찰만 기록. Effects·Haptics 토글 끄기/다시 켜기가 화면에 반영됨(다시 켠 값 true가 `happy-farm:settings:v1`에 저장된 것 확인). `09-settings-top.png`, `09-toggles-off.png`, `09-settings-bottom.png` | 후보 화면 자체(광고 섹션이 아예 없는 배치)는 관찰하지 못했다. 범위 밖 관찰: 토글의 켜짐/꺼짐 상태가 접근성 값으로 노출되지 않음(VoiceOver 사용자 상태 확인 불가). "Weather effects" 켜짐인데 설명이 "Hide rain and snow particles…"라 의미가 반대로 읽힘 | 다음 회차 후보 SHA 전용 Metro에서 재확인. 토글에 `accessibilityRole="switch"`·`accessibilityState={{checked}}`. 날씨 설명 문구를 켜짐 기준으로 수정 | 통과(혼입 코드 기준) — 후보 SHA 불일치(작업 트리 코드 혼입) |
| 10. 저장 복원 | (혼입 코드) 720G·밭 8칸 밀(수확 가능)·부스트 상태로 08:58:53Z 종료 → 재실행·진입 → 720G, 밀 8칸 GET, 부스트 26m, "Farm records loaded." 토스트. `10-before-terminate.png`, `10-restored-0_8s.png`, `10-save-before-relaunch/` | 없음 | — | 통과 — 후보 SHA 불일치(작업 트리 코드 혼입) |
| 11. 복귀 요약 | (혼입 코드) 1차: 모든 밭이 수확 가능 상태로 저장된 채 `lastSeen`=−8h → "Welcome Back! … away for 8h 1m", "Crops ready to harvest 8 plots", 오프라인 골드 항목 없음(코드상 오프라인 골드는 성장 중인 밭만 계산). 2차: 고구마 8칸 성장 중 저장 → `lastSeen`=−8h → "Earnings while you were away +778KG", "8 plots", 버튼 "Harvest now"·"Watch ad for 2× · 1.56MG total"·"Collect +778KG and play" → 수령 2.02K→780KG. `11-welcome-back.png`, `11-attempt2-welcome-back.png`, `11-attempt2-after-collect.png`, `11-*-save-backup-*`, `11-*edit.txt` | 받을 보상은 명확. 경미: "Farm records loaded." 토스트가 요약 시트의 주 버튼 글자·"8 plots"를 약 2초 가린다. 범위 밖: 보유 2K에 오프라인 +778K는 균형 검토 필요 | 복귀 요약이 뜰 때는 "불러옴" 토스트 생략 또는 시트 밖 위치 | 통과 — 후보 SHA 불일치(작업 트리 코드 혼입) |
| 12. 초기화 | (혼입 코드) 설정 → "Reset farm save" → "Start Over" 시트(경고 문구, 입력칸). 틀린 입력(시뮬레이터 한글 자판으로 "ㄲㄸㄴㅆㄸ") → 삭제 버튼 비활성(enabled=false), 탭해도 780KG 유지. "RESET" 입력 → 활성 → 09:05:24Z 삭제 → 새 온보딩(2/3, 자동 당근) 시작, 50G+출석 50G. `12-reset-confirm.png`, `12-wrong-word-typed.png`, `12-wrong-word-delete-tapped.png`, `12-correct-word-typed.png`, `12-after-reset.png`, `12-new-onboarding.png` | 기능 문제 없음. 경미: 초기화 직후 출석 보너스 시트가 온보딩 안내 위에 바로 겹쳐 뜬다. 새 온보딩 완료 시 항목 4 멈춤이 다시 발생 | 초기화 직후 출석 시트는 온보딩 완료 뒤로 미루기 | 통과 — 후보 SHA 불일치(작업 트리 코드 혼입) |

항목 밖 관찰:

- ATT: 세션 전체에서 SDK의 `trackingAuthorizationStatus` 조회가 212회 있었고 `requestTrackingAuthorization` 호출과 ATT 창은 0회다. 조회만으로는 창이 뜨지 않는다(기록용).
- HUD의 "About 308K G/hr"가 50G 시작 상태에서도 표시된다. 처음 사용자에게 과장된 수익 기대를 줄 수 있어 산식 확인을 권한다(범위 밖).
- 개발 빌드 경고 토스트 "Open debugger to view warnings."가 하단 씨앗 줄을 가린다(개발 빌드 한정).

## 수정·재확인·남은 문제

| 번호 | 문제 | 정확한 재현 | 상태 | 다음 조치 |
|---|---|---|---|---|
| R1-1 (P1, AC-3) | iOS에서 `IABTCF_*` 동의 기록이 지워지지 않는다 | 새 설치 → 1회 실행 후 종료 → `simctl spawn … defaults write <container>/Library/Preferences/com.seorilabs.happyfarm IABTCF_TCString -string CQtestTCString`(+`IABTCF_gdprApplies -int 1`, `IABTCF_PurposeConsents -string 11111111111`) → 실행·Enter Farm·30초 대기 → 종료 → `defaults read` 시 3개 키가 그대로 | 구현자가 08:51Z `deleteValues`로 수정(커밋 `bdbae86`), 이번 회차에서 후보 SHA로는 미재확인 | 후보 SHA 전용 체크아웃·Metro에서 같은 절차로 재확인. 회차 종료 시 키가 없어진 것(`03-plist-end-of-round.txt`)은 08:51Z 이후 코드와 진단 실험의 결과라 근거로 쓰지 않는다 |
| R1-2 (P0) | 온보딩 완료 순간 화면 입력이 전부 막힌다 | 새 설치 → Enter Farm → 당근 수확 → "Continue" 탭(또는 보상 단계에서 8초 대기) → 이후 모든 탭 무반응, 로그에 `Attempt to present <RCTFabricModalHostViewController> … while a presentation is in progress`/`… which is already presenting …`. 앱 강제 종료 후 재실행하면 알림 안내가 정상으로 뜬다. 2/2 재현(후보 코드 1회, 혼입 코드 1회) | 미수정 | 모달 표시 직렬화 후 같은 두 경로(Continue, 8초 자동 완료)를 새 설치에서 재확인 |
| R1-3 | 보상 광고를 보상 전에 닫는 경로를 관찰하지 못함 | 테스트 광고가 보상 지급 전 닫기 버튼을 주지 않음(2회) | 차단 | 2회차 광고 취소·실패 범위에서 확인 |
| R1-4 | 검수 환경이 후보 SHA와 다름 | Metro가 작업 트리를 서빙, 08:43:40Z·08:51:11Z에 코드 변경 유입 | 구현자 인지 | 다음 회차는 후보 SHA 전용 체크아웃에서 Metro 실행, 시작 시 서빙 번들의 해당 코드 확인 |
| R1-5 (경미) | en-US 한 줄 안내 잘림("Pick a seed below and plant it in an…"), 씨앗 이름 잘림("Sweet P…"), 토글 접근성 상태 미노출, 날씨 토글 설명 반대 의미, 복귀 요약 위 토스트 겹침, 초기화 직후 출석 시트 겹침, RN 기본 런치 화면 | 각 항목 증거 참조 | 범위 밖·기존 동작 | 별도 이슈로 분리 권장 |

이번 회차 결론: 동의 창이 뜨지 않는 것(AC-5 화면·로그)은 후보 코드에서 확인했다. 그러나 동의 기록 삭제(AC-3)가 실패했고, 첫 사용자 흐름에서 P0 입력 멈춤이 재현됐다. 항목 5~12는 혼입 코드에서 관찰했으므로 후보 SHA 기준 통과로 볼 수 없다.

## 추가 진행 품의

해당 없음.
