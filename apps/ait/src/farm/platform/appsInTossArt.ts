import type { FarmArt } from '../../../../../packages/farm-ui/src';

// Same rationale as appsInTossAudio: the Granite runtime cannot load
// require()-based local assets, so generated art streams from Firebase Hosting
// (repo path web/art, deploy steps in docs/apps-in-toss-registration.md).
// RN's image pipeline caches by URL; CropGlyph falls back to the emoji glyph
// on load failure, so a missing hosting deploy degrades gracefully.
const ART_BASE_URL = 'https://happy-farm-tycoon.web.app/art';

export const appsInTossFarmArt: FarmArt = {
  cropIcon: (cropKey) => ({ uri: `${ART_BASE_URL}/crop_${cropKey}.png` }),
  stageIcon: (stage) => ({ uri: `${ART_BASE_URL}/stage_${stage}.png` }),
};
