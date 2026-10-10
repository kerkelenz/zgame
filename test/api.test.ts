import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { createWorld, type World } from '../server/world';

let base = '';
let close: () => void;
let w: World;

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

beforeAll(async () => {
  w = createWorld({ economySpeed: 500, fleetSpeed: 500, protectionPoints: 0, raidIntervalMin: 0 });
  const server = createApp(w).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());

describe('http api', () => {
  let ta = '', tb = '', homeA = '', homeB = '';

  it('requires auth', async () => {
    expect((await call('GET', '/api/me')).status).toBe(401);
  });

  it('registers and logs in', async () => {
    const a = await call('POST', '/api/register', undefined, { username: 'alice', password: 'secret1' });
    expect(a.status).toBe(200);
    ta = a.json.token;
    const b = await call('POST', '/api/register', undefined, { username: 'bob', password: 'secret2' });
    tb = b.json.token;
    expect((await call('POST', '/api/register', undefined, { username: 'alice', password: 'secret1' })).status).toBe(400);
    expect((await call('POST', '/api/login', undefined, { username: 'alice', password: 'nope' })).status).toBe(401);
    expect((await call('POST', '/api/login', undefined, { username: 'ALICE', password: 'secret1' })).json.token).toBeTruthy();
  });

  it('returns me, planets and defs', async () => {
    const me = await call('GET', '/api/me', ta);
    expect(me.json.player.username).toBe('alice');
    expect(me.json.planets).toHaveLength(1);
    homeA = me.json.planets[0].id;
    homeB = (await call('GET', '/api/me', tb)).json.planets[0].id;
    const p = await call('GET', `/api/planets/${homeA}`, ta);
    expect(p.json.resources.metal).toBeGreaterThan(1000);
    expect(p.json.production.metal).toBeGreaterThan(0);
    expect((await call('GET', `/api/planets/${homeA}`, tb)).status).toBe(403);
    expect((await call('GET', '/api/defs', ta)).json.UNITS.cruiser.cost.metal).toBe(20000);
  });

  it('builds and reports errors as JSON', async () => {
    const ok = await call('POST', `/api/planets/${homeA}/build`, ta, { id: 'metalMine' });
    expect(ok.status).toBe(200);
    expect(ok.json.buildQueue.id).toBe('metalMine');
    const dup = await call('POST', `/api/planets/${homeA}/build`, ta, { id: 'solarPlant' });
    expect(dup.status).toBe(400);
    expect(dup.json.error).toMatch(/progress/);
    const bad = await call('POST', `/api/planets/${homeA}/build`, tb, { id: 'metalMine' });
    expect(bad.status).toBe(403);
    expect((await call('POST', `/api/planets/${homeB}/build`, tb, { id: 'doesNotExist' })).status).toBe(400);
  });

  it('galaxy view lists my planet', async () => {
    const me = (await call('GET', '/api/me', ta)).json;
    const c = me.planets[0].coords;
    const g = await call('GET', `/api/galaxy/${c.g}/${c.s}`, ta);
    const slot = g.json.slots.find((s: any) => s.p === c.p);
    expect(slot.planet.mine).toBe(true);
    expect((await call('GET', '/api/galaxy/99/1', ta)).status).toBe(400);
  });

  it('messages and chat work', async () => {
    expect((await call('POST', '/api/messages/send', ta, { to: 'bob', text: 'hello' })).status).toBe(200);
    const inbox = await call('GET', '/api/messages', tb);
    expect(inbox.json.some((m: any) => m.kind === 'player' && m.body === 'hello' && m.from === 'alice')).toBe(true);
    expect((await call('POST', '/api/chat', ta, { channel: 'global', text: 'gm' })).status).toBe(200);
    const chat = await call('GET', '/api/chat?channel=global', tb);
    expect(chat.json.at(-1).text).toBe('gm');
    expect((await call('POST', '/api/chat', ta, { channel: 'alliance', text: 'x' })).status).toBe(400);
  });

  it('alliance flow over http', async () => {
    const c = await call('POST', '/api/alliance/create', ta, { tag: 'GG', name: 'Good Games' });
    expect(c.status).toBe(400); // tag too short
    const ok = await call('POST', '/api/alliance/create', ta, { tag: 'GGWP', name: 'Good Games' });
    expect(ok.status).toBe(200);
    expect(ok.json.members).toHaveLength(1);
    const list = await call('GET', '/api/alliances', tb);
    expect((await call('POST', '/api/alliance/join', tb, { id: list.json[0].id })).status).toBe(200);
    const mine = await call('GET', '/api/alliance', tb);
    expect(mine.json.members).toHaveLength(2);
    expect((await call('POST', '/api/alliance/donate', tb, { planetId: homeB, amount: { metal: 500 } })).json.bank.metal).toBe(500);
    await call('POST', '/api/chat', ta, { channel: 'alliance', text: 'team chat' });
    expect((await call('GET', '/api/chat?channel=alliance', tb)).json.at(-1).text).toBe('team chat');
  });

  it('highscore ranks players and alliances', async () => {
    const h = await call('GET', '/api/highscore', ta);
    expect(h.json.players).toHaveLength(2);
    expect(h.json.alliances[0].tag).toBe('GGWP');
  });

  it('fleet send validation surfaces errors', async () => {
    const r = await call('POST', '/api/fleets/send', ta, { fromPlanetId: homeA, to: { g: 1, s: 1, p: 1 }, ships: { cruiser: 1 }, mission: 'attack' });
    expect(r.status).toBe(400);
    const f = await call('GET', '/api/fleets', ta);
    expect(f.json.mine).toEqual([]);
  });
});
