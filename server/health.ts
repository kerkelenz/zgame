import { statSync } from 'node:fs';
import type { World } from './world';

/**
 * What the admin page shows about the running server: how long ticks and saves take, memory, who is playing, and the last few errors.
 * Kept in memory for this process only (a restart starts fresh), so it costs nothing to record.
 */
const TICKS = 120;                                   // the last two minutes of one-second ticks
const ERRORS = 20;
const ticks: number[] = [];
const errors: { at: number; text: string }[] = [];
let lastSave: { at: number; ms: number; bytes: number | null } | null = null;
let sockets: () => number = () => 0;
let saveFile: string | null = null;
const startedAt = Date.now();

export function recordTick(ms: number) { ticks.push(ms); if (ticks.length > TICKS) ticks.shift(); }
export function recordError(text: string, at = Date.now()) { errors.push({ at, text: text.slice(0, 300) }); if (errors.length > ERRORS) errors.shift(); }
export function recordSave(ms: number, file: string | null, at = Date.now()) {
  let bytes: number | null = null;
  try { if (file) bytes = statSync(file).size; } catch { /* not there */ }
  lastSave = { at, ms, bytes };
}
export function configureHealth(opts: { sockets?: () => number; saveFile?: string | null }) { if (opts.sockets) sockets = opts.sockets; if ('saveFile' in opts) saveFile = opts.saveFile ?? null; }
/** tests start from nothing */
export function resetHealth() { ticks.length = 0; errors.length = 0; lastSave = null; }

const pct = (xs: number[], q: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

export function healthView(w: World, now = Date.now()) {
  const players = Object.values(w.players).filter((p) => !p.npc);
  const mem = process.memoryUsage();
  return {
    uptimeMs: now - startedAt,
    tick: { samples: ticks.length, avgMs: ticks.length ? ticks.reduce((a, b) => a + b, 0) / ticks.length : 0, p95Ms: pct(ticks, 0.95), maxMs: ticks.length ? Math.max(...ticks) : 0 },
    save: lastSave ? { ...lastSave, ago: now - lastSave.at } : null,
    saveFile,
    memoryMb: { rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576) },
    players: {
      total: players.length,
      online: players.filter((p) => now - p.lastSeen < 5 * 60_000).length,
      day: players.filter((p) => now - p.lastSeen < 86_400_000).length,
      week: players.filter((p) => now - p.lastSeen < 7 * 86_400_000).length,
      sockets: sockets(),
    },
    world: {
      planets: Object.keys(w.planets).length, movements: Object.keys(w.movements).length, messages: w.messages.length, alliances: Object.keys(w.alliances).length,
      operations: (w.operations ?? []).filter((o) => !o.closed).length, empires: Object.values(w.players).filter((p) => p.npc).length,
    },
    errors: [...errors].reverse(),
  };
}
