import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { launchBrowser, startServer, type TestServer } from './harness';

/**
 * The new commander's first hours on a server with the onboarding on (the other browser tests switch it off so every page is there):
 * a short menu that grows, a quest line, and a short tutorial the first time a new page opens.
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
  server = await startServer({ ZGAME_ONBOARDING: '1' });
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(`console: ${m.text()}`); });
}, 120_000);
afterAll(async () => { await browser?.close(); await server?.stop(); });

const run = (name: string, fn: () => Promise<void>) => it(name, async (t) => { if (!browser) { t.skip(); return; } await fn(); }, 90_000);

describe('onboarding', () => {
  run('a new commander starts with a short menu, a quest to follow and the first tutorial', async () => {
    await page.goto(server.base + '/');
    await page.getByRole('button', { name: /New here\? Register/ }).click();
    await page.locator('input[autocomplete="username"]').fill('rookie');
    await page.locator('input[type="password"]').first().fill('correct-horse-9');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForSelector('.tour', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Skip tour' }).click();
    await page.locator('.tutnote').waitFor();
    expect(await page.locator('.tutnote h3').textContent()).toBe('Your resources');
    await page.getByRole('button', { name: 'Skip tutorial' }).click();
    await page.locator('.tutnote').waitFor({ state: 'detached' });
    // only the basics are in the menu
    expect(await page.locator('nav .hubitem > span:nth-child(2)').allInnerTexts()).toEqual(['Home', 'Build', 'Inbox', 'More']);
    await page.locator('nav [data-tour="hub-build"]').click();
    expect(await page.locator('.subtabs .subtab').allInnerTexts()).toEqual(['Buildings', 'Resources']);
    // the Overview says what to do next
    await page.locator('nav [data-tour="hub-home"]').click();
    await page.locator('.subtabs [data-tour="nav-overview"]').click();
    expect(await page.locator('[data-tour="quests"]').innerText()).toMatch(/Dig in/);
    await page.locator('.subtabs [data-tour="nav-quests"]').click();
    await page.locator('.page h2', { hasText: 'Quests' }).waitFor();
    expect(await page.locator('main').innerText()).toMatch(/Foundations[\s\S]*Research[\s\S]*Community/);
  });

  run('a page the quests open is announced, and its short tutorial starts the first time it is opened', async () => {
    // the server does not hand out quests quickly, so pretend the Research Lab quest is done: the page list gains Research and the Tech tree
    await page.route('**/api/me', async (route) => {
      const r = await route.fetch(); const j = await r.json() as any;
      j.unlocked = [...new Set([...j.unlocked, 'research', 'techtree'])];
      await route.fulfill({ response: r, json: j });
    });
    await page.reload();
    await page.waitForSelector('header.top');
    await page.locator('.toast', { hasText: 'New pages open: Research, Tech tree' }).waitFor({ timeout: 15_000 });
    await page.locator('.toast').getByRole('button', { name: 'Open Research' }).click();
    await page.locator('.tutnote').waitFor({ timeout: 10_000 });
    expect(await page.locator('.tutnote h3').textContent()).toBe('Research');
    expect(await page.locator('.tutnote').innerText()).toMatch(/About this page/);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.locator('.tutnote').waitFor({ state: 'detached' });
    // once only: back on the page it does not start again, but the Tutorial button replays it
    await page.locator('.subtabs [data-tour="nav-techtree"]').click();
    await page.locator('.tutnote').waitFor();                                         // the Tech tree has its own, shown once
    await page.getByRole('button', { name: "Don't show these" }).click();
    await page.locator('.subtabs [data-tour="nav-research"]').click();
    await page.waitForTimeout(1200);
    expect(await page.locator('.tutnote').count()).toBe(0);
    await page.getByRole('button', { name: '? Tutorial' }).click();
    await page.locator('.tutnote').waitFor();
    expect(await page.locator('.tutnote h3').textContent()).toBe('Research');
    await page.getByRole('button', { name: 'Skip tutorial' }).click();
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
