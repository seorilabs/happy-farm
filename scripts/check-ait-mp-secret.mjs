#!/usr/bin/env node
// GA4 Measurement Protocol API secret이 실수로 커밋되는 것을 막는 정적 가드.
//
// apps/ait/src/firebaseWeb/mpSecret.generated.ts 는 항상 빈 placeholder로 커밋되어야 하고,
// 실제 secret은 배포 빌드에서만 scripts/write-ait-mp-config.mjs 로 주입된다. 로컬에서
// 주입 스크립트를 돌린 뒤 그대로 커밋하면 secret이 저장소에 남으므로 여기서 차단한다.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const target = path.join(process.cwd(), 'apps/ait/src/firebaseWeb/mpSecret.generated.ts');
const source = readFileSync(target, 'utf8');

const match = source.match(/export const GA4_MP_API_SECRET = '([^']*)';/);
if (match == null) {
  console.error(`[check:ait-mp-secret] ${target} 에서 GA4_MP_API_SECRET 선언을 찾지 못했습니다.`);
  process.exit(1);
}

if (match[1] !== '') {
  console.error(
    '[check:ait-mp-secret] mpSecret.generated.ts 에 비어 있지 않은 secret이 있습니다. ' +
      "커밋 전 빈 placeholder(GA4_MP_API_SECRET = '')로 되돌리세요. 실제 secret은 배포 빌드에서만 주입합니다.",
  );
  process.exit(1);
}

console.log('[check:ait-mp-secret] OK (placeholder 비어 있음).');
