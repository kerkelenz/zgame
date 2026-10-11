import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { createApp } from '../server/app';
import {
  CATEGORIES, categoryOf, defaultNotify, externalNotify, mask, resetLimits, sendTest, setSender, validateTarget, type SendInit,
} from '../server/external';
import { processMovements, sendFleet } from '../server/fleet';
import { notifyPlayer } from '../server/messages';
import { spawnRaid } from '../server/npc';
import { GameError, createWorld, migratePlayer, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const DISCORD = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789-_ABCD';
const NTFY = 'https://ntfy.sh/my-secret-topic-123';

interface Call { url: string; init: SendInit }
let calls: Call[];
let status = 204;
let w: World;
let alice: Player, bob: Player;

beforeEach(() => {
  calls = []; status = 204; resetLimits();
  setSender(async (url, init) => { calls.push({ url, init }); return { ok: status >= 200 && status < 300, status }; });
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bob', 'secret2', T0).player;
  alice.notify.discord = DISCORD;
  alice.lastSeen = Date.now() - 3_600_000; // away
});
afterEach(() => setSender(null));
const flush = () => new Promise((r) => setTimeout(r, 5));

describe('addresses are validated against an allowlist', () => {
  it('accepts Discord webhooks and ntfy topics (bare names too) and clears on empty', () => {
    expect(validateTarget('discord', DISCORD)).toBe(DISCORD);
    expect(validateTarget('discord', 'https://ptb.discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz')).toBeTruthy();
    expect(validateTarget('ntfy', 'my-secret-topic-123')).toBe(NTFY);
    expect(validateTarget('ntfy', NTFY)).toBe(NTFY);
    expect(validateTarget('discord', '  ')).toBeNull();
    expect(validateTarget('ntfy', undefined)).toBeNull();
  });

  it('rejects anything that could make the server call somewhere else', () => {
    const bad = [
      'http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',          // not https
      'https://discord.com.evil.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz', // look-alike host
      'https://evil.com/https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',
      'https://discord.com@evil.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz', // userinfo trick
      'https://discord.com:8443/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',
      'https://discord.com/api/webhooks/123456789012345678/abc',                                  // token too short
      'https://localhost/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz',
      'https://169.254.169.254/latest/meta-data/',
      'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz/../../x',
      'file:///etc/passwd', 'javascript:alert(1)', 'x'.repeat(400),
    ];
    for (const b of bad) expect(() => validateTarget('discord', b), b.slice(0, 60)).toThrow(GameError);
    for (const b of ['https://ntfy.sh.evil.com/topictopic', 'https://evil.com/ntfy.sh/topictopic', 'http://ntfy.sh/topictopic', 'https://ntfy.sh/short', 'https://ntfy.sh/a/b/c/dddddd', 'https://ntfy.sh/topic topic', 'bad topic!']) {
      expect(() => validateTarget('ntfy', b), b).toThrow(GameError);
    }
  });

  it('masks the secret part when showing an address back', () => {
    const m = mask(DISCORD)!;
    expect(m).toContain('/api/webhooks/123456789012345678/');
    expect(m).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(m.endsWith('ABCD')).toBe(true);
    expect(mask(null)).toBeNull();
  });
});

describe('what triggers an alert', () => {
  it('maps in-game messages to categories', () => {
    expect(categoryOf('raid', 'Raid incoming!')).toBe('attacks');
    expect(categoryOf('raid', 'Ally under raid!')).toBe('allies');
    expect(categoryOf('system', 'Hostile fleet detected')).toBe('attacks');
    expect(categoryOf('system', 'Missile launch detected')).toBe('attacks');
    expect(categoryOf('system', 'Construction complete')).toBe('completions');
    expect(categoryOf('news', 'Kaxe demands tribute')).toBe('tribute');
    expect(categoryOf('news', 'Kaxe raided Bob')).toBeNull();
    expect(categoryOf('player', 'hi')).toBe('messages');
    expect(categoryOf('combat', 'Battle')).toBeNull();
  });

  it('a hostile fleet heading for you sends a Discord alert', async () => {
    bob.notify.discord = null;
    const ap = w.planets[alice.planetIds[0]], bp = w.planets[bob.planetIds[0]];
    ap.coords = { g: 1, s: 5, p: 6 }; bp.coords = { g: 1, s: 6, p: 8 };
    bp.buildings = { shipyard: 4, roboticsFactory: 3 }; bp.fleet = { cruiser: 20 };
    bp.resources = { metal: 1e6, crystal: 1e6, deuterium: 1e6 };
    bob.techs = { impulseDrive: 4, combustionDrive: 4 };
    sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { cruiser: 10 }, mission: 'attack' }, T0);
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(DISCORD);
    const body = JSON.parse(calls[0].init.body);
    expect(body.content).toContain('Hostile fleet detected');
    expect(body.content).toContain('bob');
    expect(body.allowed_mentions).toEqual({ parse: [] }); // a message can never @everyone
  });

  it('a raid on you alerts you, and a raid on an ally alerts the alliance', async () => {
    w.config.protectionPoints = 1;
    AL.createAlliance(w, alice, 'TEAM', 'The Team');
    AL.joinAlliance(w, bob, alice.allianceId!);
    bob.notify.ntfy = NTFY; bob.lastSeen = 0;
    const ap = w.planets[alice.planetIds[0]]; ap.fleet = { battleship: 100 };
    spawnRaid(w, T0, () => 0, { targetPlayerId: bob.id });
    await flush();
    const toBob = calls.find((c) => c.url === NTFY)!;
    expect(toBob.init.headers.Priority).toBe('urgent');
    expect(toBob.init.headers.Title).toMatch(/Raid incoming/);
    expect(calls.some((c) => c.url === DISCORD && /Ally under raid/.test(JSON.parse(c.init.body).content))).toBe(true);
  });

  it('an ally under attack by a player alerts you too', async () => {
    AL.createAlliance(w, alice, 'TEAM', 'The Team');
    AL.joinAlliance(w, bob, alice.allianceId!);
    const carol = register(w, 'carol', 'secret3', T0).player;
    const cp = w.planets[carol.planetIds[0]], bp = w.planets[bob.planetIds[0]];
    cp.coords = { g: 1, s: 5, p: 4 }; bp.coords = { g: 1, s: 6, p: 8 };
    w.planets[alice.planetIds[0]].coords = { g: 2, s: 30, p: 2 };         // out of the way: a random home could land on one of the spots above
    cp.buildings = { shipyard: 4, roboticsFactory: 3 }; cp.fleet = { cruiser: 10 };
    cp.resources = { metal: 1e6, crystal: 1e6, deuterium: 1e6 };
    carol.techs = { impulseDrive: 4, combustionDrive: 4 };
    sendFleet(w, carol, { fromPlanetId: cp.id, to: bp.coords, ships: { cruiser: 5 }, mission: 'attack' }, T0);
    await flush();
    expect(calls.some((c) => c.url === DISCORD && /Ally under attack/.test(JSON.parse(c.init.body).content))).toBe(true);
  });

  it('completions and tribute demands use their own switches', async () => {
    notifyPlayer(w, alice.id, 'system', 'Construction complete', 'Metal Mine is now level 3');
    await flush();
    expect(calls).toHaveLength(0); // completions are off by default
    alice.notify.events.completions = true;
    notifyPlayer(w, alice.id, 'system', 'Construction complete', 'Metal Mine is now level 3');
    notifyPlayer(w, alice.id, 'news', 'Kaxe demands tribute', 'pay up');
    await flush();
    expect(calls).toHaveLength(2);
  });
});

describe('when alerts are held back', () => {
  it('stays quiet while you are in the game, unless you turn that off', async () => {
    alice.lastSeen = Date.now();
    notifyPlayer(w, alice.id, 'raid', 'Raid incoming!', 'x');
    await flush();
    expect(calls).toHaveLength(0);
    alice.notify.onlyWhenAway = false;
    notifyPlayer(w, alice.id, 'raid', 'Raid incoming!', 'x');
    await flush();
    expect(calls).toHaveLength(1);
  });

  it('respects the per-category switch and an unconfigured player', async () => {
    alice.notify.events.attacks = false;
    notifyPlayer(w, alice.id, 'raid', 'Raid incoming!', 'x');
    await flush();
    expect(calls).toHaveLength(0);
    notifyPlayer(w, bob.id, 'raid', 'Raid incoming!', 'x'); // bob has no channel
    await flush();
    expect(calls).toHaveLength(0);
  });

  it('rate-limits floods: at most 5 per category in 5 minutes', async () => {
    for (let i = 0; i < 12; i++) externalNotify(w, alice.id, 'attacks', 'Raid', 'x', Date.now());
    await flush();
    expect(calls).toHaveLength(5);
    externalNotify(w, alice.id, 'attacks', 'Raid', 'x', Date.now() + 6 * 60_000); // window passed
    await flush();
    expect(calls).toHaveLength(6);
  });

  it('caps a player at 30 alerts an hour across categories', async () => {
    let sent = 0;
    for (const c of CATEGORIES) { alice.notify.events[c] = true; }
    const t = Date.now();
    for (let i = 0; i < 80; i++) externalNotify(w, alice.id, CATEGORIES[i % 5], 't', 'x', t + i * 6 * 60_000 / 80 * 0); // all within the same moment
    await flush();
    sent = calls.length;
    expect(sent).toBeLessThanOrEqual(25); // 5 categories x 5 each
    resetLimits();
    calls = [];
    for (let i = 0; i < 60; i++) externalNotify(w, alice.id, CATEGORIES[i % 5], 't', 'x', t + i * 50_000); // 60 alerts spread over 50 minutes: only the hourly cap bites
    await flush();
    expect(calls.length).toBe(30);
  });
});

describe('dead channels', () => {
  it('a deleted webhook is removed and you are told in-game', async () => {
    status = 404;
    notifyPlayer(w, alice.id, 'raid', 'Raid incoming!', 'x');
    await flush();
    expect(alice.notify.discord).toBeNull();
    expect(w.messages.some((m) => m.to === alice.id && /External alerts switched off/.test(m.subject))).toBe(true);
  });

  it('a temporary failure keeps the channel', async () => {
    status = 500;
    notifyPlayer(w, alice.id, 'raid', 'Raid incoming!', 'x');
    await flush();
    expect(alice.notify.discord).toBe(DISCORD);
  });
});

describe('test messages', () => {
  it('go to every configured channel and report the result', async () => {
    alice.notify.ntfy = NTFY;
    const r = await sendTest(w, alice);
    expect(r).toEqual([{ channel: 'discord', ok: true, status: 204 }, { channel: 'ntfy', ok: true, status: 204 }]);
    expect(calls).toHaveLength(2);
    status = 500;
    expect((await sendTest(w, alice)).every((x) => !x.ok)).toBe(true);
  });

  it('need a channel first, and ignore the away rule', async () => {
    await expect(sendTest(w, bob)).rejects.toThrow(/Add a Discord/);
    alice.lastSeen = Date.now();
    expect((await sendTest(w, alice))[0].ok).toBe(true);
  });
});

describe('saved settings', () => {
  it('old saves get safe defaults, and partial settings are completed', () => {
    const old = { ...alice } as Partial<Player>;
    delete old.notify;
    migratePlayer(old as Player);
    expect(old.notify).toEqual(defaultNotify());
    const partial = { ...alice, notify: { discord: DISCORD, events: { attacks: false } } } as unknown as Player;
    migratePlayer(partial);
    expect(partial.notify.events).toEqual({ attacks: false, allies: true, tribute: true, completions: false, messages: false });
    expect(partial.notify.onlyWhenAway).toBe(true);
  });
});

describe('over HTTP', () => {
  const web = createWorld({ economySpeed: 20, npcDensity: 0, raidIntervalMin: 0 });
  const server = createApp(web).listen(0);
  let base = '';
  const ready = new Promise<void>((r) => server.once('listening', () => { base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; r(); }));
  afterAll(() => server.close());
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    await ready;
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: (await res.json().catch(() => null)) as any };
  };

  it('saves, masks, validates and tests', async () => {
    const t = (await call('POST', '/api/register', undefined, { username: 'notifier', password: 'secret1' })).json.token;
    expect((await call('GET', '/api/notify', t)).json).toMatchObject({ discord: null, ntfy: null, onlyWhenAway: true });
    expect((await call('POST', '/api/notify', t, { discord: 'https://evil.com/x' })).status).toBe(400);
    const saved = await call('POST', '/api/notify', t, { discord: DISCORD, ntfy: 'my-secret-topic-123', events: { completions: true, attacks: false }, onlyWhenAway: false });
    expect(saved.status).toBe(200);
    expect(saved.json.discord).not.toContain('abcdefghijklmnop');
    expect(saved.json.events).toMatchObject({ completions: true, attacks: false, allies: true });
    expect(saved.json.onlyWhenAway).toBe(false);
    expect(JSON.stringify((await call('GET', '/api/notify', t)).json)).not.toContain('abcdefghijklmnop'); // the secret never comes back
    const test = await call('POST', '/api/notify/test', t);
    expect(test.json.results).toHaveLength(2);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect((await call('POST', '/api/notify', t, { discord: '', ntfy: '' })).json).toMatchObject({ discord: null, ntfy: null });
    expect((await call('POST', '/api/notify/test', t)).status).toBe(400); // nothing configured now
  });
});
