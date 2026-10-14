import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { buildBacklogMax, maxFields, planetCapacity, planetProduction, queueBuilding, researchBacklogMax, tradeResources } from '../server/economy';
import { activeSlots } from '../server/fleet';
import { playerPoints } from '../server/galaxy';
import { expeditionYield, fuelFactor, researchFactor, timeFactor, tradeFee } from '../server/perks';
import { buildMonument, buyBoost, buyEmpireUpgrade, buyProject, upgradesView } from '../server/upgrades';
import { createWorld, type Planet, type Player, type World } from '../server/world';
import { BOOSTS, EMPIRE_UPGRADES, MONUMENTS, PLANET_PROJECTS, levelCost } from '../shared/upgrades';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
let w: World; let alice: Player; let ap: Planet;
const rich = () => { ap.resources = { metal: 1e12, crystal: 1e12, deuterium: 1e12 }; ap.updatedAt = T0; };

beforeEach(() => {
  w = createWorld({ economySpeed: 20, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  ap = w.planets[alice.planetIds[0]];
  rich();
});

describe('what upgrades cost', () => {
  it('scales with the economy speed and grows with every level, in whole hundreds', () => {
    const d = EMPIRE_UPGRADES.constructionQueue;
    const c1 = levelCost(d, 1, 20), c1slow = levelCost(d, 1, 1), c2 = levelCost(d, 2, 20);
    expect(c1.metal).toBe(d.base.metal * 20);
    expect(c1slow.metal).toBe(d.base.metal);
    expect(c2.metal).toBeGreaterThan(c1.metal * 1.8);
    for (const k of ['metal', 'crystal', 'deuterium'] as const) expect(c2[k] % 100).toBe(0);
  });
  it('is taken from the planet, refused when it cannot pay, and a failed purchase takes nothing', () => {
    ap.resources = { metal: 100, crystal: 100, deuterium: 100 };
    expect(() => buyEmpireUpgrade(w, alice, ap, 'constructionQueue', T0)).toThrow(/Not enough/);
    expect(alice.upgrades?.levels.constructionQueue ?? 0).toBe(0);
    expect(ap.resources.metal).toBe(100);
    rich();
    const before = ap.resources.metal;
    expect(buyEmpireUpgrade(w, alice, ap, 'constructionQueue', T0)).toBe(1);
    expect(before - ap.resources.metal).toBe(levelCost(EMPIRE_UPGRADES.constructionQueue, 1, 20).metal);
  });
  it('stops at the highest level', () => {
    for (let i = 0; i < EMPIRE_UPGRADES.fleetCommand.max; i++) buyEmpireUpgrade(w, alice, ap, 'fleetCommand', T0);
    expect(() => buyEmpireUpgrade(w, alice, ap, 'fleetCommand', T0)).toThrow(/highest level/);
    expect(upgradesView(w, alice, ap, T0).empire.find((e) => e.id === 'fleetCommand')!.next).toBeNull();
  });
});

describe('what empire upgrades give', () => {
  it('queue slots: four, and one more for every level, separately for buildings and research', () => {
    expect(buildBacklogMax(alice)).toBe(4);
    buyEmpireUpgrade(w, alice, ap, 'constructionQueue', T0); buyEmpireUpgrade(w, alice, ap, 'constructionQueue', T0);
    buyEmpireUpgrade(w, alice, ap, 'researchQueue', T0);
    expect(buildBacklogMax(alice)).toBe(6);
    expect(researchBacklogMax(alice)).toBe(5);
    ap.buildings = { solarPlant: 20 };
    rich();
    for (let i = 0; i < 7; i++) queueBuilding(w, alice, ap, 'metalMine', T0);   // one runs, six wait
    expect(ap.buildBacklog.length).toBe(6);
    expect(() => queueBuilding(w, alice, ap, 'metalMine', T0)).toThrow(/Queue is full \(6\)/);
  });
  it('fleet slots, timers, merchant cut and expedition yield', () => {
    const slots = activeSlots(w, alice).max, factor = timeFactor(alice, T0), rf = researchFactor(alice, T0), fee = tradeFee(alice), yieldBefore = expeditionYield(alice);
    for (let i = 0; i < 3; i++) buyEmpireUpgrade(w, alice, ap, 'fleetCommand', T0);
    expect(activeSlots(w, alice).max).toBe(slots + 3);
    for (let i = 0; i < 4; i++) { buyEmpireUpgrade(w, alice, ap, 'engineering', T0); buyEmpireUpgrade(w, alice, ap, 'archives', T0); buyEmpireUpgrade(w, alice, ap, 'tradeNetwork', T0); buyEmpireUpgrade(w, alice, ap, 'relay', T0); }
    expect(timeFactor(alice, T0)).toBeCloseTo(factor * (1 - 0.015 * 4), 6);
    expect(researchFactor(alice, T0)).toBeCloseTo(rf * (1 - 0.02 * 4), 6);
    expect(tradeFee(alice)).toBeCloseTo(fee - 0.006 * 4, 6);
    expect(expeditionYield(alice)).toBeCloseTo(yieldBefore * (1 + 0.04 * 4), 6);
    for (let i = 0; i < 6; i++) buyEmpireUpgrade(w, alice, ap, 'tradeNetwork', T0);
    expect(tradeFee(alice)).toBeGreaterThanOrEqual(0.04);                     // never below the floor
  });
  it('a better trade network gives more from the merchant', () => {
    ap.resources = { metal: 1e12, crystal: 1e12, deuterium: 1e12 };
    const before = tradeResources(w, ap, 'metal', 'crystal', 100_000, T0);
    for (let i = 0; i < 6; i++) buyEmpireUpgrade(w, alice, ap, 'tradeNetwork', T0);
    ap.resources = { metal: 1e12, crystal: 1e12, deuterium: 1e12 };
    const after = tradeResources(w, ap, 'metal', 'crystal', 100_000, T0);
    expect(after).toBeGreaterThan(before);
  });
});

describe('planet projects', () => {
  it('raise production, storage and fields of that planet only', () => {
    ap.buildings = { metalMine: 10, solarPlant: 15, metalStorage: 2 };
    const other = w.planets[register(w, 'bobby', 'secret2', T0).player.planetIds[0]];
    const prod = planetProduction(w, ap).metal, cap = planetCapacity(w, ap).metal, fields = maxFields(ap);
    for (let i = 0; i < 4; i++) { buyProject(w, alice, ap, 'surveyors', T0); buyProject(w, alice, ap, 'annex', T0); buyProject(w, alice, ap, 'habitat', T0); }
    expect(planetProduction(w, ap).metal).toBeGreaterThan(prod * 1.04);
    expect(planetCapacity(w, ap).metal).toBeCloseTo(cap * 1.32, 3);
    expect(maxFields(ap)).toBe(fields + 8);
    expect(ap.projects).toEqual({ surveyors: 4, annex: 4, habitat: 4 });
    expect(other.projects).toBeUndefined();
  });
  it('not on moons', () => {
    const moon = { ...ap, id: 'm1', isMoon: true, projects: undefined } as Planet;
    w.planets.m1 = moon;
    expect(() => buyProject(w, alice, moon, 'annex', T0)).toThrow(/not moons/);
  });
});

describe('boosts and monuments', () => {
  it('a boost runs for its hours, extends when bought again, and has a ceiling', () => {
    buyBoost(w, alice, ap, 'rapidBuild', T0);
    const f0 = timeFactor(alice, T0 + HOUR);
    expect(timeFactor(alice, T0 + 5 * HOUR)).toBeGreaterThan(f0);              // over after four hours
    expect(f0).toBeCloseTo(timeFactor(alice, T0 + 5 * HOUR) * 0.75, 6);
    buyBoost(w, alice, ap, 'rapidBuild', T0 + HOUR);                           // 3 hours left + 4 more
    expect(alice.upgrades!.boosts.rapidBuild).toBe(T0 + 8 * HOUR);
    for (let i = 0; i < 10; i++) { try { buyBoost(w, alice, ap, 'rapidBuild', T0 + HOUR); } catch { /* at the ceiling */ } }
    expect(alice.upgrades!.boosts.rapidBuild! - (T0 + HOUR)).toBeLessThanOrEqual(24 * HOUR);
    buyBoost(w, alice, ap, 'fuelSaver', T0);
    expect(fuelFactor(alice, T0 + HOUR)).toBeCloseTo(0.7, 6);
    expect(fuelFactor(alice, T0 + 7 * HOUR)).toBe(1);
    buyBoost(w, alice, ap, 'researchSurge', T0);
    expect(researchFactor(alice, T0 + HOUR)).toBeCloseTo(0.75, 6);
    expect(BOOSTS.rapidBuild.hours).toBe(4);
  });
  it('monuments go up in order, once each, and count toward the standing', () => {
    const before = playerPoints(w, alice).total;
    expect(() => buildMonument(w, alice, ap, 'obelisk', T0)).toThrow(/Beacon first/);
    buildMonument(w, alice, ap, 'beacon', T0);
    expect(() => buildMonument(w, alice, ap, 'beacon', T0)).toThrow(/already/);
    const gain = playerPoints(w, alice).total - before;
    expect(gain).toBeGreaterThan(300);                                         // 550 points for the first
    buildMonument(w, alice, ap, 'obelisk', T0);
    expect(playerPoints(w, alice).total - before).toBeGreaterThan(gain * 4);
    expect(upgradesView(w, alice, ap, T0).monuments.filter((m) => m.built).map((m) => m.id)).toEqual(['beacon', 'obelisk']);
    expect(MONUMENTS).toHaveLength(5);
  });
  it('nothing can be bought on vacation, and the view lists what is on offer', () => {
    alice.vacation = { since: T0, minUntil: T0 + 1e9 };
    expect(() => buyEmpireUpgrade(w, alice, ap, 'relay', T0)).toThrow(/vacation/);
    alice.vacation = null;
    const v = upgradesView(w, alice, ap, T0);
    expect(v.empire).toHaveLength(Object.keys(EMPIRE_UPGRADES).length);
    expect(v.projects).toHaveLength(Object.keys(PLANET_PROJECTS).length);
    expect(v.boosts).toHaveLength(Object.keys(BOOSTS).length);
    expect(v.empire[0].next!.affordable).toBe(true);
  });
});

describe('the Fortified Vault', () => {
  it('leaves less to take when the planet is raided', async () => {
    const { processMovements, sendFleet } = await import('../server/fleet');
    const bob = register(w, 'bobby', 'secret2', T0).player;
    const bp = w.planets[bob.planetIds[0]];
    bp.coords = { g: 1, s: ap.coords.s, p: ap.coords.p === 10 ? 11 : 10 };
    bp.defenses = {}; bp.fleet = {};
    const raid = (at: number) => {
      bp.resources = { metal: 2_000_000, crystal: 2_000_000, deuterium: 0 }; bp.updatedAt = at;
      ap.fleet = { largeCargo: 400, battleship: 20 };
      const before = alice.stats.plundered;
      const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { largeCargo: 400, battleship: 20 }, mission: 'attack' }, at);
      processMovements(w, m.arriveAt);
      const loot = alice.stats.plundered - before;
      processMovements(w, m.arriveAt + 30 * HOUR);                            // the fleet flies home
      return { loot, next: m.arriveAt + 30 * HOUR };
    };
    const open = raid(T0);
    expect(open.loot).toBeGreaterThan(500_000);
    bp.resources = { metal: 1e13, crystal: 1e13, deuterium: 1e13 }; bp.updatedAt = open.next;
    for (let i = 0; i < PLANET_PROJECTS.vault.max; i++) buyProject(w, bob, bp, 'vault', open.next);
    rich(); ap.updatedAt = open.next;
    const guarded = raid(open.next + 10 * HOUR);
    expect(guarded.loot).toBeLessThan(open.loot * 0.7);
    expect(guarded.loot).toBeGreaterThan(open.loot * 0.5);
  });
});
