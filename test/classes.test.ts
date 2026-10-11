import { beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../server/accounts';
import { planetProduction, startResearch, tradeResources } from '../server/economy';
import { activeSlots, flightPlan, processMovements, sendFleet } from '../server/fleet';
import { maxExpeditions } from '../server/galaxy';
import { chooseClass } from '../server/progress';
import { commandView, planetView } from '../server/views';
import { GameError, createWorld, migratePlayer, type Planet, type Player, type World } from '../server/world';
import { CHAR_CLASSES, CLASS_CHANGE_COST, TRADE_FEE, TRADE_FEE_COLLECTOR, tradeQuote } from '../shared/data';
import { detailCtxFrom, unitDetails } from '../shared/effects';
import { shipSpeed } from '../shared/formulas';

const T0 = 1_700_000_000_000;
let w: World;
let alice: Player, bob: Player;
let ap: Planet, bp: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 50, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bob', 'secret2', T0).player;
  ap = w.planets[alice.planetIds[0]]; bp = w.planets[bob.planetIds[0]];
  ap.coords = { g: 1, s: 5, p: 6 }; bp.coords = { g: 1, s: 12, p: 8 };
  for (const p of [ap, bp]) {
    p.buildings = { metalMine: 12, crystalMine: 10, deuteriumSynthesizer: 8, solarPlant: 20, shipyard: 8, roboticsFactory: 5, researchLab: 10, naniteFactory: 1 };
    p.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
  }
  ap.maxTemp = bp.maxTemp = 40;
  alice.techs = { combustionDrive: 6, impulseDrive: 5, energy: 9, computer: 3, astrophysics: 4, espionage: 4, weapons: 2 };
  bob.techs = { ...alice.techs };
});

describe('choosing a class', () => {
  it('lists three classes with perks', () => {
    expect(CHAR_CLASSES.map((c) => c.id)).toEqual(['collector', 'general', 'discoverer']);
    for (const c of CHAR_CLASSES) expect(c.perks.length).toBeGreaterThanOrEqual(3);
  });

  it('the first choice is free; changing costs credits and needs enough of them', () => {
    expect(alice.charClass).toBeNull();
    chooseClass(alice, 'collector');
    expect(alice.charClass).toBe('collector');
    expect(alice.credits).toBe(0);
    expect(() => chooseClass(alice, 'collector')).toThrow(/already/);
    expect(() => chooseClass(alice, 'general')).toThrow(/costs 2,000/);
    alice.credits = CLASS_CHANGE_COST + 50;
    chooseClass(alice, 'general');
    expect(alice.charClass).toBe('general');
    expect(alice.credits).toBe(50);
    expect(() => chooseClass(alice, 'wizard')).toThrow(GameError);
  });

  it('the command view shows the options, the current pick and the price', () => {
    let v = commandView(w, alice);
    expect(v.classes).toHaveLength(3);
    expect(v.charClass).toBeNull();
    expect(v.classChangeCost).toBe(0);
    chooseClass(alice, 'discoverer');
    v = commandView(w, alice);
    expect(v.classes.find((c) => c.chosen)?.id).toBe('discoverer');
    expect(v.classChangeCost).toBe(CLASS_CHANGE_COST);
  });

  it('old saves load without a class', () => {
    const old = { ...alice } as Partial<Player>;
    delete old.charClass;
    migratePlayer(old as Player);
    expect(old.charClass).toBeNull();
  });
});

describe('Collector', () => {
  it('+15% mine output and +10% energy, visible in the planet view too', () => {
    const base = planetProduction(w, ap);
    const detailBase = planetView(w, ap, T0).detail;
    chooseClass(alice, 'collector');
    const boosted = planetProduction(w, ap);
    expect(boosted.energyProduced / base.energyProduced).toBeCloseTo(1.1, 2);
    expect(boosted.detail.mine.metal.total / base.detail.mine.metal.total).toBeCloseTo(1.15, 2);
    expect(planetView(w, ap, T0).detail.boost / detailBase.boost).toBeCloseTo(1.15, 6);
  });

  it('carries 25% more in cargo ships only, and the merchant keeps less', () => {
    ap.fleet = { smallCargo: 10, cruiser: 10 };
    const send = (cargo: number, ships = { smallCargo: 10 }) => () => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships, mission: 'transport', cargo: { metal: cargo } }, T0);
    expect(send(60_000)).toThrow(/capacity/);
    chooseClass(alice, 'collector');
    expect(send(62_500)).not.toThrow(); // 10 x 5,000 x 1.25
    ap.fleet = { smallCargo: 10, cruiser: 10 };
    expect(send(800 * 10 + 1, { cruiser: 10 } as never)).toThrow(/capacity/); // warships are unchanged
    expect(tradeQuote('metal', 'crystal', 3000, TRADE_FEE_COLLECTOR)).toBeGreaterThan(tradeQuote('metal', 'crystal', 3000, TRADE_FEE));
    ap.resources.metal = 10_000;
    const out = tradeResources(w, ap, 'metal', 'crystal', 3000, T0);
    expect(out).toBe(Math.floor((3000 / 1.5) * 0.92));
  });
});

describe('General', () => {
  it('+2 fleet slots, 25% less fuel and combat ships fly 25% faster; cargo ships do not', () => {
    const to = { g: 1, s: 30, p: 5 };
    const war = { cruiser: 5 }, haul = { largeCargo: 5 };
    const before = { war: flightPlan(w, alice, war, ap.coords, to, 100), haul: flightPlan(w, alice, haul, ap.coords, to, 100), slots: activeSlots(w, alice).max };
    chooseClass(alice, 'general');
    const after = { war: flightPlan(w, alice, war, ap.coords, to, 100), haul: flightPlan(w, alice, haul, ap.coords, to, 100), slots: activeSlots(w, alice).max };
    expect(after.slots).toBe(before.slots + 2);
    expect(after.war.speed / before.war.speed).toBeCloseTo(1.25, 6);
    expect(after.war.secs).toBeLessThan(before.war.secs);
    expect(after.haul.speed).toBe(before.haul.speed);
    expect(after.haul.secs).toBe(before.haul.secs);
    expect(after.war.fuel / before.war.fuel).toBeGreaterThan(0.7);
    expect(after.war.fuel / before.war.fuel).toBeLessThan(0.8);
  });

  it('a mixed fleet is as fast as its slowest ship, and the fuel is really charged', () => {
    chooseClass(alice, 'general');
    ap.fleet = { cruiser: 5, largeCargo: 5 };
    const plan = flightPlan(w, alice, { cruiser: 5, largeCargo: 5 }, ap.coords, bp.coords, 100);
    expect(plan.speed).toBe(shipSpeed('largeCargo', alice.techs)); // the hauler (unboosted) sets the pace
    const before = ap.resources.deuterium;
    sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 5, largeCargo: 5 }, mission: 'transport' }, T0);
    expect(before - ap.resources.deuterium).toBeCloseTo(plan.fuel, 0);
  });

  it('battles leave 3% more debris', () => {
    const make = (cls: 'general' | null) => {
      const x = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
      const a = register(x, 'aaa', 'secret1', T0).player, b = register(x, 'bbb', 'secret2', T0).player;
      a.charClass = cls;
      const pa = x.planets[a.planetIds[0]], pb = x.planets[b.planetIds[0]];
      pa.coords = { g: 1, s: 5, p: 6 }; pb.coords = { g: 1, s: 5, p: 8 };
      pa.buildings = { shipyard: 5, roboticsFactory: 3 }; pa.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
      a.techs = { combustionDrive: 6, impulseDrive: 5 };
      pa.fleet = { cruiser: 40 }; pb.fleet = { cruiser: 40 };
      const rnd = vi.spyOn(Math, 'random');
      let seed = 7;
      rnd.mockImplementation(() => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; });
      const m = sendFleet(x, a, { fromPlanetId: pa.id, to: pb.coords, ships: { cruiser: 40 }, mission: 'attack' }, T0);
      processMovements(x, m.arriveAt);
      rnd.mockRestore();
      const d = Object.values(x.debris)[0];
      return d.metal + d.crystal;
    };
    const base = make(null), gen = make('general');
    expect(gen / base).toBeGreaterThan(1.05);
    expect(gen / base).toBeLessThan(1.15);
  });

  it('unit details show the class speed on combat ships only', () => {
    chooseClass(alice, 'general');
    const ctx = detailCtxFrom(planetView(w, ap, T0) as never, alice.techs);
    expect(unitDetails('cruiser', ctx).effective.speed).toBeCloseTo(shipSpeed('cruiser', alice.techs) * 1.25, 6);
    expect(unitDetails('largeCargo', ctx).effective.speed).toBe(shipSpeed('largeCargo', alice.techs));
  });
});

describe('Discoverer', () => {
  it('+1 expedition slot and +10% research speed', () => {
    const slots = maxExpeditions(alice);
    startResearch(w, alice, ap, 'weapons', T0);
    const base = alice.research!.end - alice.research!.start;
    alice.research = null;
    chooseClass(alice, 'discoverer');
    expect(maxExpeditions(alice)).toBe(slots + 1);
    startResearch(w, alice, ap, 'weapons', T0);
    expect((alice.research!.end - alice.research!.start) / base).toBeLessThan(0.95);
    expect(planetView(w, ap, T0).detail.researchFactor).toBe(0.9);
  });

  const expedition = (cls: 'discoverer' | null, roll: number, second = 0.5) => {
    const x = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
    const a = register(x, 'ddd', 'secret1', T0).player;
    a.charClass = cls;
    a.techs = { astrophysics: 4, combustionDrive: 6, impulseDrive: 5 };
    const pa = x.planets[a.planetIds[0]];
    pa.coords = { g: 1, s: 5, p: 6 };
    pa.buildings = { shipyard: 5 }; pa.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
    pa.fleet = { largeCargo: 10, cruiser: 10 };
    const to = { g: 1, s: 5, p: x.config.positions + 1 };
    const seq = [roll, second, 0.5 /* not the credits find */, 0.5, 0.5, 0.5]; // call order: outcome roll, discoverer re-roll, credits check
    let i = 0;
    const rnd = vi.spyOn(Math, 'random').mockImplementation(() => seq[Math.min(i++, seq.length - 1)]);
    const m = sendFleet(x, a, { fromPlanetId: pa.id, to, ships: { largeCargo: 10, cruiser: 10 }, mission: 'expedition' }, T0);
    i = 0; // arrival rolls start fresh
    processMovements(x, m.arriveAt);
    rnd.mockRestore();
    return { x, m, a, pa };
  };

  it('finds 50% more', () => {
    // the first roll (credits check) must miss; then 0.4 = a resource find
    const resRoll = (cls: 'discoverer' | null) => {
      const x = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
      const a = register(x, 'rrr', 'secret1', T0).player;
      a.charClass = cls; a.techs = { astrophysics: 4, combustionDrive: 6, impulseDrive: 5 };
      const pa = x.planets[a.planetIds[0]];
      pa.coords = { g: 1, s: 5, p: 6 }; pa.buildings = { shipyard: 5 }; pa.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
      pa.fleet = { largeCargo: 10, cruiser: 10 };
      const to = { g: 1, s: 5, p: x.config.positions + 1 };
      const m = sendFleet(x, a, { fromPlanetId: pa.id, to, ships: { largeCargo: 10, cruiser: 10 }, mission: 'expedition' }, T0);
      const vals = [0.4 /* resource find */, 0.5 /* not the credits find */, 0.0 /* kind: metal */, 0.5];
      let i = 0;
      const rnd = vi.spyOn(Math, 'random').mockImplementation(() => vals[Math.min(i++, vals.length - 1)]);
      processMovements(x, m.arriveAt);
      rnd.mockRestore();
      return m.cargo.metal + m.cargo.crystal + m.cargo.deuterium;
    };
    const base = resRoll(null), disc = resRoll('discoverer');
    expect(base).toBeGreaterThan(0);
    expect(disc / base).toBeCloseTo(1.5, 1);
  });

  it('turns pirates and black holes into quiet trips half the time', () => {
    // black hole roll 0.92 + dodge roll 0.2 (<0.5) => harmless; with 0.7 the black hole stands
    const lucky = expedition('discoverer', 0.92, 0.2);
    expect(lucky.x.movements[lucky.m.id]).toBeDefined();
    const unlucky = expedition('discoverer', 0.92, 0.7);
    expect(unlucky.x.movements[unlucky.m.id]).toBeUndefined(); // fleet lost
    const plain = expedition(null, 0.92, 0.2);
    expect(plain.x.movements[plain.m.id]).toBeUndefined(); // others get no second chance
  });

  it('new colonies are 10% bigger', () => {
    const make = (cls: 'discoverer' | null) => {
      const x = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
      const a = register(x, 'ccc', 'secret1', T0).player;
      a.charClass = cls; a.techs = { astrophysics: 4, impulseDrive: 5, combustionDrive: 6 };
      const pa = x.planets[a.planetIds[0]];
      pa.coords = { g: 1, s: 5, p: 6 }; pa.buildings = { shipyard: 5 }; pa.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
      pa.fleet = { colonyShip: 1 };
      const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const m = sendFleet(x, a, { fromPlanetId: pa.id, to: { g: 1, s: 5, p: 10 }, ships: { colonyShip: 1 }, mission: 'colonize' }, T0);
      processMovements(x, m.arriveAt);
      rnd.mockRestore();
      return x.planets[a.planetIds[1]];
    };
    const plain = make(null), disc = make('discoverer');
    expect(disc.fields / plain.fields).toBeGreaterThan(1.07);
    expect(disc.fields / plain.fields).toBeLessThan(1.13);
  });
});

describe('classes do not stack with other classes', () => {
  it('only the chosen class applies', () => {
    chooseClass(alice, 'general');
    const gen = planetProduction(w, ap).metal;
    alice.charClass = null;
    expect(planetProduction(w, ap).metal).toBe(gen); // General has no mining bonus
    expect(activeSlots(w, alice).max).toBe(4);
  });
});
