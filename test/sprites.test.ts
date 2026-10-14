import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOON_LOOKS, PLANET_LOOKS, moonArtId, planetArtId } from '../shared/artlist';

describe('the cut-out pictures for the bodies that cross the banner', () => {
  it('exist for every planet and moon look (npm run art -- sprites makes them)', () => {
    const missing = [
      ...Object.keys(PLANET_LOOKS).map(planetArtId),
      ...Object.keys(MOON_LOOKS).map(moonArtId),
    ].filter((id) => !existsSync(`client/src/assets/art/${id}.sprite.webp`));
    expect(missing).toEqual([]);
  });
});
