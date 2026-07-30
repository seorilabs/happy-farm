import { useEffect, useRef } from 'react';

export type AnalyticsTransitionKey = string | number | null;

/**
 * Analytics that describes a UI transition must only run when the transition
 * key changes. Snapshot and callback refs stay fresh on every render without
 * becoming effect dependencies, so the 250ms game tick cannot reschedule the
 * analytics effect.
 */
export function useAnalyticsTransition<TSnapshot>(
  transitionKey: AnalyticsTransitionKey,
  snapshot: TSnapshot,
  trackTransition: (snapshot: TSnapshot) => void
): void {
  const lastTransitionKeyRef = useRef<AnalyticsTransitionKey>(null);
  const snapshotRef = useRef(snapshot);
  const trackTransitionRef = useRef(trackTransition);

  snapshotRef.current = snapshot;
  trackTransitionRef.current = trackTransition;

  useEffect(() => {
    if (lastTransitionKeyRef.current === transitionKey) {
      return;
    }
    lastTransitionKeyRef.current = transitionKey;
    if (transitionKey == null) {
      return;
    }
    trackTransitionRef.current(snapshotRef.current);
  }, [transitionKey]);
}
