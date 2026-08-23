/**
 * Resolving the build queue.
 *
 * Kept separate from `buildings.ts` (which *starts* builds) because this is the
 * half that `tick` drives on a timer, and the split keeps each file small
 * enough to read in one sitting.
 */

import type { BuildQueueItem, Planet } from './types';

export type CompletionResult = {
  planet: Planet;
  /** Items that finished during this call, in the order they finished. */
  completed: BuildQueueItem[];
};

/**
 * Apply every queue item whose `finishesAt` has passed.
 *
 * The queue holds at most one item in this milestone, but the loop is written
 * for many: a later Nanite Factory upgrade will allow a real queue, and the
 * *order* matters when it does (two upgrades of the same building must land in
 * sequence, not both jump to the same level). Sorting by `finishesAt` first
 * makes that correct by construction.
 *
 * The returned `completed` list is what the UI will use to toast
 * "Metal Mine level 4 complete" - the store needs to know *what* finished, not
 * just that something did.
 */
export function completeFinishedBuilds(planet: Planet, now: number): CompletionResult {
  // Nothing to do is the overwhelmingly common case (this runs every second),
  // so bail out early without allocating a new planet object. Returning the
  // same reference also means React skips the re-render.
  if (planet.queue.length === 0 || !planet.queue.some((item) => item.finishesAt <= now)) {
    return { planet, completed: [] };
  }

  const due = planet.queue
    .filter((item) => item.finishesAt <= now)
    .sort((a, b) => a.finishesAt - b.finishesAt);

  const remaining = planet.queue.filter((item) => item.finishesAt > now);

  const buildings = { ...planet.buildings };
  for (const item of due) {
    // Assign the stored target level rather than incrementing. If a save file
    // is ever inconsistent, `targetLevel` is the authoritative record of what
    // the player paid for, and using it keeps levels from drifting.
    buildings[item.buildingId] = item.targetLevel;
  }

  return {
    planet: { ...planet, buildings, queue: remaining },
    completed: due,
  };
}

/**
 * How far along a queue item is, as a fraction in [0, 1].
 *
 * Derived from the two timestamps we already store rather than counted up by a
 * timer, which is what makes it correct after the app has been closed: reopen
 * six hours into an eight-hour build and the bar is at 75% on the first frame,
 * with nothing to catch up on.
 *
 * A zero-length item (possible only for a corrupt save, since
 * `buildTimeSeconds` clamps to one second) reports as finished rather than
 * dividing by zero.
 */
export function buildProgress(item: BuildQueueItem, now: number): number {
  const total = item.finishesAt - item.startedAt;
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, (now - item.startedAt) / total));
}
