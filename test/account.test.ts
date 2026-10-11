import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as ACC from '../server/account';
import { login, register } from '../server/accounts';
import * as AL from '../server/alliance';
import { createApp } from '../server/app';
import { sendFleet } from '../server/fleet';
import { GameError, createWorld, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;
let w: World; let a: Player, b: Player;

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  a = register(w, 'alice', 'secret1', T0).player;
  b = register(w, 'bobby', 'secret2', T0).player;
  process.env.OGAME_ADMINS = 'alice';
});

describe('password, rename and recovery', () => {
  it('changes the password and signs out other sessions', () => {
    const t1 = login(w, 'alice', 'secret1').token, t2 = login(w, 'alice', 'secret1').token;
    expect(() => ACC.changePassword(w, a, 'wrong!', 'newpass1')).toThrow(/Wrong password/);
    expect(() => ACC.changePassword(w, a, 'secret1', 'abc')).toThrow(/6 characters/);
    expect(() => ACC.changePassword(w, a, 'secret1', 'secret1')).toThrow(/different/);
    ACC.changePassword(w, a, 'secret1', 'newpass1', t2);
    expect(w.sessions[t1]).toBeUndefined();
    expect(w.sessions[t2]).toBe(a.id);
    expect(() => login(w, 'alice', 'secret1')).toThrow(GameError);
    expect(login(w, 'alice', 'newpass1').player.id).toBe(a.id);
  });

  it('renames once a week, keeps names unique and updates the homeworld and fleets', () => {
    const home = w.planets[a.planetIds[0]];
    expect(() => ACC.renameAccount(w, a, 'nope', 'alicia', T0)).toThrow(/Wrong password/);
    expect(() => ACC.renameAccount(w, a, 'secret1', 'bobby', T0)).toThrow(/taken/);
    expect(() => ACC.renameAccount(w, a, 'secret1', 'x', T0)).toThrow(/3-16/);
    ACC.renameAccount(w, a, 'secret1', 'alicia', T0);
    expect(a.username).toBe('alicia');
    expect(home.name).toBe("alicia's Homeworld");
    expect(login(w, 'alicia', 'secret1').player.id).toBe(a.id);
    expect(() => ACC.renameAccount(w, a, 'secret1', 'alice2', T0 + DAY)).toThrow(/once every 7 days/);
    ACC.renameAccount(w, a, 'secret1', 'alice2', T0 + 8 * DAY);
    expect(a.username).toBe('alice2');
  });

  it('recovers a lost password with a one-time key', () => {
    const key = ACC.createRecoveryKey(a, 'secret1');
    expect(key).toMatch(/^[0-9a-f]{5}(-[0-9a-f]{5}){3}$/);
    expect(() => ACC.recoverAccount(w, 'alice', 'aaaaa-bbbbb-ccccc-ddddd', 'brandnew1')).toThrow(/Wrong username/);
    expect(() => ACC.recoverAccount(w, 'alice', key, 'abc')).toThrow(/6 characters/);
    const t = login(w, 'alice', 'secret1').token;
    ACC.recoverAccount(w, 'alice', key, 'brandnew1');
    expect(w.sessions[t]).toBeUndefined();
    expect(login(w, 'alice', 'brandnew1').player.id).toBe(a.id);
    expect(() => ACC.recoverAccount(w, 'alice', key, 'again123')).toThrow(/Wrong username/); // single use
    expect(() => ACC.recoverAccount(w, 'nobody', key, 'again123')).toThrow(/Wrong username/);
  });
});

describe('deleting an account', () => {
  it('needs the password and the username, and removes everything the commander owns', () => {
    const planet = w.planets[b.planetIds[0]];
    planet.fleet = { smallCargo: 3 };
    b.techs.combustionDrive = 3;
    const m = sendFleet(w, b, { fromPlanetId: planet.id, to: w.planets[a.planetIds[0]].coords, ships: { smallCargo: 1 }, mission: 'transport' }, T0);
    const tok = login(w, 'bobby', 'secret2').token;
    const planetId = planet.id;
    expect(() => ACC.deleteAccount(w, b, 'wrong', 'bobby')).toThrow(/Wrong password/);
    expect(() => ACC.deleteAccount(w, b, 'secret2', 'someone')).toThrow(/confirm/);
    ACC.deleteAccount(w, b, 'secret2', 'bobby');
    expect(w.players[b.id]).toBeUndefined();
    expect(w.planets[planetId]).toBeUndefined();
    expect(w.movements[m.id]).toBeUndefined();
    expect(w.sessions[tok]).toBeUndefined();
    expect(() => login(w, 'bobby', 'secret2')).toThrow(GameError);
    expect(register(w, 'bobby', 'secret9', T0).player.id).not.toBe(b.id); // the name is free again
  });

  it('a founder must hand over a non-empty alliance first; the last member takes it with them', () => {
    AL.createAlliance(w, a, 'TEAM', 'The Team');
    AL.joinAlliance(w, b, a.allianceId!);
    expect(() => ACC.deleteAccount(w, a, 'secret1', 'alice')).toThrow(/Transfer alliance leadership/);
    const id = a.allianceId!;
    ACC.deleteAccount(w, b, 'secret2', 'bobby');
    expect(w.alliances[id].members.map((m) => m.playerId)).toEqual([a.id]);
    ACC.deleteAccount(w, a, 'secret1', 'alice');
    expect(w.alliances[id]).toBeUndefined();
  });
});

describe('moderation', () => {
  it('admins come from OGAME_ADMINS and cannot be moderated', () => {
    expect(ACC.isAdmin(a)).toBe(true);
    expect(ACC.isAdmin(b)).toBe(false);
    expect(() => ACC.requireAdmin(b)).toThrow(/Admins only/);
    expect(() => ACC.ban(w, a.id, 1, 'x', T0)).toThrow(/Admins cannot/);
  });

  it('bans block login and revoke sessions, temporary bans expire', () => {
    const t = login(w, 'bobby', 'secret2').token;
    ACC.ban(w, b.id, 2, 'spam', T0);
    expect(w.sessions[t]).toBeUndefined();
    expect(ACC.isBanned(b, T0 + 3_600_000)).toBe(true);
    expect(() => login(w, 'bobby', 'secret2', T0 + 1000)).toThrow(/banned/);
    expect(ACC.isBanned(b, T0 + 3 * 3_600_000)).toBe(false);
    ACC.ban(w, b.id, null, 'forever', T0);
    expect(ACC.isBanned(b, T0 + 999 * DAY)).toBe(true);
    ACC.unban(w, b.id);
    expect(login(w, 'bobby', 'secret2', T0).player.id).toBe(b.id);
  });

  it('mutes stop chat and messages until they expire', () => {
    ACC.mute(w, b.id, 1, 'rude', T0);
    expect(() => ACC.assertNotMuted(b, T0 + 1000)).toThrow(/muted.*rude/);
    expect(() => ACC.assertNotMuted(b, T0 + 2 * 3_600_000)).not.toThrow();
    expect(w.messages.some((m) => m.to === b.id && /muted/.test(m.subject))).toBe(true);
    ACC.unmute(w, b.id);
    expect(() => ACC.assertNotMuted(b, T0)).not.toThrow();
  });

  it('announcements reach every commander', () => {
    ACC.announce(w, 'Maintenance at noon');
    for (const p of [a, b]) expect(w.messages.some((m) => m.to === p.id && m.body === 'Maintenance at noon')).toBe(true);
    expect(() => ACC.announce(w, '  ')).toThrow(/Empty/);
  });

  it('the overview lists commanders with their state', () => {
    ACC.mute(w, b.id, null, 'x', T0);
    const o = ACC.adminOverview(w, T0, () => 5);
    expect(o.world.humans).toBe(2);
    expect(o.players.find((p) => p.username === 'bobby')).toMatchObject({ muted: { reason: 'x' }, banned: null, admin: false });
    expect(o.players.find((p) => p.username === 'alice')!.admin).toBe(true);
  });
});

describe('account api', () => {
  let base = '', close: () => void, wa: World;
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  beforeAll(async () => {
    process.env.OGAME_ADMINS = 'root';
    wa = createWorld({ economySpeed: 20, protectionPoints: 0, raidIntervalMin: 0 }, T0);
    const s = createApp(wa).listen(0);
    await new Promise((r) => s.once('listening', r));
    base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    close = () => s.close();
  });
  afterAll(() => close());

  it('full flow: register, admin rights, ban, recovery, delete', async () => {
    process.env.OGAME_ADMINS = 'root';
    const root = (await call('POST', '/api/register', undefined, { username: 'root', password: 'rootpw1' })).json;
    const user = (await call('POST', '/api/register', undefined, { username: 'gamer', password: 'gamerpw1' })).json;
    expect((await call('GET', '/api/me', root.token)).json.player.admin).toBe(true);
    expect((await call('GET', '/api/me', user.token)).json.player.admin).toBe(false);
    expect((await call('GET', '/api/admin/overview', user.token)).status).toBe(403);
    const ov = await call('GET', '/api/admin/overview', root.token);
    expect(ov.json.players.length).toBe(2);

    const key = (await call('POST', '/api/account/recovery-key', user.token, { password: 'gamerpw1' })).json.key;
    expect(key).toBeTruthy();
    expect((await call('POST', '/api/account/password', user.token, { current: 'gamerpw1', next: 'gamerpw2' })).status).toBe(200);
    expect((await call('POST', '/api/login', undefined, { username: 'gamer', password: 'gamerpw2' })).status).toBe(200);

    await call('POST', '/api/admin/mute', root.token, { id: user.id, hours: 1, reason: 'calm down' });
    const muted = await call('POST', '/api/chat', user.token, { text: 'hello' });
    expect(muted.status).toBe(403);
    expect(muted.json.error).toMatch(/muted/);
    await call('POST', '/api/admin/unmute', root.token, { id: user.id });
    expect((await call('POST', '/api/chat', user.token, { text: 'hello' })).status).toBe(200);

    await call('POST', '/api/admin/ban', root.token, { id: user.id, reason: 'bye' });
    expect((await call('GET', '/api/me', user.token)).status).toBe(401);
    expect((await call('POST', '/api/login', undefined, { username: 'gamer', password: 'gamerpw2' })).status).toBe(403);
    await call('POST', '/api/admin/unban', root.token, { id: user.id });

    expect((await call('POST', '/api/recover', undefined, { username: 'gamer', key, password: 'recovered1' })).status).toBe(200);
    const again = (await call('POST', '/api/login', undefined, { username: 'gamer', password: 'recovered1' })).json;
    expect((await call('POST', '/api/account/delete', again.token, { password: 'recovered1', confirm: 'gamer' })).status).toBe(200);
    expect((await call('GET', '/api/me', again.token)).status).toBe(401);
  });
});
