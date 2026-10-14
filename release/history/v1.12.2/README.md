# v1.12.2 마켓 기록 (App Store 전용)

**2026-10-14 iOS 1.12.2(1012002)를 App Review에 제출했고 심사 대기 상태를 확인했다.** 1.12.0이 Guideline 5.1.2(i)로 거절된 데 대한 재제출이다. 승인과 공개는 아직 미완료이며 이전 버전(1.11.8)이 계속 공개 상태다. Google Play와 AppsInToss에는 이 버전을 올리지 않았다.

- 소스: `ae4f7ea0ff64dfb181f9247fa1ebce8d28740f0d`, 태그 `v1.12.2`
- 변경
  - #574: iOS에서 Google 광고 동의 창(UMP)을 띄우지 않고 남은 동의 기록(`IABTCF_*`)을 지운다. App Privacy를 추적 안 함으로 정렬했다. 안내 모달 표시 경합으로 입력이 멈추던 문제를 고쳤다.
  - #576: 광고가 뜬 뒤에는 표시 시간 제한(보상 120초·전면 60초)으로 끝내지 않는다. 이전에는 광고를 오래 띄워 두면 시트가 닫히면서 입력이 멈췄다. iPhone 설정에서 "광고 정보" 섹션을 뺐다.
  - #577: 출시 노트
- v1.12.1(`5fb1981`)은 빌드 전 E2E E7(실기기)에서 위 광고 멈춤이 발견돼 빌드 없이 대체했다.
- 개발 근거: [Release v1.12.2](https://github.com/seorilabs/happy-farm/releases/tag/v1.12.2)의 `development-evidence.app-store.before-build.json`(중앙 검증기 통과). UI 검수 5회(4·5회차 소유자 승인), 빌드 전 E2E E1~E7 통과. E7의 "광고 130초 이상 유지" 실기기 확인은 소유자 결정으로 생략했고 시뮬레이터에서 확인했다([E2E 기록](../../../docs/qa/2026-10-13-ios-no-tracking-consent/e2e-app-store-before-build-v1.12.2.md)).
- 실제 제출 문구: 이 폴더의 `release-notes.json`(Release 자산과 같음)

| 항목 | 확인한 상태 |
| --- | --- |
| 빌드 | `1.12.2 / 1012002`, VALID, 비면제 암호화 false. [빌드·업로드](https://github.com/seorilabs/happy-farm/actions/runs/38554938351) |
| 심사 | 제출 `276964a2-b129-48e9-96c8-382d895083f4`, 2026-10-14T11:23:36Z 접수, 제출·버전 모두 `WAITING_FOR_REVIEW`, `AFTER_APPROVAL`. [접수 기록](app-store-submission-receipt-20261014.json) |
| 문구 | whatsNew 8개 언어가 출시 노트와 일치. 심사 메모에 5.1.2(i) 대응 설명(설정 안내 문장 없음) |
| App Privacy | 추적에 쓰는 데이터 유형 없음(2026-10-13 게시·되읽기) |
| 공용 방침 | [seorilabs-official#61](https://github.com/seorilabs/seorilabs-official/pull/61) 병합, www.seorilabs.com/privacy·/en/privacy 반영 확인 |

남은 확인: 심사 승인, 자동 공개, 공개 버전 실행 확인.
