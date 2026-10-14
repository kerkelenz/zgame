import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_CONFIG, type UniverseConfig } from '../shared/config';
import { dedupeLooks, migrateLooks } from './looks';
import { migratePlayer, type World } from './world';

/**
 * Optional SQLite persistence (set ZGAME_DB=data/world.sqlite). Every player, planet, fleet, message and so on is its own row,
 * and a save only writes the rows whose content changed since the last save - so a big, mostly idle universe costs
 * a handful of writes per autosave instead of rewriting one huge JSON file.
 */
type Doc = { kind: string; id: string; json: string };

const COLLECTIONS = ['players', 'planets', 'movements', 'wrecks', 'alliances', 'shared'] as const;
const LISTS = ['messages', 'chat', 'reports'] as const;
const SCALARS = ['version', 'config', 'createdAt', 'nextRaidAt', 'nextNpcTick', 'rngSeed', 'season', 'hallOfFame', 'debris', 'sessions', 'sessionAt', 'sectors', 'invasion', 'invasionCount', 'nextInvasionAt', 'invasionHistory', 'wars', 'operations', 'looksAssigned', 'looksDeduped', 'forges', 'market', 'outposts', 'auditLog', 'scheduledAnnouncements', 'dailyStats', 'standingDay', 'vapid'] as const;

const hashOf = (s: string) => createHash('sha1').update(s).digest('base64');

export class SqlStore {
  private db: DatabaseSync;
  /** row key -> content hash as last written, so unchanged rows are skipped */
  private known = new Map<string, string>();

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    this.db.exec('CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (kind, id)) WITHOUT ROWID');
  }

  /** true if nothing has ever been saved here */
  isEmpty(): boolean {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM docs').get() as { n: number }).n === 0;
  }

  private collect(w: World): Doc[] {
    const docs: Doc[] = [];
    const rec = w as unknown as Record<string, unknown>;
    for (const kind of COLLECTIONS) for (const [id, v] of Object.entries((rec[kind] ?? {}) as Record<string, unknown>)) docs.push({ kind, id, json: JSON.stringify(v) });
    for (const kind of LISTS) for (const v of (rec[kind] ?? []) as { id: string }[]) docs.push({ kind, id: v.id, json: JSON.stringify(v) });
    for (const key of SCALARS) if (rec[key] !== undefined) docs.push({ kind: 'meta', id: key, json: JSON.stringify(rec[key]) });
    return docs;
  }

  /** Write what changed and delete what vanished. Returns the row counts (handy for tests and logs). */
  save(w: World): { written: number; deleted: number; total: number } {
    const docs = this.collect(w);
    const seen = new Set<string>();
    const upsert = this.db.prepare('INSERT INTO docs (kind, id, json) VALUES (?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET json = excluded.json');
    const del = this.db.prepare('DELETE FROM docs WHERE kind = ? AND id = ?');
    let written = 0, deleted = 0;
    this.db.exec('BEGIN');
    try {
      for (const d of docs) {
        const key = `${d.kind}\u0000${d.id}`;
        seen.add(key);
        const h = hashOf(d.json);
        if (this.known.get(key) === h) continue;
        upsert.run(d.kind, d.id, d.json);
        this.known.set(key, h);
        written++;
      }
      for (const key of [...this.known.keys()]) {
        if (seen.has(key)) continue;
        const [kind, id] = key.split('\u0000');
        del.run(kind, id);
        this.known.delete(key);
        deleted++;
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      this.known.clear(); // unknown state: rewrite everything next time
      throw e;
    }
    return { written, deleted, total: docs.length };
  }

  load(overrides: Partial<UniverseConfig> = {}): World {
    const rows = this.db.prepare('SELECT kind, id, json FROM docs').all() as unknown as Doc[];
    const w: Record<string, unknown> = {};
    for (const k of COLLECTIONS) w[k] = {};
    for (const k of LISTS) w[k] = [];
    for (const r of rows) {
      const v = JSON.parse(r.json);
      if (r.kind === 'meta') w[r.id] = v;
      else if ((COLLECTIONS as readonly string[]).includes(r.kind)) (w[r.kind] as Record<string, unknown>)[r.id] = v;
      else (w[r.kind] as unknown[]).push(v);
      this.known.set(`${r.kind}\u0000${r.id}`, hashOf(r.json));
    }
    // arrays keep their time order (ties fall back to id)
    for (const k of LISTS) (w[k] as { at: number; id: string }[]).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
    const world = w as unknown as World;
    world.config = { ...DEFAULT_CONFIG, ...world.config, ...overrides };
    world.debris ??= {}; world.sessions ??= {};
    migrateLooks(world);
    dedupeLooks(world);
    for (const p of Object.values(world.players)) migratePlayer(p);
    return world;
  }

  close() { this.db.close(); }
}
