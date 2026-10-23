# 현재 SDK 계약으로 업데이트 안내 연결

- 설계 ID: 2026-10-23-update-gate, v1
- 기준 소스: fe69cd5883f7cc096f153852318db4c2e4a222f0
- 접수: [#512](https://github.com/seorilabs/happy-farm/issues/512)
- 관련 목록: [18건 상태와 처리 순서](../2026-10-23-open-issues/README.md)
- 검증 계획: [test-plan.json](test-plan.json), L3, dev, redesign=true

## 목적과 결정

현재 AIT와 mobile은 이미 platform-sdk 0.6.0 exact를 사용하고 .npmrc는 공개 npm을 사용한다. 0.5.0으로 낮추지 않는다. 서버 판정 UpdateGateState와 config.gate(), shouldPrompt(), markPrompted()를 그대로 사용하고 클라이언트에서 semver를 재비교하지 않는다. Firebase Remote Config는 복원하지 않는다.

ok는 안내를 내리고, recommended는 닫기와 주소가 있는 경우 업데이트 버튼을 제공한다. 권장 안내는 버전별 24시간에 1회이며 기준 버전 변경은 즉시 재노출한다. required는 뒤로, 배경 탭, 닫기 버튼으로 닫을 수 없다. maintenance는 게임 입력을 막고 조회 재시도를 제공한다. updateUrl이 없으면 업데이트 버튼을 만들지 않는다. 조회 실패는 로그인과 게임 진입을 막지 않는다.

## 흐름, 구조와 실패 처리

각 app shell의 platformEvents에서 config 수명주기와 GateStore를 조합한다. RN은 AsyncStorage, AIT는 실제 Storage 어댑터를 주입해 WebView에 localStorage가 없는 경우에도 재시작 후 이력을 유지한다. pure 상태 전달과 문구 외 SDK 의존성을 farm-core로 옮기지 않는다. 화면은 기존 title와 sheet 톤을 유지하고 한 상태에 주 행동 하나를 둔다. 앱 상태 복귀 때 설정을 갱신하고 unmount 뒤 결과 반영을 막는다. 권장 이력은 실제 렌더 뒤 기록한다. 서버 메시지는 표시하고 빈 메시지용 현지화 fallback을 모든 활성 언어에 둔다.

#480의 RC 최소 빌드 선언 및 RC 일치 검사는 현재 구조에 적용하지 않는다. 안내 노출과 스토어 이동 계측은 이 작업으로 옮긴다. debug의 프로덕션 GA4 전송 분리는 별도 남은 요구로 기록하고 #480을 임의로 닫지 않는다. 실제 강제 정책, minimum version, registry와 스토어 URL 설정 변경은 제외한다. iOS는 과거 이슈 범위 밖이므로 공개 App ID 6775451733 확인만 기록하고 운영 주소 등록은 별도 승인으로 남긴다.

## 변경 범위의 인수조건과 실행

상태별 실제 화면, 닫기·Android 뒤로·배경 입력, URL 없음과 링크 실패, 조회 실패 및 회복, 24시간 경계, 기준 버전 변경, 시계 역행, 저장 실패, 재시작 유지와 다중 갱신을 검증한다. L3 전체 기능을 독립 실행하고 UI 검수 3회 각각 기능과 UX를 확인한다. 320×568과 390×844, ko-KR와 en-US 및 긴 번역, 글자 100%와 200%에서 버튼 잘림과 focus 이동을 확인한다. 새 기능 ID update-gate를 구현 후보 기능 목록에 추가한다.

각 원 인수조건은 구현 PR에서 AC-번호로 순서대로 옮겨 실패와 통과 근거에 연결한다. 공개나 외부 운영 확인은 Refs로 남기고 코드 병합만으로 닫지 않는다. #575는 시작 화면, 상태와 접근성, 겹침으로 나누며 개인정보 항목은 조사 보류다. 범위 밖 항목은 원 이슈에서 유지한다.

### 접수 이슈의 원 인수조건

- [ ] `.npmrc`가 `@seorilabs`를 공개 npm으로 해석하고, 토큰 없는 환경에서 clean install이 된다
- [ ] `apps/ait`과 `apps/mobile`의 `@seorilabs/platform-sdk`가 `0.5.0` exact이고 lockfile이 일치한다
- [ ] `state.kind === "recommended"`이면 닫을 수 있는 안내가 뜨고, `updateUrl`이 있으면 그 주소를 연다
- [ ] `state.kind === "required"`이면 **닫기 수단이 없다**
- [ ] `state.kind === "ok"`이면 아무것도 뜨지 않고, 떠 있던 안내가 있으면 내려간다
- [ ] `state.updateUrl`이 없으면 업데이트 버튼을 그리지 않는다
- [ ] 권장 안내가 하루 1회만 뜬다. 권장 기준 버전이 바뀌면 하루를 기다리지 않고 다시 뜬다
- [ ] 설정 조회가 실패해도 로그인과 게임 진입이 막히지 않는다
- [ ] 게임 코드가 semver를 직접 비교하지 않는다

위 원문 중 SDK 0.5.0, Firebase Remote Config, 배포 및 기기 검증 등 현재 구조 또는 이번 요청과 달라진 항목은 이 문서의 목적과 결정에서 차이를 밝혔으며 자동 충족으로 표시하지 않는다. 원문을 수정된 인수조건으로 몰래 대체하지 않는다.

## 실행과 승인

[공통 실행 범위, 검수와 복구](../2026-10-23-open-issues/execution-scope.md)를 따른다. 설계와 같은 커밋의 test-plan.json은 사용자가 승인했다. 정확한 승인 커밋과 응답은 위 공통 실행 범위에 기록했다. 배포 실행은 승인 범위에서 제외한다.
