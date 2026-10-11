import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { createApp } from '../server/app';
import { externalNotify, resetLimits } from '../server/external';
import { MAX_SUBS, addSubscription, cleanSubscription, ensureVapid, pushToPlayer, pushView, removeSubscription, setPushSender, type PushSender } from '../server/push';
import { createWorld, type Player, type World } from '../server/world';

const T0 = Date.UTC(2026, 9, 12, 8);
const P256DH = 'B' + 'x'.repeat(86);       // a real key is 87 url-safe characters
const AUTH = 'a'.repeat(22);
const sub = (n: number, host = 'fcm.googleapis.com') => ({ endpoint: `https://${host}/fcm/send/device${n}`, keys: { p256dh: P256DH, auth: AUTH } });

let w: World; let a: Player;
let calls: { endpoint: string; payload: any; subject: string }[];
let status: (endpoint: string) => number;

beforeEach(() => {
  w = createWorld({ npcDensity: 0 }, T0);
  a = register(w, 'alice', 'secret1', T0).player;
  calls = []; status = () => 201;
  const fake: PushSender = async (s, payload, v) => { calls.push({ endpoint: s.endpoint, payload: JSON.parse(payload), subject: v.subject }); return { statusCode: status(s.endpoint) }; };
  setPushSender(fake);
  resetLimits();
});
afterEach(() => setPushSender(null));

describe('subscriptions', () => {
  it('accept real push-service endpoints with valid keys', () => {
    const c = cleanSubscription(sub(1));
    expect(c.endpoint).toBe('https://fcm.googleapis.com/fcm/send/device1');
    for (const host of ['updates.push.services.mozilla.com', 'web.push.apple.com', 'wns2-par02p.notify.windows.com']) expect(() => cleanSubscription(sub(1, host))).not.toThrow();
  });

  it('reject anything else, so the server can never be pointed at an internal address', () => {
    for (const bad of [null, {}, { endpoint: 5 }, { endpoint: 'not a url', keys: {} }, { endpoint: 'http://fcm.googleapis.com/x', keys: { p256dh: P256DH, auth: AUTH } },
      sub(1, 'localhost'), sub(1, '127.0.0.1'), sub(1, '10.0.0.5'), sub(1, '[::1]'), sub(1, 'intranet')]) {
      expect(() => cleanSubscription(bad), JSON.stringify(bad)).toThrow(/push/i);
    }
    expect(() => cleanSubscription({ endpoint: 'https://fcm.googleapis.com/x'.padEnd(700, 'a'), keys: { p256dh: P256DH, auth: AUTH } })).toThrow(/https/);
    expect(() => cleanSubscription({ ...sub(1), keys: { p256dh: 'short', auth: AUTH } })).toThrow(/keys/);
    expect(() => cleanSubscription({ ...sub(1), keys: { p256dh: P256DH, auth: 'bad auth!' } })).toThrow(/keys/);
  });

  it('are stored per player, updated in place for the same device, and capped', () => {
    addSubscription(a, sub(1), 'Chrome on Android', T0);
    addSubscription(a, sub(1), 'Chrome on Android (renamed)', T0 + 1);
    expect(a.pushSubs).toHaveLength(1);
    expect(a.pushSubs![0].label).toBe('Chrome on Android (renamed)');
    for (let i = 2; i <= MAX_SUBS + 2; i++) addSubscription(a, sub(i), 'd' + i, T0 + i);
    expect(a.pushSubs).toHaveLength(MAX_SUBS);
    expect(a.pushSubs!.some((s) => s.endpoint.endsWith('device1'))).toBe(false); // the oldest device made room
    removeSubscription(a, a.pushSubs![0].endpoint);
    expect(a.pushSubs).toHaveLength(MAX_SUBS - 1);
  });

  it('the server identity is created once and kept', () => {
    const v = ensureVapid(w);
    expect(v.publicKey.length).toBeGreaterThan(80);
    expect(ensureVapid(w)).toBe(v);
    expect(pushView(w, a).publicKey).toBe(v.publicKey);
  });
});

describe('delivery', () => {
  it('sends the message to every device with the server identity', async () => {
    addSubscription(a, sub(1), 'one', T0); addSubscription(a, sub(2), 'two', T0);
    const r = await pushToPlayer(w, a, { title: 'Attack!', body: 'A fleet is heading for you', tag: 'attacks' });
    expect(r).toEqual({ sent: 2, dropped: 0, failed: 0 });
    expect(calls.map((c) => c.endpoint).sort()).toEqual([sub(1).endpoint, sub(2).endpoint]);
    expect(calls[0].payload).toEqual({ title: 'Attack!', body: 'A fleet is heading for you', tag: 'attacks', url: '/' });
    expect(calls[0].subject).toMatch(/^mailto:|^https:/);
  });

  it('forgets devices the push service says are gone, and keeps the ones that merely failed', async () => {
    addSubscription(a, sub(1), 'gone', T0); addSubscription(a, sub(2), 'flaky', T0); addSubscription(a, sub(3), 'fine', T0);
    status = (e) => (e.endsWith('device1') ? 410 : e.endsWith('device2') ? 500 : 201);
    const r = await pushToPlayer(w, a, { title: 't', body: 'b' });
    expect(r).toEqual({ sent: 1, dropped: 1, failed: 1 });
    expect(a.pushSubs!.map((s) => s.label).sort()).toEqual(['fine', 'flaky']);
    status = () => 404;
    await pushToPlayer(w, a, { title: 't', body: 'b' });
    expect(a.pushSubs).toEqual([]);
  });

  it('trims long text so the push service accepts it', async () => {
    addSubscription(a, sub(1), 'x', T0);
    await pushToPlayer(w, a, { title: 'T'.repeat(500), body: 'B'.repeat(5000) });
    expect(calls[0].payload.title).toHaveLength(80);
    expect(calls[0].payload.body).toHaveLength(240);
  });
});

describe('through the alert settings', () => {
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('a device alone is enough to receive alerts, and the category switches apply', async () => {
    addSubscription(a, sub(1), 'phone', T0);
    a.notify.onlyWhenAway = false;
    externalNotify(w, a.id, 'attacks', 'Raid incoming!', 'Someone is coming', T0);
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0].payload).toMatchObject({ title: 'Raid incoming!', tag: 'attacks' });
    a.notify.events.messages = false;
    externalNotify(w, a.id, 'messages', 'Hello', 'a message', T0 + 1000);
    await settle();
    expect(calls).toHaveLength(1);
  });

  it('"only when away" holds push back while you are in the game', async () => {
    addSubscription(a, sub(1), 'phone', T0);
    a.notify.onlyWhenAway = true;
    a.lastSeen = T0;
    externalNotify(w, a.id, 'attacks', 'x', 'y', T0 + 30_000);
    await settle();
    expect(calls).toHaveLength(0);
    externalNotify(w, a.id, 'attacks', 'x', 'y', T0 + 10 * 60_000);
    await settle();
    expect(calls).toHaveLength(1);
  });

  it('shares the rate limit with the other channels, and does nothing without any device', async () => {
    a.notify.onlyWhenAway = false;
    externalNotify(w, a.id, 'attacks', 'x', 'y', T0);
    await settle();
    expect(calls).toHaveLength(0);
    addSubscription(a, sub(1), 'phone', T0);
    for (let i = 0; i < 12; i++) externalNotify(w, a.id, 'attacks', 'x', 'y', T0 + i);
    await settle();
    expect(calls.length).toBe(5);                                    // five per five minutes per category
  });
});

describe('api', () => {
  let base = '', close: () => void, w2: World;
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  beforeEach(async () => {
    w2 = createWorld({ npcDensity: 0, raidIntervalMin: 0 }, T0);
    const s = createApp(w2).listen(0);
    await new Promise((r) => s.once('listening', r));
    base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    close = () => s.close();
  });
  afterEach(() => close());

  it('subscribes, lists, tests and unsubscribes a device', async () => {
    const reg = (await call('POST', '/api/register', undefined, { username: 'pusher', password: 'secret1' })).json;
    expect((await call('GET', '/api/push')).status).toBe(401);
    const key = (await call('GET', '/api/push', reg.token)).json.publicKey;
    expect(key.length).toBeGreaterThan(80);
    expect((await call('POST', '/api/push/test', reg.token)).status).toBe(400);                     // no device yet
    expect((await call('POST', '/api/push/subscribe', reg.token, { subscription: { endpoint: 'http://evil.test/x', keys: {} } })).status).toBe(400);
    const ok = await call('POST', '/api/push/subscribe', reg.token, { subscription: sub(7), label: 'Pixel' });
    expect(ok.status).toBe(200);
    expect(ok.json.devices).toHaveLength(1);
    expect(ok.json.devices[0]).toMatchObject({ label: 'Pixel', full: sub(7).endpoint });
    const test = await call('POST', '/api/push/test', reg.token);
    expect(test.status).toBe(200);
    expect(test.json).toEqual({ sent: 1, dropped: 0, failed: 0 });
    expect(calls.at(-1)!.payload.title).toBe('Zgame');
    const gone = await call('POST', '/api/push/unsubscribe', reg.token, { endpoint: sub(7).endpoint });
    expect(gone.json.devices).toHaveLength(0);
  });

  it('serves the app manifest pieces without breaking the API', async () => {
    expect((await call('GET', '/api/health')).status).toBe(200);
  });
});
