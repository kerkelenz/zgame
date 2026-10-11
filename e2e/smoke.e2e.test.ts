import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { launchBrowser, startServer, type TestServer } from './harness';

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
const go = async (label: string) => {
  // open whichever group holds the page, then click it
  const item = page.locator('nav .navitem', { hasText: new RegExp(`^${label}(?![A-Za-z])`) }).first();
  if (!(await item.isVisible())) {
    const closed = page.locator('nav .navgroup.closed .navhead');
    for (let i = 0; i < (await closed.count()); i++) { await closed.first().click(); if (await item.isVisible()) break; }
  }
  await item.click();
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
    await page.getByRole('button', { name: 'Next' }).click();
    expect(await page.locator('.tourbox h3').textContent()).toBe('Buildings');
    await page.getByRole('button', { name: 'Skip tour' }).click();
    await page.waitForSelector('.tour', { state: 'detached' });
    expect(await heading().textContent()).toMatch(/Homeworld/);
    noErrors();
  });

  run('the top bar shows the three resources with their pictures', async () => {
    expect(await page.locator('header.top .res svg.ri').count()).toBe(3);
    expect(await page.locator('header.top .res').textContent()).toMatch(/\d/);
  });
});

describe('every page', () => {
  const PAGES = ['Overview', 'Resources', 'Buildings', 'Research', 'Tech tree', 'Shipyard', 'Defense', 'Fleet', 'Galaxy', 'Empire', 'Economy', 'Contracts', 'Command', 'Alliance', 'Contacts', 'Messages', 'Chat', 'Standing', 'Settings', 'Guide'];

  run('collapse all and expand all work on the side menu', async () => {
    await go('Overview');
    const navLook = await page.locator('nav').evaluate((el) => ({ bar: getComputedStyle(el).scrollbarWidth, width: el.getBoundingClientRect().width }));
    expect(navLook.bar).toBe('none');                                      // no scroll bar drawn in the menu
    expect(navLook.width).toBeGreaterThanOrEqual(165);
    await page.getByRole('button', { name: 'Collapse all' }).click();
    expect(await page.locator('nav .navgroup.closed').count()).toBe(await page.locator('nav .navgroup').count() - 1);    // the group you are in stays open
    await page.getByRole('button', { name: 'Expand all' }).click();
    expect(await page.locator('nav .navgroup.closed').count()).toBe(0);
    await page.reload();
    await page.waitForSelector('header.top');
    expect(await page.locator('nav .navgroup.closed').count()).toBe(0);                                                  // remembered
    await page.getByRole('button', { name: 'Collapse all' }).click();
    await page.getByRole('button', { name: 'Expand all' }).click();
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
    for (const label of held) expect(await page.locator('nav .navitem', { hasText: new RegExp(`^${label}`) }).count(), `${label} should be hidden at first`).toBe(0);
    await go('Settings');
    await page.getByLabel(/Show every page in the menu/).check();
    for (const label of held) expect(await page.locator('nav .navitem', { hasText: new RegExp(`^${label}`) }).count(), `${label} should appear`).toBe(1);
    await page.reload();
    await page.waitForSelector('header.top');
    expect(await page.locator('nav .navitem', { hasText: /^Automation/ }).count()).toBe(1);
    for (const label of held) { await go(label); await heading().waitFor(); expect(await page.locator('main', { hasText: /Something went wrong/i }).count(), label).toBe(0); }
    noErrors();
  });

  run('fits a phone screen: no sideways scrolling on any page', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await page.waitForSelector('header.top');
    const labels = await page.locator('nav .navitem').allInnerTexts();
    expect(labels.length).toBeGreaterThan(15);
    for (const raw of labels) {
      const label = raw.replace(/\d+$/, '').trim();
      await page.locator('nav .navitem', { hasText: new RegExp(`^${label}`) }).first().click();
      await heading().waitFor();
      expect(await overflow(), `${label} scrolls sideways on a phone`).toBeLessThanOrEqual(1);
    }
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
    expect(await page.locator('.spyhead .plink').textContent()).toBe('[1:9:4]');
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
    expect(await page.locator('main').innerText()).toMatch(/1\. Crystal Mine\s*·\s*\d/);
    expect(await page.locator('main').innerText()).toMatch(/2\. Solar Plant\s*·\s*\d/);
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
    expect(await page.locator('nav .navitem', { hasText: /^Territory/ }).count()).toBe(1);
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
    await page.locator('table.galaxy a.plink', { hasText: 'pilot_one' }).click();
    await page.getByText('← Back').waitFor();
    expect(await heading().textContent()).toBe('pilot_one');
    await page.getByRole('button', { name: '← Back' }).click();
    await page.locator('table.galaxy').waitFor();
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
    await go('Admin');
    await page.getByText('Commanders').first().waitFor({ timeout: 10_000 });
    expect(await page.locator('main').innerText()).toMatch(/pilot_one/);
    expect(await page.getByRole('button', { name: 'Start an invasion' }).count()).toBe(1);
    noErrors();
  });
});
