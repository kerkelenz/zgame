import { beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../server/accounts';
import { activeSlots, processMovements, sendFleet } from '../server/fleet';
import { createMoon, createPlanet, maxExpeditions } from '../server/galaxy';
import { maxFields, planetCapacity, planetProduction, processPlayer, queueUnits, startBuilding, startResearch } from '../server/economy';
import { createWorld, type Planet, type Player, type World } from '../server/world';
import { FACTIONS, OFFICERS, POS_DIAMETER, TECHS, UNITS, fieldsFromDiameter, tradeQuote } from '../shared/data';
import { buildingCost } from '../shared/formulas';

const T0 = 1_700_000_000_000;
let w: World;
let alice: Player, bob: Player;
let ap: Planet, bp: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 10, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bob', 'secret2', T0).player;
  ap = w.planets[alice.planetIds[0]];
  bp = w.planets[bob.planetIds[0]];
  ap.coords = { g: 1, s: 5, p: 6 };
  bp.coords = { g: 1, s: 6, p: 8 };
  for (const p of [ap, bp]) {
    p.buildings = { roboticsFactory: 6, shipyard: 8, researchLab: 12, solarPlant: 25, metalMine: 15, crystalMine: 12, naniteFactory: 2, metalStorage: 5 };
    p.resources = { metal: 5e7, crystal: 5e7, deuterium: 5e7 };
  }
  alice.techs = { energy: 14, computer: 3, astrophysics: 4, combustionDrive: 6, impulseDrive: 5, espionage: 4 };
  bob.techs = { energy: 14, computer: 3, combustionDrive: 6, espionage: 4 };
});

describe('terraformer', () => {
  it('adds 8 fields per level and ignores the field limit itself', () => {
    ap.fields = 20;
    ap.buildings = { naniteFactory: 1, terraformer: 0, metalMine: 20 }; // 21 levels > 20 fields: full
    expect(() => startBuilding(w, alice, ap, 'metalStorage', T0)).toThrow(/fields/);
    startBuilding(w, alice, ap, 'terraformer', T0); // allowed even when full
    expect(ap.buildQueue?.id).toBe('terraformer');
    ap.buildQueue = null;
    ap.buildings.terraformer = 2;
    expect(maxFields(ap)).toBe(36);
  });

  it('is cheap on metal, heavy on crystal and deuterium, and gated by nanites and energy tech', () => {
    expect(buildingCost('terraformer', 1)).toEqual({ metal: 0, crystal: 50_000, deuterium: 100_000 });
    ap.buildings.naniteFactory = 0;
    expect(() => startBuilding(w, alice, ap, 'terraformer', T0)).toThrow(/Requirements/);
  });
});

describe('graviton technology', () => {
  it('costs nothing but needs a huge energy supply on the research planet, tripling per level', () => {
    expect(TECHS.graviton.energyReq).toBe(300_000);
    ap.buildings.solarPlant = 10;
    expect(() => startResearch(w, alice, ap, 'graviton', T0)).toThrow(/energy production/);
    ap.buildings = { ...ap.buildings, researchLab: 12, fusionReactor: 25 };
    alice.techs.energy = 25;
    const prod = planetProduction(w, ap).energyProduced;
    expect(prod).toBeGreaterThan(300_000);
    startResearch(w, alice, ap, 'graviton', T0);
    expect(alice.research?.id).toBe('graviton');
    expect(alice.research?.cost).toEqual({ metal: 0, crystal: 0, deuterium: 0 });
    processPlayer(w, alice, T0 + 3_600_000);
    expect(alice.techs.graviton).toBe(1);
    // level 2 needs 900k
    expect(() => startResearch(w, alice, ap, 'graviton', T0 + 3_600_001)).toThrow(/900,000 energy/);
  });

  it('is required for the Deathstar', () => {
    expect(UNITS.deathstar.requires.some((r) => r.id === 'graviton')).toBe(true);
    ap.buildings.shipyard = 12;
    alice.techs = { ...alice.techs, hyperspaceDrive: 7, hyperspace: 6 };
    expect(() => queueUnits(w, alice, ap, 'deathstar', 1, T0)).toThrow(/Requirements/);
    alice.techs.graviton = 1;
    queueUnits(w, alice, ap, 'deathstar', 1, T0);
    expect(ap.shipyardQueue[0].id).toBe('deathstar');
  });
});

describe('planet size and storage', () => {
  it('derives fields from diameter by orbit; homeworlds keep 163', () => {
    expect(fieldsFromDiameter(12800)).toBe(163);
    const home = w.planets[register(w, 'carol', 'secret3', T0).player.planetIds[0]];
    expect(home.fields).toBe(163);
    expect(home.diameter).toBe(12800);
    for (let p = 1; p <= 15; p++) {
      const c = createPlanet(w, alice, { g: 1, s: 30, p }, { now: T0 });
      const [lo, hi] = POS_DIAMETER[p]!;
      expect(c.diameter!).toBeGreaterThanOrEqual(Math.floor(lo / 100) * 100);
      expect(c.diameter!).toBeLessThanOrEqual(Math.ceil(hi / 100) * 100);
      expect(c.fields).toBe(fieldsFromDiameter(c.diameter!));
    }
  });

  it('moons get a diameter that grows with the moon chance', () => {
    const small = createMoon(w, ap, T0, 0.01);
    const big = createMoon(w, bp, T0, 0.2);
    expect(big.diameter!).toBeGreaterThan(small.diameter!);
  });

  it('storage capacity scales with the economy speed', () => {
    const slow = createWorld({ economySpeed: 1 }, T0);
    const a = register(slow, 'alpha', 'secret1', T0).player;
    const cap1 = planetCapacity(slow, slow.planets[a.planetIds[0]]);
    const fast = createWorld({ economySpeed: 25 }, T0);
    const b = register(fast, 'bravo', 'secret1', T0).player;
    expect(planetCapacity(fast, fast.planets[b.planetIds[0]]).metal).toBe(cap1.metal * 25);
  });
});

describe('officers', () => {
  it('quartermaster boosts mines, engineer boosts energy and speeds everything up', () => {
    const base = planetProduction(w, ap);
    alice.officers = { quartermaster: 2 };
    const q = planetProduction(w, ap);
    expect(q.metal).toBeGreaterThan(base.metal * 1.08);
    expect(q.metal).toBeLessThan(base.metal * 1.12);
    alice.officers = { engineer: 3 };
    expect(planetProduction(w, ap).energyProduced).toBeGreaterThan(base.energyProduced * 1.14);

    alice.officers = {};
    startResearch(w, alice, ap, 'energy', T0);
    const slow = alice.research!.end - alice.research!.start;
    alice.research = null;
    alice.officers = { engineer: 3 };
    startResearch(w, alice, ap, 'energy', T0);
    expect((alice.research!.end - alice.research!.start) / slow).toBeCloseTo(0.7, 1);
  });

  it('admiral adds fleet and expedition slots', () => {
    expect(activeSlots(w, alice).max).toBe(4);
    alice.officers = { admiral: 3 };
    expect(activeSlots(w, alice).max).toBe(7);
    expect(maxExpeditions(alice)).toBe(2 + 1);
  });

  it('are priced by rank in the shared table', () => {
    expect(OFFICERS.map((o) => o.id).sort()).toEqual(['admiral', 'engineer', 'geologist', 'quartermaster', 'spymaster']);
    for (const o of OFFICERS) expect(o.cost[0] < o.cost[1] && o.cost[1] < o.cost[2]).toBe(true);
  });

  it('spymaster helps probes get through, geologist grows debris', () => {
    bp.fleet = { cruiser: 150 };
    ap.fleet = { espionageProbe: 3 };
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const send = () => {
      ap.fleet = { espionageProbe: 3 };
      const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { espionageProbe: 3 }, mission: 'espionage' }, T0);
      processMovements(w, m.arriveAt);
      return w.movements[m.id];
    };
    expect(send()).toBeUndefined(); // caught with no officer
    alice.officers = { spymaster: 3 };
    expect(send()?.phase).toBe('returning'); // 25%*3 = 75% less likely to be caught
    spy.mockRestore();
  });
});

describe('factions', () => {
  it('the table has four factions in two rival pairs', () => {
    expect(FACTIONS).toHaveLength(4);
    for (const f of FACTIONS) expect(FACTIONS.find((x) => x.id === f.rival)?.rival).toBe(f.id);
  });

  it('Solar Covenant boosts mines; Verge Syndicate boosts cargo and plunder', () => {
    const base = planetProduction(w, ap).metal;
    alice.faction = 'solar';
    expect(planetProduction(w, ap).metal / base).toBeCloseTo(1.08, 1);
    alice.faction = 'verge';
    ap.fleet = { smallCargo: 10 };
    // 10 small cargo = 50,000 cargo; verge holds 55,000
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { smallCargo: 10 }, mission: 'transport', cargo: { metal: 55_000 } }, T0)).not.toThrow();
    alice.faction = null;
    ap.fleet = { smallCargo: 10 };
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { smallCargo: 10 }, mission: 'transport', cargo: { metal: 55_000 } }, T0)).toThrow(/capacity/);
  });

  it('Black Chain and Concord of Iron change who wins close fights', () => {
    const fight = (aFaction: Player['faction'], bFaction: Player['faction'], seed: number) => {
      alice.faction = aFaction; bob.faction = bFaction;
      ap.fleet = { cruiser: 30 }; bp.fleet = { cruiser: 30 }; bp.defenses = {};
      const rnd = vi.spyOn(Math, 'random');
      let s = seed;
      rnd.mockImplementation(() => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; });
      const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 30 }, mission: 'attack' }, T0);
      processMovements(w, m.arriveAt);
      rnd.mockRestore();
      const left = w.movements[m.id]?.ships.cruiser ?? 0;
      for (const mv of Object.values(w.movements)) delete w.movements[mv.id];
      return left;
    };
    let chain = 0, plain = 0;
    for (let i = 1; i <= 12; i++) { chain += fight('chain', null, i); plain += fight(null, null, i); }
    expect(chain).toBeGreaterThan(plain);
  });
});

describe('trader', () => {
  it('quotes at 3:2:1 with a 12% cut', () => {
    expect(tradeQuote('metal', 'crystal', 3000)).toBe(Math.floor(3000 / 1.5 * 0.88));
    expect(tradeQuote('deuterium', 'metal', 1000)).toBe(Math.floor(3000 * 0.88));
    expect(tradeQuote('metal', 'metal', 1000)).toBe(880); // callers must reject same-resource trades
  });
});

describe('statistics and credits', () => {
  it('expeditions can pay Command Credits', () => {
    ap.fleet = { largeCargo: 5, cruiser: 5 };
    const to = { g: 1, s: 5, p: w.config.positions + 1 };
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.05); // credit roll < 0.15
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to, ships: { largeCargo: 5, cruiser: 5 }, mission: 'expedition' }, T0);
    processMovements(w, m.arriveAt);
    spy.mockRestore();
    expect(alice.credits).toBeGreaterThanOrEqual(20);
    expect(w.messages.some((x) => x.to === alice.id && /Command Credits/.test(x.body))).toBe(true);
  });

  it('battles track destroyed value and plunder; recycling tracks harvests', () => {
    ap.fleet = { battleship: 20, largeCargo: 10 };
    bp.fleet = { lightFighter: 10 };
    bp.defenses = { rocketLauncher: 20 };
    bp.resources = { metal: 200_000, crystal: 100_000, deuterium: 50_000 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { battleship: 20, largeCargo: 10 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    expect(alice.stats.destroyed).toBeGreaterThan(30_000);
    expect(alice.stats.plundered).toBeGreaterThan(50_000);
    expect(bob.stats.destroyed).toBeLessThan(alice.stats.destroyed);
    const key = Object.keys(w.debris)[0];
    expect(key).toBeTruthy();
    ap.fleet = { recycler: 2 };
    const [g, s, p] = key.split(':').map(Number);
    const r = sendFleet(w, alice, { fromPlanetId: ap.id, to: { g, s, p }, ships: { recycler: 2 }, mission: 'recycle' }, m.arriveAt);
    processMovements(w, r.arriveAt);
    expect(alice.stats.harvested).toBeGreaterThan(0);
  });
});
