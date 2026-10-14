import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { processMovements, sendFleet } from '../server/fleet';
import { CAP_MEDIANS, REWARD, announceInvasion, bossBudget, invasionView, processInvasion } from '../server/invasion';
import { createWorld, type Planet, type Player, type World } from '../server/world';

const T0 = Date.UTC(2026, 9, 12, 8);
let w: World; let players: Player[]; let planets: Planet[];

const setFleets = (cruisers: number[]) => cruisers.forEach((n, i) => { planets[i].fleet = n ? { cruiser: n } : {}; });

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0, invasionStrength: 0.35, invasionMinPlayers: 2 }, T0 - 30 * 86_400_000);
  players = ['ann', 'bob', 'cat', 'dan'].map((n) => register(w, n, 'secret1', T0 - 30 * 86_400_000).player);
  for (const p of players) { p.techs = { combustionDrive: 6, impulseDrive: 5, computer: 8, weapons: 3, shielding: 3, armour: 3, espionage: 5 }; p.lastSeen = T0; }
  planets = players.map((p) => w.planets[p.planetIds[0]]);
  for (const pl of planets) pl.resources = { metal: 1e12, crystal: 1e12, deuterium: 1e12 };
});

describe('the Armada is sized to the typical fleet', () => {
  it('one huge fleet does not size it: the same as if that fleet were three times the median', () => {
    setFleets([1000, 1000, 1000, 1000]);                                       // four equal fleets
    const equal = bossBudget(w);
    setFleets([1000, 1000, 1000, 100_000]);                                    // one whale, a hundred times the others
    const whale = bossBudget(w);
    setFleets([1000, 1000, 1000, CAP_MEDIANS * 1000]);                         // a fleet at exactly the cap
    const atCap = bossBudget(w);
    expect(whale).toBeCloseTo(atCap, 0);
    expect(whale).toBeGreaterThan(equal);                                      // the whale still counts, up to the cap
    expect(whale).toBeLessThan(equal * 2);                                     // but not a hundred times
  });
  it('equal fleets are all counted in full, and an empty server gets the floor', () => {
    setFleets([500, 500, 500, 500]);
    const all = bossBudget(w);
    setFleets([500, 500, 500, 0]);
    expect(all).toBeGreaterThan(bossBudget(w));
    setFleets([0, 0, 0, 0]);
    expect(bossBudget(w)).toBe(1_000_000);
  });
});

describe('the rewards favour the work that does not need a big fleet a bit more', () => {
  it('weights add up to one and the front damage is no longer the larger half', () => {
    const sum = Object.values(REWARD.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
    expect(REWARD.weights.damage).toBeLessThan(0.5);
    expect(REWARD.weights.home + REWARD.weights.supply + REWARD.weights.scout).toBeGreaterThan(0.5);
  });
});

describe('the strength meter', () => {
  it('is not there before the rift opens, and then estimates the fight with and without your fleet', () => {
    setFleets([800, 40, 40, 0]);
    announceInvasion(w, T0, 0);
    expect(invasionView(w, players[0].id, T0).active!.meter).toBeNull();      // between the announcement and the rift
    processInvasion(w, T0);
    const meter = invasionView(w, players[0].id, T0 + 1000).active!.meter!;
    expect(meter.field).toBeGreaterThan(0);
    expect(meter.mineHome).toBeGreaterThan(0);
    expect(meter.held.value).toBe(0);
    expect(meter.chanceHeld).toBe(0);                                          // nobody is at the rift
    expect(meter.chanceWithMine).toBeGreaterThanOrEqual(meter.chanceHeld);
    // a small fleet waiting at the rift
    const m = sendFleet(w, players[1], { fromPlanetId: planets[1].id, to: w.invasion!.rift, ships: { cruiser: 40 }, mission: 'invade' }, T0);
    processMovements(w, m.arriveAt);
    const after = invasionView(w, players[0].id, m.arriveAt).active!.meter!;
    expect(after.held.commanders).toBe(1);
    expect(after.held.value).toBeGreaterThan(0);
    expect(after.chanceWithMine).toBeGreaterThanOrEqual(after.chanceHeld);
    for (const c of [after.chanceHeld, after.chanceWithMine]) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(1); }
    // the same question twice costs nothing: the answer is kept for a minute
    expect(invasionView(w, players[0].id, m.arriveAt + 1000).active!.meter).toEqual(after);
  });
});
