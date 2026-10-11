import type { AddressInfo } from 'node:net';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { createApp } from '../server/app';
import { demandTribute } from '../server/empires';
import { processPlayer, queueUnits, startBuilding, startResearch, tradeResources, updatePlanet, planetProduction } from '../server/economy';
import { launchMissiles, processMovements, sendFleet } from '../server/fleet';
import { galaxyView, isProtected } from '../server/galaxy';
import { spawnRaid } from '../server/npc';
import { rankings } from '../server/rankings';
import { activityOf, endVacation, startVacation } from '../server/vacation';
import { GameError, createWorld, migratePlayer, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
let w: World;
let alice: Player, bob: Player;
let ap: Planet, bp: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0, vacationMinHours: 48 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bob', 'secret2', T0).player;
  ap = w.planets[alice.planetIds[0]]; bp = w.planets[bob.planetIds[0]];
  ap.coords = { g: 1, s: 5, p: 6 }; bp.coords = { g: 1, s: 6, p: 8 };
  for (const p of [ap, bp]) {
    p.buildings = { metalMine: 10, crystalMine: 8, solarPlant: 15, shipyard: 6, roboticsFactory: 4, researchLab: 6, missileSilo: 5, metalStorage: 6 };
    p.resources = { metal: 1e6, crystal: 1e6, deuterium: 1e6 };
  }
  alice.techs = { combustionDrive: 6, impulseDrive: 4, energy: 8, computer: 3, espionage: 5 };
  bob.techs = { ...alice.techs };
});

describe('going on vacation needs a quiet empire', () => {
  it('works when nothing is going on, and records the minimum stay', () => {
    startVacation(w, alice, T0);
    expect(alice.vacation).toEqual({ since: T0, minUntil: T0 + 48 * HOUR });
    expect(() => startVacation(w, alice, T0)).toThrow(/already/);
  });

  it('is refused with fleets in flight, queues running, or research under way', () => {
    ap.fleet = { cruiser: 2 };
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 1 }, mission: 'transport' }, T0);
    expect(() => startVacation(w, alice, T0)).toThrow(/fleets/);
    processMovements(w, m.arriveAt + m.flightMs + 1000);

    startBuilding(w, alice, ap, 'solarPlant', T0 + 2 * HOUR);
    expect(() => startVacation(w, alice, T0 + 2 * HOUR)).toThrow(/construction/);
    ap.buildQueue = null;
    startResearch(w, alice, ap, 'weapons', T0 + 2 * HOUR);
    expect(() => startVacation(w, alice, T0 + 2 * HOUR)).toThrow(/research/);
    alice.research = null;
    queueUnits(w, alice, ap, 'lightFighter', 5, T0 + 2 * HOUR);
    expect(() => startVacation(w, alice, T0 + 2 * HOUR)).toThrow(/construction queues/);
  });

  it('is refused while hostile fleets are inbound or allies are stationed with you', () => {
    bp.fleet = { cruiser: 30 };
    const m = sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { cruiser: 30 }, mission: 'attack' }, T0);
    expect(() => startVacation(w, alice, T0)).toThrow(/Hostile fleets/);
    delete w.movements[m.id];

    AL.createAlliance(w, alice, 'TEAM', 'The Team');
    AL.joinAlliance(w, bob, alice.allianceId!);
    bp.fleet = { cruiser: 5 };
    const h = sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { cruiser: 5 }, mission: 'hold', holdHours: 5 }, T0);
    processMovements(w, h.arriveAt);
    expect(() => startVacation(w, alice, h.arriveAt)).toThrow(/stationed/);
  });

  it('computer empires cannot take vacation', () => {
    const npc = { ...alice, id: 'n', npc: { status: 'active', seedPoints: 1, faction: null } } as Player;
    expect(() => startVacation(w, npc, T0)).toThrow(/Computer/);
  });
});

describe('while away', () => {
  beforeEach(() => startVacation(w, alice, T0));

  it('nothing is produced, and there is no catch-up afterwards', () => {
    const before = { ...ap.resources };
    processPlayer(w, alice, T0 + 40 * HOUR);
    expect(ap.resources).toEqual(before);
    endVacation(w, alice, T0 + 49 * HOUR);
    updatePlanet(w, ap, T0 + 49 * HOUR);
    expect(ap.resources).toEqual(before); // the 49 hours did not count
    updatePlanet(w, ap, T0 + 50 * HOUR);
    expect(ap.resources.metal - before.metal).toBeCloseTo(planetProduction(w, ap).metal, 0); // production resumes: exactly one hour's worth
  });

  it('the empire cannot act', () => {
    ap.fleet = { cruiser: 5 };
    const t = T0 + HOUR;
    expect(() => startBuilding(w, alice, ap, 'solarPlant', t)).toThrow(/vacation mode/);
    expect(() => startResearch(w, alice, ap, 'weapons', t)).toThrow(/vacation mode/);
    expect(() => queueUnits(w, alice, ap, 'lightFighter', 1, t)).toThrow(/vacation mode/);
    expect(() => sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 1 }, mission: 'transport' }, t)).toThrow(/vacation mode/);
    expect(() => tradeResources(w, ap, 'metal', 'crystal', 1000, t)).toThrow(/vacation mode/);
    ap.defenses = { interplanetaryMissile: 3 };
    expect(() => launchMissiles(w, alice, ap.id, bp.coords, 1, t)).toThrow(/vacation mode/);
  });

  it('cannot be attacked, spied on, missile-struck or stationed with - but may receive gifts', () => {
    bp.fleet = { cruiser: 10, espionageProbe: 5, largeCargo: 5 };
    bp.defenses = { interplanetaryMissile: 4 };
    const t = T0 + HOUR;
    expect(isProtected(w, bob, alice)).toBe(true);
    expect(() => sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { cruiser: 5 }, mission: 'attack' }, t)).toThrow(/on vacation/);
    expect(() => sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { espionageProbe: 3 }, mission: 'espionage' }, t)).toThrow(/on vacation/);
    expect(() => launchMissiles(w, bob, bp.id, ap.coords, 1, t)).toThrow(/on vacation/);
    AL.createAlliance(w, bob, 'TEAM', 'The Team');
    expect(() => sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { cruiser: 1 }, mission: 'hold' }, t)).toThrow(GameError);
    const gift = sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { largeCargo: 2 }, mission: 'transport', cargo: { metal: 1000 } }, t);
    processMovements(w, gift.arriveAt);
    expect(ap.resources.metal).toBeGreaterThan(1e6);
  });

  it('an attack that was already in flight is called off on arrival', () => {
    endVacation(w, alice, T0 + 49 * HOUR);
    bp.fleet = { cruiser: 30 };
    const t = T0 + 50 * HOUR;
    const m = sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { cruiser: 30 }, mission: 'attack' }, t);
    alice.vacation = { since: t, minUntil: t + 48 * HOUR }; // e.g. she slipped in right as it launched
    ap.defenses = { rocketLauncher: 3 };
    processMovements(w, m.arriveAt);
    expect(ap.defenses.rocketLauncher).toBe(3);
    expect(w.movements[m.id].phase).toBe('returning');
    expect(w.messages.some((x) => x.to === bob.id && /on vacation/.test(x.body))).toBe(true);
    expect(alice.stats.battlesLost).toBe(0);
  });

  it('raiders and tribute demands leave you alone', () => {
    w.config.protectionPoints = 1;
    ap.fleet = { battleship: 500 };
    const generic = spawnRaid(w, T0 + HOUR, () => 0.5); // bob is eligible, alice is not
    expect(generic === null || (generic.to.s === bp.coords.s && generic.to.p === bp.coords.p)).toBe(true);
    if (generic) delete w.movements[generic.id];
    expect(spawnRaid(w, T0 + HOUR, () => 0.5, { targetPlayerId: alice.id })).toBeNull();
    expect(demandTribute(w, alice, T0 + HOUR)).toBeNull();
  });
});

describe('leaving', () => {
  it('is only possible after the minimum stay', () => {
    startVacation(w, alice, T0);
    expect(() => endVacation(w, alice, T0 + 47 * HOUR)).toThrow(/at least 48 hours - 60 more minutes/);
    endVacation(w, alice, T0 + 48 * HOUR);
    expect(alice.vacation).toBeNull();
    expect(() => endVacation(w, alice, T0 + 49 * HOUR)).toThrow(/not in vacation/);
    // and the empire works again
    startBuilding(w, alice, ap, 'solarPlant', T0 + 49 * HOUR);
    expect(ap.buildQueue).toBeTruthy();
  });

  it('honours a custom minimum stay', () => {
    w.config.vacationMinHours = 1;
    startVacation(w, alice, T0);
    expect(() => endVacation(w, alice, T0 + 30 * 60_000)).toThrow();
    endVacation(w, alice, T0 + HOUR);
  });
});

describe('status flags', () => {
  it('classifies activity by how long ago a commander was seen', () => {
    const at = (idleMs: number) => { alice.lastSeen = T0 - idleMs; return activityOf(w, alice, T0); };
    expect(at(60_000)).toBe('online');
    expect(at(2 * HOUR)).toBe('active');
    expect(at(6 * 24 * HOUR)).toBe('active');
    expect(at(8 * 24 * HOUR)).toBe('inactive');
    expect(at(30 * 24 * HOUR)).toBe('longInactive');
    w.config.inactiveDays = 1;
    expect(at(2 * 24 * HOUR)).toBe('inactive');
  });

  it('the galaxy shows vacation, inactivity and newbie/strong protection', () => {
    w.config.protectionPoints = 100;
    bp.buildings = {}; bp.fleet = {};                          // bob is tiny -> a newbie to alice
    ap.buildings = { metalMine: 25, crystalMine: 22, solarPlant: 30, shipyard: 12 };
    bob.lastSeen = T0 - 10 * 24 * HOUR;
    const slot = () => galaxyView(w, alice, 1, 6, T0).find((s) => s.p === 8)!.planet!;
    expect(slot().status).toEqual({ vacation: false, activity: 'inactive', protection: 'weak' });
    expect(galaxyView(w, bob, 1, 5, T0).find((s) => s.p === 6)!.planet!.status.protection).toBe('strong'); // alice looks too strong to bob
    bob.vacation = { since: T0, minUntil: T0 + 1 };
    expect(slot().status).toMatchObject({ vacation: true, protection: null });
    expect(slot().protectedFor).toBe(true);
    expect(galaxyView(w, alice, 1, 5, T0).find((s) => s.p === 6)!.planet!.status.protection).toBeNull(); // your own planet
  });

  it('highscores flag commanders on vacation', () => {
    startVacation(w, alice, T0);
    expect(rankings(w, true).find((r) => r.id === alice.id)!.vacation).toBe(true);
    expect(rankings(w, true).find((r) => r.id === bob.id)!.vacation).toBe(false);
  });

  it('old saves without the field load as "not on vacation"', () => {
    const old = { ...alice } as Partial<Player>;
    delete old.vacation;
    migratePlayer(old as Player);
    expect(old.vacation).toBeNull();
  });
});

describe('over HTTP', () => {
  let close: () => void;
  let base = '';
  const web = createWorld({ economySpeed: 20, vacationMinHours: 0, npcDensity: 0, raidIntervalMin: 0 });
  const server = createApp(web).listen(0);
  const ready = new Promise<void>((r) => server.once('listening', () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; r(); }));
  close = () => server.close();
  afterAll(() => close());
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    await ready;
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };

  it('start, blocked actions, end', async () => {
    const t = (await call('POST', '/api/register', undefined, { username: 'sleepy', password: 'secret1' })).json.token;
    const home = (await call('GET', '/api/me', t)).json.planets[0].id;
    const started = await call('POST', '/api/vacation/start', t);
    expect(started.status).toBe(200);
    expect(started.json.vacation).toMatchObject({ since: expect.any(Number) });
    const blocked = await call('POST', `/api/planets/${home}/build`, t, { id: 'metalMine' });
    expect(blocked.status).toBe(403);
    expect(blocked.json.error).toMatch(/vacation mode/);
    expect((await call('POST', '/api/vacation/start', t)).status).toBe(400);
    const ended = await call('POST', '/api/vacation/end', t);
    expect(ended.status).toBe(200);
    expect(ended.json.vacation).toBeNull();
    expect((await call('POST', `/api/planets/${home}/build`, t, { id: 'metalMine' })).status).toBe(200);
  });
});
