import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { SESSION_TTL_MS, authenticate, login, logout, pruneSessions, register } from '../server/accounts';
import { mayRegisterReserved, reservedAdminName } from '../server/account';
import { createApp } from '../server/app';
import { createWorld, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;

describe('sessions', () => {
  let w: World;
  beforeEach(() => { w = createWorld({ npcDensity: 0 }, T0); });

  it('expire after a month without use, and any use keeps them alive', () => {
    const { token } = register(w, 'alice', 'secret1', T0);
    expect(authenticate(w, token, T0 + 29 * DAY)?.username).toBe('alice');
    expect(authenticate(w, token, T0 + 58 * DAY)?.username).toBe('alice'); // 29 days since the last use
    expect(authenticate(w, token, T0 + 58 * DAY + SESSION_TTL_MS + 1)).toBeNull();
    expect(w.sessions[token]).toBeUndefined();
    expect(w.sessionAt![token]).toBeUndefined();
  });

  it('logout revokes the token and ignores junk', () => {
    const { token } = register(w, 'alice', 'secret1', T0);
    logout(w, undefined); logout(w, 'nope'); logout(w, '__proto__');
    expect(authenticate(w, token, T0)).not.toBeNull();
    logout(w, token);
    expect(authenticate(w, token, T0)).toBeNull();
  });

  it('inherited property names are not tokens', () => {
    register(w, 'alice', 'secret1', T0);
    for (const t of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '']) expect(authenticate(w, t, T0)).toBeNull();
  });

  it('pruning forgets expired and orphaned entries', () => {
    const a = register(w, 'alice', 'secret1', T0);
    const b = register(w, 'bobby', 'secret2', T0 + 40 * DAY);
    w.sessionAt!.orphan = 5;
    w.sessions.ghost = 'no-such-player';
    expect(pruneSessions(w, T0 + 41 * DAY)).toBe(3); // alice's expired login, the ghost session, the orphaned timestamp
    expect(w.sessions[a.token]).toBeUndefined();
    expect(w.sessions[b.token]).toBe(b.player.id);
    expect(w.sessions.ghost).toBeUndefined();
    expect(w.sessionAt!.orphan).toBeUndefined();
  });

  it('logging in refreshes the timestamp and new logins cap old ones', () => {
    register(w, 'alice', 'secret1', T0);
    const t = login(w, 'alice', 'secret1', T0 + 10 * DAY).token;
    expect(w.sessionAt![t]).toBe(T0 + 10 * DAY);
  });
});

describe('admin name reservation', () => {
  let w: World;
  beforeEach(() => { w = createWorld({ npcDensity: 0 }, T0); delete process.env.OGAME_ADMIN_KEY; process.env.OGAME_ADMINS = 'boss, Second'; });

  it('reserves listed names until somebody legitimately holds them', () => {
    expect(reservedAdminName(w, 'boss')).toBe(true);
    expect(reservedAdminName(w, 'SECOND')).toBe(true);
    expect(reservedAdminName(w, 'someone')).toBe(false);
    register(w, 'boss', 'secret1', T0);
    expect(reservedAdminName(w, 'Boss')).toBe(false);
  });

  it('needs the setup key when one is configured, otherwise the server machine itself', () => {
    expect(mayRegisterReserved('', '203.0.113.9')).toBe(false);
    expect(mayRegisterReserved('anything', '203.0.113.9')).toBe(false);
    expect(mayRegisterReserved('', '127.0.0.1')).toBe(true);
    expect(mayRegisterReserved('', '::1')).toBe(true);
    expect(mayRegisterReserved('', '::ffff:127.0.0.1')).toBe(true);
    expect(mayRegisterReserved('', undefined)).toBe(false);
    process.env.OGAME_ADMIN_KEY = 'open-sesame';
    expect(mayRegisterReserved('open-sesame', '203.0.113.9')).toBe(true);
    expect(mayRegisterReserved('open-sesam', '127.0.0.1')).toBe(false); // with a key set, being local is not enough
    expect(mayRegisterReserved('', '127.0.0.1')).toBe(false);
    delete process.env.OGAME_ADMIN_KEY;
  });
});

describe('http hardening', () => {
  let base = '', close: () => void;
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: (await r.json().catch(() => null)) as any, headers: r.headers };
  };
  beforeAll(async () => {
    const w = createWorld({ npcDensity: 0, protectionPoints: 0, raidIntervalMin: 0 }, T0);
    const s = createApp(w).listen(0);
    await new Promise((r) => s.once('listening', r));
    base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    close = () => s.close();
  });
  afterAll(() => close());

  it('sends security headers, including a content security policy', async () => {
    const r = await call('GET', '/api/health');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    const csp = r.headers.get('content-security-policy')!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('logout really signs the token out', async () => {
    const reg = (await call('POST', '/api/register', undefined, { username: 'leaver', password: 'secret1' })).json;
    expect((await call('GET', '/api/me', reg.token)).status).toBe(200);
    expect((await call('POST', '/api/logout', reg.token)).status).toBe(200);
    expect((await call('GET', '/api/me', reg.token)).status).toBe(401);
    expect((await call('POST', '/api/logout')).status).toBe(200); // harmless without a token
  });

  it('blocks repeated wrong passwords for one account but never successful logins', async () => {
    await call('POST', '/api/register', undefined, { username: 'victim', password: 'secret1' });
    for (let i = 0; i < 5; i++) expect((await call('POST', '/api/login', undefined, { username: 'victim', password: 'wrong' + i })).status).toBe(401);
    for (let i = 0; i < 3; i++) expect((await call('POST', '/api/login', undefined, { username: 'victim', password: 'secret1' })).status).toBe(200);
    for (let i = 0; i < 8; i++) await call('POST', '/api/login', undefined, { username: 'victim', password: 'bad' + i });
    const locked = await call('POST', '/api/login', undefined, { username: 'victim', password: 'secret1' });
    expect(locked.status).toBe(429);
    expect(locked.json.error).toMatch(/failed attempts/);
    // someone else is unaffected
    await call('POST', '/api/register', undefined, { username: 'bystander', password: 'secret1' });
    expect((await call('POST', '/api/login', undefined, { username: 'bystander', password: 'secret1' })).status).toBe(200);
  });

  it('refuses a reserved admin name from a remote address (here: only loopback is allowed without a key)', async () => {
    process.env.OGAME_ADMINS = 'rootadmin';
    // the test client connects over loopback, so it may claim the name...
    expect((await call('POST', '/api/register', undefined, { username: 'rootadmin', password: 'secret1' })).status).toBe(200);
    // ...and with a key configured, loopback is no longer enough
    process.env.OGAME_ADMINS = 'rootadmin2';
    process.env.OGAME_ADMIN_KEY = 'k3y';
    expect((await call('POST', '/api/register', undefined, { username: 'rootadmin2', password: 'secret1' })).status).toBe(403);
    expect((await call('POST', '/api/register', undefined, { username: 'rootadmin2', password: 'secret1', adminKey: 'k3y' })).status).toBe(200);
    delete process.env.OGAME_ADMIN_KEY;
  });
});

describe('websocket limits (real server process)', () => {
  it('survives an oversized frame and caps connections per player', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-ws-'));
    const port = 3900 + Math.floor(Math.random() * 90);
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      env: { ...process.env, PORT: String(port), OGAME_SAVE: join(dir, 'w.json'), OGAME_NPC_DENSITY: '0', OGAME_RAID_INTERVAL_MIN: '0' }, stdio: 'ignore',
    });
    const base = `http://127.0.0.1:${port}`;
    try {
      for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)); }
      const reg = await (await fetch(base + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'wsuser', password: 'secret1' }) })).json() as { token: string };
      const open = async () => { const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${reg.token}`); ws.on('error', () => undefined); await new Promise((r) => ws.on('message', r)); return ws; };
      const big = await open();
      const closed = new Promise<void>((r) => big.on('close', () => r()));
      big.send('x'.repeat(5000));
      await closed; // the server dropped the connection...
      expect((await fetch(base + '/api/health')).ok).toBe(true); // ...and is still alive
      const socks = [];
      for (let i = 0; i < 8; i++) socks.push(await open());
      const ninth = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${reg.token}`);
      ninth.on('error', () => undefined);
      const code = await new Promise<number>((r) => ninth.on('close', (c) => r(c)));
      expect(code).toBe(4002);
      for (const s of socks) s.close();
    } finally {
      child.kill();
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* temp */ }
    }
  }, 30_000);
});
