import { lvl } from '../shared/formulas';
import { externalNotify } from './external';
import type { World } from './world';

/** How long a queue may stay empty before the player is told outside the game (once per time it runs dry). */
export const IDLE = { minutes: 30 };

/**
 * A building queue or the research that has been empty for half an hour sends one alert ("Queues running dry"; a Settings switch, on by default,
 * and only while the player is away like the other alerts). The clock starts when the last job finishes with nothing waiting behind it, and
 * starting anything resets it, so a fresh account or a queue the player emptied on purpose and then used again never alerts.
 */
export function checkIdle(w: World, now: number): void {
  const ms = IDLE.minutes * 60_000;
  for (const p of Object.values(w.players)) {
    if (p.npc || p.vacation || p.banned) continue;
    for (const id of p.planetIds) {
      const planet = w.planets[id];
      if (!planet || planet.buildQueue || planet.buildBacklog?.length || !planet.idleSince || planet.idleAlerted || now - planet.idleSince < ms) continue;
      planet.idleAlerted = true;
      externalNotify(w, p.id, 'idle', 'Buildings idle', `Nothing is being built on ${planet.name}, and has not been for ${IDLE.minutes} minutes.`, now);
    }
    const lab = p.planetIds.some((id) => lvl(w.planets[id]?.buildings ?? {}, 'researchLab') > 0);
    if (lab && !p.research && !p.researchBacklog?.length && p.researchIdleSince && !p.researchIdleAlerted && now - p.researchIdleSince >= ms) {
      p.researchIdleAlerted = true;
      externalNotify(w, p.id, 'idle', 'Research idle', `No research is running, and none has been for ${IDLE.minutes} minutes.`, now);
    }
  }
}
