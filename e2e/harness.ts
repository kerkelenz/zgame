import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';

/** a real game server on a private port with its own empty save, serving the built client */
export interface TestServer { base: string; stop: () => Promise<void> }

export async function startServer(env: Record<string, string> = {}): Promise<TestServer> {
  const dir = mkdtempSync(join(tmpdir(), 'sf-e2e-'));
  const port = 4100 + Math.floor(Math.random() * 800);
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(port), ZGAME_SAVE: join(dir, 'world.json'), ZGAME_NPC_DENSITY: '0.1', ZGAME_RAID_INTERVAL_MIN: '0', ZGAME_INVASION_INTERVAL_HOURS: '0', ZGAME_ADMINS: 'boss', ZGAME_ONBOARDING: '0', ...env },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(base + '/api/health')).ok) break; } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 250));
    if (i === 79) { child.kill(); throw new Error('the test server did not start'); }
  }
  return {
    base,
    stop: async () => { child.kill(); await new Promise((r) => setTimeout(r, 300)); try { rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch { /* temp dir */ } },
  };
}

/** the browser already on this machine (Edge ships with Windows, Chrome is common); none found means the suite skips itself */
export async function launchBrowser(): Promise<Browser | null> {
  for (const channel of ['msedge', 'chrome'] as const) {
    try { return await chromium.launch({ channel, headless: true }); } catch { /* try the next one */ }
  }
  try { return await chromium.launch({ headless: true }); } catch { return null; }
}
