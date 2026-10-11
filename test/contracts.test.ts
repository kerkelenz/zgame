import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { ALL_BONUS, KINDS, STREAK_CAP, STREAK_STEP, claimContract, contractsView, dayKeyOf, ensureContracts, weekKeyOf } from '../server/contracts';
import { processPlayer, queueUnits, startBuilding, startResearch } from '../server/economy';
import { processMovements, sendFleet } from '../server/fleet';
import { GameError, createWorld, type Planet, type Player, type World } from '../server/world';

const DAY = 86_400_000;
// 2026-10-12 is a Monday
const T0 = Date.UTC(2026, 9, 12, 8);
let w: World; let a: Player, b: Player; let home: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  a = register(w, 'alice', 'secret1', T0).player;
  b = register(w, 'bobby', 'secret2', T0).player;
  home = w.planets[a.planetIds[0]];
  home.buildings = { shipyard: 4, researchLab: 3, roboticsFactory: 4, metalMine: 5 };
  home.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
});

/** make every contract of today finished by moving the stat counters it watches */
const finish = (id: string) => {
  const book = ensureContracts(w, a, T0);
  const c = [...book.daily, ...book.weekly].find((x) => x.id === id)!;
  a.stats[KINDS[c.kind].stat] = c.base + c.target;
  return c;
};

describe('issuing contracts', () => {
  it('gives three dailies and two weeklies of different kinds, only ones the player can actually do', () => {
    const v = contractsView(w, a, T0);
    expect(v.daily).toHaveLength(3);
    expect(v.weekly).toHaveLength(2);
    expect(new Set(v.daily.map((c) => c.kind)).size).toBe(3);
    expect(new Set(v.weekly.map((c) => c.kind)).size).toBe(2);
    for (const c of [...v.daily, ...v.weekly]) { expect(c.progress).toBe(0); expect(c.claimed).toBe(false); expect(c.credits).toBeGreaterThan(0); expect(c.label).toMatch(/\d/); }
    expect(v.daily.every((c) => c.kind !== 'repel')).toBe(true); // repelling raiders is a weekly-only job
    // a brand-new account with no lab, shipyard, astrophysics or alliance never gets those jobs
    const fresh = register(w, 'newbie', 'secret3', T0).player;
    fresh.stats.harvested = 0;
    for (let d = 0; d < 20; d++) {
      const kinds = [...contractsView(w, fresh, T0 + d * DAY).daily, ...contractsView(w, fresh, T0 + d * DAY).weekly].map((c) => c.kind);
      for (const forbidden of ['research', 'ships', 'spy', 'expedition', 'deliver', 'recycle']) expect(kinds, forbidden).not.toContain(forbidden);
    }
  });

  it('are the same all day and change tomorrow; every player rolls their own', () => {
    const today = contractsView(w, a, T0).daily.map((c) => c.id + c.kind);
    expect(contractsView(w, a, T0 + 5 * 3_600_000).daily.map((c) => c.id + c.kind)).toEqual(today);
    const seen = new Set<string>([today.join()]);
    for (let d = 1; d < 12; d++) seen.add(contractsView(w, a, T0 + d * DAY).daily.map((c) => c.kind).join());
    expect(seen.size).toBeGreaterThan(3);
    const other = contractsView(w, b, T0).daily.map((c) => c.kind).join();
    let differs = other !== today.map((x) => x.replace(/^[^a-z]*[a-z]\d+-\d/, '')).join();
    for (let d = 1; d < 15 && !differs; d++) differs = contractsView(w, a, T0 + d * DAY).daily.map((c) => c.kind).join() !== contractsView(w, b, T0 + d * DAY).daily.map((c) => c.kind).join();
    expect(differs).toBe(true);
  });

  it('weeks start on Monday', () => {
    expect(weekKeyOf(T0)).toBe(weekKeyOf(T0 + 6 * DAY - 9 * 3_600_000));       // Mon 08:00 .. Sun 23:00
    expect(weekKeyOf(T0 + 7 * DAY - 8 * 3_600_000)).toBe(weekKeyOf(T0) + 1);    // the next Monday 00:00
    expect(contractsView(w, a, T0).nextWeeklyAt).toBe(Date.UTC(2026, 9, 19));
    expect(contractsView(w, a, T0).nextDailyAt).toBe(Date.UTC(2026, 9, 13));
  });

  it('scales money-sized targets with the universe speed', () => {
    const fast = createWorld({ economySpeed: 100, npcDensity: 0 }, T0);
    const f = register(fast, 'fast', 'secret1', T0).player;
    f.stats.harvested = 1; fast.planets[f.planetIds[0]].fleet = { recycler: 1 };
    for (let d = 0; d < 30; d++) {
      const c = contractsView(fast, f, T0 + d * DAY).daily.find((x) => x.kind === 'recycle');
      if (c) { expect(c.target).toBe(200_000); return; }
    }
    throw new Error('no recycle contract came up in 30 days');
  });
});

describe('progress comes from what you do', () => {
  it('finished buildings, research and ships count (only after the contract was issued)', () => {
    a.stats.buildingsDone = 7;                               // work done before today's contracts existed
    const book = ensureContracts(w, a, T0);
    expect(book.daily.concat(book.weekly).every((c) => KINDS[c.kind].eligible(w, a))).toBe(true);
    const base = a.stats.buildingsDone;
    startBuilding(w, a, home, 'solarPlant', T0);
    processPlayer(w, a, T0 + 5 * 3_600_000);
    expect(a.stats.buildingsDone).toBe(base + 1);
    startResearch(w, a, home, 'energy', T0 + 5 * 3_600_000);
    processPlayer(w, a, T0 + 40 * 3_600_000);
    expect(a.stats.researchDone).toBe(1);
    a.techs.combustionDrive = 1;
    queueUnits(w, a, home, 'lightFighter', 3, T0 + 40 * 3_600_000);
    processPlayer(w, a, T0 + 400 * 3_600_000);
    expect(a.stats.shipsBuilt).toBe(3);
  });

  it('spy reports and deliveries to allies are counted, deliveries to strangers are not', () => {
    AL.createAlliance(w, a, 'TEAM', 'The Team');
    AL.joinAlliance(w, b, a.allianceId!);
    const bp = w.planets[b.planetIds[0]];
    a.techs = { combustionDrive: 4, computer: 4, espionage: 6 };
    home.fleet = { smallCargo: 5, espionageProbe: 3 };
    const t = sendFleet(w, a, { fromPlanetId: home.id, to: bp.coords, ships: { smallCargo: 2 }, cargo: { metal: 7000, crystal: 0, deuterium: 0 }, mission: 'transport' }, T0);
    processMovements(w, t.arriveAt);
    expect(a.stats.delivered).toBe(7000);
    AL.leaveAlliance(w, b);
    const t2 = sendFleet(w, a, { fromPlanetId: home.id, to: bp.coords, ships: { smallCargo: 2 }, cargo: { metal: 5000, crystal: 0, deuterium: 0 }, mission: 'transport' }, T0 + DAY);
    processMovements(w, t2.arriveAt);
    expect(a.stats.delivered).toBe(7000);                    // stranger: no credit toward the contract
    const sp = sendFleet(w, a, { fromPlanetId: home.id, to: bp.coords, ships: { espionageProbe: 3 }, mission: 'espionage' }, T0 + 2 * DAY);
    processMovements(w, sp.arriveAt);
    expect(a.stats.spyReports + w.messages.filter((m) => m.to === a.id && /Probes lost/.test(m.subject)).length).toBe(1);
  });

  it('shows progress capped at the target', () => {
    const c0 = ensureContracts(w, a, T0).daily[0];
    a.stats[KINDS[c0.kind].stat] = c0.base + c0.target * 10;
    const shown = contractsView(w, a, T0).daily[0];
    expect(shown.progress).toBe(c0.target);
    expect(shown.done).toBe(true);
  });
});

describe('claiming', () => {
  it('pays the contract plus a streak bonus, once', () => {
    const c = finish(ensureContracts(w, a, T0).daily[0].id);
    const r = claimContract(w, a, c.id, T0);
    expect(r).toMatchObject({ credits: c.credits + STREAK_STEP, bonus: 0, streak: 1 });
    expect(a.credits).toBe(c.credits + STREAK_STEP);
    expect(() => claimContract(w, a, c.id, T0)).toThrow(/Already claimed/);
  });

  it('refuses unfinished or unknown contracts', () => {
    const open = ensureContracts(w, a, T0).daily[0];
    expect(() => claimContract(w, a, open.id, T0)).toThrow(/Not finished/);
    expect(() => claimContract(w, a, 'nope', T0)).toThrow(GameError);
    expect(a.credits).toBe(0);
  });

  it('gives a bonus for all three dailies, once a day', () => {
    const ids = ensureContracts(w, a, T0).daily.map((c) => c.id);
    for (const id of ids) finish(id);
    const first = claimContract(w, a, ids[0], T0), second = claimContract(w, a, ids[1], T0), third = claimContract(w, a, ids[2], T0);
    expect([first.bonus, second.bonus, third.bonus]).toEqual([0, 0, ALL_BONUS]);
    expect(contractsView(w, a, T0).allBonus.got).toBe(true);
    expect(w.messages.some((m) => m.to === a.id && m.subject === 'All daily contracts done')).toBe(true);
  });

  it('builds a streak over consecutive days, resets after a missed day, and caps the bonus', () => {
    const claimDay = (d: number) => {
      const now = T0 + d * DAY;
      const book = ensureContracts(w, a, now);
      const c = book.daily[0];
      a.stats[KINDS[c.kind].stat] = c.base + c.target;
      return claimContract(w, a, c.id, now);
    };
    expect(claimDay(0).streak).toBe(1);
    expect(claimDay(1).streak).toBe(2);
    expect(claimDay(2).streak).toBe(3);
    expect(contractsView(w, a, T0 + 3 * DAY).streak).toBe(3);       // still alive the morning after
    expect(contractsView(w, a, T0 + 4 * DAY).streak).toBe(0);       // a whole day without a claim ends it
    expect(claimDay(4).streak).toBe(1);
    for (let d = 5; d < 20; d++) claimDay(d);
    const last = claimDay(20);
    expect(last.streak).toBe(17);
    const c = a.contracts!.daily[0];
    expect(last.credits).toBe(c.credits + STREAK_CAP * STREAK_STEP);
  });

  it('weeklies pay more, carry no streak bonus and survive the day rolling over', () => {
    const weekly = ensureContracts(w, a, T0).weekly[0];
    a.stats[KINDS[weekly.kind].stat] = weekly.base + weekly.target;
    expect(contractsView(w, a, T0 + 2 * DAY).weekly[0].done).toBe(true);
    const r = claimContract(w, a, weekly.id, T0 + 2 * DAY);
    expect(r.credits).toBe(weekly.credits);
    expect(weekly.credits).toBeGreaterThan(40);
    expect(r.streak).toBe(0);                                           // claiming a weekly does not start a daily streak
  });

  it('unclaimed work is lost when the period rolls over, and the new period starts from zero', () => {
    const old = ensureContracts(w, a, T0).daily[0];
    a.stats[KINDS[old.kind].stat] = old.base + old.target;
    expect(contractsView(w, a, T0).claimable).toBeGreaterThanOrEqual(1);
    const tomorrow = contractsView(w, a, T0 + DAY);
    expect(() => claimContract(w, a, old.id, T0 + DAY)).toThrow(/no longer available/);
    for (const c of tomorrow.daily) expect(c.progress).toBe(0);
  });
});

describe('api', () => {
  it('serves the board and pays out through the endpoint', async () => {
    const { createApp } = await import('../server/app');
    const server = createApp(w, { clock: () => T0 }).listen(0);
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    try {
      const login = await (await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'alice', password: 'secret1' }) })).json() as { token: string };
      const call = async (path: string, body?: unknown) => { const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json() as any }; };
      const board = await call('/api/contracts');
      expect(board.status).toBe(200);
      expect(board.json.daily).toHaveLength(3);
      const target = finish(board.json.daily[0].id);
      const claim = await call('/api/contracts/claim', { id: target.id });
      expect(claim.status).toBe(200);
      expect(claim.json.credits).toBe(target.credits + STREAK_STEP);
      expect(claim.json.view.daily[0].claimed).toBe(true);
      expect((await call('/api/contracts/claim', { id: target.id })).status).toBe(400);
      expect((await call('/api/me')).json.contractsClaimable).toBe(0);
    } finally { server.close(); }
  });
});

void dayKeyOf;
