import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface BackupResult { file: string; bytes: number; pruned: string[] }

/**
 * Take a consistent snapshot of the universe while the server may still be running.
 * JSON saves are written atomically by the server, so copying them is safe; SQLite uses VACUUM INTO, which is transaction-safe.
 */
export function makeBackup(source: string, outDir: string, keep = 14, now = Date.now()): BackupResult {
  if (!existsSync(source)) throw new Error(`Nothing to back up: ${source} does not exist`);
  mkdirSync(outDir, { recursive: true });
  const ext = extname(source);
  const stem = basename(source, ext);
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  const file = join(outDir, `${stem}-${stamp}${ext}`);
  if (existsSync(file)) throw new Error(`${file} already exists`);
  if (ext === '.sqlite' || ext === '.db') {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite'); // loaded on demand: it prints an experimental warning
    const db = new DatabaseSync(source);
    try { db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); } finally { db.close(); }
  } else copyFileSync(source, file);
  const mine = readdirSync(outDir).filter((f) => f.startsWith(stem + '-') && f.endsWith(ext)).sort();
  const pruned = keep > 0 ? mine.slice(0, Math.max(0, mine.length - keep)) : [];
  for (const f of pruned) unlinkSync(join(outDir, f));
  return { file, bytes: statSync(file).size, pruned };
}

/** Put a backup back in place. The server must be stopped first; the current file is kept as `.before-restore`. */
export function restoreBackup(backup: string, target: string, now = Date.now()): string | null {
  if (!existsSync(backup)) throw new Error(`No such backup: ${backup}`);
  mkdirSync(dirname(target), { recursive: true });
  let saved: string | null = null;
  if (existsSync(target)) { saved = `${target}.before-restore-${now}`; copyFileSync(target, saved); }
  copyFileSync(backup, target);
  return saved;
}

// CLI: `npm run backup` or `npm run backup -- restore <file>`
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = resolve(process.env.OGAME_DB || process.env.OGAME_SAVE || 'data/world.json');
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (cmd === 'restore') {
      if (!arg) throw new Error('Usage: npm run backup -- restore <backup file>');
      const saved = restoreBackup(resolve(arg), source);
      console.log(`Restored ${arg} to ${source}.${saved ? ` The previous file is kept at ${saved}.` : ''}`);
    } else {
      const keep = Number(process.env.OGAME_BACKUP_KEEP ?? 14);
      const r = makeBackup(source, resolve(process.env.OGAME_BACKUP_DIR || join(dirname(source), 'snapshots')), keep);
      console.log(`Backup written: ${r.file} (${(r.bytes / 1024).toFixed(0)} KiB)${r.pruned.length ? `; removed ${r.pruned.length} old backup(s)` : ''}`);
    }
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
