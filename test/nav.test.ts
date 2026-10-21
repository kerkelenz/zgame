import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { featuresOf } from '../server/features';
import { announceInvasion, finish } from '../server/invasion';
import { createWorld, type Planet, type Player, type World } from '../server/world';
import { NAV_GROUPS, breadcrumb, groupOfPage, hubTarget, isPlanetPage, tabOfItem, visibleNav, type Features } from '../client/src/nav';

const none: Features = { automation: false, territory: false, invasion: false, simulator: false };
const ids = (f: Features | undefined, showAll = false, admin = false, current?: string) => visibleNav(f, showAll, admin, current).flatMap((g) => g.items.map((i) => i.id));

describe('the navigation', () => {
  it('lists every page exactly once, under a hub', () => {
    const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(expect.arrayContaining(['overview', 'resources', 'buildings', 'research', 'techtree', 'shipyard', 'defense', 'automation', 'fleet', 'galaxy', 'invasion', 'simulator', 'empire', 'economy', 'contracts', 'command', 'alliance', 'territory', 'contacts', 'messages', 'chat', 'highscore', 'settings', 'guide', 'news', 'admin']));
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['home', 'build', 'fleet', 'galaxy', 'inbox', 'alliance', 'more']);
  });

  it('has a page behind every entry', () => {
    const app = readFileSync('client/src/App.tsx', 'utf8');
    for (const id of NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id)).filter((x) => x !== 'overview')) expect(app, id).toContain(`case '${id}'`);
  });

  it('holds back pages until their feature is unlocked', () => {
    const base = ids(none);
    for (const hidden of ['automation', 'territory', 'invasion', 'simulator', 'admin']) expect(base, hidden).not.toContain(hidden);
    for (const shown of ['overview', 'fleet', 'galaxy', 'contracts', 'alliance', 'messages', 'settings', 'guide', 'news']) expect(base, shown).toContain(shown);
    expect(ids({ ...none, territory: true })).toContain('territory');
    expect(ids({ ...none, automation: true, invasion: true, simulator: true })).toEqual(expect.arrayContaining(['automation', 'invasion', 'simulator']));
    expect(ids(undefined)).not.toContain('automation');
  });

  it('can show everything, and always shows the page you are on', () => {
    expect(ids(none, true)).toEqual(expect.arrayContaining(['automation', 'territory', 'invasion', 'simulator']));
    expect(ids(none, false, false, 'territory')).toContain('territory');
  });

  it('shows the admin page to admins only', () => {
    expect(ids(none, false, false)).not.toContain('admin');
    expect(ids(none, false, true)).toContain('admin');
  });

  it('keeps every hub for a newcomer, each with something to show', () => {
    const groups = visibleNav(none, false, false);
    expect(groups.map((g) => g.id)).toEqual(['home', 'build', 'fleet', 'galaxy', 'inbox', 'alliance', 'more']);
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });
});

describe('the order of the Build tabs', () => {
  it('goes Buildings, Research, Shipyard, Defense, Tech tree, Lifeform, Upgrades, Tech tree, Resources, Automation', () => {
    expect(NAV_GROUPS.find((g) => g.id === 'build')!.items.map((i) => i.id)).toEqual(['buildings', 'research', 'shipyard', 'defense', 'lifeform', 'upgrades', 'techtree', 'resources', 'automation']);
  });
});

describe('which hub a page belongs to', () => {
  it('knows the hub of every tab, and of the pages that are not tabs', () => {
    expect(groupOfPage('buildings')).toBe('build');
    expect(groupOfPage('techtree')).toBe('build');
    expect(groupOfPage('messages')).toBe('inbox');
    expect(groupOfPage('highscore')).toBe('alliance');
    expect(groupOfPage('detail')).toBe('build');
    expect(groupOfPage('profile')).toBe('alliance');
    expect(groupOfPage('news')).toBe('more');
    expect(groupOfPage('who-knows')).toBe('home');
  });
  it('says whether a page is about the selected planet', () => {
    for (const p of ['overview', 'buildings', 'resources', 'research', 'shipyard', 'defense', 'fleet', 'detail']) expect(isPlanetPage(p), p).toBe(true);
    for (const p of ['empire', 'economy', 'galaxy', 'messages', 'alliance', 'settings', 'techtree']) expect(isPlanetPage(p), p).toBe(false);
  });
});

describe('where a hub takes you', () => {
  const groups = visibleNav(none, false, false);
  it('opens the first page, or the one you were last on in it when it is still there', () => {
    expect(hubTarget('build', groups, {})).toBe('buildings');
    expect(hubTarget('build', groups, { build: 'research' })).toBe('research');
    expect(hubTarget('build', groups, { build: 'automation' })).toBe('buildings');         // that page is not unlocked (any more)
    expect(hubTarget('inbox', groups, { build: 'research' })).toBe('messages');
    expect(hubTarget('nope', groups, {})).toBe('overview');
  });
});

describe('the tab an item sits under', () => {
  it('puts buildings, research, ships and defenses under their own pages', () => {
    expect(tabOfItem('metalMine')).toBe('buildings');
    expect(tabOfItem('laser')).toBe('research');
    expect(tabOfItem('cruiser')).toBe('shipyard');
    expect(tabOfItem('rocketLauncher')).toBe('defense');
    expect(tabOfItem('nope')).toBeUndefined();
    expect(tabOfItem(null)).toBeUndefined();
  });
});

describe('the breadcrumb', () => {
  it('names the hub and the tab, and the item on a details page', () => {
    expect(breadcrumb('buildings')).toEqual([{ label: 'Build', page: 'buildings' }, { label: 'Buildings' }]);
    expect(breadcrumb('detail', 'Metal Mine', 'buildings')).toEqual([{ label: 'Build', page: 'buildings' }, { label: 'Buildings', page: 'buildings' }, { label: 'Metal Mine' }]);
    expect(breadcrumb('detail', 'Metal Mine')).toEqual([{ label: 'Build', page: 'buildings' }, { label: 'Metal Mine' }]);
    expect(breadcrumb('galaxy')).toEqual([{ label: 'Galaxy', page: 'galaxy' }, { label: 'Galaxy' }]);
    expect(breadcrumb('profile', 'Alice')).toEqual([{ label: 'Alliance', page: 'alliance' }, { label: 'Standing', page: 'highscore' }, { label: 'Alice' }]);
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

describe('the Battle screen', () => {
  it('belongs to the Fleet hub and is not a tab', () => {
    expect(groupOfPage('battle')).toBe('fleet');
    expect(tabOfItem('battle')).toBeUndefined();
  });
});

describe('pages the quest line has not opened yet', () => {
  const ids = (unlocked: string[] | null | undefined, current?: string, showAll = false) => visibleNav(undefined, showAll, false, current, unlocked).flatMap((g) => g.items.map((i) => i.id));
  it('are left out of the menu until a quest opens them, and groups with nothing left vanish', () => {
    const basics = ['overview', 'buildings', 'resources', 'quests', 'messages', 'settings', 'guide', 'news'];
    const shown = ids(basics);
    expect(shown).toEqual(expect.arrayContaining(['overview', 'quests', 'buildings', 'messages', 'settings']));
    for (const hidden of ['research', 'shipyard', 'fleet', 'galaxy', 'market', 'alliance', 'command', 'chat']) expect(shown, hidden).not.toContain(hidden);
    const groups = visibleNav(undefined, false, false, undefined, basics).map((g) => g.id);
    expect(groups).toEqual(['home', 'build', 'inbox', 'more']);
    expect(ids([...basics, 'research', 'fleet'])).toEqual(expect.arrayContaining(['research', 'fleet']));
  });
  it('are all there for a veteran, for "show every page" and for the page you are on', () => {
    const all = ids(null);
    expect(all).toEqual(expect.arrayContaining(['research', 'fleet', 'galaxy', 'market', 'alliance']));
    expect(ids(undefined)).toEqual(all);
    expect(ids(['overview'], undefined, true)).toEqual(expect.arrayContaining(all));
    expect(ids(['overview'], 'fleet')).toContain('fleet');
  });
  it('leave the optional feature pages to the features, as before', () => {
    expect(ids(['overview'])).not.toContain('automation');
    expect(visibleNav({ automation: true, territory: false, invasion: false, simulator: false }, false, false, undefined, ['overview']).flatMap((g) => g.items.map((i) => i.id))).toContain('automation');
  });
});
