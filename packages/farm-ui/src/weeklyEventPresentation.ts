import type { WeeklyEventAxis } from '../../farm-core/src';

import type { FarmMessages } from './i18n';

export const GOLDEN_SALE_WEEKLY_EVENT_KEY = 'golden_sale';

export function getWeeklyEventPresentation(
  messages: FarmMessages,
  typeKey: string,
  axis: WeeklyEventAxis,
) {
  if (typeKey === GOLDEN_SALE_WEEKLY_EVENT_KEY && axis === 'sell') {
    return {
      badgeIcon: '🪙',
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
