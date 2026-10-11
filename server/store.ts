import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DEFAULT_CONFIG, type UniverseConfig } from '../shared/config';
import { createWorld, migratePlayer, type World } from './world';

export function loadWorld(file: string, overrides: Partial<UniverseConfig> = {}): World {
  if (existsSync(file)) {
    try {
      const w = JSON.parse(readFileSync(file, 'utf8')) as World;
      if (!w || typeof w !== 'object' || !w.players || !w.planets) throw new Error('not a world file');
      // new config keys added since the save get defaults; explicit overrides win
      w.config = { ...DEFAULT_CONFIG, ...w.config, ...overrides };
      w.wrecks ??= {};
      for (const p of Object.values(w.players)) migratePlayer(p);
      return w;
    } catch (e) {
      // never let the next autosave overwrite a save we could not read
      const quarantine = `${file}.corrupt-${Date.now()}`;
      try { renameSync(file, quarantine); } catch { /* ignore */ }
      console.error(`Failed to read save file (${(e as Error).message}); moved it to ${quarantine} and starting a new universe.`);
    }
  }
  return createWorld(overrides);
}

export interface BackupOptions { everyMs: number; keep: number }
const DEFAULT_BACKUP: BackupOptions = { everyMs: 60 * 60_000, keep: 12 };

/** Atomically write the save, and keep rolling timestamped backups of the previous save. */
export function saveWorld(file: string, w: World, backup: BackupOptions = DEFAULT_BACKUP, now = Date.now()) {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true });
  if (backup.keep > 0 && existsSync(file)) rotateBackups(file, backup, now);
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(w));
  renameSync(tmp, file);
}

function rotateBackups(file: string, { everyMs, keep }: BackupOptions, now: number) {
  const dir = join(dirname(file), 'backups');
  const prefix = basename(file, '.json') + '-';
  mkdirSync(dir, { recursive: true });
  const existing = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort();
  const lastTs = existing.length ? Number(existing[existing.length - 1].slice(prefix.length, -5)) : 0;
  if (now - lastTs < everyMs) return;
  copyFileSync(file, join(dir, `${prefix}${now}.json`));
  for (const old of existing.slice(0, Math.max(0, existing.length + 1 - keep))) unlinkSync(join(dir, old));
}
