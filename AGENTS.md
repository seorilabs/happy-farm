# AGENTS.md

## 기본 협업 규칙

- 한글을 주 사용언어로 한다.
- 항상 간결하고 실무적으로 답변한다.
- 애매한 부분은 상상해서 채우지 말고 먼저 확인하거나 필요한 정보를 수집한다.
- 사용자의 전제나 기술 판단이 틀리면 바로잡는다.
- GitHub PR 제목과 Description은 한글로 작성한다.
- GitHub Actions workflow/action 버전은 GitHub 공식 repo/API 또는 공식 문서 기준 최신 stable major를 확인한다.

## i18n 작업 지침

- i18n source of truth는 `docs/i18n-plan.md`다.
- 새 사용자-facing 문자열은 코드에 직접 추가하지 말고 locale catalog에 추가한다.
- `ko-KR`과 `en-US`를 함께 갱신한다. 한쪽만 채우는 변경은 미완료로 본다.
- analytics event name, storage key, crop key, area key, config key는 번역하지 않는다.
- 저장 데이터에는 번역 문자열을 저장하지 않고 stable key만 저장한다.
- `packages/farm-core`에는 locale-aware formatter와 label lookup만 둔다. locale 감지, 사용자 선택 저장, platform SDK 연동은 `apps/ait` 또는 `apps/mobile`에서 처리한다.
- 스토어 문구, 릴리스 노트, 스크린샷 문구가 바뀌는 변경은 i18n 영향 변경으로 보고 Play/App Store/AppsInToss 문서와 config를 함께 확인한다.
- UI 변경 후에는 긴 `en-US` 문구가 button, bottom sheet, tool strip, one-line text에서 넘치지 않는지 확인한다.

## i18n 변경 체크리스트

- 새 문구가 locale catalog에 있는가?
- `ko-KR`과 `en-US` key set이 일치하는가?
- crop/area label, 금액, 시간, 광고 제한 사유가 locale-aware 경로를 타는가?
- 테스트가 한국어 문자열에 불필요하게 고정되지 않았는가?
- store listing, release note, screenshot text 영향이 문서에 반영됐는가?
