import { performance } from 'node:perf_hooks';
import { runAutomationAll } from './automation';
import { NPC_TICK_MS, npcTick, processTributes } from './empires';
import { processPlayer } from './economy';
import { processMovements } from './fleet';
import { processInvasion } from './invasion';
import { processForges } from './forge';
import { refreshStandingDay } from './standing';
import { processRaids } from './npc';
import { checkProgress } from './progress';
import { SECTOR, processSectors } from './sectors';
import { processWars } from './wars';
import { processSeason } from './season';
import type { World } from './world';

export { NPC_TICK_MS };

/**
 * One server tick as the running game does it. Lives here, not in index.ts, so the load test measures exactly this code.
 * Slow jobs run on their own cadence: territory every minute, achievements and objectives every five seconds.
 */
export function createTicker(world: World) {
  let lastProgress = 0, lastSectors = 0, lastStanding = 0;
  /** pass an object to collect the milliseconds spent in each step (the load test does) */
  return function tick(now: number, prof?: Record<string, number>) {
    let t = prof ? performance.now() : 0;
    const lap = (name: string) => { if (prof) { const n = performance.now(); prof[name] = (prof[name] ?? 0) + (n - t); t = n; } };
    processMovements(world, now); lap('fleet movements');
    processRaids(world, now); lap('raids');
    if (world.nextNpcTick && now >= world.nextNpcTick) npcTick(world, now);
    lap('computer empires');
    processTributes(world, now);
    processSeason(world, now);
    processInvasion(world, now); lap('seasons, tribute, invasion');
    processForges(world, now);
    if (now - lastStanding >= 60_000) { lastStanding = now; refreshStandingDay(world, now); }
    if (now - lastSectors >= SECTOR.everyMs) { lastSectors = now; processSectors(world, now); }
    processWars(world, now);
    lap('territory');
    for (const p of Object.values(world.players)) processPlayer(world, p, now);
    lap('economy (every player)');
    runAutomationAll(world, now);
    lap('automation');
    if (now - lastProgress > 5000) { lastProgress = now; for (const p of Object.values(world.players)) checkProgress(world, p, now); }
    lap('objectives and achievements');
  };
}
