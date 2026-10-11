import { beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { abandonPlanet, maxFields, planetProduction, queueUnits, startBuilding } from '../server/economy';
import { jumpGate, maybeCreateMoon, moonChance, phalanxScan, processMovements, sendFleet } from '../server/fleet';
import { colonyCount, createMoon, createPlanet } from '../server/galaxy';
import { spawnRaid } from '../server/npc';
import { planetView } from '../server/views';
import { createWorld, planetAt, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;

let w: World;
let alice: Player, bob: Player;
let ap: Planet, bp: Planet, bm: Planet, am: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 100, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bob', 'secret2', T0).player;
  ap = w.planets[alice.planetIds[0]];
  bp = w.planets[bob.planetIds[0]];
  ap.coords = { g: 1, s: 5, p: 6 };
  bp.coords = { g: 1, s: 7, p: 8 };
  for (const p of [ap, bp]) {
    p.buildings = { roboticsFactory: 4, shipyard: 6, researchLab: 6, solarPlant: 20, metalStorage: 8, crystalStorage: 8, deuteriumTank: 8 };
    p.resources = { metal: 5e6, crystal: 5e6, deuterium: 5e6 };
  }
  alice.techs = { combustionDrive: 6, impulseDrive: 4, energy: 8, computer: 3, hyperspace: 7, astrophysics: 2 };
  bob.techs = { combustionDrive: 6, impulseDrive: 4, energy: 8, computer: 3 };
  am = createMoon(w, ap, T0);
  bm = createMoon(w, bp, T0);
  for (const m of [am, bm]) m.resources = { metal: 1e6, crystal: 1e6, deuterium: 1e6 };
});

describe('moon creation', () => {
  it('has a 20% chance once the debris field holds 100k, a smaller one below that', () => {
    expect(moonChance({ metal: 60_000, crystal: 40_000 })).toBeCloseTo(0.2);
    expect(moonChance({ metal: 9e6, crystal: 9e6 })).toBeCloseTo(0.2);               // never more
    expect(moonChance({ metal: 25_000, crystal: 0 })).toBeCloseTo(0.05);
    expect(moonChance({ metal: 0, crystal: 0 })).toBe(0);
  });

  it('forms when the roll beats the chance, once per planet', () => {
    const fresh = createPlanet(w, alice, { g: 1, s: 20, p: 6 }, { now: T0 });
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.19);
    expect(maybeCreateMoon(w, fresh, { metal: 0, crystal: 0 }, T0)).toBeNull();            // no debris, no moon
    const moon = maybeCreateMoon(w, fresh, { metal: 300_000, crystal: 200_000 }, T0);
    expect(moon?.isMoon).toBe(true);
    expect(moon?.coords).toEqual(fresh.coords);
    expect(moon?.parentId).toBe(fresh.id);
    expect(maybeCreateMoon(w, fresh, { metal: 9e6, crystal: 9e6 }, T0)).toBeNull();         // already has one
    spy.mockReturnValue(0.21);
    const other = createPlanet(w, alice, { g: 1, s: 21, p: 6 }, { now: T0 });
    expect(maybeCreateMoon(w, other, { metal: 300_000, crystal: 200_000 }, T0)).toBeNull();  // unlucky roll (21% > 20%)
    spy.mockRestore();
  });

  it('counts debris from earlier battles: a small battle over a big old field can make a moon', () => {
    const bp2 = createPlanet(w, bob, { g: 1, s: 7, p: 3 }, { now: T0 });          // a planet without a moon yet
    bp2.fleet = { lightFighter: 2 };
    w.debris['1:7:3'] = { metal: 900_000, crystal: 300_000 };                      // left by earlier battles
    ap.fleet = { cruiser: 30 };
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.19);                    // any roll under 20% succeeds
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp2.coords, ships: { cruiser: 30 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    spy.mockRestore();
    const moon = Object.values(w.planets).find((p) => p.parentId === bp2.id && p.isMoon);
    expect(moon).toBeTruthy();
    expect(w.messages.some((x) => x.to === bob.id && x.subject === 'A moon formed!')).toBe(true);
  });

  it('the planet view tells the client which planet a moon belongs to, so the Overview can show them side by side', () => {
    expect(planetView(w, am, T0).parentId).toBe(ap.id);
    expect(planetView(w, ap, T0).parentId).toBeNull();
  });

  it('the battle report tells the odds, and whether the moon formed or not', () => {
    const attack = (roll: number, planet: Planet) => {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(roll);
      ap.fleet = { cruiser: 30 };
      const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: planet.coords, ships: { cruiser: 30 }, mission: 'attack' }, T0);
      processMovements(w, m.arriveAt);
      spy.mockRestore();
      return w.messages.filter((x) => x.to === alice.id && x.kind === 'combat').at(-1)!;
    };
    const p1 = createPlanet(w, bob, { g: 1, s: 8, p: 3 }, { now: T0 });
    p1.fleet = { lightFighter: 2 };
    w.debris['1:8:3'] = { metal: 600_000, crystal: 0 };
    const none = attack(0.95, p1);                                       // 95 > 20: no moon
    expect((none.data as any).moon).toMatchObject({ formed: false });
    expect((none.data as any).moon.chance).toBeCloseTo(0.2);
    expect(none.body).toMatch(/No moon formed \(chance 20%/);
    const p2 = createPlanet(w, bob, { g: 1, s: 8, p: 4 }, { now: T0 });
    p2.fleet = { lightFighter: 2 };
    w.debris['1:8:4'] = { metal: 600_000, crystal: 0 };
    const yes = attack(0.1, p2);
    expect((yes.data as any).moon).toMatchObject({ formed: true });
    expect(yes.body).toMatch(/condensed into a moon! \(chance 20%\)/);
    expect(w.messages.some((x) => x.to === bob.id && x.subject === 'A moon formed!')).toBe(true);     // the planet's owner is told separately too
    const again = attack(0.1, p2);                                        // it has a moon now: nothing to roll for
    expect((again.data as any).moon).toBeNull();
    expect(again.body).not.toMatch(/moon formed|condensed/i);
    // the report carries the round-by-round numbers
    expect((yes.data as any).roundStats.length).toBeGreaterThan(0);
    expect((yes.data as any).roundStats[0].attackers).toMatchObject({ shots: expect.any(Number), damage: expect.any(Number), absorbed: expect.any(Number), hullDamage: expect.any(Number) });
  });

  it('moons do not count as colonies and are found by planetAt only when asked', () => {
    expect(colonyCount(w, alice)).toBe(1);
    expect(planetAt(w, ap.coords)?.id).toBe(ap.id);
    expect(planetAt(w, ap.coords, true)?.id).toBe(am.id);
  });
});

describe('moon rules', () => {
  it('has 1 field, grows with lunar bases, and earns no basic income', () => {
    am.buildings = {};
    am.resources = { metal: 5e6, crystal: 5e6, deuterium: 5e6 };
    expect(maxFields(am)).toBe(1);
    expect(planetProduction(w, am).metal).toBe(0);
    expect(() => startBuilding(w, alice, am, 'shipyard', T0)).toThrow(/Requirements/); // needs robotics, which needs a field
    startBuilding(w, alice, am, 'lunarBase', T0);
    expect(() => startBuilding(w, alice, am, 'roboticsFactory', T0)).toThrow(/progress/);
    am.buildQueue = null;
    am.buildings.lunarBase = 1;
    expect(maxFields(am)).toBe(4);
  });

  it('blocks mines on moons and moon buildings on planets', () => {
    am.buildings = { lunarBase: 3 };
    expect(() => startBuilding(w, alice, am, 'metalMine', T0)).toThrow(/moon/);
    expect(() => startBuilding(w, alice, ap, 'lunarBase', T0)).toThrow(/only be built on a moon/);
    expect(() => startBuilding(w, alice, am, 'sensorPhalanx', T0)).not.toThrow();
  });

  it('moons can build ships once they have a shipyard', () => {
    am.buildings = { shipyard: 3, roboticsFactory: 3 };
    queueUnits(w, alice, am, 'lightFighter', 3, T0);
    expect(am.shipyardQueue).toHaveLength(1);
  });

  it('abandoning a planet takes its moon with it; moons cannot be abandoned', () => {
    const col = createPlanet(w, alice, { g: 1, s: 9, p: 9 }, { name: 'Colony', now: T0 });
    const colMoon = createMoon(w, col, T0);
    expect(() => abandonPlanet(w, alice, am, am.name, T0)).toThrow(/Moons/);
    abandonPlanet(w, alice, col, 'Colony', T0);
    expect(w.planets[colMoon.id]).toBeUndefined();
    expect(alice.planetIds).not.toContain(colMoon.id);
  });

  it('npc raids never target moons', () => {
    w.config.protectionPoints = 1;
    for (let i = 0; i < 20; i++) {
      const raid = spawnRaid(w, T0, () => 0.99);
      if (raid) expect(planetAt(w, raid.to)?.isMoon).toBeFalsy();
    }
  });
});

describe('missions to moons', () => {
  it('transport delivers to the moon, not the planet', () => {
    ap.fleet = { largeCargo: 4 };
    bp.resources = { metal: 0, crystal: 0, deuterium: 0 };
    bm.resources = { metal: 0, crystal: 0, deuterium: 0 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, toMoon: true, ships: { largeCargo: 4 }, mission: 'transport', cargo: { metal: 40_000 } }, T0);
    processMovements(w, m.arriveAt);
    expect(bm.resources.metal).toBeCloseTo(40_000, -2);
    expect(bp.resources.metal).toBeLessThan(100);
  });

  it('attacks on a moon fight the moon\'s garrison, not the planet\'s', () => {
    ap.fleet = { battleship: 15 };
    bp.fleet = { cruiser: 200 }; // strong planet fleet that must stay out of it
    bm.fleet = { lightFighter: 3 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, toMoon: true, ships: { battleship: 15 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    expect(bp.fleet.cruiser).toBe(200);
    expect(bm.fleet.lightFighter ?? 0).toBe(0);
    expect(w.movements[m.id].phase).toBe('returning');
  });

  it('rejects moon targets for colonize/recycle/expedition and missing moons', () => {
    ap.fleet = { colonyShip: 1, recycler: 1, cruiser: 1 };
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: { g: 1, s: 9, p: 3 }, toMoon: true, ships: { colonyShip: 1 }, mission: 'colonize' }, T0)).toThrow(/moon/);
    const noMoon = createPlanet(w, bob, { g: 1, s: 12, p: 3 }, { now: T0 });
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: noMoon.coords, toMoon: true, ships: { cruiser: 1 }, mission: 'transport' }, T0)).toThrow(/no planet/);
  });

  it('planet and moon at the same coordinates can exchange ships (deploy)', () => {
    ap.fleet = { cruiser: 4 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: ap.coords, toMoon: true, ships: { cruiser: 3 }, mission: 'deploy' }, T0);
    processMovements(w, m.arriveAt);
    expect(am.fleet.cruiser).toBe(3);
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: ap.coords, ships: { cruiser: 1 }, mission: 'deploy' }, T0)).toThrow(/already there/);
  });

  it('recyclers can collect the debris field above their own planet or moon', () => {
    w.debris['1:5:6'] = { metal: 30_000, crystal: 10_000 };
    ap.fleet = { recycler: 3 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: ap.coords, ships: { recycler: 3 }, mission: 'recycle' }, T0);
    processMovements(w, m.arriveAt);
    expect(w.debris['1:5:6']).toBeUndefined();
    expect(alice.stats.harvested).toBe(40_000);
    // the same from the moon, which shares the coordinates
    w.debris['1:5:6'] = { metal: 5_000, crystal: 0 };
    am.fleet = { recycler: 1 };
    am.resources = { metal: 1e6, crystal: 1e6, deuterium: 1e6 };
    const m2 = sendFleet(w, alice, { fromPlanetId: am.id, to: ap.coords, ships: { recycler: 1 }, mission: 'recycle' }, T0 + 1000);
    processMovements(w, m2.arriveAt);
    expect(w.debris['1:5:6']).toBeUndefined();
  });

  it('still refuses to send anything else to the position it already stands on', () => {
    ap.fleet = { cruiser: 2, recycler: 1 };
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: ap.coords, ships: { cruiser: 1 }, mission: 'transport' }, T0)).toThrow(/already there/);
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: ap.coords, ships: { recycler: 1 }, mission: 'recycle' }, T0)).toThrow(/no debris/);
  });

  it('allies can station fleets on a moon separately from the planet', () => {
    AL.createAlliance(w, alice, 'TEAM', 'The Team');
    AL.joinAlliance(w, bob, alice.allianceId!);
    ap.fleet = { cruiser: 5 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, toMoon: true, ships: { cruiser: 5 }, mission: 'hold' }, T0);
    processMovements(w, m.arriveAt);
    expect(m.phase).toBe('holding');
    expect(m.toMoon).toBe(true);
  });
});

describe('sensor phalanx', () => {
  beforeEach(() => { am.buildings = { lunarBase: 1, sensorPhalanx: 3 }; }); // range 8 systems

  it('shows foreign fleets heading to or from a planet in range and charges deuterium', () => {
    bp.fleet = { cruiser: 4 };
    bp.coords = { g: 1, s: 9, p: 8 };
    const dest = createPlanet(w, alice, { g: 1, s: 12, p: 2 }, { now: T0 });
    const hostile = sendFleet(w, bob, { fromPlanetId: bp.id, to: dest.coords, ships: { cruiser: 4 }, mission: 'transport' }, T0);
    const before = am.resources.deuterium;
    const r = phalanxScan(w, alice, am.id, bp.coords, T0 + 1000);
    expect(am.resources.deuterium).toBe(before - 5000);
    expect(r.movements).toHaveLength(1);
    expect(r.movements[0]).toMatchObject({ mission: 'transport', ownerName: 'bob', ships: 4 });
    expect(r.movements[0].at).toBe(hostile.arriveAt);
  });

  it('enforces range, deuterium, ownership and phalanx level', () => {
    bp.coords = { g: 1, s: 30, p: 8 };
    expect(() => phalanxScan(w, alice, am.id, bp.coords, T0)).toThrow(/range/);
    bp.coords = { g: 1, s: 8, p: 8 };
    am.resources.deuterium = 100;
    expect(() => phalanxScan(w, alice, am.id, bp.coords, T0)).toThrow(/vespene gas/);
    am.resources.deuterium = 1e6;
    expect(() => phalanxScan(w, bob, am.id, bp.coords, T0)).toThrow(/your moons/);
    expect(() => phalanxScan(w, alice, ap.id, bp.coords, T0)).toThrow(/your moons/);
    am.buildings.sensorPhalanx = 0;
    expect(() => phalanxScan(w, alice, am.id, bp.coords, T0)).toThrow(/no Sensor/);
  });

  it('warns about raiders heading for an ally', () => {
    w.config.protectionPoints = 1;
    bp.coords = { g: 1, s: 8, p: 8 };
    const raid = spawnRaid(w, T0, () => 0)!;
    const r = phalanxScan(w, alice, am.id, planetAt(w, raid.to)!.coords, T0);
    expect(r.movements.some((m) => m.ownerName === 'Raiders')).toBe(true);
  });
});

describe('jump gate', () => {
  beforeEach(() => {
    am.buildings = { lunarBase: 2, jumpGate: 1 };
  });

  it('moves ships instantly between your own gated moons, then recharges', () => {
    const am2 = createMoon(w, createPlanet(w, alice, { g: 1, s: 15, p: 6 }, { now: T0 }), T0);
    am2.buildings = { lunarBase: 2, jumpGate: 1 };
    am.fleet = { cruiser: 10, smallCargo: 4 };
    const r = jumpGate(w, alice, am.id, am2.id, { cruiser: 6, smallCargo: 4 }, T0);
    expect(am.fleet).toEqual({ cruiser: 4 });
    expect(am2.fleet).toEqual({ cruiser: 6, smallCargo: 4 });
    expect(r.readyAt).toBeGreaterThan(T0);
    expect(() => jumpGate(w, alice, am.id, am2.id, { cruiser: 1 }, T0 + 1000)).toThrow(/recharging/);
    jumpGate(w, alice, am2.id, am.id, { cruiser: 1 }, r.readyAt + 1);
    expect(am.fleet.cruiser).toBe(5);
  });

  it('needs gates on both ends, enough ships, and your own moons', () => {
    am.fleet = { cruiser: 2 };
    const am2 = createMoon(w, createPlanet(w, alice, { g: 1, s: 16, p: 6 }, { now: T0 }), T0);
    expect(() => jumpGate(w, alice, am.id, am2.id, { cruiser: 1 }, T0)).toThrow(/both moons need/i);
    am2.buildings = { jumpGate: 1 };
    expect(() => jumpGate(w, alice, am.id, am2.id, { cruiser: 9 }, T0)).toThrow(/Not enough/);
    expect(() => jumpGate(w, alice, am.id, am2.id, {}, T0)).toThrow(/at least one/);
    expect(() => jumpGate(w, alice, am.id, bm.id, { cruiser: 1 }, T0)).toThrow(/your moons/);
    expect(() => jumpGate(w, alice, am.id, am.id, { cruiser: 1 }, T0)).toThrow(/another moon/);
    expect(() => jumpGate(w, alice, am.id, ap.id, { cruiser: 1 }, T0)).toThrow(/your moons/);
  });
});

describe('what can be built on a moon', () => {
  it('offers no storage buildings, because nothing is mined there', async () => {
    const { buildingAllowed } = await import('../shared/data');
    for (const id of ['metalStorage', 'crystalStorage', 'deuteriumTank', 'metalMine', 'crystalMine', 'deuteriumSynthesizer', 'solarPlant'] as const) expect(buildingAllowed(id, true), id).toBe(false);
    for (const id of ['lunarBase', 'sensorPhalanx', 'jumpGate', 'roboticsFactory', 'shipyard', 'missileSilo'] as const) expect(buildingAllowed(id, true), id).toBe(true);
    expect(buildingAllowed('metalStorage', false)).toBe(true);
  });
});
