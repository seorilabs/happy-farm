# v1.12.0 마켓 검수 기록

세 마켓 빌드와 업로드를 완료했다. **새 버전의 프로덕션 심사 제출·공개는 아직 완료하지 않았다.** 출시 빌드의 실기기 검수와 개인정보 선언 확인이 남았다. 이전 버전은 계속 공개 상태다.

- 소스: `82b5470e5af5c827b1b976ab89a1ddf8ba3de248`, 태그 `v1.12.0`
- 변경: A 방향의 아침 농장 타이틀, 실제 저장 읽기 진행 표시·오류 재시도, 하단 시스템 영역 확보
- 검증: 92개 테스트 모음의 1,474개 테스트와 Platform presence 5개 통과, typecheck·변경 파일 lint·PR CI 통과
- 실제 제출 문구: GitHub Release의 `release-notes.json`; SHA256 `e669a63ac6ff06239fee8557de07b5edaf99764046bb94d32b344a7bc61345dc`

| 마켓 | 현재 확인한 상태 | 심사 제출 전에 남은 작업 |
| --- | --- | --- |
| Google Play | `1.12.0 / 1001011010`, 내부 테스터에게 제공됨. [빌드·업로드](https://github.com/seorilabs/happy-farm/actions/runs/37320518692) | Galaxy Note9 재연결, 같은 내부 테스트 버전의 설치·실행 |
| App Store | `1.12.0 / 1012000`, VALID·내부 TestFlight 제공. [빌드·업로드](https://github.com/seorilabs/happy-farm/actions/runs/37320525118) | 실제 TestFlight 실행 및 iPad 확인, App Privacy의 사용자 ID 선언 확인·수정 |
| AppsInToss | `20261005-54`, CREATED·비공개 테스트 준비. [빌드·업로드](https://github.com/seorilabs/happy-farm/actions/runs/37320532858) | 사용자 실제 테스트 완료 확인, 게임 등급 자료·정책 확인, 심사 승인 후 콘솔에서 출시 |

Google Play의 관리형 게시가 꺼져 있고 App Store는 `AFTER_APPROVAL`이다. 두 마켓은 프로덕션 제출 후 승인되면 기존 설정대로 공개된다. AppsInToss는 승인 후 콘솔의 출시 동작이 별도로 필요하다.

## 문구와 이미지

Google Play의 8개 언어 문구와 기존 이미지 52장을 검수했다. 이전 시작 로고만 있는 태블릿 이미지 4장과 개발 경고가 보이는 중국어 휴대전화 이미지 1장을 제거했다. 남은 47장의 ID·순서를 API로 다시 확인했다. 저장소에서도 해당 이미지 5장과 기본 언어용 중복 파일 2장을 제거했다. 이미지 변경의 edit ID는 `02350202748763395123`이다. 이 계정은 `changesNotSentForReview`를 허용하지 않으므로 이미지 변경은 자동 검토 경로에 들어간다. 이 변경은 새 바이너리를 프로덕션에 제출한 것이 아니다.

App Store의 8개 언어 제목·부제·소개·홍보·키워드·출시 문구와 64장 이미지를 검수했다. 새 버전의 문구를 저장 후 GET으로 대조했고, 스크린샷 내용·장수·순서·처리 상태·checksum이 검수한 이미지와 같다. 모든 언어에 앱 미리보기가 없다. 새 타이틀 진입 방법을 심사 안내에 저장하고 다시 읽었다. 연결된 버전 ID는 `66e840f6-c545-44ce-b8b8-739196f11e41`, 빌드 ID는 `6cb6f8dd-7e20-432b-95a1-244176123e25`다.

AppsInToss의 한국어·영어 이름, 한국어 설명, 로고·가로 썸네일을 검수했다. 새 deployment `01a10c5a-d1d9-7bde-9a13-93623b6909de`의 출시 문구를 저장하고 Console 도구로 대조했다. `isTested=true`는 테스트 환경 준비이며 실제 테스트 완료를 뜻하지 않는다. 사용자에게 전용 링크와 QR을 전달했다.

## 서명 파일 확인

Google Play가 생성한 같은 버전의 universal APK를 내려받아 패키지·버전·targetSdk 36·Google 앱 서명을 확인했다. 업로드한 AAB의 API SHA256과 빌드 기록의 SHA256이 같다. 내려받은 APK 설치는 내부 Play 채널 설치 검수를 대신하지 않는다.

iOS는 같은 고정 태그·소스·버전으로 [추가 검증 archive](https://github.com/seorilabs/happy-farm/actions/runs/37322813684)를 만들었다. Apple Distribution 서명, Team ID, entitlements, AppIcon, 최종 Info.plist의 버전·비면제 암호화 false, 앱과 SDK 개인정보 목록을 읽었다. 이 archive는 별도 검증 빌드이며 업로드된 archive와 바이트가 같다고 주장하지 않는다.

## 개인정보와 실행 검수의 미완료 항목

- iOS의 공개 App Privacy에는 사용자 ID 항목이 없지만, 실제 FirebaseAuth 개인정보 목록은 `UserID / linked=true / tracking=false / AppFunctionality`를 선언한다. 현재 코드도 이 ID로 Platform 세션을 만든다. App Store Connect 전용 브라우저는 수동 로그인 상태이므로 저장된 선언의 확인·수정이 필요하다. 공개 표시만 보고 콘솔의 미공개 초안까지 판단하지 않았다.
- 클라우드 저장은 이미 제거됐다. 로컬 config의 옛 게임 진행 저장 수집 설명을 현재 동작과 맞췄다. 사용자 ID 수집은 Platform 인증에 계속 필요하다.
- Galaxy Note9이 ADB 목록에 없다. 이전 debug 타이틀 검수는 이번 출시 후보의 설치·실행 검수로 계산하지 않았다. 연결된 iPhone에는 아직 `1.11.8 / 1011008`이 설치돼 있다.
- AppsInToss Console 도구는 현재 대화의 실제 테스트 완료 확인 전에 검토 요청을 금지한다. Console 웹 로그인도 필요하다. 내부 게임 등급 화면 이미지의 직접 조회는 HTTP 403이었다.
- [Platform #212](https://github.com/seorilabs/platform/issues/212)의 AIT 분석 중계 확인이 남아 있다. 현재 후보의 서비스·광고·이벤트 흐름 검수 없이 공개 실행 검수를 완료 처리하지 않는다.

Google Play Data Safety는 기존 CSV를 내려받고 사용자 ID 수집·필수·비임시·앱 기능·계정 관리 답변 6개만 바꿨다. 저장 후 다시 내보낸 782개 행이 검수 원본과 일치했다. 사용자 ID는 수집으로만 선언했고 다른 회사로 공유하는 데이터 유형은 기존 답변을 유지했다. Console에서 Data Safety 변경 1개를 검토에 전송하고 `검토 중인 변경사항` 상태를 다시 확인했다. 이 항목은 앱 전체의 개인정보 신고 수정이며, 새 바이너리의 프로덕션 제출과 구분한다.

각 API 대조 기록과 이미지 제거 ID는 이 폴더의 JSON 파일에 보관했다. 전체 진행 상태는 `release/market-launch-state.json`에 기록했으며, 구조 검증 오류는 없고 미완료 항목이 남아 있다.

App Store Connect의 실제 기본 언어는 `en-US`다. [Apple의 현지화 설명](https://developer.apple.com/help/app-store-connect/manage-app-information/localize-app-information/)은 스토어 메타데이터 언어와 바이너리 현지화를 구분한다. 기기 이름은 등록된 한국어 앱 이름과 같으므로 기본 언어 이름만 강제하던 로컬 검사 오류를 수정했다. 영어 기본 언어·한국어 기기 이름의 통과와 등록되지 않은 이름·빈 이름의 차단을 회귀 검증했다. 앱 실행 코드와 고정된 출시 빌드는 바뀌지 않는다.
