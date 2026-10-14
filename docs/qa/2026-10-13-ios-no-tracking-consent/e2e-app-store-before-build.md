# 빌드 전 E2E — App Store v1.12.1

## 실행 전 계획

- 후보: v1.12.1 태그 `5fb1981ff01cb9eddd23282504f6c29aa0b8c062`, 대상 `app-store`, 단계 `before-build`
- 계획 시각: 2026-10-13T15:14:57Z (UI 검수 4회차 완료 2026-10-13T15:14:00Z 뒤)
- 실행 환경(`native-development`):
  - iOS 시뮬레이터 `iPhone 18 Pro`(iOS 27.0) Debug 앱. Metro는 태그 SHA 전용 worktree에서 띄운다.
  - 실기기 `iPhone 12 Pro`(iOS 26.6) Debug 앱. 같은 Metro를 LAN으로 쓰고, 기존 앱은 소유자 승인으로 삭제 뒤 새로 설치했다.
- 설정 지문: 아래 실행 설정 식별자를 이어 붙인 문자열의 SHA-256이다(비밀값 없음).
  - 앱 버전 1.12.1 / Apple 빌드 1012001, 번들 `com.seorilabs.happyfarm`
  - Debug 구성, AdMob 테스트 광고 단위
  - Platform `asia-northeast3` 엔드포인트
  - Firebase iOS 앱 설정 파일 SHA-256
  - `app-store/app-store.config.json` SHA-256
- 격리 데이터: 시뮬레이터는 매 시나리오 새 설치나 시드 주입을 쓴다(사용자 기기 데이터 아님). 실기기는 소유자 승인으로 기존 앱을 삭제한 뒤 새로 설치한 상태이며, 실기기에서는 초기화 같은 파괴적 조작을 하지 않는다.
- 이어받는 기반 기능: 없음(기준 실행 없음).

| 시나리오 | 흐름 | 기능 |
|---|---|---|
| E1 첫 사용자 | `IABTCF_*` 키 3개 주입 → 실행·타이틀·진입. 동의 창이 없고 키가 삭제되는지 확인 → 온보딩 수확·Continue → 출석 → 알림 안내 → 기능 안내 → 씨앗 선택·심기·모두 심기 → 성장 시트·비료 → 수확 → 상점(개간·업그레이드·장식) → 다음 목표 바·상태 시트 → 설정(광고 정보·Google 링크, 소리·진동·날씨·언어 전환) → 시트 닫기·더보기 → 강제 종료 후 재실행 복원 | app-launch-shell, title-startup, onboarding, planting, growth-harvest, shop, hud-goals-status, menus-sheets, settings, save-restore, ad-consent |
| E2 광고 | 성장 단축·수확 부스트·상점 보상 테스트 광고 시청 → 보상 확인 → 모두 수확 반복 후 전면 광고 → 닫은 뒤 반응 | rewarded-ads, interstitial-ads |
| E3 진행 농장 | 진행 농장 시드 주입(8개 구역, 47종 수확, 졸업 가능 골드, 출석·바퀴 가능) → 출석 → 행운 바퀴 → 미션 → 도감·업적 → 동물·공방·요리 → 연구·자동화·교배 → 지도·랜드마크·졸업 | daily-bonus-wheel, missions, collection-achievements, production, research-automation, prestige-map-landmark |
| E4 복귀·알림 | 성장 중 밭으로 종료 → `lastSeen` 8시간 전 → 재실행 → 복귀 요약 → "바로 수확"과 복귀 광고 → 알림 권한 안내 허용 → 예약 알림 확인 | welcome-back-offline, notifications |
| E5 초기화 | 설정 → 틀린 확인 단어 → RESET → 새 온보딩 8초 자동 완료 | reset-farm |
| E6 연결 기반 기능 | E1~E5 동안 앱 로그에서 Firebase 익명 인증·Analytics(`app-analytics-services.com`), Platform 세션·이벤트(`platform-api`·`platform-ingest`) 연결과 `Attempt to present`·UMP 흔적 0건을 확인한다 | firebase-auth-analytics, platform-session-events |
| E7 실기기 | iPhone 12 Pro에서 실행 → 진입 → 동의 창 없음 → 보상 광고 1회 → 설정 광고 정보 → 알림 권한. 기반 기능(광고·동의·알림·Firebase·Platform)의 후보당 1회 실기기 확인 | rewarded-ads, ad-consent, notifications, firebase-auth-analytics, platform-session-events |

## 실행 결과

결론: **E7 실패로 이 후보(v1.12.1, `5fb1981`)는 빌드하지 않았다.** 실기기에서 보상 광고 뒤 입력 멈춤을 찾았고, 설계 v4(#576)로 고친 뒤 v1.12.2로 다시 실행했다([e2e-app-store-before-build-v1.12.2.md](e2e-app-store-before-build-v1.12.2.md)).

| 시나리오 | 시각(UTC) | 판정 | 요약 |
|---|---|---|---|
| E1 첫 사용자 | 10-13 15:18~16:13 | 통과 | `IABTCF_*` 3개 주입 후 동의 창 없음·키 삭제, Continue 6.07초 탭, 설정 광고 정보·Google 링크·언어 전환, 강제 종료 후 복원 |
| E2 광고 | 16:13~16:18 | 통과 | 보상 3종(성장 단축·수확 1.5배·상점 할인) 보상 적용, 첫 "Harvest All" 전면 광고 닫은 뒤 반응. 광고는 모두 120초 안에 닫았다 |
| E3 진행 농장 | 15:15~16:27 | 통과 | 6개 기능 묶음 통과(iPhone SE). 랜드마크 1단계는 연쇄 농장 `lastCollectedAt`을 3.5시간 앞당긴 시드로 진행. 경미 D1(바퀴 상금 칸 잘림)·D2(업적 시트 스크롤 위치)는 #575에 추가 |
| E4 복귀·알림 | 16:18~16:23 | 통과 | 8시간 복귀 요약, "Harvest now" 뒤 광고 닫고 반응, 알림 권한 허용·예약 추가 |
| E5 초기화 | 16:23~16:24 | 통과 | 틀린 단어 차단, RESET 뒤 새 온보딩 8.19초 자동 완료 |
| E6 연결 기반 기능 | 15:17~16:24 | 통과 | 실행 5회 183,269줄에서 `Attempt to present`·UMP·ATT 요청 0건. platform-api·platform-ingest·app-analytics-services·AdMob·securetoken(HTTP 200) 연결 확인 |
| E7 실기기 | 10-13 23:16~23:46 | **실패** | iPhone 12 Pro(iOS 26.6). 1~5단계(진입·동의 창 없음·Continue·알림 허용·기능 안내)는 정상. 성장 시트의 보상 광고를 닫지 않고 두자 표시 120초 시간 제한이 결과를 끝내고 시트를 닫아, 광고만 내려가고 빈 시트가 모든 터치를 막았다(08:42:56 표시 → 08:44:55 KST `Snapshotting a view … not in a visible window`). 시뮬레이터에서도 재현(120.0초, 접근성 트리 요소 56 → 1), 33초에 닫은 대조 실행은 정상 |

- 증거: `~/.local/share/seorilabs/evidence/happy-farm/2026-10-13-ios-no-tracking-consent/e2e/`(E1~E6 파일), 실기기 콘솔 `scratchpad/e2e/device-logs/e7-console-4.log`, 재현 캡처 `scratchpad/e2e/repro-120s-*.png`.
- 실기기 콘솔 수집 중 멈춘 상태를 디버거로 읽으려다 앱이 종료돼(signal 9) 멈춘 화면의 컨트롤러 계층은 남기지 못했다. 원인은 시뮬레이터 재현으로 확인했다.
