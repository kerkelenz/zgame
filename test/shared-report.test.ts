import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { createWorld, type World } from '../server/world';

let base = '', close: () => void, w: World;
const call = async (method: string, path: string, token?: string) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: method === 'POST' ? '{}' : undefined });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
};

beforeAll(async () => {
  w = createWorld({ economySpeed: 20, protectionPoints: 0, raidIntervalMin: 0 }, 1_700_000_000_000);
  const s = createApp(w).listen(0);
  await new Promise((r) => s.once('listening', r));
  base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  close = () => s.close();
});
afterAll(() => close());

describe('shared battle reports', () => {
  it('publishes only battle reports, serves them without login, and keeps the log', async () => {
    const reg = await (await fetch(base + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sharer', password: 'secret1' }) })).json() as any;
    const report = { coords: { g: 1, s: 2, p: 3 }, rounds: 2, winner: 'attacker', attackers: [], defenders: [], roundLog: [{ a: { cruiser: 5 }, d: { cruiser: 3 } }, { a: { cruiser: 5 }, d: {} }] };
    w.messages.push({ id: 'combatmsg', to: reg.id, from: null, kind: 'combat', subject: 'Battle at 1:2:3', body: '', data: report, at: 1, read: false });
    w.messages.push({ id: 'plainmsg', to: reg.id, from: null, kind: 'system', subject: 'Hello', body: 'hi', at: 1, read: false });
    expect((await call('POST', '/api/messages/plainmsg/share', reg.token)).status).toBe(400);
    expect((await call('POST', '/api/messages/combatmsg/share')).status).toBe(401);
    const s = await call('POST', '/api/messages/combatmsg/share', reg.token);
    expect(s.status).toBe(200);
    const pub = await call('GET', `/api/shared/${s.json.id}`);
    expect(pub.status).toBe(200);
    expect(pub.json.subject).toBe('Battle at 1:2:3');
    expect(pub.json.report.roundLog).toHaveLength(2);
    expect((await call('GET', '/api/shared/nope')).status).toBe(404);
  });
});
