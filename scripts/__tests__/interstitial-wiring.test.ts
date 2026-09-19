import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// 전면광고는 지면 플래그·어댑터·ad unit 세 가지가 모두 연결돼야 실제로 노출된다.
// 셋 중 하나만 빠져도 조용히 0회 노출로 돌아간다(모바일이 오래 그 상태였다).
// 연결 자체를 계약으로 못박는다.
const repoRoot = join(__dirname, '..', '..');

function readSource(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

describe('전면광고 연결 계약', () => {
  test('모바일 앱이 전면 어댑터와 세 지면을 FarmGame에 넘긴다', () => {
    const app = readSource('apps/mobile/App.tsx');
    expect(app).toContain('useInterstitialAd={useAdMobInterstitialAd}');
    const placements = app.slice(app.indexOf('interstitialPlacements={{'));

    expect(placements).toMatch(/returnWelcomeBack:\s*true/);
    expect(placements).toMatch(/progressionMilestone:\s*true/);
    expect(placements).toMatch(/harvestBatch:\s*true/);
  });

  test('AppsInToss도 세 지면을 모두 켠다', () => {
    const page = readSource('apps/ait/src/pages/index.tsx');
    expect(page).toContain('interstitialPlacements={{');
    const placements = page.slice(page.indexOf('interstitialPlacements={{'));

    expect(placements).toMatch(/returnWelcomeBack:\s*true/);
    expect(placements).toMatch(/progressionMilestone:\s*true/);
    expect(placements).toMatch(/harvestBatch:\s*true/);
  });

  test('FarmGame 기본값은 세 지면 모두 꺼진 상태를 유지한다', () => {
    // 호스트가 명시적으로 켜지 않으면 노출하지 않는다. 광고 어댑터를 넘기지 않는
    // 테스트·미지원 호스트가 전면광고를 띄우는 일이 없어야 한다.
    const farmGame = readSource('packages/farm-ui/src/FarmGame.tsx');
    expect(farmGame).toContain('const DEFAULT_INTERSTITIAL_PLACEMENTS');
    const defaults = farmGame.slice(farmGame.indexOf('const DEFAULT_INTERSTITIAL_PLACEMENTS'));

    expect(defaults).toMatch(/returnWelcomeBack:\s*false/);
    expect(defaults).toMatch(/progressionMilestone:\s*false/);
    expect(defaults).toMatch(/harvestBatch:\s*false/);
  });

  test('마일스톤·수확 지면은 온보딩 중에 뜨지 않는다', () => {
    // 복귀 지면에만 있던 가드가 빠져 있어 튜토리얼 중 첫 밭 해금에 광고가
    // 뜰 수 있었다. 세 지면 모두 온보딩을 마친 뒤에만 열린다.
    const farmGame = readSource('packages/farm-ui/src/FarmGame.tsx');

    const milestone = farmGame.slice(farmGame.indexOf('async function maybeShowMilestoneAd'));
    expect(milestone.slice(0, 600)).toMatch(/onboardingStep != null/);
    expect(milestone.slice(0, 600)).toMatch(/onboardingCompleted/);

    const harvest = farmGame.slice(farmGame.indexOf('async function maybeShowHarvestAd'));
    expect(harvest.slice(0, 600)).toMatch(/onboardingStep != null/);
    // 진행도 유예는 core 게이트가 본다(온보딩 완료 여부도 그 안에 있다).
    expect(harvest.slice(0, 600)).toContain('canShowHarvestInterstitial');
  });

  test('전면 노출 간격은 세션 내 횟수에 따라 늘어난다', () => {
    // 고정 쿨다운이 아니라 백오프다. 초반엔 자주, 오래 붙잡고 있을수록 뜸하게.
    const farmGame = readSource('packages/farm-ui/src/FarmGame.tsx');
    expect(farmGame).toContain('getInterstitialCooldownMs(interstitialSessionShownRef.current)');
    expect(farmGame).toContain('interstitialSessionShownRef.current += 1');
    // 오래 비웠다 돌아오면 새 세션으로 보고 백오프를 되돌린다.
    expect(farmGame).toContain('interstitialSessionResetMs');
  });

  test('전면 ad unit이 양 플랫폼 모두 채워져 있다', () => {
    // 지면 플래그와 어댑터가 연결돼 있어도 ad unit 이 비면 노출이 조용히 0회로
    // 돌아간다. 값 자체는 중앙 원장 검증(check-admob-analytics)이 맡고, 여기서는
    // 두 플랫폼 모두 비어 있지 않은지만 본다.
    const config = readSource('apps/mobile/src/ads/config.ts');
    expect(config).toContain('PRODUCTION_INTERSTITIAL_AD_UNIT_IDS');
    const production = config.slice(
      config.indexOf('PRODUCTION_INTERSTITIAL_AD_UNIT_IDS'),
      config.indexOf('function getProductionInterstitialAdUnitId')
    );

    expect(production).toMatch(/android:\s*'ca-app-pub-\d+\/\d+'/);
    expect(production).toMatch(/ios:\s*'ca-app-pub-\d+\/\d+'/);
  });

  test('ad unit이 비면 프로덕션에서 미지원으로 떨어진다', () => {
    // 값이 빠졌을 때 빈 문자열을 그대로 SDK 에 넘기지 않고 null 로 떨어뜨려,
    // 컨트롤러가 미지원으로 동작하게 하는 가드는 유지돼야 한다.
    const config = readSource('apps/mobile/src/ads/config.ts');
    expect(config).toContain('export function getInterstitialAdUnitId');
    const getter = config.slice(config.indexOf('export function getInterstitialAdUnitId'));

    expect(getter).toContain('adUnitId.length > 0 ? adUnitId : null');
    // debug 빌드는 실 단위가 아니라 테스트 ID 를 써야 한다(실적 오염 방지).
    expect(getter).toContain('TestIds.INTERSTITIAL');
  });

  test('로드 실패 뒤 재시도를 예약한다', () => {
    // FarmGame은 전면 컨트롤러의 reloadAd를 부르지 않는다. 첫 로드가 실패한 세션이
    // 끝까지 notReady로 굳으면 전면광고가 한 번도 뜨지 않으므로, 어댑터가 스스로
    // 다시 시도해야 한다. 오프라인 기기가 반복 로드하지 않도록 간격은 지수적으로 벌린다.
    const adapter = readSource('apps/mobile/src/ads/adMobInterstitialAd.ts');

    expect(adapter).toContain('MOBILE_INTERSTITIAL_RETRY_BASE_MS');
    expect(adapter).toContain('MOBILE_INTERSTITIAL_RETRY_MAX_MS');
    expect(adapter).toMatch(/2 \*\* retryAttemptRef\.current/);
    // 로드 타임아웃·load() throw·로드 단계 ERROR 세 경로 모두에서 재시도를 건다.
    expect(adapter.match(/scheduleRetry\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // 노출 성공으로 준비되면 백오프를 되돌린다.
    expect(adapter).toContain('retryAttemptRef.current = 0;');
  });
});
