/**
 * Test fixtures.
 *
 * Not a `*.test.ts` file, so vitest treats it as a plain module (see the
 * `include` pattern in vitest.config.ts).
 */

import { emptyBuildings } from '../constants';
import type { BuildingId, Planet, Resources } from '../types';

/** A fixed clock, so no test ever depends on the real one. */
export const T0 = 1_700_000_000_000; // 2023-11-14T22:13:20Z
export const HOUR = 3_600_000;

/**
 * Build a planet for testing. Everything is overridable, and the defaults are
 * deliberately boring: mild temperature (10 C average), no buildings, no queue.
 */
export function makePlanet(overrides: Partial<Planet> = {}): Planet {
  return {
    id: 'p_test',
    name: 'Testworld',
    coords: { galaxy: 1, system: 42, position: 8 },
    diameter: 12800,
    temperature: { min: -10, max: 30 },
    resources: { metal: 0, crystal: 0, deuterium: 0 },
    buildings: emptyBuildings(),
    queue: [],
    ...overrides,
  };
}

/** `makePlanet` but with a partial building map merged over the empty one. */
export function withBuildings(
  levels: Partial<Record<BuildingId, number>>,
  overrides: Partial<Planet> = {},
): Planet {
  return makePlanet({
    ...overrides,
    buildings: { ...emptyBuildings(), ...levels },
  });
}

export function resources(metal: number, crystal: number = 0, deuterium: number = 0): Resources {
  return { metal, crystal, deuterium };
}
