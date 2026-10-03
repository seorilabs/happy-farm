# AIT 광고 세션 복구 — #559

## 승인 범위

2026-10-04 사용자 실행 계획: #559 수정, 한국어 Ready PR·리뷰·병합, 다음 patch 태그 발급, AIT 전용 workflow 업로드, Android Toss 샌드박스 광고·수확 부스트 검증, 같은 번들 심사·라이브 전환, 라이브 확인과 최소 7일 지표 관찰. Play·App Store 배포, 예약 작업, 외부 알림은 포함하지 않는다.

## 코드와 근거

- 기준 main: `819f042d8b17ef1fe253b88cffca8ba8b6981054`.
- 실제 Chrome에서 객체 메서드로 부른 fetch는 `Illegal invocation`, `globalThis.fetch.bind(globalThis)`는 성공했다.
- 이벤트 인증·전송, 광고 인증, 광고 정책·claim 클라이언트에 동일한 바인딩 fetch를 주입한다. SDK·모바일 앱·광고 정책·보상 설계는 변경하지 않는다.
- 세션 결과는 성공 또는 `login`/`session_exchange` 단계와 제한된 오류 분류를 반환한다. `ad_load_result`의 로드·표시 단계에서 `session_stage`, `session_failure_reason`을 기록하고 인증 코드·토큰·원문 오류를 보내지 않는다.
- 세션 실패는 재시도하고 동시 호출은 공유한다. 명시적인 정책 차단만 캐시하며 foreground 복귀 시 초기화한다.

## 검증

- `pnpm lint`, `pnpm typecheck`, `pnpm test` — 91 suites / 1,483 tests, `pnpm check:i18n`, `pnpm check:ait` 통과.
- 테스트와 AIT build는 순차 실행했다. build 출력의 deployment ID는 패키징 식별자이며 업로드 증거가 아니다.
- receiver 제약과 세 클라이언트 바인딩, 기존 세션 재사용, 로그인·교환 실패 분류, 동시 호출 공유, 실패 후 재시도, 로드·표시 실패 계측을 검증했다.
- 중복 보상 콜백에도 claim 확인은 한 번이며 미시청 종료에는 보상이 없다. 실기기 부스트 지급은 별도 미검증이다.

## 운영 상태와 남은 인수조건

2026-10-04 콘솔 readback: workspace `38345`, miniApp `31877`, appName `happy-farm`, 서비스 `intoss://happy-farm`. 라이브 deployment `01a0b98a-9a77-7e63-b0ca-676c6ac96b65`, memo `v1.11.6 GitHub Actions v1.11.6@1a3c32a`. 9/1~10/3 광고 노출 0, 추정 수익 0. reviewRequestDecision/releaseDecision 모두 ALLOWED.

- [x] 실제 브라우저 fetch 제약 재현과 주입 후 성공
- [x] 세션 실패 원인 분류 계측 구현·자동 검증
- [ ] 고정된 병합 SHA의 patch 태그와 receipt 확인
- [ ] AIT 전용 workflow 업로드·콘솔 deployment readback
- [ ] 해당 번들 Android 샌드박스 인증·광고 노출·수확 부스트 한 번 지급·이벤트 전송
- [ ] 같은 번들의 심사 제출·승인
- [ ] 라이브 deployment/태그/SHA readback과 공개 채널 광고·보상 확인
- [ ] 라이브 전환 후 최소 7일 광고 노출 및 GA4 WEB 차단 사유 확인

#559는 라이브와 지표 조건까지 열어 둔다. 이벤트가 없으면 실패율 0%로 해석하지 않는다.

## WEB 이벤트 중계 후속 조사

AIT 부팅은 익명 Platform 인증, SDK events ingest, GA4 relay 순이다. 클라이언트 바인딩 수정과 별도로 원격 Platform 레지스트리에는 GA4 measurement ID와 `ad_load_result` allowlist 항목이 없다. 서버는 각각 relay 생략과 이벤트 폐기로 처리한다. 운영 revision 및 로그는 등록된 provisioner의 `run.services.get`/logging 권한 오류로 확인하지 못했다. 운영 배포의 직접 원인은 단정하지 않는다. 후속 이슈: https://github.com/seorilabs/platform/issues/212.

## 실기기 검증 경로 정정

공식 문서 https://developers-apps-in-toss.toss.im/development/test/sandbox.md 의 지원표에 따르면 샌드박스 앱은 인앱 광고와 분석을 지원하지 않는다. 연결된 Android Seeker / Android 16에는 `viva.republica.toss.test`만 설치돼 있다. 인증은 샌드박스로 확인할 수 있지만, 실제 광고·수확 부스트·분석 확인은 동일 업로드 번들의 콘솔 QR 테스트 링크를 일반 Toss 앱에서 실행해야 한다. 일반 Toss 앱의 로그인과 현재 번들 실제 테스트 완료는 외부 의존성이다.
