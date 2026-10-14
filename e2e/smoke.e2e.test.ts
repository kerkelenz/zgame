import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { launchBrowser, startServer, type TestServer } from './harness';
import { NAV_GROUPS } from '../client/src/nav';

/**
 * Smoke tests in a real browser against a real server: register through the form, open every page on desktop and phone,
 * and use the main features. They catch what unit tests cannot: a page that crashes, a button that does nothing, a layout that overflows.
 *   npm run e2e        (builds the client first)
 */
let server: TestServer;
let browser: Browser | null = null;
let ctx: BrowserContext;
let page: Page;
const errors: string[] = [];

const ignorable = (t: string) => /fonts\.g|net::ERR|Failed to load resource|favicon|service ?worker|ServiceWorker/i.test(t);

beforeAll(async () => {
  browser = await launchBrowser();
  if (!browser) return;
  server = await startServer();
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(`console: ${m.text()}`); });
}, 120_000);

afterAll(async () => { await browser?.close(); await server?.stop(); });

const run = (name: string, fn: () => Promise<void>) => it(name, async (ctxT) => { if (!browser) { ctxT.skip(); return; } await fn(); }, 90_000);
const noErrors = () => { expect(errors, errors.join('\n')).toEqual([]); };
const heading = () => page.locator('main h1, main h2').first();
const hubOf = (label: string) => NAV_GROUPS.find((g) => g.items.some((i) => i.label === label))!;
const go = async (label: string) => {
  // click the hub that holds the page if its tab is not showing, then the tab (a hub with one page has none)
  const hub = hubOf(label), item = hub.items.find((i) => i.label === label)!;
  const tab = page.locator('.subtabs [data-tour="nav-' + item.id + '"]');
  if (!(await tab.isVisible().catch(() => false))) await page.locator('nav [data-tour="hub-' + hub.id + '"]').click();
  if (await tab.isVisible().catch(() => false)) await tab.click();
};
const register = async (name: string) => {
  await page.goto(server.base + '/');
  await page.getByRole('button', { name: /New here\? Register/ }).click();
  await page.locator('input[autocomplete="username"]').fill(name);
  await page.locator('input[type="password"]').first().fill('correct-horse-9');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForSelector('header.top', { timeout: 20_000 });
};
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

describe('first visit', () => {
  run('a new commander registers through the real form and sees the welcome tour', async () => {
    await register('pilot_one');
    await page.waitForSelector('.tour', { timeout: 10_000 });
    expect(await page.locator('.tourbox h3').textContent()).toMatch(/Welcome/);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    expect(await page.locator('.tourbox h3').textContent()).toBe('Buildings');
    await page.getByRole('button', { name: 'Skip tour' }).click();
    await page.waitForSelector('.tour', { state: 'detached' });
    // closing the tour starts the hands-on tutorial; this account skips it so the other tests have the game to themselves
    await page.locator('.tutnote').waitFor();
    expect(await page.locator('.tutnote h3').textContent()).toBe('Your resources');
    await page.getByRole('button', { name: 'Skip tutorial' }).click();
    await page.locator('.tutnote').waitFor({ state: 'detached' });
    expect(await heading().textContent()).toMatch(/Homeworld/);
    noErrors();
  });

  run('the hands-on tutorial points at the real buttons and carries on when they are pressed', async () => {
    const c2 = await browser!.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
    const p2 = await c2.newPage();
    const title = () => p2.locator('.tutnote h3').textContent();
    try {
      await p2.goto(server.base + '/');
      await p2.getByRole('button', { name: /New here\? Register/ }).click();
      await p2.locator('input[autocomplete="username"]').fill('tutor_one');
      await p2.locator('input[type="password"]').first().fill('correct-horse-9');
      await p2.getByRole('button', { name: 'Create account' }).click();
      await p2.waitForSelector('.tour', { timeout: 20_000 });
      await p2.getByRole('button', { name: 'Skip tour' }).click();
      await p2.locator('.tutnote').waitFor();
      expect(await title()).toBe('Your resources');
      expect(await p2.locator('.tutspot').isVisible()).toBe(true);
      await p2.getByRole('button', { name: 'Next', exact: true }).click();
      await expect.poll(title).toBe('Open Buildings');
      await p2.locator('nav [data-tour="hub-build"]').click();                      // pressing the real thing moves it on
      await expect.poll(title).toBe('Build a Metal Mine');
      await p2.locator('[data-tour="build-metalMine"]').click();
      await expect.poll(title).toBe('The construction queue');
      await p2.getByRole('button', { name: 'Next', exact: true }).click();
      await expect.poll(title).toBe('Energy for the mines');
      await p2.locator('[data-tour="build-solarPlant"]').click();
      await expect.poll(title).toBe('Look inside any item');
      await p2.locator('[data-tour="link-metalMine"]').first().click();
      await expect.poll(title).toBe('Go back');
      await p2.locator('[data-tour="back"]').click();
      await expect.poll(title).toBe('Research');
      await p2.getByRole('button', { name: 'Skip tutorial' }).click();
      await p2.reload();
      await p2.waitForSelector('header.top');
      expect(await p2.locator('.tutnote').count()).toBe(0);                           // finished or skipped: it does not come back
    } finally { await c2.close(); }
  });

  run('the top bar shows the three resources with their pictures', async () => {
    expect(await page.locator('header.top .res .ri').count()).toBeGreaterThanOrEqual(3);
    expect(await page.locator('header.top .res').textContent()).toMatch(/\d/);
  });
});

describe('every page', () => {
  const PAGES = ['Overview', 'Resources', 'Buildings', 'Research', 'Tech tree', 'Shipyard', 'Defense', 'Fleet', 'Galaxy', 'Empire', 'Economy', 'Contracts', 'Command', 'Alliance', 'Contacts', 'Messages', 'Chat', 'Standing', 'Settings', 'Guide'];

  run('the menu is a handful of hubs, each with its pages as tabs, and a hub opens the page you were last on', async () => {
    await go('Overview');
    expect(await page.locator('nav .hubitem > span:nth-child(2)').allInnerTexts()).toEqual(['Home', 'Build', 'Fleet', 'Galaxy', 'Inbox', 'Alliance', 'More']);
    expect(await page.locator('nav .hubitem.active').innerText()).toMatch(/Home/);
    const navLook = await page.locator('nav').evaluate((el) => ({ bar: getComputedStyle(el).scrollbarWidth }));
    expect(navLook.bar).toBe('none');                                      // no scroll bar drawn in the menu
    await page.locator('nav [data-tour="hub-build"]').click();
    expect(await page.locator('.subtabs .subtab').allInnerTexts()).toEqual(['Buildings', 'Research', 'Shipyard', 'Defense', 'Tech tree', 'Resources']);       // in this order
    expect(await page.locator('.subtab.active').innerText()).toBe('Buildings');
    await page.locator('.subtabs [data-tour="nav-research"]').click();
    await page.locator('nav [data-tour="hub-home"]').click();
    await page.locator('nav [data-tour="hub-build"]').click();            // back to where you were in Build
    expect(await page.locator('.subtab.active').innerText()).toBe('Research');
    // an item page keeps its tab lit and shows the trail
    await page.locator('.subtabs [data-tour="nav-buildings"]').click();
    await page.locator('.items .card a.itemlink', { hasText: 'Solar Plant' }).first().click();
    await page.getByRole('heading', { name: 'Solar Plant' }).first().waitFor();
    expect(await page.locator('.subtab.active').innerText()).toBe('Buildings');
    expect(await page.locator('.crumbs').innerText()).toMatch(/Build\s*›\s*Buildings\s*›\s*Solar Plant/);
    // the planet strip shows your planets as pictures and dims on pages that are not about one planet
    expect(await page.locator('.pstrip .pchip').count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator('.pstrip .pchip.on').innerText()).toMatch(/Homeworld/);           // the name is on the chip, with the coordinates as a link
    expect(await page.locator('.pstrip .pchip.on a').count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator('.pstrip.dim').count()).toBe(0);
    await go('Empire');
    expect(await page.locator('.pstrip.dim').count()).toBe(1);
    noErrors();
  });

  run('opens without errors on a desktop', async () => {
    for (const label of PAGES) {
      await go(label);
      await heading().waitFor({ timeout: 10_000 });
      await expect.poll(async () => (await page.locator('main').innerText()).length, { message: label, timeout: 8000 }).toBeGreaterThan(40);
      expect(await page.locator('main', { hasText: /Something went wrong/i }).count(), `${label} crashed`).toBe(0);
      expect(await overflow(), `${label} scrolls sideways`).toBeLessThanOrEqual(1);
    }
    noErrors();
  });

  run('pages that are held back appear when the switch in Settings is on, and the choice survives a reload', async () => {
    const held = ['Automation', 'Territory', 'Invasion'];
    const tabs = async (label: string) => { await page.locator('nav [data-tour="hub-' + hubOf(label).id + '"]').click(); return page.locator('.subtabs .subtab', { hasText: new RegExp('^' + label) }).count(); };
    for (const label of held) expect(await tabs(label), label + ' should be hidden at first').toBe(0);
    await go('Settings');
    await page.getByLabel(/Show every page in the menu/).check();
    for (const label of held) expect(await tabs(label), label + ' should appear').toBe(1);
    await page.reload();
    await page.waitForSelector('header.top');
    expect(await tabs('Automation')).toBe(1);
    for (const label of held) { await go(label); await heading().waitFor(); expect(await page.locator('main', { hasText: /Something went wrong/i }).count(), label).toBe(0); }
    noErrors();
  });

  run('fits a phone screen: no sideways scrolling on any page', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await page.waitForSelector('header.top');
    // on a phone the side menu gives way to a bar with the five main hubs and More for the rest; the pages of a hub are tabs along the top
    expect(await page.locator('.tabbar').isVisible()).toBe(true);
    expect(await page.locator('nav [data-tour="hub-home"]').isVisible()).toBe(false);
    const bar = ['home', 'build', 'fleet', 'galaxy', 'inbox'];
    const labels = NAV_GROUPS.flatMap((g) => g.items.filter((i) => !i.admin && !i.feature).map((i) => ({ hub: g.id, id: i.id, label: i.label })));
    expect(labels.length).toBeGreaterThan(15);
    for (const l of labels) {
      if (bar.includes(l.hub)) {
        await page.locator('.tabbar [data-tour="hub-' + l.hub + '"]').click();
        const tab = page.locator('.subtabs [data-tour="nav-' + l.id + '"]');
        if (await tab.count()) await tab.click();
      } else {
        await page.locator('.tabbar button[aria-label="More"]').click();
        await page.locator('.sheet').waitFor();
        await page.locator('.sheetitems [data-tour="nav-' + l.id + '"]').click();
      }
      await heading().waitFor();
      expect(await overflow(), l.label + ' scrolls sideways on a phone').toBeLessThanOrEqual(1);
    }
    await page.locator('.tabbar button[aria-label="Fleet"]').click();
    await page.getByRole('heading', { name: 'Fleet' }).first().waitFor();
    expect(await page.locator('.tabbar button.on').innerText()).toMatch(/Fleet/);
    await page.setViewportSize({ width: 1280, height: 900 });
    noErrors();
  });
});

describe('using the game', () => {
  run('queues a building from the Buildings page and shows it under construction', async () => {
    await go('Buildings');
    const card = page.locator('.items .card', { hasText: /Metal Mine/ }).first();
    await card.getByRole('button').first().click();
    await page.getByText('Under construction').waitFor({ timeout: 10_000 });
    expect(await page.locator('main').innerText()).toMatch(/Metal Mine → level 1/);
    await page.getByText(/Add to queue/).first().waitFor();
    noErrors();
  });

  run('the tech tree shows one card per item, lights a chain, opens levels and can show only a path', async () => {
    await go('Tech tree');
    expect(await page.locator('.icard').count()).toBe(59);                  // one card per building, research, ship and defense
    expect(await page.locator('.band').count()).toBe(5);                     // rows grouped by purpose
    expect(await page.locator('.icard.ready').count()).toBeGreaterThan(5);   // what you can start right now stands out
    await page.locator('.icard', { hasText: 'Fusion Reactor' }).first().click();
    expect(await page.locator('.treeinfo').innerText()).toMatch(/Vespene Extractor to level 5/);
    expect(await page.locator('.icard.anc').count()).toBe(3);
    expect(await page.locator('.icard.dim').count()).toBeGreaterThan(40);
    expect(await page.locator('.bedge.back').count()).toBe(3);
    expect(await page.locator('.bedge').count()).toBeGreaterThan(70);        // the whole map is drawn, not only the selection
    await page.locator('.icard', { hasText: 'Energy Technology' }).first().click();
    expect(await page.locator('.ladder .pip').count()).toBeGreaterThanOrEqual(12);   // its levels open in place
    // pan with the mouse, zoom with the wheel; no scroll bars
    const tf = () => page.locator('.graph').evaluate((el) => (el as HTMLElement).style.transform);
    expect(await page.locator('.graphbox').evaluate((el) => getComputedStyle(el).overflow)).toBe('hidden');
    const before = await tf();
    const empty = await page.locator('.graphbox').evaluate((el) => {
      const r = el.getBoundingClientRect();
      for (let y = r.bottom - 10; y > r.top + 10; y -= 14) for (let x = r.left + 10; x < r.right - 10; x += 14) {
        const hit = document.elementFromPoint(x, y);
        if (hit === el || hit?.tagName.toLowerCase() === 'svg') return { x, y };
      }
      return null;
    });
    expect(empty, 'an empty spot to grab').toBeTruthy();
    const drag = async (dx: number, dy: number) => {
      await page.mouse.move(empty!.x, empty!.y);
      await page.mouse.down();
      await page.mouse.move(empty!.x + dx, empty!.y + dy, { steps: 6 });
      await page.mouse.up();
    };
    await drag(40, -30);
    if ((await tf()) === before) await drag(-40, 30);                          // the map may already be at one edge
    expect(await tf()).not.toBe(before);
    expect(await page.locator('.icard.sel').count()).toBe(1);               // a drag does not change the selection
    const panned = await tf();
    await page.mouse.wheel(0, -300);
    expect(await tf()).not.toBe(panned);
    // show only the path to a goal
    await page.locator('select[aria-label="Show only the path to an item"]').selectOption({ label: 'Deathstar' });
    await page.locator('.goalbar').waitFor();
    expect(await page.locator('.goalbar').innerText()).toMatch(/Showing only the path to Deathstar/);
    expect(await page.locator('.goalbar').innerText()).toMatch(/Next you can start/);
    const few = await page.locator('.icard').count();
    expect(few).toBeGreaterThan(5);
    expect(few).toBeLessThan(30);
    expect(await page.locator('.icard.next').count()).toBeGreaterThan(0);    // the next move is highlighted
    await page.getByRole('button', { name: 'Show everything' }).click();
    expect(await page.locator('.icard').count()).toBe(59);
    await page.getByRole('button', { name: 'Production and effects' }).click();
    expect(await page.locator('main').innerText()).toMatch(/Raised by/);
    noErrors();
  });

  run('events show the fleet and the cargo only when you point at them', async () => {
    const place = (n: string, p: number) => ({ name: n, coords: { g: 1, s: 5, p }, moon: false });
    await page.route('**/api/fleets', async (route) => {
      const r = await route.fetch(); const j = await r.json();
      j.events = [{ id: 't', at: Date.now() + 900_000, kind: 'own', step: 'arrive', projected: false, mission: 'transport', owner: { id: 'x', name: 'me', alliance: null }, from: place('Home', 3), to: place('Colony', 6), targetOwner: null, ships: 12, fleet: { smallCargo: 10, cruiser: 2 }, shipTypes: ['smallCargo', 'cruiser'], intel: 'exact', cargo: { metal: 123456, crystal: 7890, deuterium: 0 }, speedPct: 100 }];
      await route.fulfill({ response: r, json: j });
    });
    await page.reload();
    await page.waitForSelector('header.top');
    await go('Overview');
    const row = page.locator('.event.ev-own').first();
    await row.waitFor();
    expect(await row.innerText()).not.toMatch(/123,456|7,890|Small Cargo/);                       // nothing inline
    const tips = row.locator('.hovertip');
    expect(await tips.count()).toBe(2);
    await tips.nth(0).hover();
    await row.locator('.tip').nth(0).waitFor({ state: 'visible' });
    expect(await row.locator('.tip').nth(0).innerText()).toMatch(/Small Cargo\s*10/);
    expect(await row.locator('.tip').nth(0).innerText()).toMatch(/Cruiser\s*2/);
    await tips.nth(1).hover();
    await row.locator('.tip').nth(1).waitFor({ state: 'visible' });
    expect(await row.locator('.tip').nth(1).innerText()).toMatch(/123\.5K|123,456|123K/);
    expect(await row.locator('.tip').nth(1).innerText()).toMatch(/In all/);
    await page.mouse.move(5, 5);
    await row.locator('.tip').nth(1).waitFor({ state: 'hidden' });
    await page.unroute('**/api/fleets');
    await page.reload();
    await page.waitForSelector('header.top');
    noErrors();
  });

  run('a spy report has clickable coordinates and buttons that start a mission against the planet', async () => {
    await page.route('**/api/messages', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const data = { coords: { g: 1, s: 9, p: 4 }, moon: false, planet: 'Target Prime', owner: 'Victim', level: 2, resources: { metal: 5000, crystal: 3000, deuterium: 100 }, fleet: { cruiser: 4 } };
      await route.fulfill({ json: [{ id: 'sp1', to: 'x', from: null, kind: 'espionage', subject: 'Spy report Target Prime [1:9:4]', body: 'x', at: Date.now(), read: true, data }] });
    });
    await go('Messages');
    await page.locator('.msghead').first().click();
    await page.locator('.spyhead').waitFor();
    expect(await page.locator('.spyhead .plink', { hasText: '[1:9:4]' }).textContent()).toBe('[1:9:4]');
    expect(await page.locator('.spyhead .plink', { hasText: 'Target Prime' }).count()).toBe(1);                // the planet name is a link too
    await page.getByRole('button', { name: 'Attack' }).first().click();
    await page.getByRole('heading', { name: 'Fleet' }).first().waitFor();
    await page.unroute('**/api/messages');
    noErrors();
  });

  run('attacks on you are red in the events, attacks on allies are amber', async () => {
    const place = (n: string, p: number) => ({ name: n, coords: { g: 1, s: 5, p }, moon: false });
    const ev = (id: string, kind: string, at: number) => ({ id, at, kind, step: 'arrive', projected: false, mission: 'attack', owner: { id: 'q', name: 'Raider', alliance: null }, from: place('Base', 3), to: place('Target', 6), targetOwner: kind === 'allyAttack' ? { id: 'z', name: 'Friend' } : null, ships: 4, intel: 'count', shipTypes: null, fleet: null, cargo: null, speedPct: 100 });
    await page.route('**/api/fleets', async (route) => {
      const r = await route.fetch(); const j = await r.json();
      j.events = [ev('h', 'hostile', Date.now() + 600_000), ev('a', 'allyAttack', Date.now() + 700_000)];
      await route.fulfill({ response: r, json: j });
    });
    await page.reload();
    await page.waitForSelector('header.top');
    await go('Overview');
    const colour = (sel: string) => page.locator(`${sel} .evtext`).evaluate((el) => getComputedStyle(el).color);
    await page.locator('.event.ev-hostile').waitFor();
    await page.locator('.event.ev-allyAttack').waitFor();
    const red = await colour('.event.ev-hostile'), amber = await colour('.event.ev-allyAttack');
    expect(red).not.toBe(amber);
    expect(red).toBe('rgb(255, 123, 123)');
    expect(await page.locator('.event.ev-allyAttack').innerText()).toMatch(/Attack on an ally/);
    await page.unroute('**/api/fleets');
    await page.reload();                                                                    // back to the real events for the tests that follow
    await page.waitForSelector('header.top');
    noErrors();
  });

  run('number fields group the digits as you type, and the probe default is a setting', async () => {
    await go('Resources');
    const field = page.locator('input[inputmode="numeric"]').first();
    await field.click();
    await field.fill('');
    await field.pressSequentially('2000000');
    expect(await field.inputValue()).toBe('2,000,000');
    await field.press('Home');
    await field.press('Delete');
    expect(await field.inputValue()).toBe('0');                                   // 2,000,000 minus its first digit
    await go('Settings');
    const probes = page.locator('label', { hasText: 'Spy probes to send' }).locator('input');
    expect(await probes.inputValue()).toBe('1');                                  // the default
    await probes.fill('');
    await probes.pressSequentially('6');
    await page.reload();
    await page.waitForSelector('header.top');
    await go('Settings');
    expect(await page.locator('label', { hasText: 'Spy probes to send' }).locator('input').inputValue()).toBe('6');
    noErrors();
  });

  run('the overview lists fleet events and the list can be hidden', async () => {
    await go('Overview');
    await page.getByRole('heading', { name: /^Events/ }).waitFor();
    expect(await page.locator('main').innerText()).toMatch(/Nothing is moving/);
    await page.locator('.card', { hasText: 'Events' }).getByRole('button', { name: 'Hide' }).click();
    expect(await page.locator('main').innerText()).not.toMatch(/Nothing is moving/);
    await page.reload();
    await page.waitForSelector('header.top');
    await go('Overview');
    expect(await page.locator('main').innerText()).not.toMatch(/Nothing is moving/);          // the choice is remembered
    await page.locator('.card', { hasText: 'Events' }).getByRole('button', { name: 'Show' }).click();
    expect(await page.locator('main').innerText()).toMatch(/Nothing is moving/);
    noErrors();
  });

  run('the overview shows the Moon Forge card with its requirements once there is a debris field to use', async () => {
    await page.route('**/api/planets', async (route) => {
      const r = await route.fetch(); const j = await r.json();
      j[0].forge = { hours: 12, requirements: [{ label: 'Graviton Technology 1', ok: false }, { label: 'Shipyard 12 on this planet', ok: false }, { label: 'A debris field of 1,000,000 above it (now 1,200,000)', ok: true }, { label: 'No moon over this planet yet', ok: true }], debris: { metal: 800000, crystal: 400000 }, cost: { metal: 300000, crystal: 300000, deuterium: 1200000 }, diameter: 3500, running: null, hasMoon: false, relevant: true };
      await route.fulfill({ response: r, json: j });
    });
    await page.reload();
    await page.waitForSelector('header.top');
    await go('Overview');
    await page.getByRole('heading', { name: 'Moon Forge' }).waitFor({ timeout: 10_000 });
    expect(await page.locator('.reqlist li').count()).toBe(4);
    expect(await page.locator('.reqlist li.bad').count()).toBe(2);
    expect(await page.getByRole('button', { name: 'Forge a moon' }).isDisabled()).toBe(true);        // requirements are not met
    expect(await page.locator('main').innerText()).toMatch(/3,500 km|3\.5K km|3500 km/);
    await page.unroute('**/api/planets');
    noErrors();
  });

  run('queue pages show the time of every job and of the whole queue', async () => {
    // a running job and two queued ones, set up through the planet answer (the test world builds too fast to catch a real queue)
    await page.route('**/api/planets', async (route) => {
      const r = await route.fetch(); const j = await r.json();
      j[0].buildQueue = { id: 'metalMine', level: 2, start: Date.now(), end: Date.now() + 600_000, cost: { metal: 0, crystal: 0, deuterium: 0 } };
      j[0].buildBacklog = ['crystalMine', 'solarPlant'];
      await route.fulfill({ response: r, json: j });
    });
    await page.reload();
    await page.waitForSelector('header.top');
    await go('Buildings');
    await page.getByText(/Whole queue, including the running job: about/).waitFor({ timeout: 10_000 });
    expect(await page.locator('main').innerText()).toMatch(/1\.\s+Crystal Mine\s*·\s*\d/);
    expect(await page.locator('main').innerText()).toMatch(/2\.\s+Solar Plant\s*·\s*\d/);
    const total = await page.locator('.qtotal b').first().innerText();
    expect(total).toMatch(/\d/);
    expect(total).toMatch(/m|h|s/);
    await page.unroute('**/api/planets');
    await page.reload();
    await page.waitForSelector('header.top');
    noErrors();
  });

  run('the standing shows the change in points and places since the daily snapshot', async () => {
    await go('Standing');
    await page.getByRole('columnheader', { name: '24 h' }).waitFor({ timeout: 10_000 });
    await page.getByRole('columnheader', { name: 'Place' }).waitFor();
    expect(await page.locator('main').innerText()).toMatch(/refreshed once every 24 hours/);
    noErrors();
  });

  run('a battle message shows the result only; the full report with every round opens in a popup', async () => {
    const side = (name: string, before: object, after: object) => ({ name, before, after, lost: {} });
    const data = {
      coords: { g: 1, s: 4, p: 7 }, planet: 'Target', rounds: 3, winner: 'attacker', debris: { metal: 90000, crystal: 40000 }, loot: { metal: 1000, crystal: 500, deuterium: 0 }, bounty: 0,
      moon: { chance: 0.13, formed: false, field: 130000 },
      attackers: [side('Raider', { cruiser: 10 }, { cruiser: 8 })], defenders: [side('Victim', { lightFighter: 20 }, { lightFighter: 0 })],
      roundLog: [{ a: { cruiser: 10 }, d: { lightFighter: 20 } }, { a: { cruiser: 9 }, d: { lightFighter: 9 } }, { a: { cruiser: 9 }, d: { lightFighter: 2 } }, { a: { cruiser: 8 }, d: {} }],
      roundStats: [1, 2, 3].map((n) => ({ attackers: { shots: 10 * n, damage: 5000 * n, absorbed: 1200 * n, hullDamage: 3800 * n, destroyed: n }, defenders: { shots: 20, damage: 800, absorbed: 100, hullDamage: 700, destroyed: 1 } })),
    };
    await page.route('**/api/messages', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ json: [{ id: 'bt1', to: 'x', from: null, kind: 'combat', subject: 'Battle at Target [1:4:7]: Attacker victory', body: 'x', at: Date.now(), read: true, data }] });
    });
    await go('Messages');
    await page.locator('.msghead').first().click();
    const body = page.locator('.msgbody');
    await body.waitFor();
    expect(await body.innerText()).toMatch(/Attacker won/);
    expect(await body.innerText()).toMatch(/No moon formed\. The chance from the 130,000 of debris above this planet was 13%/);
    expect(await body.locator('table.rounds').count()).toBe(0);                     // no round table in the message itself
    await body.getByRole('button', { name: 'Full battle report' }).click();
    const modal = page.locator('.modal');
    await modal.waitFor();
    expect(await modal.locator('table.rounds').count()).toBe(2);
    expect(await modal.innerText()).toMatch(/Absorbed by shields/);
    expect(await modal.innerText()).toMatch(/To hulls/);
    expect(await modal.locator('tbody tr').count()).toBeGreaterThanOrEqual(8);       // three rounds, the total, and the units left each round
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'detached' });
    await page.unroute('**/api/messages');
    noErrors();
  });

  run('a battle can be watched as an animated replay with play, pause, rounds and speed', async () => {
    const side = (name: string, before: object, after: object) => ({ name, before, after, lost: {} });
    const st = (n: number) => ({ attackers: { shots: 10 * n, damage: 5000 * n, absorbed: 1200 * n, hullDamage: 3800 * n, destroyed: n }, defenders: { shots: 20, damage: 800, absorbed: 100, hullDamage: 700, destroyed: 1 } });
    const data = {
      coords: { g: 1, s: 4, p: 7 }, planet: 'Target', rounds: 3, winner: 'attacker', debris: { metal: 90000, crystal: 40000 }, loot: { metal: 1000, crystal: 500, deuterium: 0 }, bounty: 0,
      attackers: [side('Raider', { cruiser: 10 }, { cruiser: 8 })], defenders: [side('Victim', { lightFighter: 20, rocketLauncher: 6 }, { lightFighter: 0, rocketLauncher: 0 })],
      roundLog: [{ a: { cruiser: 10 }, d: { lightFighter: 20, rocketLauncher: 6 } }, { a: { cruiser: 9 }, d: { lightFighter: 9, rocketLauncher: 4 } }, { a: { cruiser: 9 }, d: { lightFighter: 2, rocketLauncher: 1 } }, { a: { cruiser: 8 }, d: {} }],
      roundStats: [1, 2, 3].map(st),
    };
    await page.route('**/api/messages', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ json: [{ id: 'bt2', to: 'x', from: null, kind: 'combat', subject: 'Battle at Target [1:4:7]: Attacker victory', body: 'x', at: Date.now(), read: true, data }] });
    });
    await go('Overview');                                  // the list is read afresh each time the page opens
    await go('Messages');
    await page.locator('.msghead').first().click();
    await page.locator('.msgbody').getByRole('button', { name: /Watch the replay/ }).click();
    const modal = page.locator('.modal');
    await modal.locator('.replay canvas').waitFor();
    // something is drawn: the canvas is not one flat colour
    const colours = async () => page.evaluate(() => {
      const c = document.querySelector('.replay canvas') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const seen = new Set<number>();
      for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      return seen.size;
    });
    await expect.poll(colours, { timeout: 10_000 }).toBeGreaterThan(20);
    await modal.getByRole('button', { name: 'Pause', exact: true }).click();
    await modal.getByRole('button', { name: 'Next round' }).click();
    await expect.poll(() => modal.locator('.replay p').innerText()).toMatch(/^Round 1: attackers fired 10 shots/);
    await modal.getByRole('button', { name: 'Next round' }).click();
    await expect.poll(() => modal.locator('.replay p').innerText()).toMatch(/^Round 2: attackers fired 20 shots/);
    await modal.getByLabel('Speed').selectOption('4');
    await modal.getByRole('button', { name: 'Play', exact: true }).click();
    await modal.getByRole('button', { name: /again/i }).waitFor({ timeout: 20_000 });      // at 4x it runs to the end and offers to watch again
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'detached' });
    await page.unroute('**/api/messages');
    noErrors();
  });

  run('the details page explains what an item does, colours what each level changes and shows engine changes', async () => {
    await go('Buildings');
    await page.locator('.items .card a.itemlink', { hasText: 'Fusion Reactor' }).first().click();
    await page.getByRole('heading', { name: 'Fusion Reactor' }).first().waitFor();
    expect(await page.locator('.explain').innerText()).toMatch(/Burns vespene gas to make a large amount of energy/);
    expect(await page.locator('.explain .tips li').count()).toBeGreaterThanOrEqual(1);
    expect(await page.locator('.chg.good').count()).toBeGreaterThanOrEqual(1);                  // more energy is good news
    expect(await page.locator('.chg.bad').count()).toBeGreaterThanOrEqual(1);                   // more gas burned is bad news
    await page.getByRole('button', { name: '← Back' }).click();
    await go('Shipyard');
    await page.locator('.items .card a.itemlink', { hasText: 'Bomber' }).first().click();
    await page.getByRole('heading', { name: 'Bomber' }).first().waitFor();
    expect(await page.locator('.specials').innerText()).toMatch(/Changes engine: from Hyperspace Drive level 8/);
    expect(await page.locator('.specials').innerText()).toMatch(/5,000|5K|5000/);
    expect(await page.locator('.specials li.good').count()).toBeGreaterThanOrEqual(1);          // rapid fire against defenses
    expect(await page.locator('main').innerText()).toMatch(/Speed by Hyperspace Drive level/);
    await page.getByRole('button', { name: '← Back' }).click();
    noErrors();
  });

  run('coordinates, player names and planet names in messages and reports are working links', async () => {
    const me = await page.evaluate(async () => { const t = localStorage.getItem('zg.token'); return (await (await fetch('/api/me', { headers: { authorization: `Bearer ${t}` } })).json()); });
    const id = me.player.id as string, name = me.player.username as string;
    const side = (owner: string | null, n: string) => ({ name: n, owner, before: { cruiser: 2 }, after: { cruiser: 1 }, lost: {} });
    const battle = { coords: { g: 1, s: 4, p: 7 }, planet: 'Target Prime', rounds: 2, winner: 'attacker', debris: { metal: 0, crystal: 0 }, loot: { metal: 0, crystal: 0, deuterium: 0 }, bounty: 0, moon: null, attackers: [side(id, name)], defenders: [side(null, 'Raiders')], roundLog: [], roundStats: [] };
    await page.route('**/api/messages', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ json: [
        { id: 'm1', to: id, from: null, kind: 'system', subject: `${name} found something at [2:9:3]`, body: `Report: ${name} left [1:4:7] and reached [2:9:3].`, at: Date.now(), read: true },
        { id: 'm2', to: id, from: null, kind: 'combat', subject: 'Battle at Target Prime [1:4:7]', body: 'x', at: Date.now(), read: true, data: battle },
      ] });
    });
    await go('Messages');
    // the subject line: a name and a coordinate, both links; clicking the coordinate opens the galaxy at that system
    const first = page.locator('.msg').first();
    await first.waitFor();
    await expect.poll(() => first.locator('.msghead a.plink').count(), { timeout: 10_000 }).toBe(2);        // the name list loads a moment after the page
    expect(await first.locator('.msghead a.plink', { hasText: '[2:9:3]' }).count()).toBe(1);
    await first.locator('.msghead a.plink', { hasText: '[2:9:3]' }).click();
    await page.locator('table.galaxy').waitFor();
    expect(await page.locator('main').innerText()).toMatch(/Galaxy 2/);                              // the galaxy of that coordinate
    expect(await page.locator('main input[type="number"]').first().inputValue()).toBe('9');                 // and its system
    // the body of a message: every name and coordinate in the text is a link, and a name opens the profile
    await go('Messages');
    await page.locator('.msg').first().locator('.msghead').click();
    const links = page.locator('.msg').first().locator('.msgbody a.plink');
    await expect.poll(() => links.count(), { timeout: 10_000 }).toBe(3);                                                // the name and two coordinates
    await links.first().click();
    await page.getByText('← Back').waitFor();
    expect(await page.locator('main h1, main h2').first().textContent()).toBe(name);
    // the battle report: the planet, its coordinates and the commanders on each side are links
    await page.getByRole('button', { name: '← Back' }).click();
    await go('Messages');
    await page.locator('.msg').nth(1).locator('.msghead').click();
    const report = page.locator('.msg').nth(1).locator('.msgbody');
    expect(await report.locator('a.plink', { hasText: 'Target Prime' }).count()).toBe(1);
    expect(await report.locator('a.plink', { hasText: '[1:4:7]' }).count()).toBe(1);
    expect(await report.locator('a.plink', { hasText: name }).count()).toBeGreaterThanOrEqual(1);
    await page.unroute('**/api/messages');
    noErrors();
  });

  run('a building level can be demolished from the Buildings page and the details page', async () => {
    await go('Buildings');
    const card = page.locator('.items .card', { hasText: 'Solar Plant' }).first();
    // make sure there is a level to take down (the test world builds in seconds)
    await expect.poll(async () => (await card.innerText()).match(/Solar Plant\s*(\d+)/)?.[1] ?? '0', { timeout: 5000 }).toMatch(/\d/);
    if ((await card.innerText()).match(/Solar Plant\s*(\d+)/)?.[1] === '0') {
      await card.getByRole('button').first().click();
      await expect.poll(async () => (await page.locator('.items .card', { hasText: 'Solar Plant' }).first().innerText()).match(/Solar Plant\s*(\d+)/)?.[1], { timeout: 15_000 }).not.toBe('0');
    }
    page.once('dialog', (d) => void d.accept());
    const demolish = page.locator('.items .card', { hasText: 'Solar Plant' }).first().getByRole('button', { name: 'Demolish a level' });
    await expect.poll(() => demolish.isEnabled(), { timeout: 25_000 }).toBe(true);                  // earlier tests may still have a building running
    await demolish.click();
    await page.locator('.toast', { hasText: 'demolition started' }).waitFor({ timeout: 10_000 });
    // the details page offers it too
    await page.locator('.items .card a.itemlink', { hasText: 'Solar Plant' }).first().click();
    await page.getByRole('heading', { name: 'Solar Plant' }).first().waitFor();
    expect(await page.locator('main').innerText()).toMatch(/Demolish level \d+|returns about 30%/);
    await page.getByRole('button', { name: '← Back' }).click();
    noErrors();
  });

  run('Back and Forward move between pages, and a refresh keeps the place', async () => {
    await go('Buildings');
    await page.locator('.items .card a.itemlink', { hasText: 'Solar Plant' }).first().click();
    await page.getByRole('heading', { name: 'Solar Plant' }).first().waitFor();
    expect(await page.evaluate(() => location.hash)).toBe('#/item/solarPlant');
    await page.goBack();
    await page.getByRole('heading', { name: 'Buildings' }).first().waitFor();
    expect(await page.evaluate(() => location.hash)).toBe('#/buildings');
    await page.goForward();
    await page.getByRole('heading', { name: 'Solar Plant' }).first().waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Solar Plant' }).first().waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: '← Back' }).click();
    await page.getByRole('heading', { name: 'Buildings' }).first().waitFor();
    noErrors();
  });

  run('the planet bar and the tabs stay at the top while the page scrolls', async () => {
    await go('Buildings');
    await page.locator('.items .card').first().waitFor();
    const at = () => page.evaluate(() => {
      const m = document.querySelector('main')!, s = document.querySelector('.navstick')!;
      return { gap: Math.round(s.getBoundingClientRect().top - m.getBoundingClientRect().top), scrolled: m.scrollTop, room: m.scrollHeight - m.clientHeight };
    });
    const before = await at();
    expect(before.room).toBeGreaterThan(300);                                   // the page is longer than the screen
    await page.evaluate(() => { const m = document.querySelector('main')!; m.scrollTop = m.scrollHeight; });
    await expect.poll(async () => (await at()).scrolled).toBeGreaterThan(300);
    const after = await at();
    expect(Math.abs(after.gap)).toBeLessThanOrEqual(2);                         // still flush with the top of the page area
    expect(await page.locator('.navstick .subtab.active').isVisible()).toBe(true);
    expect(await page.locator('.navstick .pchip.on').isVisible()).toBe(true);
    expect(await page.locator('.navstick.compact').count()).toBe(1);            // and slimmed down
    await page.evaluate(() => { document.querySelector('main')!.scrollTop = 0; });
    await expect.poll(() => page.locator('.navstick.compact').count()).toBe(0);
    noErrors();
  });

  run('Ctrl+K jumps to any item, and g then a letter opens a page', async () => {
    await page.keyboard.press('Control+k');
    await page.locator('.palette input').waitFor();
    expect(await page.locator('.palhelp').innerText()).toMatch(/Ctrl[+]K/);
    await page.locator('.palette input').fill('cruis');
    await page.locator('.palresults li', { hasText: 'Cruiser' }).first().waitFor();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Cruiser' }).first().waitFor();
    expect(await page.evaluate(() => location.hash)).toBe('#/item/cruiser');
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('g');
    await page.keyboard.press('f');
    await page.getByRole('heading', { name: 'Fleet' }).first().waitFor();
    await page.keyboard.press('Control+k');
    await page.locator('.palette input').fill('1:1:5');
    await page.locator('.palresults li', { hasText: 'Open the galaxy at' }).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.palette').waitFor({ state: 'detached' });
    noErrors();
  });

  run('Only what I can start now hides the rest, and a card you cannot pay says when you can', async () => {
    await go('Buildings');
    const all = await page.locator('.items .card').count();
    expect(await page.locator('main').innerText()).toMatch(/Affordable in|Does not fit the storage|no income/);
    await page.getByText('Only what I can start now').click();
    await expect.poll(() => page.locator('.items .card').count()).toBeLessThan(all);
    for (const b of await page.locator('.items .card button.primary').all()) expect(await b.isEnabled()).toBe(true);
    await page.getByText('Only what I can start now').click();
    await expect.poll(() => page.locator('.items .card').count()).toBe(all);
    noErrors();
  });

  run('cancelling a build offers Undo, and the bell keeps what the pop-ups said', async () => {
    await go('Buildings');
    await page.locator('.items .card', { hasText: 'Crystal Mine' }).first().getByRole('button', { name: /^(Build|Upgrade|Add to queue)/ }).click();
    await page.getByText('Under construction').waitFor({ timeout: 10_000 });
    await page.locator('section.card', { hasText: 'Under construction' }).getByRole('button', { name: 'Cancel' }).click();
    await page.locator('.toast', { hasText: 'Cancelled' }).getByRole('button', { name: 'Undo' }).click();
    await page.getByText('Under construction').waitFor({ timeout: 10_000 });
    await page.locator('.bell > button').click();
    await page.locator('.bellpanel').waitFor();
    expect(await page.locator('.bellpanel').innerText()).toMatch(/Cancelled/);
    await page.locator('.bellpanel').getByRole('button', { name: 'Clear' }).click();
    await page.locator('.bellpanel').waitFor({ state: 'detached' });
    noErrors();
  });

  run('the message options in Settings are saved', async () => {
    await go('Settings');
    const quiet = page.getByLabel(/No messages when something finishes/);
    const news = page.getByLabel(/News about other commanders/);
    expect(await quiet.isChecked()).toBe(false);
    expect(await news.isChecked()).toBe(false);                                   // off by default
    await quiet.click();
    await expect.poll(() => quiet.isChecked()).toBe(true);                       // saved on the server, then the page refreshes
    await news.click();
    await expect.poll(() => news.isChecked()).toBe(true);
    await page.reload();
    await page.waitForSelector('header.top');
    await go('Settings');
    expect(await page.getByLabel(/No messages when something finishes/).isChecked()).toBe(true);
    expect(await page.getByLabel(/News about other commanders/).isChecked()).toBe(true);
    await page.getByLabel(/No messages when something finishes/).click();
    await page.getByLabel(/News about other commanders/).click();
    await expect.poll(() => page.getByLabel(/News about other commanders/).isChecked()).toBe(false);
    noErrors();
  });

  run('runs a ready-made build order from the Automation page', async () => {
    await go('Automation');
    await page.locator('.row', { hasText: 'Colony starter' }).getByRole('button', { name: 'Run here' }).click();
    await page.locator('.plan').waitFor({ timeout: 10_000 });
    expect(await page.locator('.plan').innerText()).toMatch(/Colony starter/);
    await page.locator('.plan').getByRole('button', { name: 'Stop' }).click();
    await page.locator('.plan').waitFor({ state: 'detached' });
    noErrors();
  });

  run('shows the contracts board and the guide, whose contents links jump', async () => {
    await go('Contracts');
    await page.getByText('Today').first().waitFor();
    expect(await page.locator('.contract').count()).toBeGreaterThanOrEqual(3);
    await go('Guide');
    await page.getByRole('button', { name: 'Territory: holding systems' }).click();
    const top = await page.locator('#guide-territory').evaluate((el) => Math.round(el.getBoundingClientRect().top));
    expect(Math.abs(top)).toBeLessThan(400);
    noErrors();
  });

  run('founds an alliance and posts on its bulletin board', async () => {
    await go('Alliance');
    await page.getByPlaceholder('TAG (3-8)').fill('PIL');
    await page.getByPlaceholder('Alliance name').fill('Pilots United');
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByText('[PIL] Pilots United').first().waitFor({ timeout: 10_000 });
    await page.getByPlaceholder('Post to the board').fill('Rally at dawn');
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await page.getByText('Rally at dawn').waitFor();
    // the territory page now exists for an alliance member
    expect(await page.locator('.subtabs [data-tour="nav-territory"]').count()).toBe(1);
    noErrors();
  });

  run('the galaxy has a Recycle button where there is debris, which opens the Fleet page', async () => {
    // put a debris field on one position and on the commander's own planet by editing the galaxy answer
    await page.route('**/api/galaxy/*/*', async (route) => {
      const r = await route.fetch(); const j = await r.json();
      const mineSlot = j.slots.find((x: any) => x.planet?.mine), empty = j.slots.find((x: any) => !x.planet);
      for (const sl of [mineSlot, empty]) if (sl) sl.debris = { metal: 40_000, crystal: 12_000 };
      await route.fulfill({ response: r, json: j });
    });
    await go('Galaxy');
    await page.locator('table.galaxy').waitFor();
    const row = page.locator('table.galaxy tbody tr.mine');
    await row.getByRole('button', { name: 'Recycle' }).waitFor();
    expect(await page.getByRole('button', { name: 'Recycle' }).count()).toBeGreaterThanOrEqual(2);     // on your own planet's field and on an empty position
    await row.getByRole('button', { name: 'Recycle' }).click();
    await page.getByRole('heading', { name: 'Fleet' }).first().waitFor();
    expect(await page.locator('main').innerText()).toMatch(/Send fleet from/);                         // the button leads to the Fleet page
    await page.unroute('**/api/galaxy/*/*');
    noErrors();
  });

  run('searching for a player by name opens their profile', async () => {
    await fetch(server.base + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'Searchable_Sam', password: 'correct-horse-9' }) });
    await go('Overview');
    const box = page.getByLabel('Search players');
    await box.fill('s');
    await page.waitForTimeout(400);
    expect(await page.locator('.psresults').count()).toBe(0);                      // one character is too few
    await box.fill('searchab');
    await page.locator('.psresults li', { hasText: 'Searchable_Sam' }).waitFor({ timeout: 10_000 });
    await box.press('ArrowDown');
    await box.press('Enter');
    await page.getByText('← Back').waitFor({ timeout: 10_000 });
    expect(await page.locator('main h1, main h2').first().textContent()).toBe('Searchable_Sam');
    expect(await box.inputValue()).toBe('');                                       // the box clears after choosing
    await box.fill('nobody_called_this');
    await page.getByText('No commander found').waitFor({ timeout: 10_000 });
    await box.press('Escape');
    // a server that does not know the search yet says so instead of just claiming nobody exists
    await page.route('**/api/search/players*', (route) => route.fulfill({ status: 404, json: { error: 'Not found' } }));
    await box.fill('anything');
    await page.getByText(/Search failed: Not found \(the server may need a restart\)/).waitFor({ timeout: 10_000 });
    await page.unroute('**/api/search/players*');
    await box.fill('');
    noErrors();
  });

  run('the galaxy lists the commander\'s own planet and opens its profile', async () => {
    await go('Galaxy');
    await page.locator('table.galaxy').waitFor();
    await page.locator('table.galaxy a.plink', { hasText: /^pilot_one$/ }).click();
    await page.getByText('← Back').waitFor();
    expect(await heading().textContent()).toBe('pilot_one');
    await page.getByRole('button', { name: '← Back' }).click();
    await page.locator('table.galaxy').waitFor();
    noErrors();
  });
});

describe('advice, planners and alliance tools', () => {
  run('the Overview offers a role, and the Empire page shows it as a badge', async () => {
    await go('Overview');
    await page.getByLabel('What this planet is for').selectOption('mining');
    await expect.poll(() => page.getByLabel('What this planet is for').inputValue()).toBe('mining');
    await go('Empire');
    await page.locator('table.table .tag', { hasText: 'Mining' }).first().waitFor({ timeout: 10_000 });
    noErrors();
  });

  run('Share this planet gives a link that opens a public card', async () => {
    await go('Overview');
    let url = '';
    page.once('dialog', (d) => { url = d.defaultValue(); void d.accept(); });       // the clipboard is not always allowed: the page then shows the link
    await page.getByRole('button', { name: /Share this (planet|moon)/ }).click();
    await expect.poll(async () => url || (await page.locator('.toast', { hasText: 'Link copied' }).textContent().catch(() => '')) || '', { timeout: 10_000 }).toMatch(/\?report=p/);
    const link = url || ((await page.locator('.toast', { hasText: 'Link copied' }).textContent()) ?? '').replace(/^.*?(http\S+).*$/, '$1');
    const card = await ctx.newPage();
    await card.goto(link);
    await card.getByText('Buildings', { exact: true }).waitFor({ timeout: 10_000 });
    expect(await card.locator('.card').innerText()).toMatch(/pilot_one/);
    await card.close();
    noErrors();
  });

  run('the Shipyard has a planner and the Defense page a defense advisor', async () => {
    await go('Shipyard');
    await page.getByRole('heading', { name: 'Planner' }).waitFor();
    expect(await page.locator('main').innerText()).toMatch(/In all/);
    await go('Defense');
    await page.getByRole('heading', { name: 'Defense advisor' }).waitFor();
    await page.getByRole('button', { name: /^Check / }).click();
    await page.getByText('Small raid').waitFor({ timeout: 30_000 });
    expect(await page.locator('main').innerText()).toMatch(/Large raid[\s\S]*(Holds|Could go either way|Falls)/);
    noErrors();
  });

  run('an alliance plans an operation and shows its activity feed', async () => {
    await go('Alliance');
    await page.getByRole('heading', { name: 'Operations' }).waitFor();
    await page.getByLabel('Operation name').fill('Dawn strike');
    await page.getByRole('button', { name: 'Plan it' }).click();
    await page.getByText('Dawn strike').first().waitFor({ timeout: 10_000 });
    expect(await page.locator('main').innerText()).toMatch(/0 signed up/);
    await page.getByRole('heading', { name: 'Activity' }).waitFor();
    await page.getByLabel('Filter the feed').selectOption('help');
    noErrors();
  });

  run('active expeditions are drawn as a chart with a timeline for each', async () => {
    const now = Date.now(), H = 3_600_000;
    const mk = (id: string, phase: string, extra: object) => ({ id, mission: 'expedition', phase, from: { g: 1, s: 5, p: 6 }, to: { g: 1, s: 5, p: 16 }, ships: { largeCargo: 4, pathfinder: 1 }, flightMs: H, holdHours: 2, speedPct: 100, ownerName: 'x', ...extra });
    const mine = [
      mk('e1', 'outbound', { departAt: now - H / 2, arriveAt: now + H / 2 }),
      mk('e2', 'holding', { departAt: now - 2 * H, arriveAt: now - H, holdUntil: now + H }),
      mk('e3', 'returning', { departAt: now - 4 * H, arriveAt: now - 3 * H, holdUntil: now - 2 * H, returnAt: now + H / 2, cargo: { metal: 12000, crystal: 3000, deuterium: 0 } }),
    ];
    await page.route('**/api/fleets', async (route) => { await route.fulfill({ json: { mine, incoming: [], stationed: [], joinable: [], events: [] } }); });
    await page.reload();
    await go('Fleet');
    await page.locator('.expmap svg').waitFor({ timeout: 15_000 });
    expect(await page.locator('.expfleet').count()).toBe(3);
    const text = await page.locator('.expmap').innerText();
    expect(text).toMatch(/Flying out/); expect(text).toMatch(/Exploring/); expect(text).toMatch(/Coming home/);
    expect(await page.locator('.expfleet .nowmark').count()).toBe(3);
    expect(await page.locator('.expfleet button', { hasText: 'Recall' }).count()).toBe(2);       // a fleet already coming home cannot be recalled
    expect(await page.locator('.expmap svg foreignObject a').count()).toBe(3);                    // every target is a link
    await page.unroute('**/api/fleets');
    await page.reload();
    noErrors();
  });

  run('the tech tree cards can be walked with the arrow keys', async () => {
    await go('Tech tree');
    await page.locator('.icard').first().waitFor();
    const first = page.locator('.icard').first();
    await first.focus();
    const before = await page.evaluate(() => document.activeElement?.id);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).not.toBe(before);
    expect(await page.locator('.icard[aria-label*="ready to start"], .icard[aria-label*="locked"], .icard[aria-label*="you have it"]').count()).toBeGreaterThan(20);
    noErrors();
  });
});

describe('alliance war', () => {
  const api = async (path: string, token: string | null, body?: unknown) => {
    const r = await fetch(server.base + '/api' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return r.json() as Promise<any>;
  };

  run('declares a war from the Alliance page, shows the live score and a concession ends it', async () => {
    const mk = async (name: string) => (await api('/register', null, { username: name, password: 'correct-horse-9' })).token as string;
    const ally = await mk('wingman'), foe1 = await mk('rival_one'), foe2 = await mk('rival_two');
    const mine = await api('/alliance', await page.evaluate(() => localStorage.getItem('zg.token')));
    await api('/alliance/join', ally, { id: mine.id });
    const made = await api('/alliance/create', foe1, { tag: 'RIV', name: 'The Rivals' });
    await api('/alliance/join', foe2, { id: made.id });

    await go('Alliance');
    await page.reload();
    await page.waitForSelector('header.top');
    await go('Alliance');
    await page.locator('select').filter({ hasText: 'alliance…' }).selectOption({ label: '[RIV] The Rivals' });
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Declare war' }).click();
    await page.getByRole('heading', { name: 'War' }).waitFor({ timeout: 10_000 });
    expect(await page.locator('.warboard').innerText()).toMatch(/\[RIV\]/);
    expect(await page.locator('.warscore').count()).toBe(2);
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Concede' }).click();
    await page.getByText('Defeat').first().waitFor({ timeout: 10_000 });
    expect(await page.locator('.warboard').count()).toBe(0);
    noErrors();
  });
});

describe('settings kept from before the rename', () => {
  run('old sf.* browser settings move to the zg.* names, so nobody is logged out', async () => {
    const token = await page.evaluate(() => localStorage.getItem('zg.token'));
    await page.evaluate((t) => { localStorage.removeItem('zg.token'); localStorage.setItem('sf.token', t!); }, token);
    await page.reload();
    await page.waitForSelector('header.top');
    expect(await page.evaluate(() => [localStorage.getItem('sf.token'), localStorage.getItem('zg.token')])).toEqual([null, token]);
    noErrors();
  });
});

describe('signing out and in', () => {
  run('logging out signs the device out on the server, and logging back in works', async () => {
    const token = await page.evaluate(() => localStorage.getItem('zg.token'));
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.getByRole('button', { name: 'Log in' }).waitFor();
    const stale = await fetch(server.base + '/api/me', { headers: { authorization: `Bearer ${token}` } });
    expect(stale.status).toBe(401);
    await page.locator('input[autocomplete="username"]').fill('pilot_one');
    await page.locator('input[type="password"]').first().fill('correct-horse-9');
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForSelector('header.top');
    expect(await page.locator('header .who').textContent()).toMatch(/pilot_one/);
    noErrors();
  });

  run('a wrong password is refused with a message, not a crash', async () => {
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.locator('input[autocomplete="username"]').fill('pilot_one');
    await page.locator('input[type="password"]').first().fill('not-the-password');
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.locator('.error').waitFor();
    expect(await page.locator('.error').textContent()).toMatch(/Invalid username or password/);
    noErrors();
  });
});

describe('the admin', () => {
  run('the reserved admin name registers from this machine and gets the Admin page', async () => {
    await register('boss');
    if (await page.locator('.tour').isVisible()) await page.getByRole('button', { name: 'Skip tour' }).click();   // the tour shows once per device
    if (await page.locator('.tutnote').isVisible()) await page.getByRole('button', { name: 'Skip tutorial' }).click();
    await go('Admin');
    await page.getByText('Commanders').first().waitFor({ timeout: 10_000 });
    expect(await page.locator('main').innerText()).toMatch(/pilot_one/);
    expect(await page.getByRole('button', { name: 'Start an invasion' }).count()).toBe(1);
    await page.getByRole('heading', { name: 'Server health' }).waitFor();
    expect(await page.locator('main').innerText()).toMatch(/Tick \(last \d+\)[\s\S]*Recent errors/);
    noErrors();
  });
});
