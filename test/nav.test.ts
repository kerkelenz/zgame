import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { featuresOf } from '../server/features';
import { announceInvasion, finish } from '../server/invasion';
import { createWorld, type Planet, type Player, type World } from '../server/world';
import { NAV_GROUPS, groupOfPage, isOpen, visibleNav, type Features } from '../client/src/nav';

const none: Features = { automation: false, territory: false, invasion: false, simulator: false };
const ids = (f: Features | undefined, showAll = false, admin = false, current?: string) => visibleNav(f, showAll, admin, current).flatMap((g) => g.items.map((i) => i.id));

describe('the menu', () => {
  it('lists every page exactly once', () => {
    const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(expect.arrayContaining(['overview', 'resources', 'buildings', 'research', 'shipyard', 'defense', 'automation', 'fleet', 'galaxy', 'invasion', 'simulator', 'empire', 'economy', 'contracts', 'command', 'alliance', 'territory', 'contacts', 'messages', 'chat', 'highscore', 'settings', 'guide', 'admin']));
  });

  it('has a page behind every entry', () => {
    const app = readFileSync('client/src/App.tsx', 'utf8');
    for (const id of NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id)).filter((x) => x !== 'overview')) expect(app, id).toContain(`case '${id}'`);
  });

  it('holds back pages until their feature is unlocked', () => {
    const base = ids(none);
    for (const hidden of ['automation', 'territory', 'invasion', 'simulator', 'admin']) expect(base, hidden).not.toContain(hidden);
    for (const shown of ['overview', 'fleet', 'galaxy', 'contracts', 'alliance', 'messages', 'settings', 'guide']) expect(base, shown).toContain(shown);
    expect(ids({ ...none, territory: true })).toContain('territory');
    expect(ids({ ...none, automation: true, invasion: true, simulator: true })).toEqual(expect.arrayContaining(['automation', 'invasion', 'simulator']));
    expect(ids(undefined)).not.toContain('automation');                      // before the first server answer nothing optional shows
  });

  it('can show everything, and always shows the page you are on', () => {
    expect(ids(none, true)).toEqual(expect.arrayContaining(['automation', 'territory', 'invasion', 'simulator']));
    expect(ids(none, false, false, 'territory')).toContain('territory');
  });

  it('shows the admin page to admins only', () => {
    expect(ids(none, false, false)).not.toContain('admin');
    expect(ids(none, false, true)).toContain('admin');
  });

  it('drops a group that has nothing to show', () => {
    const groups = visibleNav(none, false, false);
    expect(groups.map((g) => g.id)).toEqual(['planet', 'space', 'empire', 'social', 'more']);
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });
});

describe('open and closed groups', () => {
  it('maps pages that are not in the menu to the group they were opened from', () => {
    expect(groupOfPage('buildings')).toBe('planet');
    expect(groupOfPage('highscore')).toBe('social');
    expect(groupOfPage('detail')).toBe('planet');
    expect(groupOfPage('profile')).toBe('social');
    expect(groupOfPage('news')).toBe('more');
    expect(groupOfPage('who-knows')).toBe('planet');
  });

  it('starts with only the Planet group open, remembers choices, and keeps the current group open', () => {
    expect(isOpen('planet', {}, 'overview')).toBe(true);
    expect(isOpen('space', {}, 'overview')).toBe(false);
    expect(isOpen('space', { space: false }, 'overview')).toBe(true);       // the player opened it
    expect(isOpen('planet', { planet: true }, 'overview')).toBe(true);      // the page you are on keeps its group open even if you "collapsed" it
    expect(isOpen('planet', { planet: true }, 'fleet')).toBe(false);        // but once you leave, the choice applies
    expect(isOpen('social', {}, 'profile')).toBe(true);
  });
});

describe('which pages a commander has unlocked', () => {
  let w: World; let a: Player, b: Player; let home: Planet;
  beforeEach(() => {
    w = createWorld({ npcDensity: 0, raidIntervalMin: 0, protectionPoints: 0 }, Date.UTC(2026, 9, 12));
    a = register(w, 'alice', 'secret1', Date.now()).player;
    b = register(w, 'bobby', 'secret2', Date.now()).player;
    home = w.planets[a.planetIds[0]];
    home.buildings = {};
  });

  it('a new commander sees only the basics', () => {
    expect(featuresOf(w, a)).toEqual({ automation: false, territory: false, invasion: false, simulator: false });
  });

  it('automation appears once there is an economy worth automating, or as soon as it is used', () => {
    home.buildings = { metalMine: 5, crystalMine: 4, solarPlant: 3 };
    expect(featuresOf(w, a).automation).toBe(true);                         // 12 levels
    home.buildings = { metalMine: 3 };
    expect(featuresOf(w, a).automation).toBe(false);
    a.buildOrders = [{ id: 'x', name: 'x', steps: [{ kind: 'building', id: 'metalMine', level: 2 }] }];
    expect(featuresOf(w, a).automation).toBe(true);
  });

  it('territory follows alliance membership', () => {
    AL.createAlliance(w, a, 'TEAM', 'The Team');
    expect(featuresOf(w, a).territory).toBe(true);
    expect(featuresOf(w, b).territory).toBe(false);
  });

  it('the simulator comes with a shipyard or a first battle', () => {
    home.buildings = { shipyard: 1 };
    expect(featuresOf(w, a).simulator).toBe(true);
    home.buildings = {};
    b.stats.battlesLost = 1;
    expect(featuresOf(w, b).simulator).toBe(true);
  });

  it('the invasion page shows during an event and stays for the record', () => {
    expect(featuresOf(w, a).invasion).toBe(false);
    announceInvasion(w, Date.now(), 1000);
    expect(featuresOf(w, a).invasion).toBe(true);
    finish(w, Date.now() + 5000, 'lost');
    expect(w.invasion).toBeUndefined();
    expect(featuresOf(w, a).invasion).toBe(true);                           // history remains
  });
});
