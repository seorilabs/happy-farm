jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Settings: { get: jest.fn() },
  I18nManager: { getConstants: jest.fn() },
}));

import { I18nManager, Platform, Settings } from 'react-native';
import { DEFAULT_LOCALE } from '../../../../packages/farm-core/src';
import { detectMobileRuntimeLocale } from '../locale';

const getSetting = Settings.get as jest.Mock;
const getConstants = I18nManager.getConstants as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getSetting.mockReset();
  getConstants.mockReset();
});

afterEach(() => { jest.restoreAllMocks(); });

const cases = [
  ['ko_KR', 'ko-KR'], ['en-GB', 'en-US'], ['ja-JP', 'ja'],
  ['zh-CN', 'zh-Hans'], ['zh-HK', 'zh-Hant'], ['de-DE', 'de'],
  ['fr-FR', 'fr'], ['es-MX', 'es'],
] as const;

test.each(cases)('iOS의 첫 언어 %s를 지원 언어 %s로 넘긴다', (osLocale, expected) => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  getSetting.mockImplementation((key: string) => key === 'AppleLanguages' ? [osLocale, 'en-US'] : 'en_US');
  expect(detectMobileRuntimeLocale()).toBe(expected);
  expect(getSetting).not.toHaveBeenCalledWith('AppleLocale');
  expect(getConstants).not.toHaveBeenCalled();
});

test.each([undefined, [], ['', null], false])('iOS 언어 목록 %p가 비면 AppleLocale을 쓴다', (languages) => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  getSetting.mockImplementation((key: string) => key === 'AppleLanguages' ? languages : 'ko_KR');
  expect(detectMobileRuntimeLocale()).toBe('ko-KR');
});

test('미지원인 첫 언어를 건너뛰어 두 번째 언어로 바꾸지 않는다', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  getSetting.mockReturnValue(['ar-SA', 'ko-KR']);
  expect(detectMobileRuntimeLocale()).toBe('en-US');
});

test.each(cases)('Android의 localeIdentifier %s를 지원 언어 %s로 넘긴다', (osLocale, expected) => {
  jest.replaceProperty(Platform, 'OS', 'android');
  getConstants.mockReturnValue({ localeIdentifier: osLocale });
  expect(detectMobileRuntimeLocale()).toBe(expected);
  expect(getSetting).not.toHaveBeenCalled();
});

test.each([undefined, null, '', 'ar-SA'])('Android의 미해석 언어 %p는 기존 영어 fallback을 쓴다', (localeIdentifier) => {
  jest.replaceProperty(Platform, 'OS', 'android');
  getConstants.mockReturnValue({ localeIdentifier });
  expect(detectMobileRuntimeLocale()).toBe('en-US');
});

test.each(['ios', 'android'] as const)('OS %s 읽기가 실패해도 진입을 막지 않고 기존 기본 언어를 쓴다', (os) => {
  jest.replaceProperty(Platform, 'OS', os);
  const fail = () => { throw new Error('OS boundary unavailable'); };
  getSetting.mockImplementation(fail);
  getConstants.mockImplementation(fail);
  expect(detectMobileRuntimeLocale()).toBe(DEFAULT_LOCALE);
});

test('iOS 언어 값 자체가 없으면 기존 영어 fallback을 쓴다', () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  expect(detectMobileRuntimeLocale()).toBe('en-US');
});
