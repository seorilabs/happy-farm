# 열린 이슈 18건 순차 처리

확인일 2026-10-23. origin/main은 fe69cd5883f7cc096f153852318db4c2e4a222f0, 시작 시 열린 이슈 18건과 열린 PR 0건을 완전 조회했다. 요청은 수동 처리이며 중앙 자율 대상 EXCLUDED 상태를 변경하지 않는다.

완료 지점은 PR 병합이다. 배포, 업로드, 심사, 운영 설정과 기기 사용은 제외한다. 공식 사이트 #520은 병합 즉시 배포되므로 Ready PR에서 멈춘다.

## 승인과 실행 결과

설계 10건과 test-plan.json의 승인 커밋, 사용자 응답 및 중앙 보완 승인은 [공통 실행 범위](execution-scope.md)에 기록한다. 이번 18개 이슈별 처리 결과, PR과 남은 조건은 [처리 기록](../../04-work/open-issues-execution-2026-10-23.md)에 모았다. 개인정보 처리방침의 실제 SDK 및 운영 확인 공백은 [근거 문서](../../04-work/privacy-policy-evidence-2026-10-23.md)에 기록했다.

## 승인된 설계

- [#494 공식 의존성 업데이트로 보안 감사 차단 줄이기](../2026-10-23-dependency-audit/design.md)
- [#482 경제 오버플로와 저장 손상 차단](../2026-10-23-economy-safety/design.md)
- [#479 Android 광고 닫힘과 보상 이벤트 순서 처리](../2026-10-23-android-reward-events/design.md)
- [#478 태그 미발행 커밋 지연 감시](../2026-10-23-release-lag/design.md)
- [#483 App Store 공개 버전을 배포 감시에 포함](../2026-10-23-ios-public-drift/design.md)
- [#512 현재 SDK 계약으로 업데이트 안내 연결](../2026-10-23-update-gate/design.md)
- [#575 기존 방향으로 시작 화면과 초기 언어 수정](../2026-10-23-ui-startup/design.md)
- [#575 성장 완료 상태와 안내 및 접근성 수정](../2026-10-23-ui-status-accessibility/design.md)
- [#575 시트와 알림 겹침 및 스크롤 상태 수정](../2026-10-23-ui-overlay-lifecycle/design.md)
- [#520 제품별 개인정보 처리방침 근거와 Ready PR 준비](../2026-10-23-privacy-preparation/design.md)

위 설계 및 같은 승인 커밋의 test-plan.json을 구현, 검증, 병합 범위로 승인받아 한 PR씩 처리했다. release 필드의 스키마 제약과 이번 요청에서 실행 권한을 제외하는 조건은 그대로 유지한다. 아래 확인 근거와 audit.md는 구현 전 최초 조회 기록이며 현재 상태는 위 처리 기록을 따른다.

## 설계 시점의 확인 근거

- [iOS 제출과 기존 검수](https://github.com/seorilabs/happy-farm/issues/573#issuecomment-6167232168), [기존 E2E](../../qa/2026-10-13-ios-no-tracking-consent/e2e-app-store-before-build-v1.12.2.md)
- 공개 Lookup: bundleId com.seorilabs.happyfarm, 한국 storefront, App ID 6775451733, version 1.12.2, 공개일 2026-10-15T02:35:00Z. 공개 정보 조회만 했고 설치와 실행은 하지 않았다.
- [#488 동일 SHA 후속 빌드](https://github.com/seorilabs/happy-farm/actions/runs/32963301306): 빌드 success, 업로드 skipped. [후속 main 빌드](https://github.com/seorilabs/happy-farm/actions/runs/37320518692)도 success.
- 의존성 감사: pnpm 11.3.0, critical 1, high 22, moderate 20, low 6. 전체 경로와 원시 응답은 NAS 검증 보존 뒤 위치를 기록한다.
- [최신 기존 채널 감시](https://github.com/seorilabs/happy-farm/issues/564#issuecomment-6332723656)는 업로드 관측이며 공개 상태와 구분한다.
- [AppsInToss 푸시 공식 문서](https://developers-apps-in-toss.toss.im/guide/marketing/smart-message.md)는 기능성 용도와 템플릿 검수를 요구하고 리텐션 목적 발송을 제한한다. #74는 보상과 복귀 유도를 임의로 추가하지 않는다.

원본 보존 위치와 조사 결과는 동일 폴더의 audit.md에 기록한다. 비밀값과 원시 사용자 식별값을 GitHub 및 이 문서에 남기지 않는다.
