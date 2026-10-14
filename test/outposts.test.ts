import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { npcTick } from '../server/empires';
import { processMovements, sendFleet } from '../server/fleet';
import { galaxyView } from '../server/galaxy';
import { ACHIEVEMENTS } from '../server/progress';
import { OUTPOST, averageCombatFleet, garrisonValue, generateOutposts, outpostOf, processOutposts } from '../server/outposts';
import { rankings } from '../server/rankings';
import { UNITS } from '../shared/data';
import { createWorld, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
let w: World; let alice: Player; let ap: Planet;

beforeEach(() => {
  w = createWorld({ galaxies: 2, systems: 12, positions: 15, economySpeed: 20, fleetSpeed: 50, protectionPoints: 100, raidIntervalMin: 0, npcDensity: 0, outpostsPerGalaxy: 5 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  ap = w.planets[alice.planetIds[0]];
  ap.coords = { g: 1, s: 6, p: 6 };
  ap.buildings = { roboticsFactory: 4, shipyard: 6, researchLab: 6, solarPlant: 20, metalMine: 15, crystalMine: 12 };
  ap.resources = { metal: 3e7, crystal: 3e7, deuterium: 3e7 };
  alice.techs = { combustionDrive: 6, impulseDrive: 4, energy: 8, computer: 3, espionage: 5, weapons: 8, shielding: 8, armour: 8 };
});

describe('outposts: settling', () => {
  it('settles the configured number in every galaxy, on free positions, each with a garrison and a treasure', () => {
    expect(generateOutposts(w, T0)).toBe(10);
    expect(w.outposts).toHaveLength(10);
    for (const g of [1, 2]) expect(w.outposts!.filter((o) => w.planets[o.planetId].coords.g === g)).toHaveLength(5);
    const spots = new Set(w.outposts!.map((o) => JSON.stringify(w.planets[o.planetId].coords)));
    expect(spots.size).toBe(10);
    for (const o of w.outposts!) {
      const pl = w.planets[o.planetId], npc = w.players[o.npcId];
      expect(npc.npc?.outpost).toEqual({ kind: o.kind, tier: o.tier });
      expect(npc.npc?.status).toBe('inactive');
      expect(Object.keys(pl.fleet).length + Object.keys(pl.defenses).length).toBeGreaterThan(0);
      expect(pl.resources.metal).toBeGreaterThan(0);
      expect(o.state).toBe('guarded');
    }
  });
  it('is the same for the same seed, and none when switched off', () => {
    generateOutposts(w, T0, 42);
    const first = w.outposts!.map((o) => `${o.kind}${o.tier}${o.name}`).join();
    const w2 = createWorld({ galaxies: 2, systems: 12, positions: 15, npcDensity: 0, outpostsPerGalaxy: 5, rngSeed: w.rngSeed } as never, T0);
    generateOutposts(w2, T0, 42);
    expect(w2.outposts!.map((o) => `${o.kind}${o.tier}${o.name}`).join()).toBe(first);
    const w3 = createWorld({ npcDensity: 0, outpostsPerGalaxy: 0 }, T0);
    expect(generateOutposts(w3, T0)).toBe(0);
  });
  it('shows in the Galaxy, never in the rankings, and holds no grudge', () => {
    generateOutposts(w, T0);
    const o = w.outposts![0], pl = w.planets[o.planetId];
    const slot = galaxyView(w, alice, pl.coords.g, pl.coords.s, T0).find((x) => x.planet?.id === pl.id)!;
    expect(slot.planet!.outpost).toMatchObject({ kind: o.kind, tier: o.tier, state: 'guarded' });
    expect(rankings(w, true).some((r) => r.id === o.npcId)).toBe(false);
    alice.heat[o.npcId] = 90_000;
    npcTick(w, T0 + HOUR);
    expect(w.players[o.npcId].npc!.status).toBe('inactive');
    expect(alice.heat[o.npcId]).toBeUndefined();
  });
});

describe('outposts: strength', () => {
  it('a garrison is measured against the fleets of the active commanders, never below the floor', () => {
    expect(garrisonValue(w, 1, T0)).toBe(OUTPOST.floor[0]);
    ap.fleet = { battleship: 400, cruiser: 400 };                              // a big fleet
    const avg = averageCombatFleet(w, T0);
    expect(avg).toBeGreaterThan(OUTPOST.floor[3]);
    expect(garrisonValue(w, 3, T0)).toBeCloseTo(avg * OUTPOST.share[2], 0);
    expect(garrisonValue(w, 4, T0)).toBeGreaterThan(garrisonValue(w, 1, T0));
    alice.lastSeen = T0 - 30 * 24 * HOUR;                                      // not seen for a month: does not count
    expect(averageCombatFleet(w, T0)).toBe(0);
  });
});

describe('outposts: clearing and rebuilding', () => {
  const tier1 = () => {
    generateOutposts(w, T0);
    const o = w.outposts!.find((x) => x.tier === 1)!;
    return { o, pl: w.planets[o.planetId] };
  };
  it('a winning fleet breaks it, is paid the bounty and the outpost is rebuilt after the delay', () => {
    const { o, pl } = tier1();
    ap.fleet = { battleship: 300, largeCargo: 100 };
    const credits = alice.credits;
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: pl.coords, ships: { battleship: 300, largeCargo: 100 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    expect(o.state).toBe('cleared');
    expect(alice.credits - credits).toBe(OUTPOST.bounty[0]);
    expect(alice.stats.outpostsCleared).toBe(1);
    expect(w.messages.some((x) => x.to === alice.id && /cleared/.test(x.subject))).toBe(true);
    // a second fleet in the meantime gets loot at most, no second bounty
    const again = alice.credits;
    ap.fleet = { battleship: 10 };
    const m2 = sendFleet(w, alice, { fromPlanetId: ap.id, to: pl.coords, ships: { battleship: 10 }, mission: 'attack' }, m.arriveAt + 1000);
    processMovements(w, m2.arriveAt);
    expect(alice.credits).toBe(again);
    // rebuilt
    expect(o.respawnAt).toBe(m.arriveAt + w.config.outpostRespawnHours * HOUR);
    processOutposts(w, o.respawnAt! - 1);
    expect(o.state).toBe('cleared');
    processOutposts(w, o.respawnAt!);
    expect(o.state).toBe('guarded');
    expect(Object.keys(pl.fleet).length + Object.keys(pl.defenses).length).toBeGreaterThan(0);
  });
  it('a failed attack pays nothing and leaves it standing', () => {
    generateOutposts(w, T0);
    const o = w.outposts!.find((x) => x.tier === 1)!, pl = w.planets[o.planetId];
    ap.fleet = { lightFighter: 3, smallCargo: 1 };
    const credits = alice.credits;
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: pl.coords, ships: { lightFighter: 3, smallCargo: 1 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    expect(o.state).toBe('guarded');
    expect(alice.credits).toBe(credits);
  });
  it('there is an achievement for the first outpost broken', () => {
    const a = ACHIEVEMENTS.find((x) => x.id === 'outpostBreaker')!;
    expect(a.test(w, alice)).toBe(false);
    alice.stats.outpostsCleared = 1;
    expect(a.test(w, alice)).toBe(true);
    void outpostOf;
  });
});

describe('outposts: the treasure does not outweigh the fight', () => {
  it('holds well under the value of the garrison, so a win pays for its repairs and little more', () => {
    generateOutposts(w, T0);
    const v = (id: string) => (UNITS as any)[id].cost.metal + (UNITS as any)[id].cost.crystal;
    for (const o of w.outposts!) {
      const pl = w.planets[o.planetId];
      const garrison = Object.entries({ ...pl.fleet, ...pl.defenses }).reduce((t, [id, n]) => t + (n as number) * v(id), 0);
      const treasure = pl.resources.metal + pl.resources.crystal * 1.5 + pl.resources.deuterium * 3;
      expect(treasure, `${o.kind} ${o.tier}`).toBeLessThan(garrison * 0.65);
    }
  });
  it('is rebuilt after twelve hours by default', () => {
    expect(w.config.outpostRespawnHours).toBe(12);
  });
});
