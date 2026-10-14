import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { createMoon, createPlanet } from '../server/galaxy';
import { assignLook, dedupeLooks, migrateLooks } from '../server/looks';
import { loadWorld, saveWorld } from '../server/store';
import { planetView } from '../server/views';
import { createWorld } from '../server/world';
import { LEGACY_MOON_LOOKS, MOON_LOOKS, PLANET_LOOKS, artIdFromFile, artItems, legacyPlanetLook, legacyPlanetPool, moonBannerId, planetBannerId, planetPool } from '../shared/artlist';

const T0 = 1_700_000_000_000;
const setup = () => {
  const w = createWorld({ npcDensity: 0 }, T0);
  const a = register(w, 'alice', 'secret1', T0).player;
  const home = w.planets[a.planetIds[0]];
  return { w, a, home };
};

describe('a world keeps its look', () => {
  it('is picked from the pool that suits its temperature and stored, so asking again gives the same', () => {
    const { home } = setup();
    const look = assignLook(home);                                        // given when the world was made
    expect(planetPool(home.maxTemp)).toContain(look);
    expect(home.look).toBe(look);
    home.maxTemp = -100;                                                  // even if the temperature rule would now say something else
    expect(assignLook(home)).toBe(look);
  });
  it('a moon gets one of the moon looks', () => {
    const { w, home } = setup();
    const moon = createMoon(w, home, 4000);
    expect(Object.keys(MOON_LOOKS)).toContain(assignLook(moon));
  });
  it('shows in the planet view, and a view never changes it', () => {
    const { w, home } = setup();
    const first = planetView(w, home, T0).look;
    expect(first).toBeTruthy();
    expect(planetView(w, home, T0 + 1000).look).toBe(first);
  });
  it('worlds that existed before looks were stored keep the look they were showing', () => {
    const { w, home } = setup();
    const moon = createMoon(w, home, 4000);
    home.look = undefined; moon.look = undefined;                         // as in a save from before looks were stored
    const before = { planet: legacyPlanetLook(home.id, home.maxTemp), moon: LEGACY_MOON_LOOKS[0] };
    expect(legacyPlanetPool(home.maxTemp)).toContain(before.planet);
    expect(w.looksAssigned).toBeUndefined();
    migrateLooks(w);
    expect(home.look).toBe(before.planet);
    expect(LEGACY_MOON_LOOKS).toContain(moon.look);
    expect(w.looksAssigned).toBe(true);
    const keep = home.look;
    home.look = 'twilight';                                              // migrating again does nothing
    migrateLooks(w);
    expect(home.look).toBe('twilight');
    void keep;
  });
  it('a saved world from before gets its looks pinned when it is loaded, and not again', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zg-looks-'));
    try {
      const { w, home } = setup();
      const file = join(dir, 'world.json');
      home.look = undefined;                                              // a save from before looks were stored has none
      saveWorld(file, w);
      const loaded = loadWorld(file, {});
      expect(loaded.looksAssigned).toBe(true);
      expect(loaded.planets[home.id].look).toBe(legacyPlanetLook(home.id, home.maxTemp));
      loaded.planets[home.id].look = 'aurora';
      saveWorld(file, loaded);
      expect(loadWorld(file, {}).planets[home.id].look).toBe('aurora');
    } finally { rmSync(dir, { recursive: true, force: true }); writeFileSync(join(tmpdir(), 'zg-looks-done'), ''); }
  });
});

describe('the looks and their pictures', () => {
  it('every look is in a pool for some temperature, and new worlds draw from more looks than before', () => {
    const used = new Set([200, 40, 0, -100].flatMap((t) => planetPool(t)));
    for (const k of Object.keys(PLANET_LOOKS)) expect(used.has(k), k).toBe(true);
    for (const t of [200, 40, 0, -100]) { expect(planetPool(t).length).toBeGreaterThan(legacyPlanetPool(t).length); for (const k of legacyPlanetPool(t)) expect(planetPool(t)).toContain(k); }
  });
  it('has a banner for every planet look and every moon look, in the art list', () => {
    const ids = artItems().map((i) => i.id);
    for (const k of Object.keys(PLANET_LOOKS)) expect(ids).toContain(planetBannerId(k));
    for (const k of Object.keys(MOON_LOOKS)) expect(ids).toContain(moonBannerId(k));
    expect(artItems().filter((i) => i.kind === 'banner')).toHaveLength(Object.keys(PLANET_LOOKS).length + Object.keys(MOON_LOOKS).length);
  });
  it('reads banner file names from the generator', () => {
    const ids = artItems().map((i) => i.id);
    expect(artIdFromFile('media-generation-auroraplanetbanner-0-e1fc443d-6a98-4c09-a255-6cab2817b6e9.webp', 'planetbanners', ids)).toBe('planetbanner-aurora');
    expect(artIdFromFile('media-generation-gasgiantbanner-0-fbf28560-d720-4f03-ae92-6322b1201158.webp', 'planetbanners', ids)).toBe('planetbanner-gasgiant');
    expect(artIdFromFile('media-generation-stormmoonbanner-0-59ec0a65-ab33-492f-9cde-8619d895e71a.webp', 'planetbanners', ids)).toBe('moonbanner-storm');
    expect(artIdFromFile('media-generation-stormplanetbanner-0-38f082e1-5819-42c6-87df-69d59e87018d.webp', 'planetbanners', ids)).toBe('planetbanner-storm');
    expect(artIdFromFile('media-generation-nothingbanner-0-38f082e1-5819-42c6-87df-69d59e87018d.webp', 'planetbanners', ids)).toBeNull();
  });
});

describe('every world looks different, as far as the looks last', () => {
  const many = (n: number) => {
    const w = createWorld({ npcDensity: 0 }, T0);
    const homes = Array.from({ length: n }, (_, i) => w.planets[register(w, 'cmdr' + i, 'secret1', T0).player.planetIds[0]]);
    return { w, homes };
  };
  it('gives every commander planet a different look while there are looks left', () => {
    const { homes } = many(19);
    expect(new Set(homes.map((h) => h.look)).size).toBe(19);
  });
  it('keeps the temperature rule while the suitable looks last, and repeats as little as possible after that', () => {
    const { homes } = many(8);
    for (const h of homes) expect(planetPool(h.maxTemp)).toContain(h.look);
    const more = many(40).homes.map((h) => h.look!);
    const counts = new Map<string, number>();
    for (const l of more) counts.set(l, (counts.get(l) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);          // 40 worlds over 19 looks: nobody has more than three of one
    expect(new Set(more).size).toBe(19);
  });
  it('gives every moon a different look too, up to the number of moon looks', () => {
    const { w, homes } = many(29);
    const moons = homes.map((h) => createMoon(w, h, 4000));
    expect(new Set(moons.map((m) => m.look)).size).toBe(29);
  });
  it('lets computer empires have any look without using up the looks of commanders', () => {
    const w = createWorld({ npcDensity: 0 }, T0);
    const a = register(w, 'alice', 'secret1', T0).player;
    const npc = { ...a, id: 'n1', username: 'Empire', planetIds: [], npc: { status: 'inactive', seedPoints: 10, faction: null } } as never;
    w.players.n1 = npc;
    const taken = new Set<string>();
    for (let i = 0; i < 12; i++) { const p = createPlanet(w, npc, { g: 1, s: 20 + i, p: 6 }, { now: T0 }); taken.add(p.look!); }
    const b = register(w, 'bobby', 'secret2', T0).player;
    expect(w.planets[b.planetIds[0]].look).toBeTruthy();
    expect(w.planets[a.planetIds[0]].look).not.toBe(w.planets[b.planetIds[0]].look);
  });
  it('a save with repeated looks gets them spread out once, the oldest world keeping its picture', () => {
    const { w, homes } = many(6);
    for (const h of homes) h.look = 'lava';
    dedupeLooks(w);
    expect(homes[0].look).toBe('lava');
    expect(new Set(homes.map((h) => h.look)).size).toBe(6);
    const keep = homes.map((h) => h.look);
    homes[3].look = 'lava';
    dedupeLooks(w);                                                         // only once
    expect(homes[3].look).toBe('lava');
    expect(homes.filter((_, i) => i !== 3).map((h) => h.look)).toEqual(keep.filter((_, i) => i !== 3));
  });
});
