import { describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { galaxyView } from '../server/galaxy';
import { profileView } from '../server/profile';
import { createWorld } from '../server/world';
import { PLANET_LOOKS } from '../shared/artlist';

const T0 = 1_700_000_000_000;

describe('worlds show their look to other commanders', () => {
  it('the galaxy lists the look of every planet, the same one the owner sees', () => {
    const w = createWorld({ npcDensity: 0 }, T0);
    const a = register(w, 'alice', 'secret1', T0).player;
    const b = register(w, 'bob', 'secret2', T0).player;
    const home = w.planets[b.planetIds[0]];
    const { g, s } = home.coords;
    const slot = galaxyView(w, a, g, s, T0).find((x) => x.planet?.id === home.id)!;
    expect(Object.keys(PLANET_LOOKS)).toContain(slot.planet!.look);
    expect(slot.planet!.look).toBe(home.look);
  });
  it('a commander profile carries the home world look and name, and each planet of the list its own', () => {
    const w = createWorld({ npcDensity: 0 }, T0);
    const a = register(w, 'alice', 'secret1', T0).player;
    const b = register(w, 'bob', 'secret2', T0).player;
    const p = profileView(w, b.id, T0);
    const home = w.planets[b.planetIds[0]];
    expect(p.homeLook).toBe(home.look);
    expect(p.homeName).toBe(home.name);
    expect(p.locations[0].look).toBe(home.look);
    expect(a.id).not.toBe(b.id);
  });
});
