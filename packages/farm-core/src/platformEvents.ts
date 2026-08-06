/**
 * Platform BigQuery에는 운영·핵심 퍼널용 저빈도 이벤트만 복제한다.
 * GA4 이벤트 사전은 이 목록과 무관하게 기존 계약을 그대로 유지한다.
 */
export const PLATFORM_EVENT_ALLOWLIST = [
  'seori_session_start',
  'seori_sdk_error',
  'game_start',
  'first_seed_selected',
  'first_meaningful_harvest',
  'onboarding_step_view',
  'onboarding_complete',
  'onboarding_skip',
  'onboarding_stall',
  'ad_reward_click',
  'ad_reward_completed',
  'ad_reward_failed',
  'ad_limit_blocked',
  'interstitial_shown',
  'notification_opened',
  'update_gate_shown',
  'update_gate_store_click',
] as const;
