import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { register } from '../server/accounts';
import { profileView } from '../server/profile';
import { SCORE_CATEGORIES, categoryRows } from '../server/rankings';
import { GameError, createWorld, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;

describe('score categories', () => {
  let w: World; let a: Player, b: Player, c: Player;
  beforeAll(() => {
    w = createWorld({ economySpeed: 20, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
    a = register(w, 'alice', 'secret1', T0).player;
    b = register(w, 'bobby', 'secret2', T0).player;
    c = register(w, 'carol', 'secret3', T0).player;
    a.stats.battlesWon = 5; b.stats.battlesWon = 9; c.stats.battlesWon = 0;
    a.stats.moonsDestroyed = 1;
    w.planets[a.planetIds[0]].fleet = { cruiser: 100 };
    w.planets[b.planetIds[0]].defenses = { plasmaTurret: 10 };
    a.techs.energy = 12;
  });

  it('offers point and activity categories', () => {
    const ids = SCORE_CATEGORIES.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['total', 'buildings', 'research', 'fleet', 'defense', 'battles', 'moons']));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ranks every commander by a point category', () => {
    const fleet = categoryRows(w, 'fleet');
    expect(fleet.map((r) => r.username)[0]).toBe('alice');
    expect(fleet.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(fleet[0].value).toBe(fleet[0].fleet);
    expect(categoryRows(w, 'defense')[0].username).toBe('bobby');
    expect(categoryRows(w, 'research')[0].username).toBe('alice');
    expect(categoryRows(w, 'total')[0].value).toBeGreaterThanOrEqual(categoryRows(w, 'total')[1].value);
  });

  it('lists only commanders with a score in activity categories, re-ranked within the category', () => {
    const wins = categoryRows(w, 'battles');
    expect(wins.map((r) => [r.username, r.rank, r.value])).toEqual([['bobby', 1, 9], ['alice', 2, 5]]);
    expect(categoryRows(w, 'moons').map((r) => r.username)).toEqual(['alice']);
    expect(categoryRows(w, 'expeditions')).toEqual([]);
  });

  it('rejects unknown categories', () => {
    expect(() => categoryRows(w, 'nope')).toThrow(GameError);
  });

  it('builds a public profile with standing in every category and no private data', () => {
    const p = profileView(w, a.id, T0 + 60_000);
    expect(p.username).toBe('alice');
    expect(p.ranks).toHaveLength(SCORE_CATEGORIES.length);
    expect(p.ranks.find((r) => r.id === 'battles')).toMatchObject({ rank: 2, value: 5, of: 2 });
    expect(p.ranks.find((r) => r.id === 'expeditions')).toMatchObject({ rank: null, value: 0 });
    expect(p.activity).toBe('online');
    expect(p.locations).toEqual([{ id: a.planetIds[0], name: w.planets[a.planetIds[0]].name, coords: w.planets[a.planetIds[0]].coords, moon: false, look: w.planets[a.planetIds[0]].look }]);
    expect(p.points.total).toBeGreaterThan(0);
    expect(p.stats.moonsDestroyed).toBe(1);
    const json = JSON.stringify(p);
    for (const secret of ['hash', 'salt', 'resources', 'credits', 'notify', 'tributes']) expect(json).not.toContain(`"${secret}":`);
    expect(profileView(w, a.id, T0 + 8 * 24 * 3_600_000).activity).toBe('inactive');
  });

  it('shows class, faction, alliance and achievements', () => {
    a.charClass = 'general'; a.faction = 'solar'; a.achievements.moonbreaker = T0;
    const p = profileView(w, a.id, T0);
    expect(p.charClass).toBe('General');
    expect(p.faction).toBeTruthy();
    expect(p.achievements.map((x) => x.id)).toContain('moonbreaker');
    expect(p.achievementsTotal).toBeGreaterThan(p.achievements.length);
  });

  it('404s for unknown commanders', () => {
    expect(() => profileView(w, 'nobody', T0)).toThrow(/No such commander/);
  });
});

describe('standings api', () => {
  let base = '', token = '', id = '', close: () => void;
  const call = async (path: string, t = token) => {
    const r = await fetch(base + path, { headers: { authorization: `Bearer ${t}` } });
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  beforeAll(async () => {
    const w = createWorld({ economySpeed: 20, protectionPoints: 0, raidIntervalMin: 0 }, T0);
    const s = createApp(w).listen(0);
    await new Promise((r) => s.once('listening', r));
    base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    close = () => s.close();
    const reg = await (await fetch(base + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'dave', password: 'secret1' }) })).json() as any;
    token = reg.token; id = reg.player?.id ?? Object.values(w.players).find((p) => p.username === 'dave')!.id;
  });
  afterAll(() => close());

  it('serves categories and a profile', async () => {
    const h = await call('/api/highscore?cat=fleet');
    expect(h.status).toBe(200);
    expect(h.json.category).toBe('fleet');
    expect(h.json.categories.length).toBe(SCORE_CATEGORIES.length);
    expect(h.json.players[0]).toHaveProperty('value');
    expect((await call('/api/highscore')).json.category).toBe('total');
    expect((await call('/api/highscore?cat=bogus')).status).toBe(400);
    const p = await call(`/api/players/${id}`);
    expect(p.status).toBe(200);
    expect(p.json.username).toBe('dave');
    expect((await call('/api/players/nope')).status).toBe(404);
    expect((await call(`/api/players/${id}`, 'bad')).status).toBe(401);
  });
});
