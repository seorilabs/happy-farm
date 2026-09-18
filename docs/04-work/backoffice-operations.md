# 행복한 농장 전용 백오피스 운영 기준

`.seorilabs/backoffice.json`이 행복한 농장 타이쿤 워크스페이스의 진실원본이다.
백오피스는 기본 브랜치의 이 파일을 읽어 전용 탭과 GA4 콘텐츠 지표를 구성한다.

## 현재 실행 경계

- 전용 도구 카드는 운영 입력, 위험 수준, 확인 방식을 선언한다.
- 실제 변경 실행기는 아직 연결되지 않았다. 실행기가 추가되기 전에는 조회·변경 카드 모두
  계약 미리보기이며 Firebase와 Firestore를 직접 변경하지 않는다.
- 실행기를 연결할 때는 백오피스가 Firebase나 DB를 직접 수정하지 않고 보호된
  GitHub Actions `workflow_dispatch`를 호출한다. 워크플로가 입력 검증, 승인 기록, 적용,
  결과 readback을 담당해야 한다.
- 프로덕션 변경은 사유 또는 typed 확인을 통과해도 스토어 배포 상태와 대상 프로젝트를
  다시 확인한다. public release나 저장 데이터 초기화 권한으로 확대 해석하지 않는다.

## 데이터와 지연

- 이벤트 이름과 파라미터: `packages/farm-core/src/analytics.ts`
- 광고 placement: `packages/farm-core/src/ads.ts`
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

## 광고 운영

- 보상형 placement 목록은 `REWARDED_AD_PLACEMENTS`와 정확히 같아야 한다.
- 광고 빈도·cap은 `balance.json`이 정본이다. 원격 오버라이드(`ad_limits_overrides`)는
  Remote Config와 함께 제거했으므로, 빈도를 바꾸려면 balance를 고쳐 배포한다.
- 광고 그룹 ID나 단가를 추측하지 않는다. AppsInToss 그룹 ID는
  `apps/ait/src/pages/index.tsx`, AdMob 단위는 `apps/mobile/src/ads/config.ts`의
  상수이며, AdMob 식별자의 정본은 중앙 원장
  [seorilabs/.github#167](https://github.com/seorilabs/.github/issues/167)이다.
- AppsInToss 콘솔에 공개된 전면 지면은 복귀(welcome-back) 하나뿐이다. 진행 마일스톤
  지면은 닫아 두었고, 켜려면 해당 지면의 정책·빈도 승인을 먼저 받는다.

## 원격 설정 없음

Firebase Remote Config를 걷어냈다. 백오피스에서 원격으로 바꿀 런타임 플래그가 없다.

- 광고 on/off, 수집 토글, 최소지원버전, 광고 빈도는 모두 빌드에 고정된다.
- **배포 없이 광고를 끄거나 구버전을 차단할 수단이 없다.** 광고 정책 사고나 치명적
  결함은 수정 빌드를 올려 스토어 심사를 거쳐야 한다. 이 제약을 전제로 릴리스
  위험도를 판단한다.
- 상세와 재도입 시 판단 기준은 `docs/firebase-mobile.md`를 따른다.


## 범위 밖 기능

현재 게임에는 IAP 상품과 entitlement가 없으므로 전용 백오피스에 커머스 도구를 노출하지
않는다. 상품이 실제 구현되면 스토어 상품 ID, 서버 검증, 지급·회수 ledger를 먼저 만든 뒤
별도 계약으로 추가한다.
