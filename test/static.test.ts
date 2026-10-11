import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { createWorld } from '../server/world';

let base = '', close: () => void, dir = '';
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sf-static-'));
  mkdirSync(join(dir, 'icons'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>shell</title>');
  writeFileSync(join(dir, 'sw.js'), 'self.addEventListener("install", () => {});');
  writeFileSync(join(dir, 'manifest.webmanifest'), '{"name":"x"}');
  writeFileSync(join(dir, 'icons', 'icon-192.png'), Buffer.from([137, 80, 78, 71]));
  const s = createApp(createWorld({ npcDensity: 0 }), { staticDir: dir }).listen(0);
  await new Promise((r) => s.once('listening', r));
  base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  close = () => s.close();
});
afterAll(() => { close(); try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* temp */ } });

describe('serving the installable app', () => {
  it('serves the service worker as javascript at the root so it can control the whole site', async () => {
    const r = await fetch(base + '/sw.js');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/javascript/);
    expect(r.headers.get('content-security-policy')).toContain("script-src 'self'");
  });
  it('serves the manifest with the manifest media type and the icons as images', async () => {
    const m = await fetch(base + '/manifest.webmanifest');
    expect(m.headers.get('content-type')).toMatch(/manifest\+json|application\/json/);
    const i = await fetch(base + '/icons/icon-192.png');
    expect(i.headers.get('content-type')).toBe('image/png');
  });
  it('falls back to the app shell for client-side pages, but never for the API', async () => {
    const page = await fetch(base + '/some/page');
    expect(await page.text()).toContain('shell');
    const api = await fetch(base + '/api/nothing-here');
    expect([401, 404]).toContain(api.status);   // the API router answers (needs a login first), it never serves the page
    expect((await api.json()) as { error: string }).toHaveProperty('error');
  });
});

describe('the app files in the repo', () => {
  it('have a valid manifest that points at icons that exist', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const m = JSON.parse(readFileSync('client/public/manifest.webmanifest', 'utf8'));
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    const sizes = m.icons.map((x: { sizes: string }) => x.sizes);
    expect(sizes).toContain('192x192'); expect(sizes).toContain('512x512');   // what browsers require to offer installation
    for (const icon of m.icons) expect(existsSync('client/public' + icon.src), icon.src).toBe(true);
    expect(readFileSync('client/index.html', 'utf8')).toContain('rel="manifest"');
  });
  it('have a service worker that handles push, clicks and leaves the game API alone', async () => {
    const { readFileSync } = await import('node:fs');
    const sw = readFileSync('client/public/sw.js', 'utf8');
    for (const event of ["'push'", "'notificationclick'", "'fetch'", "'install'", "'activate'"]) expect(sw).toContain(event);
    expect(sw).toMatch(/startsWith\('\/api'\)/);
    expect(sw).toMatch(/startsWith\('\/ws'\)/);
  });
});
