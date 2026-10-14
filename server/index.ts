import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_CONFIG, type UniverseConfig } from '../shared/config';
import { authenticate, pruneSessions } from './accounts';
import { createApp } from './app';
import { bus, type PushEvent } from './bus';
import { createTicker } from './tick';
import { existsSync } from 'node:fs';
import { SqlStore } from './sqlstore';
import { createWorld, type World } from './world';
import { loadWorld, saveWorld } from './store';
import { NPC_TICK_MS, generateEmpires, hasEmpires } from './empires';
import { env } from './env';
import { configureHealth, recordError, recordSave, recordTick } from './health';

const num = (k: string, d: number) => (env(k) !== undefined ? Number(env(k)) : d);
const overrides: Partial<UniverseConfig> = {};
for (const k of Object.keys(DEFAULT_CONFIG) as (keyof UniverseConfig)[]) {
  const envKey = k.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase();
  if (typeof DEFAULT_CONFIG[k] === 'number' && env(envKey) !== undefined) (overrides as Record<string, number>)[k] = num(envKey, DEFAULT_CONFIG[k] as number);
}

const PORT = process.env.PORT !== undefined ? Number(process.env.PORT) : 3000;
const SAVE_FILE = resolve(env('SAVE') || 'data/world.json');
// ZGAME_DB=data/world.sqlite switches persistence to SQLite (only changed rows are written); an existing JSON save is imported on first start
const DB_FILE = env('DB') ? resolve(env('DB')!) : null;
const sql = DB_FILE ? new SqlStore(DB_FILE) : null;
let world: World;
if (sql) {
  if (sql.isEmpty() && existsSync(SAVE_FILE)) { world = loadWorld(SAVE_FILE, overrides); const r = sql.save(world); console.log(`Imported ${SAVE_FILE} into ${DB_FILE} (${r.total} rows).`); }
  else world = sql.isEmpty() ? createWorld(overrides) : sql.load(overrides);
} else world = loadWorld(SAVE_FILE, overrides);
const persist = () => (sql ? void sql.save(world) : saveWorld(SAVE_FILE, world));
if (world.config.npcDensity > 0 && !hasEmpires(world)) {
  const n = generateEmpires(world);
  console.log(`Settled ${n} computer empires.`);
}
if (hasEmpires(world) && !world.nextNpcTick) world.nextNpcTick = Date.now() + NPC_TICK_MS;

const app = createApp(world, { staticDir: resolve('client/dist') });
const server = createServer(app);
// the server only pushes; clients never need to send anything, so inbound frames stay tiny
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
const sockets = new Map<WebSocket, string>();
configureHealth({ sockets: () => sockets.size, saveFile: DB_FILE ?? SAVE_FILE });

wss.on('connection', (ws, req) => {
  // a bad frame (too big, malformed) raises 'error' on the socket; without a listener Node would treat it as fatal
  ws.on('error', () => { try { ws.terminate(); } catch { /* already gone */ } });
  const token = new URL(req.url || '', 'http://x').searchParams.get('token') || undefined;
  const player = authenticate(world, token);
  if (!player) { ws.close(4001, 'unauthorized'); return; }
  if ([...sockets.values()].filter((id) => id === player.id).length >= 8) { ws.close(4002, 'too many connections'); return; }
  sockets.set(ws, player.id);
  ws.on('close', () => sockets.delete(ws));
  ws.send(JSON.stringify({ type: 'hello', data: { now: Date.now() } }));
});

// keep connections alive through proxies and drop dead peers
setInterval(() => {
  for (const ws of sockets.keys()) {
    const s = ws as WebSocket & { alive?: boolean };
    if (s.alive === false) { s.terminate(); continue; }
    s.alive = false;
    s.ping();
  }
}, 30_000);
wss.on('connection', (ws) => { const s = ws as WebSocket & { alive?: boolean }; s.alive = true; ws.on('pong', () => { s.alive = true; }); });

bus.on('push', (e: PushEvent) => {
  const payload = JSON.stringify({ type: e.type, data: e.data });
  for (const [ws, pid] of sockets) if ((e.to === '*' || e.to === pid) && ws.readyState === ws.OPEN) ws.send(payload);
});

let dirty = true;
const runTick = createTicker(world);
function tick() {
  try {
    const t0 = performance.now();
    runTick(Date.now());
    recordTick(performance.now() - t0);
    dirty = true;
  } catch (e) {
    console.error('tick failed', e);
    recordError(`tick failed: ${(e as Error).message}`);
  }
}
setInterval(tick, 1000);
setInterval(() => { try { pruneSessions(world); } catch (e) { console.error('session prune failed', e); } }, 3_600_000);
setInterval(() => {
  if (!dirty) return;
  try { const t0 = performance.now(); persist(); dirty = false; recordSave(performance.now() - t0, DB_FILE ?? SAVE_FILE); } catch (e) { console.error('save failed', e); recordError(`save failed: ${(e as Error).message}`); }
}, 10_000);

function shutdown() {
  try { persist(); } catch { /* ignore */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`Zgame server on http://localhost:${PORT}  (save: ${DB_FILE ?? SAVE_FILE})`);
  console.log(`Universe: ${world.config.galaxies}x${world.config.systems}x${world.config.positions}, economy x${world.config.economySpeed}, fleet x${world.config.fleetSpeed}`);
});
