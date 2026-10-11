import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { allianceBonuses, planetProduction } from '../server/economy';
import { createPlanet } from '../server/galaxy';
import { SECTOR, recountTerritory, influenceMap, planetWeight, processSectors, sectorKey, sectorOf, sectorsView, territoryBonus, territoryCount } from '../server/sectors';
import { createWorld, type Planet, type Player, type World } from '../server/world';
import { removePlayer } from '../server/account';

const T0 = Date.UTC(2026, 9, 12);
let w: World; let a1: Player, a2: Player, b1: Player, b2: Player;
let A: string, B: string;

/** put a player's home in system g:s and give it the weight asked for (through a mine level, which is all points) */
const place = (p: Player, g: number, s: number, extra = 0) => {
  const home = w.planets[p.planetIds[0]];
  home.coords = { g, s, p: 1 + Object.keys(w.planets).length % 12 };
  home.buildings = {};
  if (extra) home.fleet = { cruiser: extra };
  return home;
};

beforeEach(() => {
  w = createWorld({ npcDensity: 0, raidIntervalMin: 0 }, T0);
  [a1, a2, b1, b2] = ['ann', 'abe', 'bob', 'bea'].map((n) => register(w, n, 'secret1', T0).player);
  AL.createAlliance(w, a1, 'AAA', 'Alpha'); AL.joinAlliance(w, a2, a1.allianceId!);
  AL.createAlliance(w, b1, 'BBB', 'Bravo'); AL.joinAlliance(w, b2, b1.allianceId!);
  A = a1.allianceId!; B = b1.allianceId!;
});

describe('influence', () => {
  it('counts every planet at least its base weight, plus what stands on it', () => {
    const home = place(a1, 1, 5);
    expect(planetWeight(home)).toBe(SECTOR.planetBase);
    home.defenses = { rocketLauncher: 50 };
    home.buildings = { metalMine: 10 };
    expect(planetWeight(home)).toBeGreaterThan(SECTOR.planetBase);
    const moon = { ...home, isMoon: true, buildings: {}, fleet: {}, defenses: {} } as Planet;
    expect(planetWeight(moon)).toBe(0);
  });

  it('adds up per system and alliance, ignoring commanders without an alliance and computer empires', () => {
    place(a1, 1, 5); place(a2, 1, 5); place(b1, 1, 5); place(b2, 2, 9);   // b2 elsewhere, or a random home could land in 1:5
    const solo = register(w, 'solo', 'secret1', T0).player;
    place(solo, 1, 5);
    const npc = register(w, 'npcx', 'secret1', T0).player;
    npc.npc = { status: 'active', seedPoints: 1, faction: null };
    place(npc, 1, 5);
    const per = influenceMap(w).get(sectorKey(1, 5))!;
    expect([...per.keys()].sort()).toEqual([A, B].sort());
    expect(per.get(A)).toMatchObject({ planets: 2, value: 200 });
    expect(per.get(B)).toMatchObject({ planets: 1, value: 100 });
  });
});

describe('control', () => {
  it('needs a minimum presence to claim a system', () => {
    place(a1, 1, 7); place(a2, 1, 7);                     // 200 < 300
    expect(processSectors(w, T0)).toBe(0);
    expect(w.sectors).toEqual({});
    createPlanet(w, a1, { g: 1, s: 7, p: 9 }, { now: T0 });
    expect(processSectors(w, T0)).toBe(1);                // 300: claimed
    expect(w.sectors!['1:7']).toMatchObject({ allianceId: A, since: T0 });
    for (const p of [a1, a2]) expect(w.messages.some((m) => m.to === p.id && m.subject === 'Sector claimed')).toBe(true);
    expect(w.messages.some((m) => m.to === b1.id && /Sector/.test(m.subject))).toBe(false);
  });

  it('a clear lead is needed when two alliances are present, and the holder keeps it against a close rival', () => {
    place(a1, 1, 8); place(a2, 1, 8); createPlanet(w, a1, { g: 1, s: 8, p: 10 }, { now: T0 });   // A: 300
    const rival = place(b1, 1, 8);
    rival.fleet = { cruiser: 4 };                                                                    // B: two planets and a few cruisers, about level with A
    createPlanet(w, b2, { g: 1, s: 8, p: 12 }, { now: T0 });
    const aBefore = influenceMap(w).get('1:8')!.get(A)!.value, bBefore = influenceMap(w).get('1:8')!.get(B)!.value;
    expect(bBefore).toBeGreaterThan(SECTOR.claimMin * 0.9);
    expect(Math.max(aBefore, bBefore) / Math.min(aBefore, bBefore)).toBeLessThan(SECTOR.margin); // too close to call
    processSectors(w, T0);
    expect(w.sectors!['1:8']).toBeUndefined();                       // contested: nobody claims
    rival.fleet = {};
    processSectors(w, T0 + 60_000);
    expect(w.sectors!['1:8']?.allianceId).toBe(A);                   // now A leads clearly
    rival.fleet = { cruiser: 4 };                                    // B pulls level but is not 25% ahead
    expect(processSectors(w, T0 + 120_000)).toBe(0);
    expect(w.sectors!['1:8'].allianceId).toBe(A);
  });

  it('can be taken by a challenger that beats the holder by the margin, and both sides are told', () => {
    place(a1, 1, 9); place(a2, 1, 9); createPlanet(w, a1, { g: 1, s: 9, p: 10 }, { now: T0 });
    processSectors(w, T0);
    expect(territoryCount(w, A)).toBe(1);
    const big = place(b1, 1, 9);
    big.fleet = { battleship: 100 };
    createPlanet(w, b2, { g: 1, s: 9, p: 12 }, { now: T0 });
    const per = influenceMap(w).get('1:9')!;
    expect(per.get(B)!.value).toBeGreaterThan(per.get(A)!.value * SECTOR.margin);
    expect(processSectors(w, T0 + 60_000)).toBe(1);
    expect(w.sectors!['1:9'].allianceId).toBe(B);
    expect(w.messages.some((m) => m.to === a2.id && m.subject === 'Sector lost' && /\[BBB\] took sector 1:9/.test(m.body))).toBe(true);
    expect(w.messages.some((m) => m.to === b2.id && m.subject === 'Sector captured')).toBe(true);
    expect(territoryCount(w, A)).toBe(0);
    expect(territoryCount(w, B)).toBe(1);
  });

  it('is lost when the holder leaves it, loses its planets or disbands', () => {
    place(a1, 2, 3); place(a2, 2, 3); createPlanet(w, a1, { g: 2, s: 3, p: 10 }, { now: T0 });
    processSectors(w, T0);
    expect(w.sectors!['2:3']).toBeDefined();
    w.planets[a2.planetIds[0]].coords = { g: 2, s: 30, p: 4 };       // a2 leaves: 200 left, still above the keep line (150)
    expect(processSectors(w, T0 + 60_000)).toBe(0);
    for (const id of [...a1.planetIds].slice(1)) { delete w.planets[id]; a1.planetIds = a1.planetIds.filter((x) => x !== id); }
    w.planets[a1.planetIds[0]].coords = { g: 2, s: 31, p: 5 };      // everyone gone: abandoned
    expect(processSectors(w, T0 + 120_000)).toBe(1);
    expect(w.sectors!['2:3']).toBeUndefined();
    expect(w.messages.some((m) => m.to === a1.id && m.subject === 'Sector lost')).toBe(true);
  });

  it('disappears with its alliance', () => {
    place(a1, 2, 4); place(a2, 2, 4); createPlanet(w, a1, { g: 2, s: 4, p: 10 }, { now: T0 });
    processSectors(w, T0);
    expect(w.sectors!['2:4']).toBeDefined();
    AL.leaveAlliance(w, a2);
    AL.disbandAlliance(w, a1);
    expect(w.sectors!['2:4']).toBeUndefined();
    removePlayer(w, b2);                                             // removing a commander with an alliance must not break the pass either
    expect(() => processSectors(w, T0 + 60_000)).not.toThrow();
  });
});

describe('what territory gives', () => {
  it('adds a small production bonus to every member, capped', () => {
    expect(territoryBonus(w, A)).toBe(0);
    const base = allianceBonuses(w, a2).production;
    w.sectors = { '1:1': { allianceId: A, since: T0 }, '1:2': { allianceId: A, since: T0 } };
    recountTerritory(w);
    expect(territoryBonus(w, A)).toBeCloseTo(0.01, 9);
    expect(allianceBonuses(w, a2).production).toBeCloseTo(base + 0.01, 9);
    expect(allianceBonuses(w, b1).production).toBe(0);              // the rival gets nothing
    for (let i = 0; i < 40; i++) w.sectors[`2:${i + 1}`] = { allianceId: A, since: T0 };
    recountTerritory(w);
    expect(territoryBonus(w, A)).toBe(SECTOR.bonusCap);
    const home = w.planets[a2.planetIds[0]];
    home.buildings = { metalMine: 10, solarPlant: 20 };
    const boosted = planetProduction(w, home).metal;
    w.sectors = {};
    recountTerritory(w);
    expect(planetProduction(w, home).metal).toBeLessThan(boosted);
  });

  it('is described on the map and for a single system', () => {
    place(a1, 1, 5); place(a2, 1, 5); createPlanet(w, a1, { g: 1, s: 5, p: 10 }, { now: T0 });
    place(b1, 1, 5);
    processSectors(w, T0);
    const v = sectorsView(w, A);
    const cell = v.sectors.find((x) => x.g === 1 && x.s === 5)!;
    expect(cell.owner).toMatchObject({ tag: 'AAA' });
    expect(cell.contested).toBe(true);
    expect(cell.influence[0]).toMatchObject({ tag: 'AAA', planets: 3 });
    expect(v.mine).toMatchObject({ allianceId: A, count: 1 });
    expect(sectorsView(w, null).mine).toBeNull();
    const one = sectorOf(w, 1, 5, B);
    expect(one.owner).toMatchObject({ tag: 'AAA', mine: false });
    expect(one.influence.find((x) => x.tag === 'BBB')!.mine).toBe(true);
    expect(sectorOf(w, 2, 40, A).owner).toBeNull();
  });
});
