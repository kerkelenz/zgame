import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { processMovements, sendFleet } from '../server/fleet';
import { createWorld, ck, type Planet, type Player, type World } from '../server/world';
import { UNITS } from '../shared/data';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
let w: World; let alice: Player, bob: Player; let ap: Planet, bp: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 50, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bobby', 'secret2', T0).player;
  ap = w.planets[alice.planetIds[0]]; bp = w.planets[bob.planetIds[0]];
  ap.coords = { g: 1, s: 5, p: 6 }; bp.coords = { g: 1, s: 6, p: 6 };
  alice.techs = { combustionDrive: 8, impulseDrive: 8, hyperspaceDrive: 8, computer: 4, weapons: 8, shielding: 8, armour: 8 };
  ap.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
  bp.resources = { metal: 1e6, crystal: 1e6, deuterium: 0 };
  bp.defenses = {};
});

describe('the Reaper', () => {
  it('is a heavy warship with a hold, behind Shipyard 10, Hyperspace Drive 6 and Shielding Technology 6', () => {
    const d = UNITS.reaper;
    expect(d.attack).toBeGreaterThan(1000);
    expect(d.cargo).toBe(10_000);
    expect(d.requires).toEqual([{ id: 'shipyard', level: 10 }, { id: 'hyperspaceDrive', level: 6 }, { id: 'shielding', level: 6 }]);
  });
  it('collects a debris field on a Recycle mission, as far as its hold reaches, with no Recycler along', () => {
    w.debris[ck({ g: 1, s: 6, p: 9 })] = { metal: 60_000, crystal: 40_000 };
    ap.fleet = { reaper: 6 };                                                  // room for 60,000
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: { g: 1, s: 6, p: 9 }, ships: { reaper: 6 }, mission: 'recycle' }, T0);
    processMovements(w, m.arriveAt);
    expect(alice.stats.harvested).toBe(60_000);
    const left = w.debris[ck({ g: 1, s: 6, p: 9 })];
    expect(left.metal + left.crystal).toBe(40_000);
  });
  it('a fleet with neither Recyclers nor Reapers cannot be sent to recycle', () => {
    w.debris[ck({ g: 1, s: 6, p: 9 })] = { metal: 1000, crystal: 1000 };
    ap.fleet = { battleship: 5 };
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: { g: 1, s: 6, p: 9 }, ships: { battleship: 5 }, mission: 'recycle' }, T0)).toThrow(/Recyclers or Reapers/);
  });
  it('takes part of the debris of a battle it fights in straight into its hold', () => {
    bp.fleet = { cruiser: 40, lightFighter: 200 };
    ap.fleet = { battleship: 60, reaper: 10 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { battleship: 60, reaper: 10 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    const field = w.debris[ck(bp.coords)] ?? { metal: 0, crystal: 0 };
    expect(alice.stats.harvested).toBeGreaterThan(0);
    // what the reapers took plus what lies in orbit is the whole debris of the fight, and they took at most 30% of it
    const took = alice.stats.harvested, orbit = field.metal + field.crystal;
    expect(took / (took + orbit)).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(took).toBeLessThanOrEqual(10 * UNITS.reaper.cargo);                  // and no more than their holds take
    void HOUR;
  });
  it('a fleet without Reapers leaves all of the debris in orbit', () => {
    bp.fleet = { cruiser: 40, lightFighter: 200 };
    ap.fleet = { battleship: 60 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { battleship: 60 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    expect(alice.stats.harvested).toBe(0);
    expect(w.debris[ck(bp.coords)]).toBeDefined();
  });
});
