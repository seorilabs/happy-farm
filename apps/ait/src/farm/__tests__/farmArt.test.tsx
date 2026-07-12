/// <reference types="jest" />

import React from 'react';
import { Image } from 'react-native';
import { cleanup, fireEvent, render } from '@testing-library/react-native';

import { CROPS, type CropKey } from '../../../../../packages/farm-core/src';
import { CropGlyph, FarmArtProvider, type FarmArt } from '../../../../../packages/farm-ui/src';
import { appsInTossFarmArt } from '../platform/appsInTossArt';

const CARROT_ART: FarmArt = {
  cropIcon: () => ({ uri: 'https://example.com/art/crop_carrot.png' }),
};

describe('CropGlyph', () => {
  afterEach(() => {
    cleanup();
  });

  test('renders the emoji glyph when no art is provided', () => {
    const screen = render(<CropGlyph cropKey="carrot" emoji="🥕" size={24} />);

    expect(screen.getByText('🥕')).toBeTruthy();
    expect(screen.UNSAFE_queryByType(Image)).toBeNull();
  });

  test('renders the resolved image instead of the emoji when art provides one', () => {
    const screen = render(
      <FarmArtProvider art={CARROT_ART}>
        <CropGlyph cropKey="carrot" emoji="🥕" size={24} />
      </FarmArtProvider>
    );

    const image = screen.UNSAFE_getByType(Image);
    expect(image.props.source).toEqual({ uri: 'https://example.com/art/crop_carrot.png' });
    expect(image.props.style).toEqual({ width: 24, height: 24 });
    expect(screen.queryByText('🥕')).toBeNull();
  });

  test('falls back to the emoji when the image fails to load', () => {
    const screen = render(
      <FarmArtProvider art={CARROT_ART}>
        <CropGlyph cropKey="carrot" emoji="🥕" size={24} />
      </FarmArtProvider>
    );

    fireEvent(screen.UNSAFE_getByType(Image), 'error');

    expect(screen.getByText('🥕')).toBeTruthy();
    expect(screen.UNSAFE_queryByType(Image)).toBeNull();
  });

  test('renders the emoji when the resolver returns null for the crop', () => {
    const art: FarmArt = { cropIcon: () => null };
    const screen = render(
      <FarmArtProvider art={art}>
        <CropGlyph cropKey="carrot" emoji="🥕" size={24} />
      </FarmArtProvider>
    );

    expect(screen.getByText('🥕')).toBeTruthy();
  });
});

describe('appsInTossFarmArt', () => {
  test('maps every crop key to its hosted art URI', () => {
    for (const cropKey of Object.keys(CROPS) as CropKey[]) {
      expect(appsInTossFarmArt.cropIcon?.(cropKey)).toEqual({
        uri: `https://happy-farm-tycoon.web.app/art/crop_${cropKey}.png`,
      });
    }
  });

  test('maps growth stages and the soil tile to hosted art URIs', () => {
    expect(appsInTossFarmArt.stageIcon?.('sprout')).toEqual({
      uri: 'https://happy-farm-tycoon.web.app/art/stage_sprout.png',
    });
    expect(appsInTossFarmArt.stageIcon?.('sapling')).toEqual({
      uri: 'https://happy-farm-tycoon.web.app/art/stage_sapling.png',
    });
    expect(appsInTossFarmArt.soilTile).toEqual({
      uri: 'https://happy-farm-tycoon.web.app/art/tile_soil.png',
    });
  });
});
