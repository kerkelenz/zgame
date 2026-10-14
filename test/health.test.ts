import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { configureHealth, healthView, recordError, recordSave, recordTick, resetHealth } from '../server/health';
import { createWorld, type World } from '../server/world';

let w: World; let base = '', close = () => undefined as void;
const call = async (method: string, path: string, token?: string, body?: unknown) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
};
beforeAll(async () => {
  w = createWorld({ npcDensity: 0, raidIntervalMin: 0 });
  const s = createApp(w).listen(0);
  await new Promise((r) => s.once('listening', r));
  base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  close = () => { s.close(); };
});
afterAll(() => close());
beforeEach(() => { resetHealth(); configureHealth({ sockets: () => 3, saveFile: null }); });

describe('server health', () => {
  it('summarises tick times with an average, a 95th percentile and the slowest', () => {
    for (let i = 1; i <= 100; i++) recordTick(i);
    const t = healthView(w).tick;
    expect(t.samples).toBe(100);
    expect(t.avgMs).toBeCloseTo(50.5);
    expect(t.p95Ms).toBeGreaterThanOrEqual(95);
    expect(t.maxMs).toBe(100);
  });
  it('keeps only the last two minutes of ticks and the last twenty errors, newest first', () => {
    for (let i = 0; i < 300; i++) recordTick(1);
    expect(healthView(w).tick.samples).toBe(120);
    for (let i = 0; i < 30; i++) recordError(`boom ${i}`, i);
    const e = healthView(w).errors;
    expect(e).toHaveLength(20);
    expect(e[0].text).toBe('boom 29');
  });
  it('reports the last save, the connections and the commanders by how recently they played', () => {
    recordSave(12, null, 5_000);
    const h = healthView(w, 9_000);
    expect(h.save).toMatchObject({ ms: 12, at: 5_000, ago: 4_000 });
    expect(h.players.sockets).toBe(3);
    expect(h.players.total).toBe(0);
  });
  it('is for admins only', async () => {
    const reg = await call('POST', '/api/register', undefined, { username: 'plain', password: 'secret1' });
    expect((await call('GET', '/api/admin/health', reg.json.token)).status).toBe(403);
    expect((await call('GET', '/api/admin/health')).status).toBe(401);
  });
});
