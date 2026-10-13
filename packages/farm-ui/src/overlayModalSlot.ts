import type { FeatureCoachmarkKey } from '../../farm-core/src';

// iOS presents every RN Modal from the same root view controller. Pulling a Modal
// while its presentation is still running leaves an empty controller on screen that
// swallows every touch, and a Modal that starts presenting while another one is on
// screen is refused (UI 검수 1회차 R1-2, 2회차 R2-1: the farm froze after onboarding
// and after a harvest unlocked a coachmark). So the game shows at most one overlay
// Modal at a time and keeps it until onShow confirms the presentation finished.
export type OverlayModal =
  | { kind: 'notificationPrompt'; generation: number }
  | { kind: 'prestigeGuide' }
  | { kind: 'featureCoachmark'; key: FeatureCoachmarkKey };

export type OverlayModalSlot = { overlay: OverlayModal; presented: boolean } | null;

export function isSameOverlayModal(a: OverlayModal, b: OverlayModal): boolean {
  switch (a.kind) {
    case 'notificationPrompt':
      return b.kind === 'notificationPrompt' && a.generation === b.generation;
    case 'prestigeGuide':
      return b.kind === 'prestigeGuide';
    case 'featureCoachmark':
      return b.kind === 'featureCoachmark' && a.key === b.key;
  }
}

// canPresent is false while a sheet or full-screen ad is on screen or still animating away.
export function resolveOverlayModalSlot(
  slot: OverlayModalSlot,
  requested: OverlayModal | null,
  canPresent: boolean
): OverlayModalSlot {
  if (slot != null && !slot.presented) {
    return slot;
  }
  if (requested == null || !canPresent) {
    return null;
  }
  if (slot != null && isSameOverlayModal(slot.overlay, requested)) {
    return slot;
  }
  return { overlay: requested, presented: false };
}

export function markOverlayModalPresented(slot: OverlayModalSlot, overlay: OverlayModal): OverlayModalSlot {
  if (slot == null || slot.presented || !isSameOverlayModal(slot.overlay, overlay)) {
    return slot;
  }
  return { overlay: slot.overlay, presented: true };
}
