/**
 * @format
 */

import { Linking } from 'react-native';
import { getAdDataPolicyUrl, openAdDataPolicy, shouldShowAdInfoSettings } from '../src/ads/adDataPolicy';

const POLICY_URL = 'https://policies.google.com/technologies/partner-sites';

beforeEach(() => {
  jest.restoreAllMocks();
});

test.each([
  ['ko-KR', 'ko'],
  ['en-US', 'en'],
  ['ja', 'ja'],
  ['zh-Hans', 'zh-CN'],
  ['zh-Hant', 'zh-TW'],
  ['de', 'de'],
  ['fr', 'fr'],
  ['es', 'es'],
] as const)('AC-8 links %s players to the Google page in %s', (locale, hl) => {
  expect(getAdDataPolicyUrl(locale)).toBe(`${POLICY_URL}?hl=${hl}`);
});

test('AC-8 opens the Google page outside the app', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

  await openAdDataPolicy('en-US');

  expect(openURL).toHaveBeenCalledWith(`${POLICY_URL}?hl=en`);
});

test('AC-8 swallows a failure to open the page', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'));

  await expect(openAdDataPolicy('de')).resolves.toBeUndefined();
});

test.each([
  ['ios', false],
  ['android', true],
] as const)('AC-17 shows the ad info settings on %s: %s', (os, shown) => {
  expect(shouldShowAdInfoSettings(os)).toBe(shown);
});
