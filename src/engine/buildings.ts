/**
 * Starting, validating and cancelling construction.
 *
 * These functions are the "commands" of the engine: they take a planet and
 * return a new planet with the command applied. As everywhere in `src/engine`,
 * `now` arrives as an argument - nothing here reads the clock.
 */

import { BUILDINGS } from './constants';
import { buildTimeSeconds, buildingCost, addResources, subtractResources } from './formulas';
import type { BuildingId, Check, Planet, Resources } from './types';

/** Do we have at least `cost` of every resource? */
export function canAfford(resources: Resources, cost: Resources): boolean {
  return (
    resources.metal >= cost.metal &&
    resources.crystal >= cost.crystal &&
    resources.deuterium >= cost.deuterium
  );
}

/** The level a building would reach if you upgraded it right now. */
export function nextLevel(planet: Planet, id: BuildingId): number {
  return planet.buildings[id] + 1;
}

/** Cost of the next level of a building on this planet. */
export function nextLevelCost(planet: Planet, id: BuildingId): Resources {
  return buildingCost(id, nextLevel(planet, id));
}

/** Duration in seconds of the next level, accounting for the Robotics Factory. */
export function nextLevelBuildSeconds(planet: Planet, id: BuildingId, speed: number): number {
  return buildTimeSeconds(nextLevelCost(planet, id), planet.buildings.roboticsFactory, speed);
}

/**
 * Which resources are we short of, and by how much? Used by the buildings
 * screen to paint the individual shortfall in red rather than just disabling
 * the whole card.
 */
export function shortfall(resources: Resources, cost: Resources): Resources {
  return {
    metal: Math.max(0, cost.metal - resources.metal),
    crystal: Math.max(0, cost.crystal - resources.crystal),
    deuterium: Math.max(0, cost.deuterium - resources.deuterium),
  };
}

/**
 * May the player start this upgrade?
 *
 * Returns a discriminated union rather than a boolean so the UI can show the
 * *reason*. A disabled button with no explanation is one of the most common and
 * most frustrating failures in this genre of game.
 *
 * Two rules in this milestone:
 *
 * 1. **One build at a time per planet.** This is OGame's rule and it is a real
 *    design decision, not a limitation: it forces the player to *choose* what
 *    matters next instead of dumping their whole bank into a queue and walking
 *    away. (A Nanite Factory / queue-length upgrade can relax it later.)
 * 2. **You must be able to pay right now.** No debt, no reservations.
 */
export function canQueue(planet: Planet, buildingId: BuildingId): Check {
  if (planet.queue.length > 0) {
    const current = BUILDINGS[planet.queue[0].buildingId].name;
    return { ok: false, reason: `${current} is already under construction` };
  }

  const cost = nextLevelCost(planet, buildingId);
  if (!canAfford(planet.resources, cost)) {
    const missing = shortfall(planet.resources, cost);
    // Name the specific resources, cheapest signal for the player to act on.
    const parts: string[] = [];
    if (missing.metal > 0) parts.push(`${Math.ceil(missing.metal)} metal`);
    if (missing.crystal > 0) parts.push(`${Math.ceil(missing.crystal)} crystal`);
    if (missing.deuterium > 0) parts.push(`${Math.ceil(missing.deuterium)} deuterium`);
    return { ok: false, reason: `Need ${parts.join(', ')} more` };
  }

  return { ok: true };
}

/**
 * Begin an upgrade: deduct the cost and push a queue item.
 *
 * Throws if `canQueue` would refuse. That is deliberate - the UI is expected to
 * check first and disable the button, so reaching this function in a failing
 * state means a genuine bug, and a loud failure beats a silent no-op that
 * leaves the player wondering why nothing happened.
 *
 * The queue item stores absolute timestamps rather than a remaining duration.
 * That is what makes offline progress free: we do not need to know the app was
 * closed, we just compare `finishesAt` to the current time on next load.
 */
export function startBuild(
  planet: Planet,
  buildingId: BuildingId,
  now: number,
  speed: number,
): Planet {
  const check = canQueue(planet, buildingId);
  if (!check.ok) {
    throw new Error(`Cannot build ${buildingId}: ${check.reason}`);
  }

  const targetLevel = nextLevel(planet, buildingId);
  const cost = buildingCost(buildingId, targetLevel);
  const seconds = buildTimeSeconds(cost, planet.buildings.roboticsFactory, speed);

  return {
    ...planet,
    resources: subtractResources(planet.resources, cost),
    queue: [
      {
        buildingId,
        targetLevel,
        startedAt: now,
        finishesAt: now + seconds * 1000,
      },
    ],
  };
}

/**
 * Abort the in-progress build and refund it in full.
 *
 * A *full* refund (OGame's behaviour) rather than a partial one keeps the
 * decision reversible: mis-clicking a 3-day building should not be punished.
 * The cost of cancelling is the time already spent, which is punishment enough.
 *
 * We refuse to cancel a build that has already finished as of `now`. The store
 * always ticks before acting, so this should be unreachable - but if it ever
 * were reachable it would be an exploit: refund the cost *and* keep the level.
 */
export function cancelBuild(planet: Planet, now: number): Planet {
  const item = planet.queue[0];
  if (!item) return planet;

  if (item.finishesAt <= now) {
    throw new Error(
      `Cannot cancel ${item.buildingId}: it already completed at ${item.finishesAt}. ` +
        'Run tick() before mutating the queue.',
    );
  }

  const refund = buildingCost(item.buildingId, item.targetLevel);
  return {
    ...planet,
    resources: addResources(planet.resources, refund),
    queue: [],
  };
}
