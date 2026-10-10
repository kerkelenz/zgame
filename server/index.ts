import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_CONFIG, type UniverseConfig } from '../shared/config';
import { authenticate } from './accounts';
import { createApp } from './app';
import { bus, type PushEvent } from './bus';
import { processPlayer } from './economy';
import { processMovements } from './fleet';
import { processRaids } from './npc';
import { checkProgress } from './progress';
import { loadWorld, saveWorld } from './store';

const num = (k: string, d: number) => (process.env[k] !== undefined ? Number(process.env[k]) : d);
const overrides: Partial<UniverseConfig> = {};
for (const k of Object.keys(DEFAULT_CONFIG) as (keyof UniverseConfig)[]) {
  const envKey = 'OGAME_' + k.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase();
  if (typeof DEFAULT_CONFIG[k] === 'number' && process.env[envKey] !== undefined) (overrides as Record<string, number>)[k] = num(envKey, DEFAULT_CONFIG[k] as number);
}

const PORT = num('PORT', 3000);
const SAVE_FILE = resolve(process.env.OGAME_SAVE || 'data/world.json');
const world = loadWorld(SAVE_FILE, overrides);

const app = createApp(world, { staticDir: resolve('client/dist') });
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const sockets = new Map<WebSocket, string>();

wss.on('connection', (ws, req) => {
  const token = new URL(req.url || '', 'http://x').searchParams.get('token') || undefined;
  const player = authenticate(world, token);
  if (!player) { ws.close(4001, 'unauthorized'); return; }
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
let lastProgress = 0;
function tick() {
  const now = Date.now();
  try {
    processMovements(world, now);
    processRaids(world, now);
    for (const p of Object.values(world.players)) processPlayer(world, p, now);
    if (now - lastProgress > 5000) { lastProgress = now; for (const p of Object.values(world.players)) checkProgress(world, p, now); }
    dirty = true;
  } catch (e) {
    console.error('tick failed', e);
  }
}
setInterval(tick, 1000);
setInterval(() => {
  if (!dirty) return;
  try { saveWorld(SAVE_FILE, world); dirty = false; } catch (e) { console.error('save failed', e); }
}, 10_000);

function shutdown() {
  try { saveWorld(SAVE_FILE, world); } catch { /* ignore */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`OGame clone server on http://localhost:${PORT}  (save: ${SAVE_FILE})`);
  console.log(`Universe: ${world.config.galaxies}x${world.config.systems}x${world.config.positions}, economy x${world.config.economySpeed}, fleet x${world.config.fleetSpeed}`);
});
