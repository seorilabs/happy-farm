import { PLATFORM_EVENT_ALLOWLIST } from '../platformEvents';

describe('PLATFORM_EVENT_ALLOWLIST', () => {
  test('합의한 저빈도 17종만 포함한다', () => {
    expect(PLATFORM_EVENT_ALLOWLIST).toHaveLength(17);
    expect(new Set(PLATFORM_EVENT_ALLOWLIST).size).toBe(17);
    expect(PLATFORM_EVENT_ALLOWLIST).toContain('seori_session_start');
    expect(PLATFORM_EVENT_ALLOWLIST).toContain('game_start');
    expect(PLATFORM_EVENT_ALLOWLIST).toContain('update_gate_store_click');
  });

  test('고빈도 광고 노출과 게임 루프 이벤트는 제외한다', () => {
    const names: readonly string[] = PLATFORM_EVENT_ALLOWLIST;
    expect(names).not.toContain('ad_reward_impression');
    expect(names).not.toContain('crop_planted');
    expect(names).not.toContain('crop_harvested');
    expect(names).not.toContain('upgrade_purchased');
  });
});
