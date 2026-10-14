import { describe, expect, it } from 'vitest';
import { artIdFromFile, artItems, MOON_LOOKS, moonLook, PLANET_LOOKS, planetLook, planetPool } from '../shared/artlist';
import { existsSync, readdirSync } from 'node:fs';

const ids = artItems().map((i) => i.id);
describe('planet and moon pictures', () => {
  it('a world always gets the same look, and different worlds get different ones', () => {
    for (const id of ['p1', 'planet-abc', 'x']) { expect(planetLook(id, 30)).toBe(planetLook(id, 30)); expect(moonLook(id)).toBe(moonLook(id)); }
    const looks = new Set(Array.from({ length: 200 }, (_, i) => planetLook(`planet-${i}`, 30)));
    expect(looks.size).toBe(planetPool(30).length);
    expect(new Set(Array.from({ length: 200 }, (_, i) => moonLook(`moon-${i}`))).size).toBe(Object.keys(MOON_LOOKS).length);
  });
  it('the look suits the temperature: nothing hot is icy and nothing cold is molten', () => {
    for (let i = 0; i < 200; i++) {
      expect(planetLook('h' + i, 200)).not.toBe('ice');
      expect(planetLook('c' + i, -100)).not.toBe('lava');
    }
    for (const t of [240, 50, 0, -100]) expect(planetPool(t).every((l) => l in PLANET_LOOKS)).toBe(true);
  });
  it('turns the generator file names into item ids', () => {
    expect(artIdFromFile('media-generation-metalmine-0-84fa1d96-744d-4175-842e-911b55af7573.webp', 'buildings', ids)).toBe('metalMine');
    expect(artIdFromFile('media-generation-antiballisticmissile-0-03bd5bd8-b089-4a76-812a-e09549e00952.webp', 'defenses', ids)).toBe('antiBallisticMissile');
    expect(artIdFromFile('media-generation-gasgiant-0-17a034bc-bef2-4072-8742-05b6d107ad97.webp', 'planets', ids)).toBe('planet-gasgiant');
    expect(artIdFromFile('media-generation-iceplanet-0-7abbc4e3-1d47-464e-a83b-be135bdbea8a.webp', 'planets', ids)).toBe('planet-ice');
    expect(artIdFromFile('media-generation-icemoon-0-e32adec7-745c-49b0-932a-76768c9875e9.webp', 'moons', ids)).toBe('moon-ice');
    expect(artIdFromFile('media-generation-nothing-0-e32adec7-745c-49b0-932a-76768c9875e9.webp', 'ships', ids)).toBeNull();
  });
  it('every item that has a file is a known item, and every look has its picture', () => {
    const dir = 'client/src/assets/art';
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).filter((x) => /\.webp$/.test(x) && !/\.thumb\.webp$/.test(x))) {
      expect(ids, f).toContain(f.replace(/\.webp$/, ''));
      if (!/^(planet|moon)banner-/.test(f)) expect(existsSync(`${dir}/${f.replace(/\.webp$/, '.thumb.webp')}`), `${f} needs its small copy: npm run art -- optimize`).toBe(true);   // the wide banners have none
    }
    for (const k of Object.keys(PLANET_LOOKS)) expect(existsSync(`${dir}/planet-${k}.webp`), k).toBe(true);
    for (const k of Object.keys(MOON_LOOKS)) expect(existsSync(`${dir}/moon-${k}.webp`), k).toBe(true);
    for (const k of Object.keys(PLANET_LOOKS)) expect(existsSync(`${dir}/planetbanner-${k}.webp`), 'banner ' + k).toBe(true);
    for (const k of Object.keys(MOON_LOOKS)) expect(existsSync(`${dir}/moonbanner-${k}.webp`), 'banner ' + k).toBe(true);
  });
});
