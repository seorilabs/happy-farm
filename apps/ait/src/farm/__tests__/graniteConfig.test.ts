/// <reference types="jest" />

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const GRANITE_CONFIG_URL = pathToFileURL(
  path.resolve(__dirname, '../../../granite.config.ts')
).href;

describe('AppsInToss 게임 내비게이션 설정', () => {
  test('AIT 빌드 runtime setup script에 투명 게임 내비게이션 설정을 포함한다', () => {
    const runtimeSetupScript = execFileSync(
      process.execPath,
      [
        '--no-warnings',
        '--experimental-strip-types',
        '--input-type=module',
        '--eval',
        `
          const configModule = await import(${JSON.stringify(GRANITE_CONFIG_URL)});
          const config = await configModule.default;
          const runtimeSetupScript = config.pluginConfigs
            .map((pluginConfig) => pluginConfig.esbuild?.banner?.js)
            .find((script) => script?.includes('e.__appsInToss='));
          process.stdout.write(runtimeSetupScript ?? '');
        `,
      ],
      { encoding: 'utf8' }
    );

    expect(runtimeSetupScript).toMatch(
      /navigationBar:\{transparentBackground:(?:!0|true),theme:"dark"\}/
    );
  });
});
