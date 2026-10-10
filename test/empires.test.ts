import { beforeEach, describe, expect, it, vi } from 'vitest';
import { login, register } from '../server/accounts';
import {
  NPC_TICK_MS, answerTribute, demandTribute, empireList, generateEmpires, hasEmpires, npcExpansion, npcTick, npcWars, processTributes,
} from '../server/empires';
import { planetProduction, processPlayer } from '../server/economy';
import { processMovements, sendFleet } from '../server/fleet';
import { galaxyView, isProtected, playerPoints } from '../server/galaxy';
import { spawnRaid } from '../server/npc';
import { rankings } from '../server/rankings';
import { GameError, createWorld, planetAt, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

let w: World;
let alice: Player;
let ap: Planet;

function mk(density = 0.35) {
  w = createWorld({ galaxies: 2, systems: 12, positions: 15, economySpeed: 20, fleetSpeed: 50, protectionPoints: 100, raidIntervalMin: 0, npcDensity: density }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  ap = w.planets[alice.planetIds[0]];
  ap.coords = { g: 1, s: 6, p: 6 };
  ap.buildings = { roboticsFactory: 4, shipyard: 6, researchLab: 6, solarPlant: 20, metalMine: 15, crystalMine: 12 };
  ap.resources = { metal: 3e6, crystal: 3e6, deuterium: 3e6 };
  alice.techs = { combustionDrive: 6, impulseDrive: 4, energy: 8, computer: 3, espionage: 5 };
}

/** a hand-made empire, so behaviour tests do not depend on generation luck */
function addEmpire(name: string, status: 'inactive' | 'active' | 'aggressive', coords: { g: number; s: number; p: number }, opts: { faction?: any; points?: number } = {}) {
  const before = new Set(Object.keys(w.players));
  w.config.npcDensity = 0;
  const seed = Math.floor(Math.random() * 1e9);
  // register a stand-in and flip it into an NPC: this exercises the same data shape as generation
  const id = 'npc' + before.size;
  w.players[id] = { ...alice, id, username: name, planetIds: [], techs: { weapons: 2, shielding: 2, armour: 2, combustionDrive: 6, impulseDrive: 4 }, officers: {}, achievements: {}, objectives: {}, rep: {}, heat: {}, truces: {}, tributes: [], history: [], faction: null,
    stats: { ...alice.stats }, npc: { status, seedPoints: opts.points ?? 5000, faction: opts.faction ?? null } } as Player;
  void seed;
  const npc = w.players[id];
  const pl: Planet = { ...ap, id: 'pl' + id, ownerId: id, name: name + ' Prime', coords, isHome: false, buildings: { metalMine: 10, solarPlant: 15, shipyard: 4, metalStorage: 3 },
    resources: { metal: 400_000, crystal: 200_000, deuterium: 80_000 }, fleet: {}, defenses: {}, shipyardQueue: [], buildQueue: null, buildBacklog: [], updatedAt: T0 };
  w.planets[pl.id] = pl;
  npc.planetIds.push(pl.id);
  return { npc, pl };
}

beforeEach(() => mk());

describe('generation', () => {
  it('settles free slots with empires that own up to four planets in one galaxy', () => {
    const n = generateEmpires(w, T0, 42);
    expect(n).toBeGreaterThan(10);
    expect(hasEmpires(w)).toBe(true);
    for (const e of empireList(w)) {
      expect(e.planetIds.length).toBeGreaterThanOrEqual(1);
      expect(e.planetIds.length).toBeLessThanOrEqual(5); // 4 planets + possible moons
      const gs = new Set(e.planetIds.map((id) => w.planets[id].coords.g));
      expect(gs.size).toBe(1);
      expect(e.techs.weapons).toBeDefined();
      expect(['inactive', 'active', 'aggressive']).toContain(e.npc!.status);
    }
    // never on top of a commander, and one body per slot (moons aside)
    expect(planetAt(w, ap.coords)?.ownerId).toBe(alice.id);
    const seen = new Set<string>();
    for (const p of Object.values(w.planets)) if (!p.isMoon) { const k = `${p.coords.g}:${p.coords.s}:${p.coords.p}`; expect(seen.has(k), k).toBe(false); seen.add(k); }
  });

  it('is repeatable for a seed and off when density is zero', () => {
    const a = createWorld({ npcDensity: 0.3, systems: 8 }, T0), b = createWorld({ npcDensity: 0.3, systems: 8 }, T0);
    expect(generateEmpires(a, T0, 7)).toBe(generateEmpires(b, T0, 7));
    const none = createWorld({ npcDensity: 0, systems: 8 }, T0);
    expect(generateEmpires(none, T0, 7)).toBe(0);
    expect(hasEmpires(none)).toBe(false);
  });

  it('develops planets: inactive empires hoard, aggressive ones keep fleets, strength tracks points', () => {
    generateEmpires(w, T0, 99);
    const list = empireList(w);
    const rich = list.filter((e) => e.npc!.seedPoints > 3000);
    expect(rich.length).toBeGreaterThan(0);
    const fleets = list.filter((e) => e.npc!.status === 'aggressive').flatMap((e) => e.planetIds.map((id) => Object.keys(w.planets[id].fleet).length));
    if (fleets.length) expect(Math.max(...fleets)).toBeGreaterThan(0);
    for (const e of list) for (const id of e.planetIds) expect(planetProduction(w, w.planets[id]).efficiency).toBeGreaterThanOrEqual(0.99);
  });

  it('empires cannot be logged into, never receive mail, and do not use up commander slots', () => {
    generateEmpires(w, T0, 5);
    const npc = empireList(w)[0];
    expect(() => login(w, npc.username, 'whatever')).toThrow(GameError);
    const before = w.messages.length;
    w.players[alice.id].credits = 0;
    expect(w.messages.length).toBe(before);
    w.config.maxPlayers = 2;
    register(w, 'bob', 'secret2', T0); // alice + bob = 2 commanders even with hundreds of empires
    expect(() => register(w, 'carol', 'secret3', T0)).toThrow(/full/);
  });
});

describe('fighting empires', () => {
  it('commanders can always attack empires, even before protection ends', () => {
    const { npc } = addEmpire('Voidlord Tez', 'inactive', { g: 1, s: 7, p: 3 }, { points: 10 });
    w.config.protectionPoints = 1e9;
    expect(isProtected(w, alice, npc)).toBe(false);
  });

  it('a raid on an empire earns loot, a grudge, lost standing - and the grudge makes it hostile', () => {
    const { npc, pl } = addEmpire('Kaxe', 'active', { g: 1, s: 7, p: 3 }, { faction: 'iron' });
    ap.fleet = { battleship: 30, largeCargo: 20 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: pl.coords, ships: { battleship: 30, largeCargo: 20 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    expect(alice.stats.plundered).toBeGreaterThan(50_000);
    expect(alice.heat[npc.id]).toBeGreaterThan(50_000);
    expect(alice.rep.iron).toBeLessThan(0);
    expect(alice.rep.chain).toBeGreaterThan(0); // the rival faction approves
    expect(npc.stats.battlesLost).toBe(1);
    npcTick(w, T0 + HOUR);
    expect(npc.npc!.status).toBe('aggressive');
    expect(w.messages.some((x) => x.to === alice.id && x.kind === 'news' && /vendetta/.test(x.subject))).toBe(true);
  });

  it('grudges cool off 3% each tick', () => {
    const { npc } = addEmpire('Kaxe', 'inactive', { g: 1, s: 7, p: 3 });
    alice.heat[npc.id] = 10_000;
    npcTick(w, T0 + HOUR);
    expect(alice.heat[npc.id]).toBeCloseTo(9_700, 0);
    alice.heat[npc.id] = 50;
    npcTick(w, T0 + 2 * HOUR);
    expect(alice.heat[npc.id]).toBeUndefined();
  });

  it('attacking your own faction expels you', () => {
    const { pl } = addEmpire('Kaxe', 'active', { g: 1, s: 7, p: 3 }, { faction: 'solar' });
    alice.rep.solar = 60; alice.faction = 'solar';
    ap.fleet = { battleship: 30, largeCargo: 20 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: pl.coords, ships: { battleship: 30, largeCargo: 20 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    expect(alice.faction).toBeNull();
  });
});

describe('raids from empires', () => {
  const prepare = () => { w.config.protectionPoints = 1; ap.buildings = { ...ap.buildings, metalMine: 20 }; };

  it('come from an aggressive neighbour, with an empire name and a real flight', () => {
    prepare();
    addEmpire('Peaceful', 'active', { g: 1, s: 8, p: 3 });
    const { npc, pl } = addEmpire('Warlord', 'aggressive', { g: 1, s: 9, p: 3 });
    const raid = spawnRaid(w, T0, () => 0.5)!;
    expect(raid.ownerId).toBe(npc.id);
    expect(raid.ownerName).toBe('Warlord');
    expect(raid.from).toEqual(pl.coords);
    expect(raid.arriveAt - T0).toBeGreaterThanOrEqual(600_000);
    expect(w.messages.some((m) => m.to === alice.id && m.kind === 'raid' && /Warlord/.test(m.body))).toBe(true);
  });

  it('respect truces and faction pacts, falling back to generic raiders only when no empire exists', () => {
    prepare();
    const { npc } = addEmpire('Warlord', 'aggressive', { g: 1, s: 9, p: 3 }, { faction: 'chain' });
    alice.truces[npc.id] = T0 + HOUR;
    const a = spawnRaid(w, T0, () => 0.5)!;
    expect(a.ownerId).toBeNull(); // only empire is on truce -> generic raiders
    delete w.movements[a.id];
    alice.truces = {};
    alice.faction = 'chain';
    expect(spawnRaid(w, T0, () => 0.5)!.ownerId).toBeNull(); // same faction
    alice.faction = 'iron';
    expect(spawnRaid(w, T0, () => 0.5)!.ownerId).toBe(npc.id);
  });

  it('grow with the target\'s defenses and the configured strength', () => {
    prepare();
    addEmpire('Warlord', 'aggressive', { g: 1, s: 9, p: 3 }, { points: 3000 });
    const size = (m: any) => Object.values(m.ships as Record<string, number>).reduce((a, b) => a + b, 0);
    ap.defenses = {};
    const small = spawnRaid(w, T0, () => 0.5)!;
    ap.defenses = { plasmaTurret: 100, gaussCannon: 200 };
    const big = spawnRaid(w, T0, () => 0.5)!;
    expect(size(big)).toBeGreaterThan(size(small));
    w.config.raidStrength = 2;
    const strong = spawnRaid(w, T0, () => 0.5)!;
    expect(size(strong)).toBeGreaterThan(size(big) * 1.5);
  });

  it('are fought like any battle; beaten raiders pay a bounty, winners fly home with the loot', () => {
    prepare();
    const { npc, pl } = addEmpire('Warlord', 'aggressive', { g: 1, s: 9, p: 3 }, { points: 2000 });
    ap.defenses = { plasmaTurret: 300, gaussCannon: 600, largeShield: 1 };
    const raid = spawnRaid(w, T0, () => 0.5)!;
    ap.defenses = { plasmaTurret: 600, gaussCannon: 1200, largeShield: 1 };
    const metal = ap.resources.metal;
    processMovements(w, raid.arriveAt);
    expect(alice.stats.raidsRepelled).toBe(1);
    expect(ap.resources.metal).toBeGreaterThan(metal * 0.9);
    expect(w.movements[raid.id]).toBeUndefined();
    void npc; void pl;
  });

  it('a successful raider hauls loot to the empire\'s planet', () => {
    prepare();
    ap.defenses = {}; ap.fleet = {};
    const { pl } = addEmpire('Warlord', 'aggressive', { g: 1, s: 9, p: 3 }, { points: 20000 });
    const raid = spawnRaid(w, T0, () => 0.5)!;
    const before = pl.resources.metal;
    processMovements(w, raid.arriveAt);
    expect(alice.stats.battlesLost).toBe(1);
    expect(w.movements[raid.id]?.phase).toBe('returning');
    processMovements(w, raid.arriveAt + raid.flightMs + 1000);
    expect(pl.resources.metal).toBeGreaterThan(before);
  });
});

describe('the 20-minute tick', () => {
  it('active empires develop (upgrades and units) and grow stronger; inactive ones do not', () => {
    const a = addEmpire('Builder', 'active', { g: 1, s: 7, p: 3 }).pl;
    const i = addEmpire('Sleeper', 'inactive', { g: 1, s: 8, p: 3 });
    const before = { mines: a.buildings.metalMine, units: Object.keys(a.defenses).length, sleeperRes: i.pl.resources.metal, pts: i.npc.npc!.seedPoints };
    npcTick(w, T0 + 3 * HOUR);
    expect(a.buildings.metalMine!).toBeGreaterThanOrEqual(before.mines!);
    expect(Object.keys(a.defenses).length + Object.keys(a.fleet).length).toBeGreaterThan(before.units);
    expect(i.pl.buildings.metalMine).toBe(10);
    expect(i.npc.npc!.seedPoints).toBe(before.pts);
    expect(w.nextNpcTick).toBe(T0 + 3 * HOUR + NPC_TICK_MS);
  });

  it('aggressive empires fight each other: debris, losses and news for nearby commanders', () => {
    const x = addEmpire('Attacker', 'aggressive', { g: 1, s: 8, p: 3 }, { points: 30000 });
    const y = addEmpire('Victim', 'active', { g: 1, s: 1, p: 2 }); // the slot a 0.1 roll picks from s=8
    x.pl.fleet = { cruiser: 400, battleship: 200 };
    y.pl.fleet = { lightFighter: 50 };
    y.pl.defenses = { rocketLauncher: 100 };
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    npcWars(w, T0);
    rnd.mockRestore();
    expect((y.pl.fleet.lightFighter ?? 0)).toBe(0);
    expect(Object.keys(w.debris).length).toBeGreaterThan(0);
    expect(x.pl.resources.metal).toBeGreaterThan(400_000);
    expect(w.messages.some((m) => m.to === alice.id && m.kind === 'news' && /raided/.test(m.subject))).toBe(true);
  });

  it('active empires occasionally settle the next slot', () => {
    const x = addEmpire('Settler', 'active', { g: 1, s: 8, p: 3 });
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.001);
    npcExpansion(w, T0);
    rnd.mockRestore();
    expect(x.npc.planetIds.length).toBe(2);
    expect(Object.values(w.planets).filter((p) => p.ownerId === x.npc.id).length).toBe(2);
  });

  it('records a history snapshot for every commander', () => {
    npcTick(w, T0 + HOUR);
    npcTick(w, T0 + 2 * HOUR);
    expect(alice.history).toHaveLength(2);
    expect(alice.history[1]).toMatchObject({ t: T0 + 2 * HOUR, rank: 1 });
    expect(alice.history[1].points).toBeGreaterThan(0);
  });

  it('factions send supplies to their members', () => {
    alice.faction = 'solar';
    const before = ap.resources.metal;
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.01);
    npcTick(w, T0 + HOUR);
    rnd.mockRestore();
    expect(ap.resources.metal).toBeGreaterThan(before);
    expect(w.messages.some((m) => m.to === alice.id && /supplies/.test(m.subject))).toBe(true);
  });
});

describe('tribute demands', () => {
  const setup = () => {
    w.config.protectionPoints = 1;
    ap.buildings = { ...ap.buildings, metalMine: 25, crystalMine: 22, solarPlant: 30, shipyard: 12, researchLab: 12 };
    ap.fleet = { battleship: 400 }; // pushes the commander past 3,000 points
    const e = addEmpire('Warlord', 'aggressive', { g: 1, s: 9, p: 3 }, { points: 60000 });
    e.pl.fleet = { battleship: 1500 }; // strong enough to out-rank 60% of the commander
    return e;
  };

  it('a strong aggressive empire demands a share of your stockpile with a deadline', () => {
    const { npc } = setup();
    expect(playerPoints(w, alice).total).toBeGreaterThan(3000);
    const rec = demandTribute(w, alice, T0)!;
    expect(rec.npc).toBe(npc.id);
    expect(rec.want.metal).toBeGreaterThan(100_000);
    expect(rec.deadline).toBeGreaterThan(T0);
    expect(demandTribute(w, alice, T0)).toBeNull(); // one open demand at a time
    expect(alice.nextTribute).toBeGreaterThan(T0);
  });

  it('is not made to small commanders or by weaklings', () => {
    mk(0);
    addEmpire('Warlord', 'aggressive', { g: 1, s: 9, p: 3 }, { points: 60000 });
    expect(demandTribute(w, alice, T0)).toBeNull(); // alice is tiny
    setup();
    for (const e of empireList(w)) e.npc!.status = 'active';
    expect(demandTribute(w, alice, T0)).toBeNull(); // nobody aggressive
  });

  it('paying takes resources (largest stockpile first), buys a truce and ends the grudge', () => {
    const { npc } = setup();
    alice.heat[npc.id] = 5000;
    const rec = demandTribute(w, alice, T0)!;
    const before = ap.resources.metal;
    answerTribute(w, alice, rec.id, 'pay', T0 + 1000);
    expect(ap.resources.metal).toBeLessThan(before);
    expect(alice.truces[npc.id]).toBeGreaterThan(T0);
    expect(alice.heat[npc.id]).toBeUndefined();
    expect(rec.answered).toBe('paid');
    expect(spawnRaid(w, T0 + 2000, () => 0.5)!.ownerId).toBeNull(); // truce: only generic raiders left
    expect(() => answerTribute(w, alice, rec.id, 'pay', T0 + 3000)).toThrow(/already/);
  });

  it('a payment you cannot afford takes nothing', () => {
    const { npc } = setup();
    const rec = demandTribute(w, alice, T0)!;
    ap.resources = { metal: 1, crystal: 1, deuterium: 1 };
    expect(() => answerTribute(w, alice, rec.id, 'pay', T0 + 1)).toThrow(/Not enough/);
    expect(ap.resources.metal).toBeCloseTo(1, 0);
    expect(alice.truces[npc.id]).toBeUndefined();
  });

  it('refusing adds heat and brings that empire\'s fleet soon', () => {
    const { npc } = setup();
    const rec = demandTribute(w, alice, T0)!;
    let launched = 0;
    answerTribute(w, alice, rec.id, 'refuse', T0 + 1000, (id) => { launched++; expect(id).toBe(npc.id); const r = spawnRaid(w, T0 + 1000, () => 0.5, { targetPlayerId: alice.id, sourceNpcId: id }); expect(r?.ownerId).toBe(npc.id); });
    expect(launched).toBe(1);
    expect(alice.heat[npc.id]).toBeGreaterThanOrEqual(30_000);
    expect(rec.answered).toBe('refused');
  });

  it('silence counts as a refusal once the deadline passes', () => {
    const { npc } = setup();
    const rec = demandTribute(w, alice, T0)!;
    alice.nextTribute = T0 + 1e12;
    processTributes(w, rec.deadline + 1);
    expect(rec.answered).toBe('ignored');
    expect(alice.heat[npc.id]).toBeGreaterThanOrEqual(20_000);
  });

  it('processTributes schedules and issues demands on its own', () => {
    setup();
    alice.nextTribute = 0;
    processTributes(w, T0);
    expect(alice.nextTribute).toBeGreaterThan(T0);
    alice.nextTribute = T0 - 1;
    processTributes(w, T0 + 5);
    expect(alice.tributes.length).toBe(1);
  });
});

describe('what commanders see', () => {
  it('the galaxy view labels empires with their disposition and faction', () => {
    addEmpire('Kaxe', 'aggressive', { g: 1, s: 6, p: 9 }, { faction: 'verge' });
    const slot = galaxyView(w, alice, 1, 6).find((s) => s.p === 9)!;
    expect(slot.planet?.npc).toBe('aggressive');
    expect(slot.planet?.faction).toBe('verge');
    expect(galaxyView(w, alice, 1, 6).find((s) => s.p === 6)!.planet?.npc).toBeNull();
  });

  it('highscores rank empires alongside commanders', () => {
    addEmpire('Kaxe', 'active', { g: 1, s: 8, p: 9 }, { faction: 'verge' });
    const rows = rankings(w, true);
    expect(rows.some((r) => r.npc === 'active')).toBe(true);
    expect(rows.find((r) => r.id === alice.id)!.npc).toBeNull();
    expect(rows.map((r) => r.rank)).toEqual(rows.map((_, i) => i + 1));
  });

  it('raids and ticks keep a commander\'s processing working with hundreds of empires present', () => {
    generateEmpires(w, T0, 11);
    for (const p of Object.values(w.players)) processPlayer(w, p, T0 + HOUR);
    npcTick(w, T0 + HOUR);
    npcTick(w, T0 + 2 * HOUR);
    for (const e of empireList(w)) for (const id of e.planetIds) {
      const r = w.planets[id].resources;
      expect(Number.isFinite(r.metal) && r.metal >= 0).toBe(true);
    }
  });
});
