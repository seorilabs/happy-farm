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
  test('모바일 앱이 전면 어댑터와 두 지면을 FarmGame에 넘긴다', () => {
    const app = readSource('apps/mobile/App.tsx');

    expect(app).toContain('useInterstitialAd={useAdMobInterstitialAd}');
    expect(app).toMatch(/interstitialPlacements=\{\{[^}]*returnWelcomeBack:\s*true/);
    expect(app).toMatch(/interstitialPlacements=\{\{[^}]*progressionMilestone:\s*true/);
  });

  test('AppsInToss 앱도 두 지면을 모두 켠다', () => {
    const page = readSource('apps/ait/src/pages/index.tsx');
    const placements = page.slice(page.indexOf('interstitialPlacements={{'));

    expect(placements).toMatch(/returnWelcomeBack:\s*true/);
    expect(placements).toMatch(/progressionMilestone:\s*true/);
  });

  test('FarmGame 기본값은 두 지면 모두 꺼진 상태를 유지한다', () => {
    // 호스트가 명시적으로 켜지 않으면 노출하지 않는다. 광고 어댑터를 넘기지 않는
    // 테스트·미지원 호스트가 전면광고를 띄우는 일이 없어야 한다.
    const farmGame = readSource('packages/farm-ui/src/FarmGame.tsx');
    const defaults = farmGame.slice(farmGame.indexOf('const DEFAULT_INTERSTITIAL_PLACEMENTS'));

    expect(defaults).toMatch(/returnWelcomeBack:\s*false/);
    expect(defaults).toMatch(/progressionMilestone:\s*false/);
  });

  test('전면 ad unit이 비어 있으면 프로덕션에서 미지원으로 떨어진다', () => {
    // 운영 ID를 채우기 전까지는 지면이 켜져 있어도 노출되지 않아야 한다.
    const config = readSource('apps/mobile/src/ads/config.ts');
    const production = config.slice(config.indexOf('PRODUCTION_INTERSTITIAL_AD_UNIT_IDS'));
    const getter = config.slice(config.indexOf('export function getInterstitialAdUnitId'));

    expect(production).toMatch(/android:\s*''/);
    expect(production).toMatch(/ios:\s*''/);
    expect(getter).toContain('adUnitId.length > 0 ? adUnitId : null');
  });
});
