/**
 * Advancing the simulation through time.
 *
 * `tick` is the one function the rest of the app calls to move the game
 * forward. Everything else in the engine is a pure derivation; this is where
 * elapsed milliseconds get turned into resources and finished buildings.
 *
 * The engine never asks what time it is. `now` is always passed in. That single
 * discipline is what makes offline progress, fast-forward testing and a future
 * authoritative server all fall out for free: "the player was away for six
 * hours" and "the test wants to simulate six hours" are literally the same call.
 */

import { applyProduction } from './production';
import { completeFinishedBuilds } from './queue';
import type { BuildQueueItem, GameState, Planet } from './types';

/** One building that finished during a tick, tagged with where it happened. */
export type TickCompletion = {
  planetId: string;
  item: BuildQueueItem;
};

export type TickResult = {
  state: GameState;
  /** Everything that completed during this tick, for the UI to announce. */
  completed: TickCompletion[];
};

/**
 * Advance one planet from `from` to `to`.
 *
 * ## The subtlety this function exists to handle
 *
 * Suppose the player closes the app, and while they are away a Metal Mine
 * upgrade from level 3 to level 4 completes exactly halfway through their
 * two-hour absence. The naive implementations are both wrong:
 *
 * - Apply production for the whole window, *then* complete the build: the
 *   player gets 2 hours at the level-3 rate. They are cheated out of the hour
 *   the mine spent running at level 4.
 * - Complete the build first, *then* apply production for the whole window: the
 *   player gets 2 hours at the level-4 rate, including the hour before the mine
 *   even existed. Now they are being paid for a mine they did not have.
 *
 * The correct answer is to **split the window at every completion timestamp**
 * and integrate piecewise: one hour at the old rate, complete the build, then
 * one hour at the new rate. That is exactly what the loop below does.
 *
 * It generalises for free: three buildings finishing at different moments
 * during a week-long absence produce four segments, each computed at whatever
 * the levels were during that segment.
 */
function advancePlanet(
  planet: Planet,
  from: number,
  to: number,
  speed: number,
): { planet: Planet; completed: BuildQueueItem[] } {
  let current = planet;
  const completed: BuildQueueItem[] = [];

  // Clamp the start of the window. If the device clock jumped backwards,
  // `from` can be later than `to`; production for a negative window is zero
  // (`applyProduction` guards this) and we still want any overdue builds to
  // resolve.
  let cursor = Math.min(from, to);

  // Each iteration resolves the *earliest* still-pending completion inside the
  // window, so the queue strictly shrinks and the loop always terminates.
  for (;;) {
    let next: BuildQueueItem | null = null;
    for (const item of current.queue) {
      if (item.finishesAt <= to && (next === null || item.finishesAt < next.finishesAt)) {
        next = item;
      }
    }
    if (next === null) break;

    // `Math.max(cursor, ...)` guards against an item that was already overdue
    // when the window opened: we complete it, but we do not rewind the clock.
    const boundary = Math.max(cursor, next.finishesAt);

    // Segment 1..n: produce at the levels the planet had *before* this build.
    current = applyProduction(current, boundary - cursor, speed);

    // Then the build lands, changing the rates for every later segment.
    const result = completeFinishedBuilds(current, boundary);
    current = result.planet;
    completed.push(...result.completed);

    cursor = boundary;
  }

  // Final segment: from the last completion (or the start) to `to`.
  current = applyProduction(current, to - cursor, speed);

  return { planet: current, completed };
}

/**
 * Advance the whole game to `now`.
 *
 * Returns a new `GameState`; the input is not modified. Callers should always
 * use the returned state - see the immutability note in `production.ts` for why
 * mutating in place would break React re-renders.
 */
export function tick(state: GameState, now: number): TickResult {
  const completed: TickCompletion[] = [];

  const planets = state.planets.map((planet) => {
    const result = advancePlanet(planet, state.lastTick, now, state.speed);
    for (const item of result.completed) {
      completed.push({ planetId: planet.id, item });
    }
    return result.planet;
  });

  return {
    state: {
      ...state,
      planets,
      // `Math.max` rather than a plain assignment: if the device clock jumps
      // backwards, keeping the later timestamp means the player cannot be paid
      // twice for the same stretch of time once the clock catches up again.
      lastTick: Math.max(state.lastTick, now),
    },
    completed,
  };
}
