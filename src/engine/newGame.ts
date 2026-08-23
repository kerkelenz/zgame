/**
 * Creating a fresh empire.
 *
 * Also home to the seeded PRNG. Games in this genre generate a *lot* of world
 * content - hundreds of systems, each with planets of varying size, temperature
 * and composition - and we want that world to be reproducible: the same seed
 * must always produce the same galaxy. `Math.random()` cannot do that, so we
 * carry our own generator.
 */

import { DEFAULT_SPEED, SAVE_VERSION, STARTING_RESOURCES, emptyBuildings } from './constants';
import type { GameState, Planet } from './types';

/**
 * mulberry32 - a tiny, fast, seeded PRNG.
 *
 * Thirty-two bits of state, four lines of arithmetic, and statistical quality
 * far beyond anything a game needs. It is here rather than a dependency because
 * the *entire point* is that its output never changes: a library that "improved
 * its distribution" in a patch release would silently regenerate everyone's
 * universe.
 *
 * The `>>> 0` casts force unsigned 32-bit wraparound, which is what makes the
 * sequence identical on every platform - JavaScript numbers are doubles, so
 * without them the arithmetic would drift into float territory and stop being
 * reproducible.
 *
 * Returns a function producing floats in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random integer in [min, max], inclusive. */
export function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Every planet needs a stable id: it goes into the save file, and the store
 * addresses planets by it. We build one from the PRNG so that a given seed
 * always yields the same ids - which will matter once galaxy generation exists
 * and two clients must agree on what "planet 4:117:9" is called.
 */
function planetId(rng: () => number): string {
  const hex = Math.floor(rng() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  return `p_${hex}`;
}

/**
 * Build a brand-new game.
 *
 * The home planet is deliberately *not* randomised. Every OGame-alike gives new
 * players an identical, comfortable starting world - a mid-sized planet at a
 * mild temperature - so that early guides, tutorials and balance discussions
 * all describe the same thing. Randomness starts at colonisation, not at
 * character creation.
 *
 * @param now   Current time in ms since epoch. Becomes both `createdAt` and
 *              `lastTick`, so the very first tick credits zero production
 *              rather than crediting the player for the epoch.
 * @param seed  Optional seed for reproducible worlds. Defaults to `now`, so
 *              ordinary new games differ from each other, while tests (and
 *              future shared universes) can pin it.
 */
export function createNewGame(now: number, seed?: number): GameState {
  const rng = mulberry32(seed ?? now);

  const home: Planet = {
    id: planetId(rng),
    name: 'Homeworld',
    coords: { galaxy: 1, system: 42, position: 8 },
    // 12,800 km - Earth-sized. Diameter will govern the number of building
    // slots once that constraint arrives.
    diameter: 12800,
    // -10 to 30 C averages out to 10 C, which gives a 1.40x deuterium bonus:
    // comfortable, but cold colonies will still be noticeably better.
    temperature: { min: -10, max: 30 },
    resources: { ...STARTING_RESOURCES },
    buildings: emptyBuildings(),
    queue: [],
  };

  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastTick: now,
    speed: DEFAULT_SPEED,
    planets: [home],
    homePlanetId: home.id,
  };
}
