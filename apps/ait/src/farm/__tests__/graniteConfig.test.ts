/// <reference types="jest" />

jest.mock('@apps-in-toss/framework/plugins', () => ({
  appsInToss: jest.fn((options: unknown) => options),
}));

jest.mock('@granite-js/react-native/config', () => ({
  defineConfig: jest.fn((config: unknown) => config),
}));

import { appsInToss } from '@apps-in-toss/framework/plugins';
import '../../../granite.config';

describe('AppsInToss 게임 내비게이션 설정', () => {
  test('SDK 상단 바를 투명 오버레이로 렌더링해 게임 화면의 safe-area 여백을 중복 확보하지 않는다', () => {
    expect(jest.mocked(appsInToss)).toHaveBeenCalledWith(
      expect.objectContaining({
        appType: 'game',
        navigationBar: {
          transparentBackground: true,
          theme: 'dark',
        },
      })
    );
  });
});
