import type { WeeklyEventAxis } from '../../farm-core/src';

import type { FarmMessages } from './i18n';

// Keep the live-ops key stable while changing its mechanical axis.
export const GOLDEN_HARVEST_WEEKLY_EVENT_KEY = 'golden_sale';

export function getWeeklyEventPresentation(
  messages: FarmMessages,
  typeKey: string,
  axis: WeeklyEventAxis,
) {
  if (typeKey === GOLDEN_HARVEST_WEEKLY_EVENT_KEY && axis === 'mutation') {
    return {
      badgeIcon: '✨',
      activeLabel: messages.weeklyEventGoldenLabel,
      activeDescription: messages.weeklyEventGoldenDesc,
      teaserLabel: messages.weeklyEventGoldenTeaserLabel,
      teaserDescription: messages.weeklyEventGoldenTeaserDesc,
    };
  }

  return {
    badgeIcon: axis === 'speed' ? '⚡' : '🎉',
    activeLabel: messages.weeklyEventLabel,
    activeDescription: axis === 'speed' ? messages.weeklyEventHarvestDesc : messages.weeklyEventDesc,
    teaserLabel: messages.weeklyEventTeaserLabel,
    teaserDescription: messages.weeklyEventTeaserDesc,
  };
}
