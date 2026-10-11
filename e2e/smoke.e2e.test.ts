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
  const item = page.locator('nav .navitem', { hasText: new RegExp(`^${label}\\b`) }).first();
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

  run('the tech tree highlights what an item needs and opens up', async () => {
    await go('Tech tree');
    expect(await page.locator('.gcard').count()).toBeGreaterThan(55);
    expect(await page.locator('.pip').count()).toBeGreaterThan(200);          // every level is a square
    await page.locator('.gcard', { hasText: 'Fusion Reactor' }).first().click();
    expect(await page.locator('.treeinfo').innerText()).toMatch(/Vespene Extractor to level 5/);
    expect(await page.locator('.gcard.anc').count()).toBe(3);
    expect(await page.locator('.gcard.dim').count()).toBeGreaterThan(40);
    expect(await page.locator('.bedge.back').count()).toBe(3);
    expect(await page.locator('.bedge').count()).toBeGreaterThan(70);          // the whole map is drawn, not only the selection
    // panned by dragging, zoomed with the wheel, no scroll bars
    const tf = () => page.locator('.graph').evaluate((el) => (el as HTMLElement).style.transform);
    const box = (await page.locator('.graphbox').boundingBox())!;
    expect(await page.locator('.graphbox').evaluate((el) => getComputedStyle(el).overflow)).toBe('hidden');
    const before = await tf();
    await page.mouse.move(box.x + box.width / 2, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + 130, { steps: 6 });
    await page.mouse.up();
    expect(await tf()).not.toBe(before);
    expect(await page.locator('.gcard.sel').count()).toBe(1);               // a drag does not change the selection
    const panned = await tf();
    await page.mouse.wheel(0, -300);
    expect(await tf()).not.toBe(panned);
    await page.getByRole('button', { name: 'Production and effects' }).click();
    expect(await page.locator('main').innerText()).toMatch(/Raised by/);
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
    const mine = await api('/alliance', await page.evaluate(() => localStorage.getItem('sf.token')));
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

describe('signing out and in', () => {
  run('logging out signs the device out on the server, and logging back in works', async () => {
    const token = await page.evaluate(() => localStorage.getItem('sf.token'));
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
