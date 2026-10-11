import { beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { abandonPlanet, queueBuilding, queueResearch, unqueueBuilding, unqueueResearch, moveQueuedBuilding, moveQueuedResearch, cancelBuilding, cancelResearch, processPlayer, queueUnits, startBuilding, startResearch, cancelShipyardJob, planetProduction } from '../server/economy';
import { launchMissiles, processMovements, recallFleet, sendFleet } from '../server/fleet';
import { createPlanet, playerPoints } from '../server/galaxy';
import { processRaids, spawnRaid } from '../server/npc';
import { GameError, createWorld, planetAt, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

let w: World;
let alice: Player, bob: Player;
let ap: Planet, bp: Planet;

function setup() {
  w = createWorld({ economySpeed: 100, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bob', 'secret2', T0).player;
  ap = w.planets[alice.planetIds[0]];
  bp = w.planets[bob.planetIds[0]];
  // put them next to each other for short flights
  ap.coords = { g: 1, s: 5, p: 6 };
  bp.coords = { g: 1, s: 5, p: 8 };
  for (const p of [ap, bp]) {
    p.buildings = { roboticsFactory: 4, shipyard: 6, researchLab: 6, solarPlant: 20, metalStorage: 8, crystalStorage: 8, deuteriumTank: 8 };
    p.resources = { metal: 2_000_000, crystal: 2_000_000, deuterium: 2_000_000 };
  }
  alice.techs = { combustionDrive: 6, impulseDrive: 4, energy: 8, computer: 3, astrophysics: 4, espionage: 4, shielding: 3 };
  bob.techs = { combustionDrive: 6, impulseDrive: 4, energy: 8, computer: 3, espionage: 2 };
}

beforeEach(setup);

describe('accounts', () => {
  it('creates a homeworld with starting resources', () => {
    const w2 = createWorld({}, T0);
    const { player, token } = register(w2, 'newbie', 'hunter22', T0);
    expect(token).toHaveLength(48);
    const home = w2.planets[player.planetIds[0]];
    expect(home.isHome).toBe(true);
    expect(home.fields).toBe(163);
    expect(home.resources).toEqual(w2.config.startResources);
  });
  it('rejects duplicate and invalid names', () => {
    expect(() => register(w, 'Alice', 'secret1')).toThrow(/taken/);
    expect(() => register(w, 'x', 'secret1')).toThrow();
    expect(() => register(w, 'carol', '123')).toThrow();
  });
});

describe('economy', () => {
  it('accrues resources over time, capped by storage', () => {
    ap.buildings = { metalMine: 5, solarPlant: 8, metalStorage: 0 };
    ap.resources = { metal: 0, crystal: 0, deuterium: 0 };
    processPlayer(w, alice, T0 + HOUR);
    expect(ap.resources.metal).toBeGreaterThan(1000);
    processPlayer(w, alice, T0 + 1000 * HOUR);
    expect(ap.resources.metal).toBe(10_000 * 100 * 5); // level-0 capacity: x100 economy speed, x5 storage boost
  });

  it('building takes resources, completes after its duration, and can be cancelled with refund', () => {
    ap.buildings = {};
    ap.resources = { metal: 1000, crystal: 1000, deuterium: 1000 };
    startBuilding(w, alice, ap, 'metalMine', T0);
    expect(ap.resources.metal).toBe(940);
    expect(() => startBuilding(w, alice, ap, 'crystalMine', T0)).toThrow(/in progress/);
    cancelBuilding(w, ap, T0 + 1);
    expect(ap.resources.metal).toBeGreaterThanOrEqual(1000);
    startBuilding(w, alice, ap, 'metalMine', T0 + 10);
    processPlayer(w, alice, T0 + 10 + HOUR);
    expect(ap.buildings.metalMine).toBe(1);
    expect(ap.buildQueue).toBeNull();
    expect(w.messages.some((m) => m.to === alice.id && /Construction complete/.test(m.subject))).toBe(true);
  });

  it('enforces requirements and field limits', () => {
    ap.buildings = {};
    expect(() => startBuilding(w, alice, ap, 'shipyard', T0)).toThrow(/Requirements/);
    expect(() => startBuilding(w, alice, ap, 'fusionReactor', T0)).toThrow(/Requirements/);
    ap.buildings = { metalMine: 3 };
    ap.fields = 3;
    expect(() => startBuilding(w, alice, ap, 'solarPlant', T0)).toThrow(/fields/);
  });

  it('refuses to build without resources', () => {
    ap.resources = { metal: 0, crystal: 0, deuterium: 0 };
    expect(() => startBuilding(w, alice, ap, 'metalMine', T0)).toThrow(/resources/);
  });

  it('research is per-player, one at a time, with refund on cancel', () => {
    alice.techs = {};
    startResearch(w, alice, ap, 'energy', T0);
    expect(() => startResearch(w, alice, ap, 'computer', T0)).toThrow(/in progress/);
    const before = ap.resources.crystal;
    cancelResearch(w, alice, T0);
    expect(ap.resources.crystal).toBeGreaterThan(before);
    startResearch(w, alice, ap, 'energy', T0);
    processPlayer(w, alice, T0 + 10 * HOUR);
    expect(alice.techs.energy).toBe(1);
    expect(() => startResearch(w, alice, ap, 'ion', T0 + 11 * HOUR)).toThrow(/Requirements/);
  });

  it('ship production completes units progressively', () => {
    ap.fleet = {};
    queueUnits(w, alice, ap, 'lightFighter', 10, T0);
    const unitMs = ap.shipyardQueue[0].unitMs;
    processPlayer(w, alice, T0 + Math.floor(unitMs * 3.5));
    expect(ap.fleet.lightFighter).toBe(3);
    processPlayer(w, alice, T0 + unitMs * 20);
    expect(ap.fleet.lightFighter).toBe(10);
    expect(ap.shipyardQueue).toHaveLength(0);
  });

  it('shield domes are limited to one per planet', () => {
    alice.techs.shielding = 6;
    queueUnits(w, alice, ap, 'smallShield', 1, T0);
    expect(() => queueUnits(w, alice, ap, 'smallShield', 1, T0)).toThrow(/Only 1/);
  });

  it('cancelling a shipyard job refunds the remaining units', () => {
    const before = ap.resources.metal;
    queueUnits(w, alice, ap, 'rocketLauncher', 100, T0);
    expect(ap.resources.metal).toBe(before - 200_000);
    cancelShipyardJob(w, ap, 0, T0);
    expect(ap.resources.metal).toBe(before);
  });

  it('solar satellites add energy', () => {
    ap.buildings = { metalMine: 10 };
    const none = planetProduction(w, ap).energyProduced;
    ap.fleet = { solarSatellite: 20 };
    expect(planetProduction(w, ap).energyProduced).toBeGreaterThan(none);
  });
});

describe('fleets', () => {
  it('validates ownership, ship counts and slots', () => {
    ap.fleet = { smallCargo: 5 };
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { smallCargo: 6 }, mission: 'transport' }, T0)).toThrow(/Not enough/);
    expect(() => sendFleet(w, alice, { fromPlanetId: bp.id, to: bp.coords, ships: { smallCargo: 1 }, mission: 'transport' }, T0)).toThrow(/Not your/);
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: {}, mission: 'transport' }, T0)).toThrow(/at least one/);
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: { g: 9, s: 1, p: 1 }, ships: { smallCargo: 1 }, mission: 'transport' }, T0)).toThrow(/Invalid destination/);
    // computer 3 => 4 slots
    for (let i = 0; i < 4; i++) sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { smallCargo: 1 }, mission: 'transport' }, T0);
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { smallCargo: 1 }, mission: 'transport' }, T0)).toThrow(/slots/);
  });

  it('transport delivers resources then flies home', () => {
    ap.fleet = { largeCargo: 4 };
    bp.resources = { metal: 0, crystal: 0, deuterium: 0 };
    bp.buildings = {};
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { largeCargo: 4 }, mission: 'transport', cargo: { metal: 50_000, crystal: 20_000 } }, T0);
    expect(ap.fleet.largeCargo).toBeUndefined();
    processMovements(w, m.arriveAt);
    expect(bp.resources.metal).toBeCloseTo(50_000, -3);
    expect(w.movements[m.id].phase).toBe('returning');
    expect(w.messages.some((x) => x.to === bob.id && /Delivery/.test(x.subject))).toBe(true);
    processMovements(w, m.arriveAt + m.flightMs + 5);
    expect(w.movements[m.id]).toBeUndefined();
    expect(ap.fleet.largeCargo).toBe(4);
  });

  it('rejects cargo above capacity and insufficient fuel', () => {
    ap.fleet = { smallCargo: 2 };
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { smallCargo: 2 }, mission: 'transport', cargo: { metal: 20_000 } }, T0)).toThrow(/capacity/);
    ap.resources.deuterium = 0;
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { smallCargo: 2 }, mission: 'transport' }, T0)).toThrow(/resources/);
  });

  it('deploy moves ships to another own planet permanently', () => {
    const c2 = createPlanet(w, alice, { g: 1, s: 5, p: 10 }, { now: T0 });
    ap.fleet = { cruiser: 3 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: c2.coords, ships: { cruiser: 3 }, mission: 'deploy' }, T0);
    processMovements(w, m.arriveAt);
    expect(c2.fleet.cruiser).toBe(3);
    expect(w.movements[m.id]).toBeUndefined();
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 1 }, mission: 'deploy' }, T0)).toThrow();
  });

  it('recall turns a fleet around mid-flight', () => {
    ap.fleet = { cruiser: 2 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 2 }, mission: 'transport' }, T0);
    const t = T0 + Math.floor((m.arriveAt - T0) / 2);
    recallFleet(w, alice, m.id, t);
    expect(m.phase).toBe('returning');
    expect(m.returnAt! - t).toBeLessThanOrEqual((m.arriveAt - T0) / 2 + 5);
    expect(() => recallFleet(w, alice, m.id, t)).toThrow(/already/);
    processMovements(w, m.returnAt!);
    expect(ap.fleet.cruiser).toBe(2);
  });

  it('attack: winner loots, creates debris, both get reports, fleet returns with loot', () => {
    ap.fleet = { battleship: 20, largeCargo: 20 };
    bp.fleet = { lightFighter: 10 };
    bp.defenses = { rocketLauncher: 10 };
    bp.resources = { metal: 100_000, crystal: 60_000, deuterium: 20_000 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { battleship: 20, largeCargo: 20 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    expect(w.movements[m.id].phase).toBe('returning');
    expect(w.movements[m.id].cargo.metal).toBeGreaterThan(30_000);
    expect(bp.fleet.lightFighter ?? 0).toBe(0);
    expect(Object.keys(w.debris).length).toBe(1);
    const reportA = w.messages.find((x) => x.to === alice.id && x.kind === 'combat');
    const reportB = w.messages.find((x) => x.to === bob.id && x.kind === 'combat');
    expect(reportA).toBeTruthy();
    expect(reportB).toBeTruthy();
    const before = ap.resources.metal;
    processMovements(w, m.arriveAt + m.flightMs + 5);
    expect(ap.resources.metal).toBeGreaterThan(before + 30_000);
    expect(alice.stats.battlesWon).toBe(1);
    expect(bob.stats.battlesLost).toBe(1);
  });

  it('attack: losing fleet is destroyed and does not return', () => {
    ap.fleet = { lightFighter: 3 };
    bp.defenses = { heavyLaser: 30, ionCannon: 10 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { lightFighter: 3 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    expect(w.movements[m.id]).toBeUndefined();
    expect(ap.fleet.lightFighter ?? 0).toBe(0);
  });

  it('cannot attack alliance members, yourself, or protected players', () => {
    ap.fleet = { cruiser: 5 };
    AL.createAlliance(w, alice, 'TEAM', 'The Team');
    AL.joinAlliance(w, bob, alice.allianceId!);
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 1 }, mission: 'attack' }, T0)).toThrow(/alliance/);
    AL.leaveAlliance(w, bob);
    w.config.protectionPoints = 10_000_000;
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 1 }, mission: 'attack' }, T0)).toThrow(/protection/);
  });

  it('allied hold fleet helps defend and shares the fight', () => {
    AL.createAlliance(w, alice, 'TEAM', 'The Team');
    AL.joinAlliance(w, bob, alice.allianceId!);
    const carol = register(w, 'carol', 'secret3', T0).player;
    const cp = w.planets[carol.planetIds[0]];
    cp.coords = { g: 1, s: 5, p: 12 };
    cp.buildings = { roboticsFactory: 4, shipyard: 6, solarPlant: 20 };
    cp.resources = { metal: 500_000, crystal: 500_000, deuterium: 500_000 };
    cp.fleet = { cruiser: 60 };
    carol.techs = { combustionDrive: 6, impulseDrive: 4, computer: 3 };
    ap.fleet = { cruiser: 40 };
    bp.fleet = {};
    bp.defenses = {};

    // alice (ally of bob) stations cruisers at bob's
    ap.fleet = { cruiser: 40 };
    const hold = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 40 }, mission: 'hold', holdHours: 2 }, T0);
    processMovements(w, hold.arriveAt);
    expect(hold.phase).toBe('holding');

    // carol (outsider) attacks bob with 60 cruisers
    const atk = sendFleet(w, carol, { fromPlanetId: cp.id, to: bp.coords, ships: { cruiser: 60 }, mission: 'attack' }, hold.arriveAt);
    processMovements(w, atk.arriveAt);
    const report = w.messages.find((x) => x.to === alice.id && x.kind === 'combat');
    expect(report).toBeTruthy(); // alice was involved as a defender
    const data = report!.data as { defenders: unknown[] };
    expect(data.defenders).toHaveLength(2);
  });

  it('hold requires alliance membership', () => {
    ap.fleet = { cruiser: 1 };
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 1 }, mission: 'hold' }, T0)).toThrow(/alliance/);
  });

  it('espionage returns a report with detail depending on probes', () => {
    ap.fleet = { espionageProbe: 10 };
    bp.fleet = {};
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { espionageProbe: 10 }, mission: 'espionage' }, T0);
    processMovements(w, m.arriveAt);
    const rep = w.messages.find((x) => x.to === alice.id && x.kind === 'espionage' && /Spy report/.test(x.subject));
    expect(rep).toBeTruthy();
    const d = rep!.data as Record<string, unknown>;
    expect(d.resources).toBeTruthy();
    expect(d.fleet).toBeTruthy();
    expect(d.defenses).toBeTruthy();
    expect(d.buildings).toBeTruthy();
    expect(w.messages.some((x) => x.to === bob.id && x.kind === 'espionage')).toBe(true);
  });

  it('colonize creates a new planet, and respects the colony limit', () => {
    ap.fleet = { colonyShip: 3 };
    const free = { g: 1, s: 5, p: 10 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: free, ships: { colonyShip: 1 }, mission: 'colonize' }, T0);
    processMovements(w, m.arriveAt);
    const col = planetAt(w, free)!;
    expect(col.ownerId).toBe(alice.id);
    expect(alice.planetIds).toHaveLength(2);
    // astrophysics 4 => 3 planets max
    const m2 = sendFleet(w, alice, { fromPlanetId: ap.id, to: { g: 1, s: 5, p: 11 }, ships: { colonyShip: 1 }, mission: 'colonize' }, T0);
    processMovements(w, m2.arriveAt);
    expect(alice.planetIds).toHaveLength(3);
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: { g: 1, s: 5, p: 13 }, ships: { colonyShip: 1 }, mission: 'colonize' }, T0)).toThrow(/limit/);
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { colonyShip: 1 }, mission: 'colonize' }, T0)).toThrow(/already/);
  });

  it('recyclers harvest debris fields', () => {
    w.debris['1:5:9'] = { metal: 30_000, crystal: 10_000 };
    ap.fleet = { recycler: 1 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: { g: 1, s: 5, p: 9 }, ships: { recycler: 1 }, mission: 'recycle' }, T0);
    processMovements(w, m.arriveAt);
    expect(m.cargo.metal).toBe(20_000);
    expect(w.debris['1:5:9'].metal).toBe(10_000);
    expect(w.debris['1:5:9'].crystal).toBe(10_000);
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: { g: 1, s: 5, p: 14 }, ships: { cruiser: 1 }, mission: 'recycle' }, T0)).toThrow();
  });

  it('expeditions need astrophysics and resolve into some outcome', () => {
    ap.fleet = { largeCargo: 5, cruiser: 5 };
    const to = { g: 1, s: 5, p: w.config.positions + 1 };
    bob.techs.astrophysics = 0;
    bp.fleet = { cruiser: 1 };
    expect(() => sendFleet(w, bob, { fromPlanetId: bp.id, to, ships: { cruiser: 1 }, mission: 'expedition' }, T0)).toThrow(/Astrophysics/);
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.4); // resource find
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to, ships: { largeCargo: 5, cruiser: 5 }, mission: 'expedition' }, T0);
    processMovements(w, m.arriveAt);
    spy.mockRestore();
    expect(m.phase).toBe('holding');
    expect(m.cargo.metal + m.cargo.crystal + m.cargo.deuterium).toBeGreaterThan(0);
    processMovements(w, m.arriveAt + 10 * HOUR);
    expect(w.movements[m.id]).toBeUndefined();
    expect(ap.fleet.largeCargo).toBe(5);
    expect(alice.stats.expeditions).toBe(1);
  });

  it('expedition black hole loses the fleet', () => {
    ap.fleet = { cruiser: 2 };
    const to = { g: 1, s: 5, p: w.config.positions + 1 };
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.92);
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to, ships: { cruiser: 2 }, mission: 'expedition' }, T0);
    processMovements(w, m.arriveAt);
    spy.mockRestore();
    expect(w.movements[m.id]).toBeUndefined();
    expect(ap.fleet.cruiser ?? 0).toBe(0);
  });
});

describe('npc raids', () => {
  it('spawns a raid, warns the owner and allies, and credits a bounty when defeated', () => {
    w.config.protectionPoints = 1;
    AL.createAlliance(w, alice, 'TEAM', 'The Team');
    AL.joinAlliance(w, bob, alice.allianceId!);
    ap.fleet = {};
    ap.defenses = { plasmaTurret: 40, gaussCannon: 80, largeShield: 1 };
    bp.fleet = {};
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0); // first candidate
    const raid = spawnRaid(w, T0, () => 0);
    spy.mockRestore();
    expect(raid).toBeTruthy();
    expect(w.messages.some((x) => x.kind === 'raid')).toBe(true);
    expect(raid!.arriveAt - T0).toBeGreaterThanOrEqual(600_000);
    const target = planetAt(w, raid!.to)!;
    target.defenses = { plasmaTurret: 80, gaussCannon: 200 };
    const owner = w.players[target.ownerId];
    const before = target.resources.metal;
    processMovements(w, raid!.arriveAt);
    expect(w.movements[raid!.id]).toBeUndefined();
    expect(owner.stats.raidsRepelled).toBe(1);
    expect(target.resources.metal).toBeGreaterThanOrEqual(before);
  });

  it('is skipped when disabled or nobody is eligible', () => {
    processRaids(w, T0 + 100 * HOUR);
    expect(Object.keys(w.movements)).toHaveLength(0);
    w.config.protectionPoints = 1e12;
    expect(spawnRaid(w, T0)).toBeNull();
  });
});

describe('alliances', () => {
  it('create, join (open), apply (closed), review, leave and disband', () => {
    const a = AL.createAlliance(w, alice, 'ABC', 'Alpha Co');
    expect(() => AL.createAlliance(w, bob, 'ABC', 'Other')).toThrow(/taken/);
    expect(() => AL.createAlliance(w, bob, 'x', 'Other')).toThrow();
    AL.updateAlliance(w, alice, { open: false });
    AL.joinAlliance(w, bob, a.id, 'let me in');
    expect(bob.allianceId).toBeNull();
    expect(a.applications).toHaveLength(1);
    AL.reviewApplication(w, alice, bob.id, true);
    expect(bob.allianceId).toBe(a.id);
    expect(() => AL.leaveAlliance(w, alice)).toThrow(/leadership/);
    AL.setRole(w, alice, bob.id, 'officer');
    AL.setRole(w, alice, bob.id, 'founder');
    AL.leaveAlliance(w, alice);
    AL.leaveAlliance(w, bob);
    expect(Object.keys(w.alliances)).toHaveLength(0);
  });

  it('bank: donate, withdraw (officers), upgrade grants bonuses', () => {
    const a = AL.createAlliance(w, alice, 'ABC', 'Alpha Co');
    AL.joinAlliance(w, bob, a.id);
    AL.donate(w, alice, ap.id, { metal: 500_000, crystal: 300_000, deuterium: 200_000 }, T0);
    AL.donate(w, bob, bp.id, { metal: 100_000 }, T0);
    expect(a.bank.metal).toBe(600_000);
    expect(() => AL.withdraw(w, bob, bob.id, { metal: 1 }, T0)).toThrow(/rank does not allow/);
    expect(() => AL.donate(w, alice, ap.id, { metal: 1e12 }, T0)).toThrow(/resources/);

    bp.buildings.metalMine = 5;
    const before = planetProduction(w, bp).metal;
    AL.buyUpgrade(w, alice, 'production');
    expect(a.upgrades.production).toBe(1);
    expect(planetProduction(w, bp).metal).toBeGreaterThan(before);
    const bankMetal = a.bank.metal;
    AL.withdraw(w, alice, bob.id, { metal: 1000 }, T0);
    expect(a.bank.metal).toBe(bankMetal - 1000);
    expect(() => AL.buyUpgrade(w, bob, 'research')).toThrow(/rank does not allow/);
  });

  it('research upgrade shortens research time for members', () => {
    const a = AL.createAlliance(w, alice, 'ABC', 'Alpha Co');
    alice.techs = { energy: 8 };
    startResearch(w, alice, ap, 'energy', T0);
    const base = alice.research!.end - alice.research!.start;
    cancelResearch(w, alice, T0);
    a.bank = { metal: 1e7, crystal: 1e7, deuterium: 1e7 };
    AL.buyUpgrade(w, alice, 'research');
    AL.buyUpgrade(w, alice, 'research');
    startResearch(w, alice, ap, 'energy', T0);
    expect(alice.research!.end - alice.research!.start).toBeLessThan(base);
  });

  it('kick respects rank', () => {
    const a = AL.createAlliance(w, alice, 'ABC', 'Alpha Co');
    AL.joinAlliance(w, bob, a.id);
    expect(() => AL.kickMember(w, bob, alice.id)).toThrow(GameError);
    AL.kickMember(w, alice, bob.id);
    expect(bob.allianceId).toBeNull();
  });
});

describe('points', () => {
  it('count buildings, research, fleet, defenses', () => {
    ap.buildings = { metalMine: 15 };
    ap.fleet = { cruiser: 10 };
    ap.defenses = { rocketLauncher: 10 };
    alice.techs = { energy: 3 };
    const p = playerPoints(w, alice);
    expect(p.buildings).toBeGreaterThan(0);
    expect(p.fleet).toBe(290);
    expect(p.defense).toBe(20);
    expect(p.research).toBeGreaterThan(0);
    expect(p.total).toBe(p.buildings + p.research + p.fleet + p.defense);
  });
});

describe('joint attacks', () => {
  function allies() {
    AL.createAlliance(w, alice, 'TEAM', 'The Team');
    const carol = register(w, 'carol', 'secret3', T0).player;
    AL.joinAlliance(w, carol, alice.allianceId!);
    const cp = w.planets[carol.planetIds[0]];
    cp.coords = { g: 1, s: 5, p: 4 };
    cp.buildings = { roboticsFactory: 4, shipyard: 6, solarPlant: 20 };
    cp.resources = { metal: 2e6, crystal: 2e6, deuterium: 2e6 };
    carol.techs = { ...bob.techs };
    return { carol, cp };
  }

  it('allies arrive together, fight as one, split the loot and all get reports', () => {
    const { carol, cp } = allies();
    ap.fleet = { battleship: 10, largeCargo: 10 };
    cp.fleet = { battleship: 10, largeCargo: 10 };
    bp.fleet = { cruiser: 6 };
    bp.defenses = { rocketLauncher: 10 };
    bp.resources = { metal: 400_000, crystal: 200_000, deuterium: 100_000 };
    const lead = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { battleship: 10, largeCargo: 10 }, mission: 'attack' }, T0);
    const join = sendFleet(w, carol, { fromPlanetId: cp.id, to: bp.coords, ships: { battleship: 10, largeCargo: 10 }, mission: 'attack', joinFleetId: lead.id }, T0);
    expect(join.arriveAt).toBe(lead.arriveAt);
    expect(join.acsId).toBe(lead.id);
    processMovements(w, lead.arriveAt);
    const reports = w.messages.filter((m) => m.kind === 'combat');
    expect(new Set(reports.map((r) => r.to))).toEqual(new Set([alice.id, bob.id, carol.id]));
    expect((reports[0].data as { attackers: unknown[] }).attackers).toHaveLength(2);
    expect(lead.phase).toBe('returning');
    expect(join.phase).toBe('returning');
    expect(lead.cargo.metal).toBeGreaterThan(20_000);
    expect(join.cargo.metal).toBeGreaterThan(20_000);
    expect(lead.acsId).toBeUndefined();
    expect(alice.stats.battlesWon).toBe(1);
    expect(carol.stats.battlesWon).toBe(1);
    processMovements(w, lead.arriveAt + 2 * lead.flightMs + 5000);
    expect(ap.fleet.battleship).toBeGreaterThan(0);
    expect(cp.fleet.battleship).toBeGreaterThan(0);
  });

  it('rejects joining non-allies, other targets, and fleets that are too slow', () => {
    const { carol, cp } = allies();
    ap.fleet = { cruiser: 5 };
    cp.fleet = { smallCargo: 1, cruiser: 5 };
    const lead = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 5 }, mission: 'attack' }, T0);
    // outsider
    bp.fleet = { cruiser: 5 };
    expect(() => sendFleet(w, bob, { fromPlanetId: bp.id, to: bp.coords, ships: { cruiser: 1 }, mission: 'attack', joinFleetId: lead.id }, T0)).toThrow();
    // wrong target
    const other = createPlanet(w, bob, { g: 1, s: 5, p: 12 }, { now: T0 });
    expect(() => sendFleet(w, carol, { fromPlanetId: cp.id, to: other.coords, ships: { cruiser: 1 }, mission: 'attack', joinFleetId: lead.id }, T0)).toThrow(/different planet/);
    // too slow: join late with slow ships
    expect(() => sendFleet(w, carol, { fromPlanetId: cp.id, to: bp.coords, ships: { cruiser: 1 }, mission: 'attack', joinFleetId: lead.id }, lead.arriveAt - 1)).toThrow(/too slow/);
    expect(() => sendFleet(w, carol, { fromPlanetId: cp.id, to: bp.coords, ships: { cruiser: 1 }, mission: 'attack', joinFleetId: 'nope' }, T0)).toThrow(/cannot be joined/);
  });

  it('recalling the leader recalls the group; a joiner can leave alone', () => {
    const { carol, cp } = allies();
    ap.fleet = { cruiser: 5 };
    cp.fleet = { cruiser: 5 };
    const lead = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 5 }, mission: 'attack' }, T0);
    const j1 = sendFleet(w, carol, { fromPlanetId: cp.id, to: bp.coords, ships: { cruiser: 2 }, mission: 'attack', joinFleetId: lead.id }, T0);
    const j2 = sendFleet(w, carol, { fromPlanetId: cp.id, to: bp.coords, ships: { cruiser: 2 }, mission: 'attack', joinFleetId: lead.id }, T0);
    recallFleet(w, carol, j2.id, T0 + 1000);
    expect(j2.phase).toBe('returning');
    expect(lead.phase).toBe('outbound');
    recallFleet(w, alice, lead.id, T0 + 1000);
    expect(j1.phase).toBe('returning');
    expect(lead.phase).toBe('returning');
    processMovements(w, T0 + 10 * HOUR);
    expect(cp.fleet.cruiser).toBe(5);
  });
});

describe('abandon', () => {
  it('lets you drop a colony but never the homeworld, and needs confirmation', () => {
    const c = createPlanet(w, alice, { g: 1, s: 5, p: 10 }, { name: 'Outpost', now: T0 });
    expect(() => abandonPlanet(w, alice, ap, ap.name, T0)).toThrow(/homeworld/);
    expect(() => abandonPlanet(w, alice, c, 'wrong', T0)).toThrow(/confirm/);
    expect(() => abandonPlanet(w, bob, c, 'Outpost', T0)).toThrow(/Not your/);
    c.fleet = { cruiser: 1 };
    sendFleet(w, alice, { fromPlanetId: c.id, to: bp.coords, ships: { cruiser: 1 }, mission: 'transport' }, T0);
    expect(() => abandonPlanet(w, alice, c, 'Outpost', T0)).toThrow(/in flight/);
    for (const m of Object.values(w.movements)) delete w.movements[m.id];
    abandonPlanet(w, alice, c, 'Outpost', T0);
    expect(w.planets[c.id]).toBeUndefined();
    expect(alice.planetIds).toEqual([ap.id]);
    expect(planetAt(w, { g: 1, s: 5, p: 10 })).toBeUndefined();
  });
});

describe('counter-espionage', () => {
  it('lone probes are caught by a big fleet, a swarm gets through', () => {
    bp.fleet = { cruiser: 150 };
    const run = (probes: number) => {
      ap.fleet = { espionageProbe: probes };
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0.3);
      const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { espionageProbe: probes }, mission: 'espionage' }, T0);
      processMovements(w, m.arriveAt);
      spy.mockRestore();
      return w.movements[m.id];
    };
    expect(run(1)).toBeUndefined(); // destroyed
    expect(run(30)?.phase).toBe('returning'); // escaped with a report
  });
});

describe('queues', () => {
  it('queued buildings start automatically when the active one finishes, paying then', () => {
    ap.buildings = { roboticsFactory: 4 };
    ap.resources = { metal: 100_000, crystal: 100_000, deuterium: 100_000 };
    queueBuilding(w, alice, ap, 'metalMine', T0);
    queueBuilding(w, alice, ap, 'metalMine', T0);
    queueBuilding(w, alice, ap, 'solarPlant', T0);
    expect(ap.buildBacklog).toEqual(['metalMine', 'solarPlant']);
    // every entry is paid when it is queued: level 1 (60) + level 2 (90) + solar plant (75)
    expect(ap.resources.metal).toBe(100_000 - 60 - 90 - 75);
    processPlayer(w, alice, T0 + 100 * HOUR);
    expect(ap.buildings.metalMine).toBe(2);
    expect(ap.buildings.solarPlant).toBe(1);
    expect(ap.buildQueue).toBeNull();
    expect(ap.buildBacklog).toEqual([]);
  });

  it('refuses to queue what you cannot pay for, and keeps queued items safe from later spending', () => {
    ap.buildings = { roboticsFactory: 4 };
    ap.resources = { metal: 200, crystal: 100, deuterium: 0 };
    ap.settings = {};
    queueBuilding(w, alice, ap, 'metalMine', T0);
    expect(() => queueBuilding(w, alice, ap, 'naniteFactory', T0)).toThrow(/Not enough resources/);
    expect(ap.buildBacklog).toEqual([]);
    ap.resources = { metal: 1000, crystal: 1000, deuterium: 1000 };
    queueBuilding(w, alice, ap, 'solarPlant', T0);
    ap.resources = { metal: 0, crystal: 0, deuterium: 0 }; // spent elsewhere afterwards
    processPlayer(w, alice, T0 + 100 * HOUR);
    expect(ap.buildings.solarPlant).toBe(1);
    expect(w.messages.some((m) => /dropped/.test(m.subject))).toBe(false);
  });

  it('prepaid research is reserved too, and refunded when removed', () => {
    alice.techs = { energy: 8 };
    ap.resources = { metal: 1e7, crystal: 1e7, deuterium: 1e7 };
    queueResearch(w, alice, ap, 'energy', T0);
    const before = ap.resources.crystal;
    queueResearch(w, alice, ap, 'computer', T0);
    expect(ap.resources.crystal).toBeLessThan(before);
    unqueueResearch(w, alice, 0);
    expect(ap.resources.crystal).toBe(before);
    ap.resources = { metal: 0, crystal: 0, deuterium: 0 };
    expect(() => queueResearch(w, alice, ap, 'computer', T0)).toThrow(/Not enough resources/);
  });

  it('enforces queue size and supports removal', () => {
    ap.resources = { metal: 1e12, crystal: 1e12, deuterium: 1e12 };
    for (let i = 0; i < 5; i++) queueBuilding(w, alice, ap, 'solarPlant', T0);
    expect(ap.buildBacklog).toHaveLength(4);
    expect(() => queueBuilding(w, alice, ap, 'solarPlant', T0)).toThrow(/full/);
    const before = ap.resources.metal;
    unqueueBuilding(ap, 0);
    expect(ap.buildBacklog).toHaveLength(3);
    expect(ap.resources.metal).toBeGreaterThan(before); // the reservation comes back
    expect(() => unqueueBuilding(ap, 9)).toThrow();
  });

  it('queued entries can be reordered and keep their reservations', () => {
    ap.resources = { metal: 1e12, crystal: 1e12, deuterium: 1e12 };
    queueBuilding(w, alice, ap, 'metalMine', T0);
    queueBuilding(w, alice, ap, 'crystalMine', T0);
    queueBuilding(w, alice, ap, 'solarPlant', T0);
    const paid = [...ap.buildPaid!];
    moveQueuedBuilding(ap, 1, -1);
    expect(ap.buildBacklog).toEqual(['solarPlant', 'crystalMine']);
    expect(ap.buildPaid).toEqual([paid[1], paid[0]]);
    expect(() => moveQueuedBuilding(ap, 0, -1)).toThrow();
    expect(() => moveQueuedBuilding(ap, 1, 1)).toThrow();
    processPlayer(w, alice, T0 + 500 * HOUR);
    expect(ap.buildBacklog).toEqual([]);
    expect(ap.buildings.solarPlant).toBeGreaterThan(0);
    alice.techs = { energy: 8 };
    queueResearch(w, alice, ap, 'energy', T0 + 500 * HOUR);
    queueResearch(w, alice, ap, 'computer', T0 + 500 * HOUR);
    queueResearch(w, alice, ap, 'armour', T0 + 500 * HOUR);
    moveQueuedResearch(alice, 1, -1);
    expect(alice.researchBacklog.map((r) => r.id)).toEqual(['armour', 'computer']);
  });

  it('cancelling the active job starts the next queued one', () => {
    ap.resources = { metal: 1e6, crystal: 1e6, deuterium: 1e6 };
    queueBuilding(w, alice, ap, 'metalMine', T0);
    queueBuilding(w, alice, ap, 'crystalMine', T0);
    cancelBuilding(w, ap, T0 + 1);
    expect(ap.buildQueue?.id).toBe('crystalMine');
  });

  it('research queue runs back to back', () => {
    alice.techs = { energy: 8 };
    ap.resources = { metal: 1e7, crystal: 1e7, deuterium: 1e7 };
    queueResearch(w, alice, ap, 'energy', T0);
    queueResearch(w, alice, ap, 'computer', T0);
    queueResearch(w, alice, ap, 'armour', T0);
    expect(alice.researchBacklog).toHaveLength(2);
    processPlayer(w, alice, T0 + 500 * HOUR);
    expect(alice.techs.energy).toBe(9);
    expect(alice.techs.computer).toBe(1);
    expect(alice.techs.armour).toBe(1);
    expect(alice.research).toBeNull();
  });
});

describe('missiles', () => {
  beforeEach(() => {
    ap.buildings.missileSilo = 5; // 50 slots, range 24 systems
    alice.techs.impulseDrive = 2;
    bp.defenses = { rocketLauncher: 100, heavyLaser: 20, antiBallisticMissile: 0 };
    bp.fleet = { cruiser: 5 };
  });

  it('silo capacity and requirements gate missile production', () => {
    ap.buildings.missileSilo = 1;
    expect(() => queueUnits(w, alice, ap, 'interplanetaryMissile', 1, T0)).toThrow(/Requirements/);
    ap.buildings.missileSilo = 4; // 40 slots => 20 IPM
    queueUnits(w, alice, ap, 'interplanetaryMissile', 20, T0);
    expect(() => queueUnits(w, alice, ap, 'interplanetaryMissile', 1, T0)).toThrow(/silo can hold/);
    expect(() => queueUnits(w, alice, ap, 'antiBallisticMissile', 1, T0)).toThrow(/silo can hold/);
  });

  it('missiles do not fight in normal battles and survive them', () => {
    bp.defenses = { rocketLauncher: 10, antiBallisticMissile: 5, interplanetaryMissile: 3 };
    ap.fleet = { battleship: 20 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { battleship: 20 }, mission: 'attack' }, T0);
    processMovements(w, m.arriveAt);
    expect(bp.defenses.antiBallisticMissile).toBe(5);
    expect(bp.defenses.interplanetaryMissile).toBe(3);
  });

  it('strikes destroy defenses in priority order and spare ships', () => {
    ap.defenses = { interplanetaryMissile: 5 };
    bp.defenses = { rocketLauncher: 100, heavyLaser: 40 };
    const m = launchMissiles(w, alice, ap.id, bp.coords, 3, T0);
    expect(ap.defenses.interplanetaryMissile).toBe(2);
    expect(m.arriveAt).toBeGreaterThan(T0);
    expect(() => recallFleet(w, alice, m.id, T0)).toThrow(/cannot be recalled/);
    processMovements(w, m.arriveAt);
    expect(w.movements[m.id]).toBeUndefined();
    // 3 missiles * 12000 * (1 + 0.1*weapons) ~ 36000+ damage; rockets have 200 hull each => all 100 die first
    expect(bp.defenses.rocketLauncher ?? 0).toBe(0);
    expect(bp.defenses.heavyLaser).toBeGreaterThan(0);
    expect(bp.defenses.heavyLaser).toBeLessThan(40);
    expect(bp.fleet.cruiser).toBe(5);
    expect(w.messages.filter((x) => x.subject === 'Missile strike report').map((x) => x.to).sort()).toEqual([alice.id, bob.id].sort());
  });

  it('anti-ballistic missiles intercept one-for-one', () => {
    ap.defenses = { interplanetaryMissile: 4 };
    bp.defenses = { rocketLauncher: 100, antiBallisticMissile: 4 };
    const m = launchMissiles(w, alice, ap.id, bp.coords, 4, T0);
    processMovements(w, m.arriveAt);
    expect(bp.defenses.rocketLauncher).toBe(100);
    expect(bp.defenses.antiBallisticMissile ?? 0).toBe(0);
  });

  it('validates range, ownership, allies and protection', () => {
    ap.defenses = { interplanetaryMissile: 5 };
    expect(() => launchMissiles(w, alice, ap.id, ap.coords, 1, T0)).toThrow();
    expect(() => launchMissiles(w, alice, ap.id, bp.coords, 9, T0)).toThrow(/Not enough/);
    ap.buildings.missileSilo = 1; // range 4 systems
    const far = createPlanet(w, bob, { g: 1, s: 30, p: 3 }, { now: T0 });
    expect(() => launchMissiles(w, alice, ap.id, far.coords, 1, T0)).toThrow(/range/);
    ap.buildings.missileSilo = 5;
    AL.createAlliance(w, alice, 'TEAM', 'The Team');
    AL.joinAlliance(w, bob, alice.allianceId!);
    expect(() => launchMissiles(w, alice, ap.id, bp.coords, 1, T0)).toThrow(/alliance/);
  });
});

describe('registration cap', () => {
  it('closes when the universe is full', () => {
    const small = createWorld({ maxPlayers: 2 }, T0);
    register(small, 'one', 'secret1', T0);
    register(small, 'two', 'secret2', T0);
    expect(() => register(small, 'three', 'secret3', T0)).toThrow(/full/);
  });
});

describe('diplomacy changes mid-flight', () => {
  it('calls off an attack if the target joined the attacker\'s alliance in the meantime', () => {
    ap.fleet = { battleship: 10 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { battleship: 10 }, mission: 'attack' }, T0);
    AL.createAlliance(w, alice, 'TEAM', 'The Team');
    AL.joinAlliance(w, bob, alice.allianceId!);
    bp.defenses = { rocketLauncher: 5 };
    processMovements(w, m.arriveAt);
    expect(w.movements[m.id].phase).toBe('returning');
    expect(bp.defenses.rocketLauncher).toBe(5);
    expect(w.messages.some((x) => x.to === alice.id && /called off/.test(x.body))).toBe(true);
    expect(bob.stats.battlesLost + alice.stats.battlesWon).toBe(0);
  });

  it('sends stationed fleets home when someone leaves, is kicked, or the alliance disbands', () => {
    const station = () => {
      ap.fleet = { cruiser: 5 };
      const h = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 5 }, mission: 'hold', holdHours: 5 }, T0);
      processMovements(w, h.arriveAt);
      expect(h.phase).toBe('holding');
      return h;
    };
    AL.createAlliance(w, alice, 'TEAM', 'The Team');
    AL.joinAlliance(w, bob, alice.allianceId!);

    const h1 = station();
    AL.leaveAlliance(w, bob); // the host leaves
    expect(h1.phase).toBe('returning');
    AL.joinAlliance(w, bob, alice.allianceId!);
    const h2 = station();
    AL.kickMember(w, alice, bob.id);
    expect(h2.phase).toBe('returning');
    AL.joinAlliance(w, bob, alice.allianceId!);
    const h3 = station();
    AL.disbandAlliance(w, alice);
    expect(h3.phase).toBe('returning');
    processMovements(w, h3.returnAt! + 1000);
    expect(ap.fleet.cruiser).toBe(15); // all three stationed fleets made it home
    expect(Object.values(w.movements).filter((m) => m.mission === 'hold')).toHaveLength(0);
  });
});
