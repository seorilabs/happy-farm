// 보상 연출 계산(#606 AC-3). 기대(눌린 자리에서 코인이 튀어나옴), 충격(흩어짐과 효과음),
// 정착(보이는 골드 칩으로 날아가 숫자가 올라감) 세 단계의 시간과 위치를 정한다.
export const REWARD_BURST_COIN_COUNT = 8;
export const REWARD_BURST_SCATTER_MS = 220;
export const REWARD_BURST_FLY_MS = 400;
export const REWARD_BURST_STAGGER_MS = 28;
// 첫 코인이 칩에 닿을 즈음 숫자를 올리기 시작한다.
export const REWARD_COUNT_UP_DELAY_MS = REWARD_BURST_SCATTER_MS + REWARD_BURST_FLY_MS - 80;
export const REWARD_COUNT_UP_DURATION_MS = 360;
export const REWARD_BURST_TOTAL_MS =
  REWARD_BURST_SCATTER_MS + REWARD_BURST_FLY_MS + REWARD_BURST_STAGGER_MS * (REWARD_BURST_COIN_COUNT - 1) + 160;
// 이보다 오래된 터치는 보상과 관계없다고 보고 화면 가운데에서 터뜨린다(자동 팝업 등).
export const REWARD_TOUCH_FRESH_MS = 1_200;

export type Point = { x: number; y: number };
export type CountUpRun = { from: number; to: number; startedAt: number };

export function getCountUpValue(run: CountUpRun, now: number): number {
  const elapsed = now - run.startedAt - REWARD_COUNT_UP_DELAY_MS;
  if (elapsed <= 0) return run.from;
  if (elapsed >= REWARD_COUNT_UP_DURATION_MS) return run.to;
  const t = elapsed / REWARD_COUNT_UP_DURATION_MS;
  const eased = 1 - (1 - t) ** 3;
  return Math.floor(run.from + (run.to - run.from) * eased);
}

export function getBurstScatterOffsets(count: number): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2 + (index % 2 === 0 ? 0.18 : -0.12);
    const radius = index % 2 === 0 ? 62 : 46;
    return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
  });
}

export function resolveBurstOrigin(
  lastTouch: (Point & { at: number }) | null,
  now: number,
  screen: { width: number; height: number }
): Point {
  if (lastTouch != null && now - lastTouch.at <= REWARD_TOUCH_FRESH_MS) {
    return { x: lastTouch.x, y: lastTouch.y };
  }
  return { x: Math.round(screen.width / 2), y: Math.round(screen.height / 2) };
}
