import validator from './lib/backoffice-manifest.js';

const { validateBackofficeManifest } = validator;
const { manifest, failures } = validateBackofficeManifest(process.cwd());

if (failures.length > 0) {
  console.error('행복한 농장 백오피스 manifest 검증 실패');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  const toolCount = manifest.tools.length;
  const groupCount = manifest.analytics.content.groups.length;
  console.log(`행복한 농장 백오피스 manifest 검증 통과: 도구 ${toolCount}개, 지표 그룹 ${groupCount}개`);
}
