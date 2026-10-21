import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { updatePlanet } from '../server/economy';
import { processMovements, sendFleet } from '../server/fleet';
import { createWorld, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
let w: World; let alice: Player; let ap: Planet, bp: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0, deathstarFuel: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  const bob = register(w, 'bobby', 'secret2', T0).player;
  ap = w.planets[alice.planetIds[0]]; bp = w.planets[bob.planetIds[0]];
  ap.coords = { g: 1, s: 5, p: 6 }; bp.coords = { g: 1, s: 5, p: 8 };
  ap.buildings = { shipyard: 5 };
  ap.resources = { metal: 1e7, crystal: 1e7, deuterium: 1e7 };
  bp.fleet = {}; bp.defenses = { rocketLauncher: 3 };
});

const fight = () => {
  ap.fleet = { cruiser: 40 };
  const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 40 }, mission: 'attack' }, T0);
  processMovements(w, m.arriveAt);
  return m;
};

describe('battle damage', () => {
  it('a share of the surviving ships come home damaged, go into repair and rejoin after the repair time', () => {
    const m = fight();
    const home = w.movements[m.id];
    const survivors = home.ships.cruiser!;
    expect(survivors).toBeGreaterThan(0);
    expect(home.damaged!.cruiser).toBe(Math.round(survivors * 0.3));
    const metalBefore = ap.resources.metal;
    const land = m.arriveAt + m.flightMs + 5;
    processMovements(w, land);
    const damaged = Math.round(survivors * 0.3);
    expect(ap.fleet.cruiser).toBe(survivors - damaged);
    expect(ap.repairs).toHaveLength(1);
    expect(ap.repairs![0].ships.cruiser).toBe(damaged);
    expect(ap.resources.metal).toBeLessThan(metalBefore + 1);            // the dock took its share
    updatePlanet(w, ap, land + 2 * HOUR);
    expect(ap.fleet.cruiser).toBe(survivors - damaged);
    updatePlanet(w, ap, land + 4 * HOUR);
    expect(ap.fleet.cruiser).toBe(survivors);
    expect(ap.repairs).toHaveLength(0);
    expect(w.messages.some((x) => x.to === alice.id && x.subject === 'Ships repaired')).toBe(true);
  });

  it('damaged ships cannot be sent again before the repair is done', () => {
    const m = fight();
    const survivors = w.movements[m.id].ships.cruiser!;
    processMovements(w, m.arriveAt + m.flightMs + 5);
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: survivors }, mission: 'attack' }, m.arriveAt + m.flightMs + 10)).toThrow(/Not enough/);
  });

  it('a battleDamage of 0 switches it off', () => {
    w.config.battleDamage = 0;
    const m = fight();
    expect(w.movements[m.id].damaged).toBeUndefined();
    processMovements(w, m.arriveAt + m.flightMs + 5);
    expect(ap.repairs ?? []).toHaveLength(0);
  });
});
