import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { processPlayer, tradeResources } from '../server/economy';
import { processMovements, sendFleet } from '../server/fleet';
import { createMoon, createPlanet } from '../server/galaxy';
import { ACHIEVEMENTS, OBJECTIVES, adjustRep, checkProgress, currentObjective, hireOfficer, joinFaction, leaveFaction } from '../server/progress';
import { rankOf, rankings } from '../server/rankings';
import { GameError, createWorld, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
let w: World;
let alice: Player, bob: Player;
let ap: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 10, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bob', 'secret2', T0).player;
  ap = w.planets[alice.planetIds[0]];
  ap.coords = { g: 1, s: 5, p: 6 };
  w.planets[bob.planetIds[0]].coords = { g: 1, s: 6, p: 8 };
});

describe('objectives', () => {
  it('start with the first objective and advance one at a time, paying rewards', () => {
    expect(currentObjective(alice)?.id).toBe('o1');
    checkProgress(w, alice, T0);
    expect(alice.objectives.o1).toBeUndefined();
    const before = { ...ap.resources };
    ap.buildings = { metalMine: 4, crystalMine: 4 };
    checkProgress(w, alice, T0 + 1000);
    expect(alice.objectives.o1).toBe(T0 + 1000);
    expect(ap.resources.metal).toBeGreaterThanOrEqual(before.metal + 1500);
    expect(currentObjective(alice)?.id).toBe('o2'); // o2 needs 4 solar plants and balanced energy
    expect(w.messages.some((m) => m.to === alice.id && /Objective complete: Dig in/.test(m.subject))).toBe(true);
  });

  it('can chain several completions at once when the state already satisfies them', () => {
    ap.buildings = { metalMine: 8, crystalMine: 7, solarPlant: 20, deuteriumSynthesizer: 5, researchLab: 1, roboticsFactory: 2, shipyard: 1 };
    alice.techs = { energy: 1 };
    checkProgress(w, alice, T0);
    for (const id of ['o1', 'o2', 'o3', 'o4', 'o5', 'o6']) expect(alice.objectives[id], id).toBeTruthy();
    expect(currentObjective(alice)?.id).toBe('o7');
  });

  it('credit-reward objectives pay Command Credits', () => {
    for (const o of OBJECTIVES.slice(0, 6)) alice.objectives[o.id] = T0;
    alice.achievements.topTen = T0; // keep the rank achievement out of this test's credit math
    const w2 = w;
    w2.messages.push({ id: 'x', to: alice.id, from: null, kind: 'espionage', subject: 'Spy report foo [1:1:1]', body: '', at: T0, read: false });
    checkProgress(w, alice, T0);
    expect(alice.objectives.o7).toBeTruthy();
    expect(alice.credits).toBe(100);
  });

  it('are tracked per commander', () => {
    ap.buildings = { metalMine: 4, crystalMine: 4 };
    checkProgress(w, alice, T0);
    checkProgress(w, bob, T0);
    expect(alice.objectives.o1).toBeTruthy();
    expect(bob.objectives.o1).toBeUndefined();
  });
});

describe('achievements', () => {
  it('pay credits once, based on real stats', () => {
    alice.achievements.topTen = T0; // isolate from the rank achievement
    alice.stats.battlesWon = 1;
    alice.stats.plundered = 2_000_000;
    checkProgress(w, alice, T0);
    expect(alice.achievements.firstBlood).toBeTruthy();
    expect(alice.achievements.pirate).toBeTruthy();
    expect(alice.credits).toBe(60 + 200);
    checkProgress(w, alice, T0 + 1);
    expect(alice.credits).toBe(260); // no double pay
  });

  it('colonist and moonlit come from the world, not counters', () => {
    createPlanet(w, alice, { g: 1, s: 20, p: 6 }, { now: T0 });
    createMoon(w, ap, T0);
    checkProgress(w, alice, T0);
    expect(alice.achievements.colonist).toBeTruthy();
    expect(alice.achievements.moonlit).toBeTruthy();
    expect(alice.achievements.empire).toBeUndefined();
  });

  it('top ten uses live ranks', () => {
    expect(rankOf(w, alice.id, true)).toBeLessThanOrEqual(2);
    checkProgress(w, alice, T0);
    expect(alice.achievements.topTen).toBeTruthy();
  });

  it('all ids are unique and rewards positive', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.every((a) => a.reward > 0)).toBe(true);
  });
});

describe('officers', () => {
  it('cost credits per rank, cap at 3, and need enough credits', () => {
    expect(() => hireOfficer(w, alice, 'admiral')).toThrow(/costs 600/);
    alice.credits = 600 + 1600 + 4000 + 10;
    expect(hireOfficer(w, alice, 'admiral')).toBe(1);
    expect(hireOfficer(w, alice, 'admiral')).toBe(2);
    expect(hireOfficer(w, alice, 'admiral')).toBe(3);
    expect(alice.credits).toBe(10);
    expect(() => hireOfficer(w, alice, 'admiral')).toThrow(/top rank/);
    expect(() => hireOfficer(w, alice, 'wizard')).toThrow(/Unknown officer/);
  });
});

describe('factions and reputation', () => {
  it('attacking one faction costs standing there and earns half as much with its rival', () => {
    adjustRep(w, alice, 'iron', -30);
    expect(alice.rep.iron).toBe(-30);
    expect(alice.rep.chain).toBe(15);
    adjustRep(w, alice, 'solar', -100);
    expect(alice.rep.verge).toBe(50);
  });

  it('needs 40 standing to join, perks apply, and hitting your own faction expels you', () => {
    expect(() => joinFaction(alice, 'chain')).toThrow(/wants standing of 40/);
    alice.rep.chain = 45;
    joinFaction(alice, 'chain');
    expect(alice.faction).toBe('chain');
    expect(() => joinFaction(alice, 'chain')).toThrow(/already/);
    adjustRep(w, alice, 'chain', -5);
    expect(alice.faction).toBeNull();
    expect(alice.rep.chain).toBeLessThanOrEqual(0);
    expect(w.messages.some((m) => m.to === alice.id && /Expelled/.test(m.subject))).toBe(true);
    alice.faction = 'iron';
    leaveFaction(alice);
    expect(alice.faction).toBeNull();
    expect(() => joinFaction(alice, 'nope')).toThrow(GameError);
  });

  it('standing is clamped to -100..100', () => {
    adjustRep(w, alice, 'iron', 500);
    expect(alice.rep.iron).toBe(100);
    adjustRep(w, alice, 'iron', -500);
    expect(alice.rep.iron).toBe(-100);
  });
});

describe('trader', () => {
  beforeEach(() => { ap.resources = { metal: 100_000, crystal: 0, deuterium: 0 }; });

  it('swaps at 3:2:1 minus 12%', () => {
    const out = tradeResources(w, ap, 'metal', 'deuterium', 30_000, T0);
    expect(out).toBe(Math.floor(30_000 / 3 * 0.88));
    expect(ap.resources.metal).toBeCloseTo(70_000, -2);
    expect(ap.resources.deuterium).toBeCloseTo(out, -2);
  });

  it('rejects same-resource, empty, oversized, tiny and unknown trades', () => {
    expect(() => tradeResources(w, ap, 'metal', 'metal', 100, T0)).toThrow(/different/);
    expect(() => tradeResources(w, ap, 'metal', 'crystal', 0, T0)).toThrow(/amount/);
    expect(() => tradeResources(w, ap, 'metal', 'crystal', 1e9, T0)).toThrow(/Not enough/);
    expect(() => tradeResources(w, ap, 'metal', 'deuterium', 2, T0)).toThrow(/too small/);
    expect(() => tradeResources(w, ap, 'gold', 'crystal', 10, T0)).toThrow(/Unknown/);
  });
});

describe('rankings', () => {
  it('sorts everyone by points and breaks the score down', () => {
    ap.buildings = { metalMine: 20 };
    processPlayer(w, alice, T0);
    const rows = rankings(w, true);
    expect(rows[0].id).toBe(alice.id);
    expect(rows[0].rank).toBe(1);
    expect(rows[0].total).toBe(rows[0].buildings + rows[0].research + rows[0].fleet + rows[0].defense);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });
});

describe('end to end: a raid earns the plunder objective', () => {
  it('first raid objective completes after a successful looting run', () => {
    for (const o of OBJECTIVES.slice(0, 7)) alice.objectives[o.id] = T0;
    const bp = w.planets[bob.planetIds[0]];
    ap.buildings = { shipyard: 6, roboticsFactory: 4 };
    alice.techs = { combustionDrive: 6 };
    ap.resources = { metal: 1e6, crystal: 1e6, deuterium: 1e6 };
    ap.fleet = { lightFighter: 30, smallCargo: 20 };
    bp.fleet = {}; bp.defenses = {};
    bp.resources = { metal: 100_000, crystal: 50_000, deuterium: 20_000 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { lightFighter: 30, smallCargo: 20 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    checkProgress(w, alice, m.arriveAt);
    expect(alice.stats.plundered).toBeGreaterThan(0);
    expect(alice.objectives.o8).toBeTruthy();
    expect(alice.credits).toBeGreaterThanOrEqual(150);
  });
});
