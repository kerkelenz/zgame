import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { createPlanet } from '../server/galaxy';
import { gatherResources } from '../server/logistics';
import { createWorld, GameError, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
let w: World; let a: Player; let home: Planet, c1: Planet, c2: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  a = register(w, 'alice', 'secret1', T0).player;
  a.techs = { combustionDrive: 6, impulseDrive: 4, astrophysics: 10, computer: 10 };
  home = w.planets[a.planetIds[0]];
  home.coords = { g: 1, s: 5, p: 6 };
  c1 = createPlanet(w, a, { g: 1, s: 8, p: 4 }, { now: T0 });
  c2 = createPlanet(w, a, { g: 1, s: 12, p: 9 }, { now: T0 });
  for (const p of [c1, c2]) p.resources = { metal: 100_000, crystal: 50_000, deuterium: 20_000 };
  home.resources = { metal: 0, crystal: 0, deuterium: 0 };
});

describe('gather resources', () => {
  it('sends loaded transports from every planet that has cargo ships', () => {
    c1.fleet = { largeCargo: 10 }; c2.fleet = { smallCargo: 5 };
    const r = gatherResources(w, a, home.id, 50, ['metal', 'crystal'], T0);
    expect(r.sent.map((s) => s.from).sort()).toEqual([c1.name, c2.name].sort());
    const s1 = r.sent.find((s) => s.fromPlanetId === c1.id)!;
    expect(s1.cargo).toMatchObject({ metal: 50_000, crystal: 25_000, deuterium: 0 });
    // c2 only has 25k capacity: biggest stock first
    const s2 = r.sent.find((s) => s.fromPlanetId === c2.id)!;
    expect(s2.cargo.metal + s2.cargo.crystal).toBeLessThanOrEqual(25_000);
    expect(s2.cargo.metal).toBe(25_000);
    expect(Object.values(w.movements).filter((m) => m.mission === 'transport' && m.ownerId === a.id)).toHaveLength(2);
    expect(c1.fleet.largeCargo).toBeUndefined();
    expect(c1.resources.metal).toBe(50_000);
  });
  it('keeps fuel when moving deuterium and skips planets that cannot go', () => {
    c1.fleet = { largeCargo: 4 }; c2.resources.deuterium = 0; c2.fleet = { smallCargo: 2 };
    const r = gatherResources(w, a, home.id, 100, ['deuterium'], T0);
    const s = r.sent.find((x) => x.fromPlanetId === c1.id)!;
    expect(s.cargo.deuterium).toBeGreaterThan(0);
    expect(s.cargo.deuterium).toBeLessThan(20_000); // fuel stays behind
    expect(c1.resources.deuterium).toBeGreaterThanOrEqual(0);
    expect(r.skipped.find((x) => x.fromPlanetId === c2.id)!.reason).toMatch(/deuterium/);
  });
  it('skips planets without haulers, validates input and only targets your own planets', () => {
    const r = gatherResources(w, a, home.id, 90, ['metal'], T0);
    expect(r.sent).toEqual([]);
    expect(r.skipped).toHaveLength(2);
    expect(r.skipped[0].reason).toMatch(/no cargo ships/);
    expect(() => gatherResources(w, a, home.id, 90, [], T0)).toThrow(/at least one/);
    const b = register(w, 'bobby', 'secret2', T0).player;
    expect(() => gatherResources(w, b, home.id, 90, ['metal'], T0)).toThrow(GameError);
  });
});
