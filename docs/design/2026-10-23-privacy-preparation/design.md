# 제품별 개인정보 처리방침 근거와 Ready PR 준비

- 설계 ID: 2026-10-23-privacy-preparation, v1
- 기준 소스: fe69cd5883f7cc096f153852318db4c2e4a222f0
- 접수: [#520](https://github.com/seorilabs/happy-farm/issues/520)
- 관련 목록: [18건 상태와 처리 순서](../2026-10-23-open-issues/README.md)
- 검증 계획: [test-plan.json](test-plan.json), L1, dev, redesign=false

## 목적과 결정

실제 코드와 설정으로 광고, 분석, 익명 인증, 로컬 저장과 알림, Platform API 처리 항목을 확인해 한국어 및 영어 방침을 준비한다. Remote Config, Crashlytics, Firestore 클라우드 저장은 현재 앱에서 사용하지 않으므로 사용한다고 쓰지 않는다. 서버의 보관 기간, 국외 처리와 수탁자별 근거는 실제 설정과 공식 문서로 확인하고 확인 불가는 확정 문장으로 만들지 않는다.

공식 사이트는 main 병합 즉시 배포된다. 따라서 seorilabs-official의 제품별 방침 Ready PR까지만 진행하고 자동 병합은 하지 않는다. 두 공개 URL 확인 전에는 Happy Farm의 config, 앱 링크와 스토어 Console URL을 교체하지 않는다. 회사 공통 방침은 보존한다.

## 흐름, 구조와 실패 처리

seorilabs-official origin/main의 기존 제품별 PrivacyContent, ko/en route, products/registry.ts legal 구조를 재사용한다. 각 repo의 AGENTS와 최신 main을 다시 확인하고 별도 worktree를 쓴다. Happy Farm에는 사실표와 검토 링크만 남긴다. Firebase Analytics의 기존 TCF 저장 흔적(#575 R2-3)은 공식 SDK의 저장 및 동의 의미를 조사하며 임의 삭제, 동의값 변경이나 SDK 설정 변경은 이 범위에 넣지 않는다.

## 변경 범위의 인수조건과 실행

문구별 코드 설정 또는 공식 제공자 문서 근거를 연결한다. seorilabs-official의 npm run check와 npm run build, ko/en 라우트 생성, legal과 sitemap, registry 경고 제거를 로컬 빌드에서 확인한다. 실제 공개 200과 스토어 readback은 미실행으로 남긴다. 법률 고지는 근거와 문구 검토를 수행하되 별도 법률 판단과 미확정 운영 보관 정책을 대신 결정하지 않는다.

각 원 인수조건은 구현 PR에서 AC-번호로 순서대로 옮겨 실패와 통과 근거에 연결한다. 공개나 외부 운영 확인은 Refs로 남기고 코드 병합만으로 닫지 않는다. #575는 시작 화면, 상태와 접근성, 겹침으로 나누며 개인정보 항목은 조사 보류다. 범위 밖 항목은 원 이슈에서 유지한다.

### 접수 이슈의 원 인수조건

- [ ] `https://www.seorilabs.com/apps/happy-farm/privacy/`와 `/en/apps/happy-farm/privacy/`가 200으로 열린다
- [ ] 방침 본문이 이 앱의 실제 설정과 일치한다. 광고 종류(배너·전면·보상형), 개인화 여부, 분석 SDK, 결제, 계정, 수집 항목, 보관 기간을 저장소 설정을 근거로 적는다
- [ ] 앱이 실제로 쓰지 않는 항목을 적지 않는다. 회사 공통 방침에서 문장을 그대로 옮겨오지 않는다
- [ ] `registry.ts`의 `legal` 배열에 등록되어 `/legal/` 인덱스와 `sitemap.xml`에 나타난다
- [ ] `scripts/check-registry.mjs`의 경고 목록에서 이 제품이 빠진다
- [ ] `play-store/google-play.config.json`의 `privacyPolicyUrl`이 새 주소이고 trailing slash로 끝난다
- [ ] Google Play 콘솔과 App Store Connect의 등록 URL이 새 주소로 바뀌어 있다
- [ ] 기존 회사 공통 방침 `https://www.seorilabs.com/privacy/`는 그대로 살아 있다. 다른 제품이 참조 중이다

위 원문 중 SDK 0.5.0, Firebase Remote Config, 배포 및 기기 검증 등 현재 구조 또는 이번 요청과 달라진 항목은 이 문서의 목적과 결정에서 차이를 밝혔으며 자동 충족으로 표시하지 않는다. 원문을 수정된 인수조건으로 몰래 대체하지 않는다.

## 실행과 승인

[공통 실행 범위, 검수와 복구](../2026-10-23-open-issues/execution-scope.md)를 따른다. 설계와 같은 커밋의 test-plan.json은 사람 검토 대기이며, 배포 실행은 승인 범위에서 제외한다.
