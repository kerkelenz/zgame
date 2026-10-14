import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { AUDIT_CAP, SCHEDULE_CAP, audit, auditView, cancelScheduled, dayOf, processScheduled, recordDayStats, scheduleAnnouncement, statsView } from '../server/adminlog';
import { createApp } from '../server/app';
import { createWorld, type Player, type World } from '../server/world';

const T0 = Date.parse('2026-10-14T10:00:00Z');
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
let w: World; let root: Player, bob: Player;

beforeEach(() => {
  w = createWorld({ npcDensity: 0, raidIntervalMin: 0 }, T0);
  root = register(w, 'rootadm', 'secret1', T0).player;
  bob = register(w, 'bobby', 'secret2', T0).player;
});

describe('the audit log', () => {
  it('keeps newest first, names who did what to whom, and is capped', () => {
    audit(w, root, 'ban', T0, bob, '2 h: spam');
    audit(w, root, 'announce', T0 + 1, null, 'hello');
    const v = auditView(w);
    expect(v.map((e) => e.action)).toEqual(['announce', 'ban']);
    expect(v[1]).toMatchObject({ admin: 'rootadm', targetId: bob.id, targetName: 'bobby', detail: '2 h: spam' });
    for (let i = 0; i < AUDIT_CAP + 20; i++) audit(w, root, 'x' + i, T0 + i);
    expect(w.auditLog).toHaveLength(AUDIT_CAP);
    expect(auditView(w, 5)).toHaveLength(5);
  });
});

describe('scheduled announcements', () => {
  it('goes out once at its time, to every commander, and is then gone', () => {
    scheduleAnnouncement(w, root, 'Maintenance in an hour', 30, 0, T0);
    processScheduled(w, T0 + 29 * MIN);
    expect(w.messages.filter((m) => m.subject === 'Announcement')).toHaveLength(0);
    processScheduled(w, T0 + 30 * MIN);
    expect(w.messages.filter((m) => m.to === bob.id && m.subject === 'Announcement' && /Maintenance/.test(m.body))).toHaveLength(1);
    expect(w.scheduledAnnouncements).toHaveLength(0);
    expect(w.auditLog![0].action).toBe('schedule announcement');
  });
  it('a repeating one is set for its next turn, and a missed turn is not sent twice', () => {
    scheduleAnnouncement(w, root, 'Daily reminder', 60, 24, T0);
    processScheduled(w, T0 + 3 * DAY + HOUR);                                  // the server was off for days
    expect(w.messages.filter((m) => m.to === bob.id && m.subject === 'Announcement')).toHaveLength(1);
    expect(w.scheduledAnnouncements![0].at).toBeGreaterThan(T0 + 3 * DAY + HOUR);
    expect(w.scheduledAnnouncements![0].at).toBeLessThanOrEqual(T0 + 4 * DAY + 2 * HOUR);
  });
  it('can be cancelled, needs a text, and has a limit', () => {
    const s = scheduleAnnouncement(w, root, 'Never mind', 10, 0, T0);
    cancelScheduled(w, root, s.id, T0);
    expect(w.scheduledAnnouncements).toHaveLength(0);
    expect(() => cancelScheduled(w, root, s.id, T0)).toThrow(/No such/);
    expect(() => scheduleAnnouncement(w, root, '  ', 10, 0, T0)).toThrow(/Write/);
    for (let i = 0; i < SCHEDULE_CAP; i++) scheduleAnnouncement(w, root, 'a' + i, 10 + i, 0, T0);
    expect(() => scheduleAnnouncement(w, root, 'one more', 10, 0, T0)).toThrow(/At most/);
  });
});

describe('the daily numbers', () => {
  it('counts accounts created and commanders seen today, and the ones who came back', () => {
    const old = register(w, 'veteran', 'secret3', T0 - 3 * DAY).player;
    old.lastSeen = T0 - 1000;
    bob.lastSeen = T0 - 2000;
    root.lastSeen = T0 - 3 * DAY;                                              // not seen today
    recordDayStats(w, T0);
    const row = statsView(w).at(-1)!;
    expect(row).toMatchObject({ day: dayOf(T0), registered: 2, active: 2, returning: 1 });
    expect('seen' in row).toBe(false);
  });
  it('a commander seen earlier today still counts when they have left, and a new day starts a new row', () => {
    recordDayStats(w, T0);
    expect(statsView(w).at(-1)!.active).toBe(2);                               // both registered at T0, seen now
    bob.lastSeen = T0 - 5 * DAY;                                               // lastSeen moves on, the count must not drop
    recordDayStats(w, T0 + HOUR);
    expect(statsView(w).at(-1)!.active).toBe(2);
    recordDayStats(w, T0 + DAY);
    const rows = statsView(w);
    expect(rows.map((r) => r.day)).toEqual([dayOf(T0), dayOf(T0 + DAY)]);
    expect(rows[1].registered).toBe(0);
    expect(w.dailyStats![0].seen).toBeUndefined();                             // only today's row keeps the list of ids
  });
});

describe('the admin routes', () => {
  let base = '', close = () => undefined as unknown;
  let aw: World;
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  beforeAll(async () => {
    process.env.ZGAME_ADMINS = 'rootadm';
    aw = createWorld({ npcDensity: 0, raidIntervalMin: 0 }, Date.now());
    const s = createApp(aw).listen(0);
    await new Promise((r) => s.once('listening', r));
    base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    close = () => s.close();
  });
  afterAll(() => close());
  it('record admin actions, schedule and list announcements, and are for admins only', async () => {
    const adm = (await call('POST', '/api/register', undefined, { username: 'rootadm', password: 'rootpw12' })).json;
    const usr = (await call('POST', '/api/register', undefined, { username: 'gamer', password: 'gamerpw1' })).json;
    expect((await call('GET', '/api/admin/audit', usr.token)).status).toBe(403);
    expect((await call('POST', '/api/admin/schedule', usr.token, { text: 'x', minutes: 5 })).status).toBe(403);
    await call('POST', '/api/admin/mute', adm.token, { id: usr.id, hours: 1, reason: 'calm' });
    await call('POST', '/api/admin/announce', adm.token, { text: 'hello all' });
    const s = await call('POST', '/api/admin/schedule', adm.token, { text: 'later', minutes: 15, repeatHours: 0 });
    expect(s.json).toHaveLength(1);
    const log = (await call('GET', '/api/admin/audit', adm.token)).json;
    expect(log.map((e: any) => e.action)).toEqual(['schedule announcement', 'announce', 'mute']);
    expect(log[2]).toMatchObject({ admin: 'rootadm', targetName: 'gamer' });
    expect((await call('POST', '/api/admin/schedule/cancel', adm.token, { id: s.json[0].id })).json).toHaveLength(0);
    expect(Array.isArray((await call('GET', '/api/admin/stats', adm.token)).json)).toBe(true);
  });
});
