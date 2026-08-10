# 행복한 농장 전용 백오피스 운영 기준

`.seorilabs/backoffice.json`이 행복한 농장 타이쿤 워크스페이스의 진실원본이다.
백오피스는 기본 브랜치의 이 파일을 읽어 전용 탭과 GA4 콘텐츠 지표를 구성한다.

## 현재 실행 경계

- 전용 도구 카드는 운영 입력, 위험 수준, 확인 방식을 선언한다.
- 실제 변경 실행기는 아직 연결되지 않았다. 실행기가 추가되기 전에는 조회·변경 카드 모두
  계약 미리보기이며 Firebase, Firestore, Remote Config를 직접 변경하지 않는다.
- 실행기를 연결할 때는 백오피스가 Firebase나 DB를 직접 수정하지 않고 보호된
  GitHub Actions `workflow_dispatch`를 호출한다. 워크플로가 입력 검증, 승인 기록, 적용,
  결과 readback을 담당해야 한다.
- 프로덕션 변경은 사유 또는 typed 확인을 통과해도 스토어 배포 상태와 대상 프로젝트를
  다시 확인한다. public release나 저장 데이터 초기화 권한으로 확대 해석하지 않는다.

## 데이터와 지연

- 이벤트 이름과 파라미터: `packages/farm-core/src/analytics.ts`
- 광고 placement: `packages/farm-core/src/ads.ts`
- 런타임 설정 키: `remoteconfig.template.json`
- 경제·콘텐츠 카탈로그: `packages/farm-core/src/balance.json`
- 콘텐츠 지표는 GA4 BigQuery 일별 export의 확정 구간(D-1)을 사용한다. 당일 수치는
  완성된 일별 수치가 아니므로 장애나 성과 확정 근거로 사용하지 않는다.
- `app_market`이 없는 모바일 이벤트는 GA4 platform을 `google_play` 또는 `app_store`로
  매핑하고, AppsInToss 이벤트는 `app_market=apps_in_toss`를 우선한다.

## 세이브 지원

- 로컬 세이브가 항상 권위 원본이다. Firestore는 `cloud_save_backup_enabled=true`일 때만
  사용하는 선택적 백업이다.
- 백오피스는 플레이어 참조, 백업 활성화, 세이브 스키마·릴리스 버전, 최근 동기화 결과를
  읽을 수 있지만 사용자 문서를 직접 수정·삭제·초기화하지 않는다.
- 복원이나 마이그레이션이 필요하면 별도 이슈에서 재현 자료, 대상 익명 참조, 백업과 로컬
  버전, 롤백 방식을 확정한 뒤 전용 워크플로를 구현한다.

## 업데이트 게이트

- `minimum_supported_version_code`를 올리기 전에 해당 versionCode 이상의 Android 빌드가
  실제 대상 트랙에 배포됐고 사용자가 설치할 수 있는지 확인한다.
- `force_update_url`은 같은 변경에서 유효한 스토어 URL로 확인한다.
- 잘못된 게이트는 앱 진입을 막으므로 `high` 위험과 typed 확인을 유지한다. 적용 후
  `update_gate_shown`과 `update_gate_store_click`을 마켓·버전별로 확인한다.

## 광고 운영

- 보상형 placement 목록은 `REWARDED_AD_PLACEMENTS`와 정확히 같아야 한다.
- `ad_limits_overrides`는 알려진 필드의 비음수 정수 JSON만 허용한다. 빈 문자열은
  `balance.json` 기본값으로 돌아간다.
- `mobile_ads_global_enabled=false`는 모든 마켓 광고를 중지하는 비상 조치다. 수익 영향과
  복구 값을 확인하고 typed 확인 뒤에만 적용한다.
- 광고 그룹 ID나 단가를 추측하지 않는다. `appsintoss_interstitial_ad_group_id` 변경은
  AppsInToss 콘솔의 실제 inventory ID와 별도 승인 근거가 있을 때만 전용 작업으로 다룬다.
- AppsInToss 전면형 그룹 `행복농장 타이쿤 전면 광고`는 생성됐지만 현재 `REGISTERING`이라
  코드용 ID가 아직 없다. 최대 약 2시간 뒤 목록을 한 번 재조회해 `ENABLED`와 실제
  `groupId`를 확인하고, 복귀 전용 클라이언트가 공개된 뒤에만 Remote Config에 주입한다.
  현재 클라이언트는 `return_welcome_back`만 허용하고 성장 구매 지면은 막는다.

## 런타임 플래그

- 변경 허용: `analytics_collection_enabled`, `crashlytics_collection_enabled`,
  `cloud_save_backup_enabled`
- 별도 전용 작업에서만 변경: `minimum_supported_version_code`, `force_update_url`,
  `mobile_ads_global_enabled`, `ad_limits_overrides`
- 변경 금지: legacy 호환 키 3종과 예약 키 `remote_balance_enabled`
- 클라우드 백업 활성화 전 Firebase Auth provider, Firestore API·rules, 실제 백업/복원
  검증이 모두 준비됐는지 확인한다.

## 범위 밖 기능

현재 게임에는 IAP 상품과 entitlement가 없으므로 전용 백오피스에 커머스 도구를 노출하지
않는다. 상품이 실제 구현되면 스토어 상품 ID, 서버 검증, 지급·회수 ledger를 먼저 만든 뒤
별도 계약으로 추가한다.
