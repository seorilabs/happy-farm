# 열린 이슈 18건 순차 처리

확인일 2026-10-23. origin/main은 fe69cd5883f7cc096f153852318db4c2e4a222f0, 시작 시 열린 이슈 18건과 열린 PR 0건을 완전 조회했다. 요청은 수동 처리이며 중앙 자율 대상 EXCLUDED 상태를 변경하지 않는다.

완료 지점은 PR 병합이다. 배포, 업로드, 심사, 운영 설정과 기기 사용은 제외한다. 공식 사이트 #520은 병합 즉시 배포되므로 Ready PR에서 멈춘다.

## 현재 상태

| 이슈 | 재확인 결과와 다음 조건 |
|---|---|
| [#573](https://github.com/seorilabs/happy-farm/issues/573) | 공개 1.12.2 확인. 공개 실행은 미확인, 열린 상태 |
| [#488](https://github.com/seorilabs/happy-farm/issues/488) | 동일 SHA 후속 빌드 복구 확인. 종료 대상 |
| [#494](https://github.com/seorilabs/happy-farm/issues/494) | critical 1, high 22. 설계 승인 대기 |
| [#482](https://github.com/seorilabs/happy-farm/issues/482) | 상한과 저장 안전장치 설계 승인 대기 |
| [#479](https://github.com/seorilabs/happy-farm/issues/479) | Android 이벤트 처리 설계 승인 대기 |
| [#478](https://github.com/seorilabs/happy-farm/issues/478) | 태그 미발행 감시 설계 승인 대기 |
| [#483](https://github.com/seorilabs/happy-farm/issues/483) | 공개 버전 감시 설계 승인 대기 |
| [#480](https://github.com/seorilabs/happy-farm/issues/480) | RC 요구는 현행 구조와 불일치. #512 연결과 남은 debug 계측 유지 |
| [#512](https://github.com/seorilabs/happy-farm/issues/512) | SDK 0.6.0 연결 설계 승인 대기 |
| [#575](https://github.com/seorilabs/happy-farm/issues/575) | 세 수정 묶음 설계 승인 대기. TCF는 조사 보류 |
| [#520](https://github.com/seorilabs/happy-farm/issues/520) | 공식 사이트 Ready PR까지만. 공개 및 URL 교체 제외 |
| [#559](https://github.com/seorilabs/happy-farm/issues/559) | 수정 병합과 과거 QR 통과. 현재 공개 및 운영 지표 별도 조사 |
| [#564](https://github.com/seorilabs/happy-farm/issues/564) | 10월 22일 감시는 AIT와 Play v1.12.0. iOS 제외가 남음 |
| [#580](https://github.com/seorilabs/happy-farm/issues/580) | 동일 첫 세션 순서 및 버전 계약 조사 |
| [#74](https://github.com/seorilabs/happy-farm/issues/74) | 공식 문서의 리텐션 푸시 제한. 허용 용도와 템플릿 필요 |
| [#147](https://github.com/seorilabs/happy-farm/issues/147) | 보상 중복과 재고 정책, 계측 승인 필요 |
| [#320](https://github.com/seorilabs/happy-farm/issues/320) | 콤보 노출과 RP 사용 비율 및 보상 상한 근거 필요 |
| [#322](https://github.com/seorilabs/happy-farm/issues/322) | 동물 수집 원장과 확률 및 재현 정책 근거 필요 |

## 구현 전 검토할 설계

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

승인 상태는 사람 검토 대기다. 정확한 문서 커밋과 위 설계 및 test-plan.json의 구현, 검증, 병합 범위를 한 번에 확인한 뒤 한 PR씩 진행한다. release 필드의 스키마 제약과 이번 요청에서 실행 권한을 제외하는 조건은 각 설계에 명시했다. 설계 승인 대기를 코드 구현 완료로 표시하지 않는다.

## 확인 근거

- [iOS 제출과 기존 검수](https://github.com/seorilabs/happy-farm/issues/573#issuecomment-6167232168), [기존 E2E](../../qa/2026-10-13-ios-no-tracking-consent/e2e-app-store-before-build-v1.12.2.md)
- 공개 Lookup: bundleId com.seorilabs.happyfarm, 한국 storefront, App ID 6775451733, version 1.12.2, 공개일 2026-10-15T02:35:00Z. 공개 정보 조회만 했고 설치와 실행은 하지 않았다.
- [#488 동일 SHA 후속 빌드](https://github.com/seorilabs/happy-farm/actions/runs/32963301306): 빌드 success, 업로드 skipped. [후속 main 빌드](https://github.com/seorilabs/happy-farm/actions/runs/37320518692)도 success.
- 의존성 감사: pnpm 11.3.0, critical 1, high 22, moderate 20, low 6. 전체 경로와 원시 응답은 NAS 검증 보존 뒤 위치를 기록한다.
- [최신 기존 채널 감시](https://github.com/seorilabs/happy-farm/issues/564#issuecomment-6332723656)는 업로드 관측이며 공개 상태와 구분한다.
- [AppsInToss 푸시 공식 문서](https://developers-apps-in-toss.toss.im/guide/marketing/smart-message.md)는 기능성 용도와 템플릿 검수를 요구하고 리텐션 목적 발송을 제한한다. #74는 보상과 복귀 유도를 임의로 추가하지 않는다.

원본 보존 위치와 조사 결과는 동일 폴더의 audit.md에 기록한다. 비밀값과 원시 사용자 식별값을 GitHub 및 이 문서에 남기지 않는다.
