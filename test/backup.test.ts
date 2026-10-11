import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeBackup, restoreBackup } from '../server/backup';
import { register } from '../server/accounts';
import { SqlStore } from '../server/sqlstore';
import { createWorld } from '../server/world';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'sf-bk-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) { try { rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* cleaned by the OS */ } } });
const T0 = Date.UTC(2026, 9, 10, 12);

describe('backups', () => {
  it('copies a JSON save with a timestamp and keeps only the newest N', () => {
    const d = tmp(), src = join(d, 'world.json');
    writeFileSync(src, '{"a":1}');
    const out = join(d, 'snap');
    const names: string[] = [];
    for (let i = 0; i < 5; i++) names.push(makeBackup(src, out, 3, T0 + i * 86_400_000).file);
    const left = readdirSync(out).sort();
    expect(left).toHaveLength(3);
    expect(left[0]).toMatch(/^world-2026-10-12T12-00-00-000Z\.json$/);
    expect(readFileSync(join(out, left[2]), 'utf8')).toBe('{"a":1}');
    expect(existsSync(names[0])).toBe(false);
  });

  it('snapshots a live SQLite database consistently', () => {
    const d = tmp(), src = join(d, 'world.sqlite');
    const w = createWorld({ npcDensity: 0 }, T0);
    register(w, 'alice', 'secret1', T0);
    const store = new SqlStore(src);
    store.save(w);
    const r = makeBackup(src, join(d, 'snap'), 14, T0);
    expect(r.file.endsWith('.sqlite')).toBe(true);
    store.save(w); // the live database keeps working
    store.close();
    const copy = new SqlStore(r.file);
    expect(Object.values(copy.load().players).map((p) => p.username)).toEqual(['alice']);
    copy.close();
  });

  it('restores a backup and keeps the file it replaced', () => {
    const d = tmp(), src = join(d, 'world.json');
    writeFileSync(src, 'old');
    const b = makeBackup(src, join(d, 'snap'), 14, T0).file;
    writeFileSync(src, 'newer, broken');
    const saved = restoreBackup(b, src, T0);
    expect(readFileSync(src, 'utf8')).toBe('old');
    expect(readFileSync(saved!, 'utf8')).toBe('newer, broken');
  });

  it('fails clearly for a missing source or backup, and never overwrites a backup', () => {
    const d = tmp();
    expect(() => makeBackup(join(d, 'nope.json'), d)).toThrow(/Nothing to back up/);
    expect(() => restoreBackup(join(d, 'nope.json'), join(d, 'x.json'))).toThrow(/No such backup/);
    const src = join(d, 'world.json');
    writeFileSync(src, '{}');
    makeBackup(src, join(d, 's'), 14, T0);
    expect(() => makeBackup(src, join(d, 's'), 14, T0)).toThrow(/already exists/);
  });
});
