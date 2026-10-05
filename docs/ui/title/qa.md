# 타이틀 화면 구현 검증

2026-10-05. 사용자 선택: **A — 아침 농장**. 기준 main: `9bcecf45642cb0287e7b5d9711981da39ceaa33c`. 후보 branch: `feat/title-screen`.

## Galaxy Note9 제품 화면

- 기기: Samsung SM-N960N, Android 10 / API 29. 기존 debug APK에 후보 worktree의 JavaScript와 로컬 아트를 Metro 8082로 제공했다. release APK 검증으로 간주하지 않는다.
- 기본 캡처: 1080×2220 px, density 420, font scale 1.0. 물리 패널은 1440×2960이며 작업 전의 크기 override를 유지했다. 상태·내비게이션 바를 포함한 원본 캡처다.
- 검수 전에 이 debug 앱은 기기에 설치되어 있지 않았다. 저장 초기화 명령은 사용하지 않았다. 첫 진입 뒤 생긴 실제 농장 저장은 보존했다.
- [한국어 준비 완료](runtime/note9-title-ready.png): 풍경 cover 크롭, 2단 로고, 초록 버튼, 하단 밝은 면을 A와 비교했다.
- [시작 후 농장](runtime/note9-game-after-start.png): 실제 시작 버튼 터치 후 농장과 기존 튜토리얼이 표시됐다.
- [홈에서 복귀](runtime/note9-game-resumed.png): HOME → 같은 Activity 재진입 뒤 농장과 50G 상태를 유지했고 타이틀을 반복하지 않았다.
- [검수 코드 제거 후 제품 화면](runtime/note9-title-final-product.png): 원래 진입 파일로 복원하고 새 프로세스에서 타이틀 표시를 다시 확인했다.

[시안과 실제 화면 비교](runtime/target-vs-runtime.png)에서 큰 화면의 로고·농장·진행 표시·시작 버튼 순서를 확인했다. 네이티브 Text 외곽선은 별도 글자 레이어로, 밝은 하단은 투명 그라데이션 이미지로 구현했다. 정적 이미지의 intrinsic 크기가 cover 표시를 깨뜨리던 초기 구현을 명시적인 가로·세로 100%로 수정한 뒤 다시 캡처했다.

## 같은 컴포넌트의 기기 검수용 상태

아래 캡처는 실제 `FarmStartup`과 제품 아트를 실행했으며 persistence만 검수 데이터로 바꿨다. 실사용 저장 오류나 서버 장애를 재현했다고 주장하지 않는다. 임시 진입 파일은 검수 뒤 원본으로 복원하고 제거했다.

| 조건 | 캡처와 결과 |
| --- | --- |
| 영어, 기본 크기 | [준비 완료](runtime/note9-title-en.png). 로고와 Enter Farm이 잘린 곳 없이 표시됨 |
| 영어, 작은 화면 | [320×568 dp 패널](runtime/note9-title-en-small.png). `wm size 960x1704`, density 480. 앱의 실제 내용 높이는 시스템 바 때문에 더 작음. 로고·상태·버튼·제작사 표기가 겹치지 않음 |
| 프랑스어, 큰 글자 | [font scale 1.5](runtime/note9-title-fr-large-text.png). 긴 버튼 문구가 두 줄로 늘어나며 화면 안에 유지됨 |
| 저장 읽기 대기 | [1/2 완료](runtime/note9-title-loading.png). 설정 읽기는 완료, 저장 Promise는 미완료. [버튼 터치 후](runtime/note9-title-loading-after-tap.png)에도 진입하지 않음 |
| 읽기 실패 | [오류와 재시도](runtime/note9-title-error.png). 첫 저장 읽기만 reject. 실제 재시도 터치 후 [준비 완료](runtime/note9-title-retry-ready.png)로 전환됨 |
| 재시도 뒤 진입 | [검수 농장 1234G](runtime/note9-title-fixture-start.png). snapshot의 값을 전달했고 검수 persistence는 모든 쓰기를 수행하지 않음 |

상태 검수에는 테스트 파일과 같은 `createInitialState()`, 설정 locale, 미완료 Promise / 첫 읽기 실패를 사용했다. 제품에는 지연 타이머나 강제 오류 분기를 넣지 않았다. 기기의 화면 크기·density·font scale은 검수 후 작업 전 값으로 복원했다. 초기 Metro 연결 준비 중의 빈 캡처는 증거에 포함하지 않았다.

## 자동 검증

- `pnpm test`: 92 suites / 1,472 tests 통과. platform presence 5 tests 통과.
- `pnpm --dir apps/mobile test --watchAll=false`: 8 suites / 40 tests 통과. 타이틀 이전에는 광고 동의 조회와 RewardedAd 생성이 시작되지 않는 assertion을 포함한다.
- 마지막 변경 후 `FarmStartup`과 저장 adapter 재검증: 2 suites / 14 tests 통과.
- root·mobile·AIT typecheck, root lint, i18n, balance, architecture 통과. `check:title-art`로 원본·native 사본·AIT data URI 일치를 검사했다.
- AIT 로컬 build: Android/iOS 모두 1,809 modules, 오류·경고 0. runtime compatibility 검증 113 sources / 6 bundles 통과.
- App Store 등록 config 검증 통과. 심사 메모의 첫 진입 순서를 타이틀 → 시작 → 기존 튜토리얼로 갱신했다.

회귀 테스트는 실제 읽기의 0/1/2 완료, 읽기 실패 뒤 재읽기, 시작 이전 농장 미마운트, 빠른 두 번 터치의 단일 마운트, 해제된 화면의 늦은 응답 무시, 읽기 실패 시 원본 저장 보호, snapshot 사용 시 이중 읽기 방지를 확인한다. 백그라운드 복귀는 자동 테스트로 위장하지 않고 위 제품 기기 확인으로 구분한다.

## 출시 전에 남은 확인

- iOS 실제 실행과 글자·safe area 검수: 이번에 iOS 기기로 실행하지 않았다.
- 토스 앱 안의 AIT 실행: 로컬 build와 공유 RN 컴포넌트 검증까지 완료했다. 실제 토스 native Image의 data URI 렌더링은 출시 후보로 확인해야 한다.
- release Android APK/AAB, 마켓 스크린샷 재선정과 업로드·심사·공개 배포: 이번 작업에서 실행하지 않았다. 기존 스토어 이미지는 농장 플레이 장면이므로 타이틀 캡처를 자동 대체하지 않는다.
- 새 모션·화면 읽기 프로그램 동작은 검증하지 않았다. 로고는 단일 accessibility label, 준비 상태는 live region, 진행 수와 버튼 disabled 상태는 accessibility 속성으로 제공했다.
