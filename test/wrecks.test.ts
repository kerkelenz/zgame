import { beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { abandonPlanet, planetProduction, processPlayer, startBuilding, updatePlanet } from '../server/economy';
import { processMovements, sendFleet } from '../server/fleet';
import { createMoon, createPlanet } from '../server/galaxy';
import { checkProgress } from '../server/progress';
import { endVacation, startVacation } from '../server/vacation';
import { addWreck, repairSeconds, startRepair, wreckView } from '../server/wrecks';
import { planetView } from '../server/views';
import { GameError, createWorld, planetAt, type Planet, type Player, type World } from '../server/world';
import { wreckRepairShare } from '../shared/data';
import { buildingTable, detailCtxFrom } from '../shared/effects';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
let w: World;
let alice: Player, bob: Player;
let ap: Planet, bp: Planet, bm: Planet;

/** feed Math.random a scripted sequence (then 0.5 forever) */
const dice = (...seq: number[]) => {
  let i = 0;
  return vi.spyOn(Math, 'random').mockImplementation(() => (i < seq.length ? seq[i++] : 0.5));
};

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bob', 'secret2', T0).player;
  ap = w.planets[alice.planetIds[0]]; bp = w.planets[bob.planetIds[0]];
  ap.coords = { g: 1, s: 5, p: 6 }; bp.coords = { g: 1, s: 6, p: 8 };
  for (const p of [ap, bp]) {
    p.buildings = { shipyard: 12, roboticsFactory: 6, researchLab: 6, solarPlant: 25, metalStorage: 8, crystalStorage: 8, deuteriumTank: 8 };
    p.resources = { metal: 5e9, crystal: 5e9, deuterium: 5e9 };
  }
  alice.techs = { combustionDrive: 6, impulseDrive: 5, hyperspaceDrive: 4, hyperspace: 6, energy: 9, graviton: 1, computer: 10 };
  bob.techs = { ...alice.techs };
  bm = createMoon(w, bp, T0, 0.1);
  bm.diameter = 4900; // sqrt = 70 -> a lone Deathstar has a 30% chance, and a 35% risk of dying
  bm.resources = { metal: 1000, crystal: 1000, deuterium: 1000 };
});

const strike = (ships: Record<string, number>, mission: 'destroy' | 'attack' = 'destroy', toMoon = true) => {
  ap.fleet = { ...ships };
  return sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, toMoon, ships, mission }, T0);
};

describe('destroy mission rules', () => {
  it('needs a Deathstar and a moon target, and obeys the usual attack rules', () => {
    ap.fleet = { cruiser: 20, deathstar: 1 };
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, toMoon: true, ships: { cruiser: 5 }, mission: 'destroy' }, T0)).toThrow(/Deathstar/);
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, toMoon: false, ships: { deathstar: 1 }, mission: 'destroy' }, T0)).toThrow(/moon as the target/);
    const noMoon = createPlanet(w, bob, { g: 1, s: 20, p: 5 }, { now: T0 });
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: noMoon.coords, toMoon: true, ships: { deathstar: 1 }, mission: 'destroy' }, T0)).toThrow(/no moon/);
    AL.createAlliance(w, alice, 'TEAM', 'The Team');
    AL.joinAlliance(w, bob, alice.allianceId!);
    expect(() => strike({ deathstar: 1 })).toThrow(/alliance/);
    AL.leaveAlliance(w, bob);
    bob.vacation = { since: T0, minUntil: T0 + 1 };
    expect(() => strike({ deathstar: 1 })).toThrow(/vacation/);
  });

  it('cannot be joined to a joint attack', () => {
    ap.fleet = { deathstar: 1, cruiser: 5 };
    const lead = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 5 }, mission: 'attack' }, T0);
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, toMoon: true, ships: { deathstar: 1 }, mission: 'destroy', joinFleetId: lead.id }, T0)).toThrow(/joint attack/);
  });

  it('shows up as a hostile fleet for the moon owner', () => {
    strike({ deathstar: 1 });
    expect(w.messages.some((m) => m.to === bob.id && /Hostile fleet detected/.test(m.subject))).toBe(true);
  });
});

describe('moon destruction', () => {
  const resolve = (m: ReturnType<typeof strike>) => processMovements(w, m.arriveAt);

  it('destroys the moon when the roll succeeds, and the Deathstars come home if they survive the shock wave', () => {
    const m = strike({ deathstar: 1 });
    bm.fleet = { lightFighter: 3 };
    const r = dice(0.5 /* combat seed */, 0.1 /* 10 < 30: destroyed */, 0.9 /* 90 > 35: Deathstars survive */);
    resolve(m);
    r.mockRestore();
    expect(planetAt(w, bp.coords, true)).toBeUndefined();
    expect(w.planets[bm.id]).toBeUndefined();
    expect(bob.planetIds).not.toContain(bm.id);
    expect(planetAt(w, bp.coords)?.id).toBe(bp.id); // the planet is untouched
    expect(alice.stats.moonsDestroyed).toBe(1);
    expect(w.movements[m.id].phase).toBe('returning');
    expect(w.movements[m.id].ships.deathstar).toBe(1);
    expect(w.messages.some((x) => x.to === bob.id && x.subject === 'Your moon was destroyed')).toBe(true);
    expect(w.messages.some((x) => x.to === alice.id && x.subject === 'Moon destroyed')).toBe(true);
    const report = w.messages.find((x) => x.to === alice.id && x.kind === 'combat' && /Battle at/.test(x.subject))!;
    expect(report.body).toMatch(/broke apart/);
  });

  it('the moon can hold', () => {
    const m = strike({ deathstar: 1 });
    const r = dice(0.5, 0.9, 0.9);
    resolve(m);
    r.mockRestore();
    expect(w.planets[bm.id]).toBeTruthy();
    expect(alice.stats.moonsDestroyed).toBe(0);
    expect(w.messages.find((x) => x.to === alice.id && /Battle at/.test(x.subject))!.body).toMatch(/moon held/);
  });

  it('all Deathstars can be lost to the shock wave (sqrt(diameter)/2 % risk)', () => {
    const m = strike({ deathstar: 2, cruiser: 10 });
    const r = dice(0.5, 0.9, 0.1 /* 10 < 35: rip */);
    resolve(m);
    r.mockRestore();
    const back = w.movements[m.id];
    expect(back.ships.deathstar).toBeUndefined();
    expect(back.ships.cruiser).toBeGreaterThan(0); // the escorts live
    expect(w.messages.find((x) => x.to === alice.id && /Battle at/.test(x.subject))!.body).toMatch(/tore 2 Deathstar/);
  });

  it('more Deathstars raise the odds: sqrt(count) times (100 - sqrt(diameter))', () => {
    // a roll of 40 fails for one Deathstar (30%) but succeeds for four (60%)
    const one = strike({ deathstar: 1 });
    let r = dice(0.5, 0.4, 0.9);
    resolve(one);
    r.mockRestore();
    expect(w.planets[bm.id]).toBeTruthy();
    for (const mv of Object.values(w.movements)) delete w.movements[mv.id];
    ap.fleet = {};
    const four = strike({ deathstar: 4 });
    r = dice(0.5, 0.4, 0.9);
    resolve(four);
    r.mockRestore();
    expect(w.planets[bm.id]).toBeUndefined();
  });

  it('smaller moons are easier to destroy', () => {
    bm.diameter = 1600; // sqrt = 40 -> 60% for one Deathstar
    const m = strike({ deathstar: 1 });
    const r = dice(0.5, 0.5, 0.9);
    resolve(m);
    r.mockRestore();
    expect(w.planets[bm.id]).toBeUndefined();
  });

  it('is only attempted if a Deathstar survives the battle', () => {
    bm.defenses = { plasmaTurret: 400, gaussCannon: 400 };
    const m = strike({ deathstar: 1 });
    const r = dice(0.5, 0.01, 0.9);
    resolve(m);
    r.mockRestore();
    expect(w.planets[bm.id]).toBeTruthy();
    expect(alice.stats.moonsDestroyed).toBe(0);
  });

  it('a plain attack on a moon never destroys it', () => {
    const m = strike({ cruiser: 30, deathstar: 1 }, 'attack');
    const r = dice(0.5, 0.01, 0.9);
    resolve(m);
    r.mockRestore();
    expect(w.planets[bm.id]).toBeTruthy();
  });

  it('fleets stationed on the moon go home, and ships in flight to it turn back', () => {
    AL.createAlliance(w, bob, 'TEAM', 'The Team');
    const carol = register(w, 'carol', 'secret3', T0).player;
    AL.joinAlliance(w, carol, bob.allianceId!);
    const cp = w.planets[carol.planetIds[0]];
    cp.coords = { g: 1, s: 6, p: 10 }; cp.buildings = { shipyard: 5, roboticsFactory: 3 }; cp.fleet = { cruiser: 5, largeCargo: 2 };
    cp.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
    carol.techs = { combustionDrive: 6, impulseDrive: 5, computer: 5 };
    const hold = sendFleet(w, carol, { fromPlanetId: cp.id, to: bp.coords, toMoon: true, ships: { cruiser: 5 }, mission: 'hold', holdHours: 5 }, T0);
    processMovements(w, hold.arriveAt);
    expect(hold.phase).toBe('holding');
    const gift = sendFleet(w, carol, { fromPlanetId: cp.id, to: bp.coords, toMoon: true, ships: { largeCargo: 2 }, mission: 'transport' }, hold.arriveAt);
    const m = strike({ deathstar: 3 });
    const r = dice(0.5, 0.01, 0.9);
    processMovements(w, m.arriveAt);
    r.mockRestore();
    expect(w.planets[bm.id]).toBeUndefined();
    // the hold fleet fought and lost nothing it cannot recover; either way it is not stranded on a dead moon
    expect([undefined, 'returning']).toContain(w.movements[hold.id]?.phase);
    processMovements(w, gift.arriveAt + 10 * HOUR);
    expect(w.movements[gift.id]).toBeUndefined();
  });

  it('earns the Moonbreaker achievement', () => {
    const m = strike({ deathstar: 1 });
    const r = dice(0.5, 0.1, 0.9);
    resolve(m);
    r.mockRestore();
    alice.achievements.topTen = T0;
    checkProgress(w, alice, T0 + 1);
    expect(alice.achievements.moonbreaker).toBeTruthy();
    expect(alice.credits).toBeGreaterThanOrEqual(300);
  });
});

describe('wreck fields', () => {
  /** alice (strong) hits bob, who defends with cruisers */
  const battle = (defend: Record<string, number>, defenses: Record<string, number> = {}) => {
    ap.fleet = { battleship: 60 };
    bp.fleet = { ...defend }; bp.defenses = { ...defenses };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { battleship: 60 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    return m;
  };

  it('forms from the defender\'s destroyed ships when they are worth enough, and says so in the report', () => {
    battle({ cruiser: 30 });
    const wreck = w.wrecks[bp.id];
    expect(wreck).toBeTruthy();
    expect(wreck.ships.cruiser).toBeGreaterThan(20);
    expect(wreck.value).toBeGreaterThanOrEqual(w.config.wreckMinValue);
    expect(wreck.ownerId).toBe(bob.id);
    expect(wreck.expiresAt).toBe(w.movements[Object.keys(w.movements)[0]]!.arriveAt + 72 * HOUR);
    expect(w.messages.find((x) => x.to === bob.id && /Battle at/.test(x.subject))!.body).toMatch(/wreck field formed/);
  });

  it('needs enough value; defenses and satellites do not count', () => {
    battle({ lightFighter: 5, solarSatellite: 400 }, { rocketLauncher: 300, plasmaTurret: 5 });
    expect(w.wrecks[bp.id]).toBeUndefined(); // 5 light fighters are worth 20k
  });

  it('does not form for computer empires or over moons', () => {
    bp.fleet = { cruiser: 30 };
    expect(addWreck(w, bp, { cruiser: 30 }, T0)).toBeGreaterThan(0);
    delete w.wrecks[bp.id];
    expect(addWreck(w, bp, { lightFighter: 10 }, T0)).toBe(0);
    bob.npc = { status: 'active', seedPoints: 1, faction: null };
    ap.fleet = { battleship: 60 }; bp.fleet = { cruiser: 30 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { battleship: 60 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    expect(w.wrecks[bp.id]).toBeUndefined();
    bob.npc = undefined;
    bm.fleet = { cruiser: 30 };
    ap.fleet = { battleship: 50 };
    const n = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, toMoon: true, ships: { battleship: 50 }, mission: 'attack' }, T0);
    processMovements(w, n.arriveAt);
    expect(w.wrecks[bm.id]).toBeUndefined();
  });

  it('later battles add to the same field', () => {
    addWreck(w, bp, { cruiser: 10 }, T0);
    addWreck(w, bp, { cruiser: 5, battleship: 4 }, T0 + HOUR);
    expect(w.wrecks[bp.id].ships).toEqual({ cruiser: 15, battleship: 4 });
    expect(w.wrecks[bp.id].createdAt).toBe(T0);
    expect(w.wrecks[bp.id].expiresAt).toBe(T0 + HOUR + 72 * HOUR);
  });
});

describe('Space Dock', () => {
  beforeEach(() => { addWreck(w, bp, { cruiser: 100, battleship: 20 }, T0); });

  it('is a planet building with rising repair shares', () => {
    expect(wreckRepairShare(1)).toBeCloseTo(0.36, 9);
    expect(wreckRepairShare(5)).toBeCloseTo(0.6, 9);
    expect(wreckRepairShare(50)).toBe(0.9);
    const ctx = detailCtxFrom(planetView(w, bp, T0) as never, bob.techs);
    expect(buildingTable('spaceDock', ctx, 4, 4).rows[0].v.share).toBe(wreckRepairShare(4));
    bp.buildQueue = null;
    startBuilding(w, bob, bp, 'spaceDock', T0);
    expect(bp.buildQueue!.cost).toEqual({ metal: 200000, crystal: 0, deuterium: 50000 });
    expect(() => startBuilding(w, bob, bm, 'spaceDock', T0)).toThrow(/Requirements|moon/);
  });

  it('rebuilds a share of the wreck over time, for free, then the field is gone', () => {
    bp.buildings.spaceDock = 5; // 60%
    bp.fleet = {};
    startRepair(w, bob, bp, T0 + 1000);
    const repair = w.wrecks[bp.id].repair!;
    expect(repair.ships).toEqual({ cruiser: 60, battleship: 12 });
    expect(repair.endsAt).toBe(T0 + 1000 + repairSeconds(w) * 1000);
    expect(() => startRepair(w, bob, bp, T0 + 2000)).toThrow(/already under way/);
    const metal = bp.resources.metal;
    updatePlanet(w, bp, repair.endsAt - 1);
    expect(bp.fleet.cruiser).toBeUndefined();
    updatePlanet(w, bp, repair.endsAt);
    expect(bp.fleet).toEqual({ cruiser: 60, battleship: 12 });
    expect(w.wrecks[bp.id]).toBeUndefined();
    expect(bp.resources.metal).toBeGreaterThanOrEqual(metal); // repairs cost nothing
    expect(w.messages.some((m) => m.to === bob.id && m.subject === 'Repairs complete')).toBe(true);
  });

  it('refuses without a dock, for strangers, with nothing to repair, or if the share rounds to nothing', () => {
    expect(() => startRepair(w, bob, bp, T0)).toThrow(/Space Dock/);
    bp.buildings.spaceDock = 1;
    expect(() => startRepair(w, alice, bp, T0)).toThrow(/Not your planet/);
    delete w.wrecks[bp.id];
    expect(() => startRepair(w, bob, bp, T0)).toThrow(/no wreck/);
    addWreck(w, bp, { battleship: 2, cruiser: 1 }, T0); // 36% of 2 and 1 is 0
    w.wrecks[bp.id].value = 1e6;
    expect(() => startRepair(w, bob, bp, T0)).toThrow(/too small/);
  });

  it('wrecks drift away after the configured time, but a running repair is never cancelled', () => {
    bp.buildings.spaceDock = 2;
    updatePlanet(w, bp, T0 + 71 * HOUR);
    expect(w.wrecks[bp.id]).toBeTruthy();
    updatePlanet(w, bp, T0 + 73 * HOUR);
    expect(w.wrecks[bp.id]).toBeUndefined();
    addWreck(w, bp, { cruiser: 100 }, T0 + 80 * HOUR);
    startRepair(w, bob, bp, T0 + 81 * HOUR);
    updatePlanet(w, bp, T0 + 81 * HOUR + repairSeconds(w) * 1000);
    expect(bp.fleet.cruiser).toBeGreaterThan(0);
  });

  it('new wreckage cannot be added while a repair is running', () => {
    bp.buildings.spaceDock = 3;
    startRepair(w, bob, bp, T0);
    const before = JSON.stringify(w.wrecks[bp.id]);
    expect(addWreck(w, bp, { cruiser: 50 }, T0 + 1)).toBe(0);
    expect(JSON.stringify(w.wrecks[bp.id])).toBe(before);
  });

  it('the planet view describes the wreck and what the dock can do', () => {
    expect(planetView(w, bp, T0).wreck).toMatchObject({ dock: 0, share: 0 });
    bp.buildings.spaceDock = 4;
    const v = planetView(w, bp, T0).wreck!;
    expect(v.share).toBeCloseTo(0.54, 9);
    expect(v.ships).toEqual({ cruiser: 100, battleship: 20 });
    expect(v.repairSeconds).toBe(repairSeconds(w));
    expect(wreckView(w, ap)).toBeNull();
  });

  it('vacation blocks repairs; abandoning a colony removes its wreck', () => {
    bp.buildings.spaceDock = 3;
    const colony = createPlanet(w, bob, { g: 1, s: 30, p: 5 }, { name: 'Outpost', now: T0 });
    addWreck(w, colony, { cruiser: 40 }, T0);
    abandonPlanet(w, bob, colony, 'Outpost', T0);
    expect(w.wrecks[colony.id]).toBeUndefined();
    bp.fleet = {};
    bob.research = null; bp.buildQueue = null;
    startVacation(w, bob, T0);
    expect(() => startRepair(w, bob, bp, T0 + 1)).toThrow(/vacation mode/);
    endVacation(w, bob, T0 + 49 * HOUR);
    expect(() => startRepair(w, bob, bp, T0 + 49 * HOUR)).not.toThrow(GameError);
  });
});
