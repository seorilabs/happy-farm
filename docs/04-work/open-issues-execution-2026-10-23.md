# Happy Farm 열린 이슈 18건 처리 기록

2026-10-23 처리 결과다. 최종 코드 병합은 `41e6094a6159239650b57f47cee929ae6f472db3`이며, 18개 이슈 중 #488과 #512가 종료됐다. 나머지 16개는 공개 또는 운영 조건이 남아 열린 상태다.

## 승인 범위

[설계 PR #581](https://github.com/seorilabs/happy-farm/pull/581)의 승인 커밋은 `46d3ac1965ce178f82632ffc0f3ca1b0219f3ea1`이다. 병합 후 같은 파일 트리를 가진 조상은 `2a3d1f4ea0755aa2a06690273e1976520f415695`다. 추가 중앙 설계는 [#309](https://github.com/seorilabs/.github/pull/309)의 `f7c461c3898b0ca8ff2dcb883ddf4d2b9ac1c452`이며 같은 파일 트리를 가진 조상은 `a457599425e6bd535e63d3df127a6546dfe0f7c6`다.

구현, 개발 환경 검증과 PR 병합까지 수행한다. 공식 사이트의 #520은 Ready PR까지만 준비한다. 배포, 마켓 업로드, 심사, 운영 설정 및 기기 사용은 이번 범위에 포함하지 않는다. 공개나 운영 인수조건이 남은 이슈는 닫지 않는다.

## 이슈별 결과

| 이슈 | 변경 또는 현재 확인 | 남은 조건 |
|---|---|---|
| [#573](https://github.com/seorilabs/happy-farm/issues/573) | iOS 1.12.2의 공개 정보와 App Store Connect의 READY_FOR_SALE 확인 | 공개 버전 실행과 실제 개인정보 동작은 미실행. 열림 |
| [#488](https://github.com/seorilabs/happy-farm/issues/488) | 실패 후 같은 SHA에서 후속 Google Play 빌드가 성공한 기록을 기존 조건과 대조 | 근거를 남기고 종료. 이번에 새로 업로드하지 않음 |
| [#494](https://github.com/seorilabs/happy-farm/issues/494) | [#582](https://github.com/seorilabs/happy-farm/pull/582) 병합. 지원되는 업데이트로 critical 1건을 0건, high 22건을 5건으로 줄임 | 지원 수정이 없는 상위 의존성 high 5건과 공개 후 확인. 감사 무시나 임의 override 추가 없음. 열림 |
| [#482](https://github.com/seorilabs/happy-farm/issues/482) | [#583](https://github.com/seorilabs/happy-farm/pull/583) 병합. 모든 수익 경로와 저장 및 복원에 상한, 잘못된 수와 프레스티지 비용 방어 적용 | 공개 후 관찰. 열림 |
| [#479](https://github.com/seorilabs/happy-farm/issues/479) | [#584](https://github.com/seorilabs/happy-farm/pull/584) 병합. 광고 닫힘과 보상 이벤트 순서, 준비 상태, 실패 계측, 저장된 claim 중복 지급 방지 수정 | 실제 네이티브 광고와 서버 검증, AdMob 계정 및 다음 공개 후 관찰. 열림 |
| [#478](https://github.com/seorilabs/happy-farm/issues/478) | [#585](https://github.com/seorilabs/happy-farm/pull/585) 병합. 미발행 커밋이 1개 이상이고 48시간 이상인 지연 감시 | 운영 감시 실행은 미실행. 열림 |
| [#483](https://github.com/seorilabs/happy-farm/issues/483) | [#586](https://github.com/seorilabs/happy-farm/pull/586) 병합. App Store 공개 조회, 조회 실패의 확인 불가 상태 유지 | 운영 실행과 다음 공개 후 확인. 열림 |
| [#480](https://github.com/seorilabs/happy-farm/issues/480) | 제거된 Firebase Remote Config를 복원하지 않고 SDK 안내와 계측을 [#587](https://github.com/seorilabs/happy-farm/pull/587)로 이전 | 개발용 GA4 전송 구분과 운영 관찰. 열림 |
| [#512](https://github.com/seorilabs/happy-farm/issues/512) | [#587](https://github.com/seorilabs/happy-farm/pull/587) 병합. SDK 상태, 저장 이력과 24시간 권장 안내 제한, 필수 안내 및 실패 시 게임 진입 검증 | 최초 실패를 보존하고 승인된 독립 검수 4, 5, 6회와 중앙 검사, 전체 테스트 및 빌드 완료 후 종료 |
| [#575](https://github.com/seorilabs/happy-farm/issues/575) | 시작 화면과 OS 언어 연결 [#588](https://github.com/seorilabs/happy-farm/pull/588) 병합. 상태 및 접근성 [#589](https://github.com/seorilabs/happy-farm/pull/589) 병합. 첫 수확과 복귀 안내, 초기화와 스크롤 [#590](https://github.com/seorilabs/happy-farm/pull/590) 병합 | 첫 안내 종료 뒤 후속 기능 안내와 콤보 겹침, 개인정보 설정 판단과 네이티브 및 공개 확인은 남음. 열림 |
| [#520](https://github.com/seorilabs/happy-farm/issues/520) | 실제 SDK, 설정 및 공식 자료를 근거로 한국어와 영어 제품별 방침 초안 작성. 정적 검사와 실제 개발 화면, 두 번의 코드 리뷰 완료. 원본 NAS 보관 | [공식 사이트 Ready PR #89](https://github.com/seorilabs/seorilabs-official/pull/89)에서 멈춤. 운영 확인 자료가 없다는 답변에 따라 보관, 삭제, 수탁사와 국외 처리, 권리 및 대상 연령을 공개 전 조건으로 유지. 열림 |
| [#559](https://github.com/seorilabs/happy-farm/issues/559) | 앱인토스 공개 버전 1.11.10, 확인한 광고 55회 및 추정 수익 520.73, WEB GA4 이벤트 없음 | 새 코드 공개와 계측, 관찰. 없는 날짜를 0으로 대체하지 않음. 열림 |
| [#564](https://github.com/seorilabs/happy-farm/issues/564) | 앱인토스 공개 1.11.10, App Store 1.12.2, Play 1.11.8 확인. Play 실제 소유자 SeoriLabs 및 정확한 패키지 확인 | AdMob 계정 일치는 별도 미확인. 마켓별 다음 공개와 운영 지표 확인. 열림 |
| [#580](https://github.com/seorilabs/happy-farm/issues/580) | 버전과 플랫폼별 동일 첫 세션의 순서 있는 퍼널, 관찰 기간 및 다음 날 복귀를 읽기 전용으로 집계 | 버전 0.0.0과 QA 혼입, 미지원 이벤트 및 AIT 계측 공백 해결 후 운영 코호트 재집계. 열림 |
| [#74](https://github.com/seorilabs/happy-farm/issues/74) | 앱인토스 공식 푸시 허용 목적과 등록 템플릿 0개 확인 | 리텐션 목적 발송 제한을 고려한 허용 용도와 실제 템플릿 준비 후 재개 |
| [#147](https://github.com/seorilabs/happy-farm/issues/147) | 수확과 트럭의 중복 수익 경로 및 경제 정책 선택 필요성 확인 | 골드 소모와 중복 지급에 관한 정책 승인 후 재개 |
| [#320](https://github.com/seorilabs/happy-farm/issues/320) | 실제 수확 콤보 이벤트와 최근 Android의 작은 표본 확인 | 버전과 개발 실행 구분, 기능별 충분한 표본, 명시적 보상 정책 후 재개 |
| [#322](https://github.com/seorilabs/happy-farm/issues/322) | 동물 수령 사용자는 4명으로 작으며 관찰 이벤트는 isRare=false, rareMultiplier=1 | 운영 코호트와 순이익, 확률 및 보상, 생성 시점과 저장, 재시도 및 프레스티지 정책 승인 후 재개 |

## 중앙 검증 계약 보완

승인된 중앙 설계에 따라 [seorilabs/.github #310](https://github.com/seorilabs/.github/pull/310)과 [#311](https://github.com/seorilabs/.github/pull/311)을 병합했다. UI와 서비스가 섞인 실행을 각각의 계약으로 검증하며, 잘못된 최초 검수 기록을 보존하고 새 검수의 통과 근거와 구분한다. #512는 같은 후보 `76de0411818a649babdf7e803e13e774551b54bc`에서 승인된 추가 독립 검수 4, 5, 6회 전체를 새로 수행했다. 최초 검수 기록을 고쳐 통과로 바꾸지 않았다.

## 분석 해석의 한계

#580의 10월 8일부터 21일까지 첫 세션, 22일까지의 조회 스냅샷은 다음 날 복귀 2/53이었다. 이벤트 순서의 비교를 엄격한 선후 관계로 다시 계산해도 버전과 플랫폼별 결과는 같았다. GA4 일별 테이블의 최대 3일 지연 갱신을 고려해 더 이른 관찰 기간으로 제한한 별도 코호트는 1/50이었다. 서로 다른 관찰 기간의 값이며, 미확인 개발 실행 36명이 포함되어 운영 잔존율이나 개선 효과로 해석할 수 없다. 지원되지 않던 이벤트를 이탈로 세지 않았다. 엄격 순서 대조 job은 `job_GUD4KseMazuJjQLfcgslXsrMwvh-`, 지연 기간을 지난 집단 job은 `job_jy0Ch7Y1BS_aO_dO-NiKrFx25RW_`이며 각각 29,483,305바이트를 처리했다. SQL과 집계 원본 15개, 87,497바이트의 보관 위치는 `/Volumes/Data/Backup/agent-artifacts/happy-farm/2026-10-23/read-only-operations/issue-metrics-readonly-121244Z`다.

Google Play 소유자 확인은 AdMob 소유권의 확인이 아니다. 빌드 성공, 내부 업로드, 심사, 승인, 공개와 공개 후 실행도 각각 구분했다.

## 스토어의 광고 없음 문구

사용자가 본 문구는 App Store 이용자 리뷰에 있었다. 개발자가 수정하는 8개 언어의 설명, 부제 및 프로모션에는 광고 없음 주장이 없었다. 이용자 리뷰는 개발자가 직접 고치거나 삭제할 수 없다. 평점 초기화로 작성된 리뷰가 지워지지도 않는다. 평점 초기화, 신고, 개발자 답변이나 스토어 문구 변경은 실행하지 않았다.

근거는 [Apple 평점 초기화 안내](https://developer.apple.com/help/app-store-connect/monitor-ratings-and-reviews/reset-an-app-overview-rating/)와 [리뷰 응답 안내](https://developer.apple.com/help/app-store-connect/monitor-ratings-and-reviews/respond-to-reviews/)다.

## 주요 변경 파일

- [공통 경제 정규화](../../packages/farm-core/src/economy.ts)와 [경제 안전장치 검사](../../packages/farm-core/src/__tests__/economySafety.test.ts).
- [Android 광고 이벤트 처리](../../apps/mobile/src/ads/adMobRewardedAd.ts).
- [업데이트 안내](../../packages/farm-ui/src/FarmUpdateGate.tsx)와 [안내 이력](../../packages/farm-ui/src/updateGate.ts).
- [게임 화면과 상태 전환](../../packages/farm-ui/src/FarmGame.tsx) 및 [모바일 언어 감지](../../apps/mobile/src/locale.ts).
- [공개 및 태그 지연 감시](../../scripts/deploy-drift.js).

## 실행과 증적

모든 검증은 후보 SHA에 연결하고 개발 환경 실행과 실제 네이티브 동작을 구분한다. 플랫폼 SDK와 광고 서버 경계를 대체한 개발 실행을 운영 연결 성공으로 표시하지 않는다. 원본 PNG를 실제로 열람하고 판정을 기록한 뒤 중앙 검증, 전체 테스트와 정식 개발 빌드를 진행한다. 중단 및 실패 후보의 원본과 경계 도구 수정 이력도 보존하며 새 후보의 통과 근거로 이월하지 않는다.

전체 증적의 보관 루트는 `/Volumes/Data/Backup/agent-artifacts/happy-farm/2026-10-23`다. 원본은 후보별 경로에 복사한 뒤 크기와 SHA256을 대조하고 작업용 복제본을 정리한다. 새 테스트 실행 전에는 사용 중인 공용 의존성과 도구를 삭제하지 않는다.

이전 겹침 후보 `3e1df0ac8022e0f95f4548c0c319193d219ddbf1`는 첫 10개 수확의 숙련도 화면이 Continue를 가로채는 실제 실패로 닫았다. 원본 133개 중 열람 32개와 미열람 101개를 구분해 보존했으며 전체26 검수 완료 근거는 0이다. 새 후보는 숙련도와 콤보의 계산 및 지급을 유지하면서 안내 중 중복 연출만 억제한다.

## 검증된 증적 색인

아래 경로는 위 보관 루트에 대한 상대 경로다. 각 복사에서 크기와 SHA256을 읽어 대조한 뒤 작업용 원본을 정리했다. 실패 및 중단 후보와 정리 기록은 같은 루트에 별도로 보존하며 해당 구현 PR에 연결했다.

| 대상 | 경로 | 파일 수 | 바이트 |
|---|---|---:|---:|
| #494 의존성 | `c20888c1238299b55a991a8b02e9dd1fc65d5114/issue-494-0249Z` | 295 | 11,700,756 |
| #482 경제와 저장 | `cae97b467d70a69798e4f7dc4adeb5eca0bed496/issue-482-032047Z` | 276 | 17,877,874 |
| #479 광고 | `fe6b48f93393d78bac7f442dcc83d71972da1076/issue-479-040247Z` | 279 | 11,390,443 |
| #512 업데이트 안내 | `76de0411818a649babdf7e803e13e774551b54bc/issue-512-090548Z` | 1581 | 151,877,946 |
| #478 태그 지연 감시 | `1a69758f4527f8e2aa3aca759ea30e863fd97625/issue-478-093858Z` | 775 | 32,372,343 |
| #483 App Store 감시 | `55ad039573cdfc9258ee24aeade8b79f3cef69dd/issue-483-100928Z` | 886 | 25,181,488 |
| #575 시작과 언어 | `3cb6e7b7e4ae8c3fe06268ec521104cfc21f5603/issue-575-startup-final-110311Z` | 1173 | 131,054,989 |
| #575 상태와 접근성 | `ff47d0eea365d6ddd6f5c48d492b39f5a8a67c32/issue-575-status-final-123711Z` | 1302 | 45,838,586 |
| #520 개인정보 초안 | `084dd51b1bc383bd32fc898b6663f17c9d8b3ae5/issue-520-113708Z` | 174 | 21,900,323 |
| 중앙 #310 | `d31ed9fb1555306009dffe8311864c12b5754bf1/issue-central-mixed-073651Z` | 28 | 323,601 |
| 중앙 #311 | `fd28023b8e79ea0b3751a9acbb9d6416231c62e6/issue-central-invalid-history-080025Z` | 41 | 499,025 |
| #580 읽기 전용 분석 | `read-only-operations/issue-metrics-readonly-121244Z` | 15 | 87,497 |
| 스토어 문구 확인 | `de713130c3c099aaa50c62a02a74a1c0b66b3d6d/issue-store-copy-093216Z` | 26 | 209,090 |

## 최종 후보의 전체 회귀

마지막 코드 후보 `3adc700ac06362b6417e8298d6a0400411cb772a`에서 독립 실행으로 UI 25개와 서비스 1개를 새로 검수했다. 서비스 사례는 67개이며 원본 PNG 321개를 모두 읽었다. 입력 종료 14:09:05Z, 마지막 열람 14:15:56Z, UI 보고서 확정 14:18:34Z, 중앙 3개 L3 통과 14:19:51Z 순서를 지켰다. 최초 중앙 실행의 ajv 경로 오류를 보존하고 의존성 경로만 연결했으며 봉인된 입력과 보고서 해시는 유지했다.

중앙 검사 뒤 전체 테스트 99개 묶음, 1,606건을 통과했고 명시적 AIT 빌드 및 호환 소스 118개와 번들 6개 검사를 통과했다. AIT는 9,439,990바이트, SHA256 `cd875e357c73d450147e9c216d4debb75abf68a5d2aca0697a373625733ad2a5`다. 작성자와 검수 공간의 소스 900개 및 증적 1,436개를 Git 또는 기록된 해시와 각각 대조했다.

생성된 개발 빌드 원본 13개, 65,806,600바이트와 작업용 보존본 13개의 크기, 해시와 생성 시각을 대조한 뒤 재생성 가능한 빌드를 정리했다. 실행 로그와 해시 및 삭제 기록을 NAS에 보관하며 이 후보의 바이너리 원본은 NAS 보관했다고 쓰지 않는다. 앞선 시작 화면 후보처럼 바이너리를 보관한 경우와 구분한다.

첫 보상 안내 뒤 후속 기능 안내의 반투명 전환에는 콤보가 겹쳐 보인다. 안정된 흰 카드의 본문은 읽히고 콤보는 약 1.5초에 사라졌으며 실제 버튼으로 생산 시트가 열렸다. 320×568, 글자 2의 후속 카드 위쪽 19px 잘림은 남은 관찰이다. 전체 화면의 결함을 모두 해결한 것으로 확대하지 않았고 #575를 열어 두었다.

## 마지막 코드 후보의 검증과 보관

겹침 수정 후보는 `3adc700ac06362b6417e8298d6a0400411cb772a`이다. 독립 검수의 세부 실행, 중앙 검사, 전체 테스트와 빌드 결과는 구현 PR에 연결했다. 수정 전 실패와 수정 후 실제 입력, 원본 검토 및 한계는 같은 후보의 증적에 보존했다. NAS `/Volumes/Data/Backup/agent-artifacts/happy-farm/2026-10-23/3adc700ac06362b6417e8298d6a0400411cb772a/issue-overlay-final-142858Z`, 원본 1563개와 85,979,225바이트를 크기와 SHA256으로 대조했다. 재생성 가능한 빌드의 원본 보관 여부는 별도 기록을 따른다.
