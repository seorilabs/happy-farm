// Narrow indirection so test suites can install a spy on gold-pulse events
// without modifying FarmGameProps or Animated internals.
// __DEV__ is false in production bundles, so the hook is never written to and
// _callGoldPulseHook() is a safe no-op; Metro tree-shakes the dead branches.

let _hook: (() => void) | undefined;

/** @internal Test-only setter; no-op when __DEV__ is false. */
export function __setGoldPulseTestHook(fn: (() => void) | undefined): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    _hook = fn;
  }
}

export function _callGoldPulseHook(): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    _hook?.();
  }
}
