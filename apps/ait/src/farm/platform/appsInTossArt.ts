import type { FarmArt } from '../../../../../packages/farm-ui/src';
import { appsInTossUiArt } from './uiArt.generated';

// Same rationale as appsInTossAudio: the Granite runtime cannot load
// require()-based local assets, so generated art streams from Firebase Hosting
// (repo path web/art, deploy steps in docs/apps-in-toss-registration.md).
// RN's image pipeline caches by URL; CropGlyph falls back to the emoji glyph
// on load failure, so a missing hosting deploy degrades gracefully.
const ART_BASE_URL = 'https://happy-farm-tycoon.web.app/art';

export const appsInTossFarmArt: FarmArt = {
  cropIcon: (cropKey) => ({ uri: `${ART_BASE_URL}/crop_${cropKey}.png` }),
  stageIcon: (stage) => ({ uri: `${ART_BASE_URL}/stage_${stage}.png` }),
  // UI 스킨과 아이콘은 첫 렌더에 깜빡이지 않도록 base64로 넣는다(#606). 앱인토스는 커스텀 서체를
  // 확인하지 못해 displayFontFamily 없이 외곽선 글자로 그린다.
  ui: appsInTossUiArt,
};
