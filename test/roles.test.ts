import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../shared/data';
import { LADDERS, ROLES, isRole, nextForRole } from '../shared/roles';

describe('planet roles', () => {
  it('every ladder names real buildings with rising targets, and none asks for a moon-only building', () => {
    for (const r of ROLES) {
      const best: Record<string, number> = {};
      for (const [id, level] of LADDERS[r.id]) {
        expect(BUILDINGS[id], id).toBeDefined();
        expect(BUILDINGS[id].moonOnly, id).toBeFalsy();
        expect(level).toBeGreaterThanOrEqual(best[id] ?? 0);              // a building is never asked for at a lower level than before
        best[id] = level;
      }
    }
  });
  it('suggests the first step not yet reached, one level at a time, and finishes', () => {
    expect(nextForRole('mining', {})).toMatchObject({ id: 'metalMine', level: 1 });
    expect(nextForRole('mining', { metalMine: 4 })).toMatchObject({ id: 'crystalMine', level: 1 });
    expect(nextForRole('mining', { metalMine: 4, crystalMine: 3, solarPlant: 5, deuteriumSynthesizer: 3 })).toMatchObject({ id: 'metalMine', level: 5 });
    const done = Object.fromEntries(LADDERS.fleet.map(([id, l]) => [id, l]));
    expect(nextForRole('fleet', done)).toBeNull();
  });
  it('knows its own role names', () => {
    expect(isRole('mining')).toBe(true);
    expect(isRole('boss')).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});

import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll } from 'vitest';
import { createApp } from '../server/app';
import { createWorld } from '../server/world';
import { advise } from '../client/src/advice';

describe('roles over HTTP and in the advice', () => {
  let base = '', close = () => undefined as void, token = '', home = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: (await r.json().catch(() => null)) as any };
  };
  beforeAll(async () => {
    const s = createApp(createWorld({ npcDensity: 0, raidIntervalMin: 0 })).listen(0);
    await new Promise((r) => s.once('listening', r));
    base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    close = () => { s.close(); };
    const reg = await call('POST', '/api/register', { username: 'roller', password: 'secret1' });
    token = reg.json.token;
    home = (await call('GET', '/api/planets')).json[0].id;
  });
  afterAll(() => close());

  it('sets, shows and clears a role, and refuses an unknown one', async () => {
    expect((await call('POST', `/api/planets/${home}/role`, { role: 'mining' })).json.role).toBe('mining');
    expect((await call('GET', '/api/planets')).json[0].role).toBe('mining');
    expect((await call('POST', `/api/planets/${home}/role`, { role: 'banker' })).status).toBe(400);
    expect((await call('POST', `/api/planets/${home}/role`, { role: null })).json.role).toBeNull();
  });

  it('puts the suggested next building in the idle message', () => {
    const planet = { id: 'p', name: 'Home', updatedAt: 0, role: 'mining' as const, buildQueue: null, buildBacklog: [], buildings: {}, fleet: {}, defenses: {}, resources: { metal: 0, crystal: 0, deuterium: 0 }, capacity: { metal: 1e4, crystal: 1e4, deuterium: 1e4 }, production: {} };
    const a = advise({ me: { player: { research: {} } }, planets: [planet], now: 0 });
    expect(a[0].text).toMatch(/Suggested next for a mining planet: Metal Mine to level 1/);
    expect(advise({ me: { player: { research: {} } }, planets: [{ ...planet, role: null }], now: 0 })[0].text).toBe('Nothing is being built on Home.');
  });
});
