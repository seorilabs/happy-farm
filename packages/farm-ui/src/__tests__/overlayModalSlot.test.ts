/// <reference types="jest" />

import {
  markOverlayModalPresented,
  resolveOverlayModalSlot,
  type OverlayModal,
  type OverlayModalSlot,
} from '../overlayModalSlot';

const prompt: OverlayModal = { kind: 'notificationPrompt', generation: 1 };
const cooking: OverlayModal = { kind: 'featureCoachmark', key: 'cooking' };
const animals: OverlayModal = { kind: 'featureCoachmark', key: 'animals' };

describe('resolveOverlayModalSlot (UI 검수 R1-2, R2-1)', () => {
  test('opens the requested overlay when the screen is free', () => {
    expect(resolveOverlayModalSlot(null, cooking, true)).toEqual({ overlay: cooking, presented: false });
  });

  test('waits while a sheet or full-screen ad owns the screen', () => {
    expect(resolveOverlayModalSlot(null, cooking, false)).toBeNull();
  });

  test('keeps an overlay that is still presenting even when it is no longer requested', () => {
    const presenting: OverlayModalSlot = { overlay: cooking, presented: false };
    expect(resolveOverlayModalSlot(presenting, null, false)).toBe(presenting);
    expect(resolveOverlayModalSlot(presenting, prompt, true)).toBe(presenting);
  });

  test('releases a presented overlay once it is no longer requested or the screen is needed', () => {
    const presented: OverlayModalSlot = { overlay: cooking, presented: true };
    expect(resolveOverlayModalSlot(presented, null, true)).toBeNull();
    expect(resolveOverlayModalSlot(presented, cooking, false)).toBeNull();
  });

  test('keeps a presented overlay that is still requested', () => {
    const presented: OverlayModalSlot = { overlay: prompt, presented: true };
    expect(resolveOverlayModalSlot(presented, { kind: 'notificationPrompt', generation: 1 }, true)).toBe(presented);
  });

  test('swaps a presented overlay for a different request', () => {
    const presented: OverlayModalSlot = { overlay: cooking, presented: true };
    expect(resolveOverlayModalSlot(presented, animals, true)).toEqual({ overlay: animals, presented: false });
  });
});

describe('markOverlayModalPresented', () => {
  test('marks the matching overlay as presented', () => {
    expect(markOverlayModalPresented({ overlay: cooking, presented: false }, cooking)).toEqual({
      overlay: cooking,
      presented: true,
    });
  });

  test('ignores a report for an overlay that is no longer in the slot', () => {
    const slot: OverlayModalSlot = { overlay: animals, presented: false };
    expect(markOverlayModalPresented(slot, cooking)).toBe(slot);
    expect(markOverlayModalPresented(null, cooking)).toBeNull();
  });
});
