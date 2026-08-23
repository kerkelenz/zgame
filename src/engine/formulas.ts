/**
 * Every number in the game, derived from first principles.
 *
 * Each function here is pure: same inputs -> same output, no clock, no state,
 * no side effects. That makes them trivially unit-testable (see
 * `__tests__/formulas.test.ts`) and safe to call from render code without
 * worrying about hidden mutation.
 */

import { BUILDINGS, BUILD_TIME_DIVISOR, MIN_BUILD_SECONDS, STORAGE_BUILDING } from './constants';
import type { BuildingId, Resources } from './types';

// ---------------------------------------------------------------------------
// Resource arithmetic
// ---------------------------------------------------------------------------
// Resources are a 3-tuple we add, subtract and scale constantly. These tiny
// helpers exist so the rest of the engine never hand-writes
// `{ metal: a.metal + b.metal, ... }` - which is exactly the kind of line where
// a copy-paste typo (`crystal: a.crystal + b.metal`) hides for weeks.

export function addResources(a: Resources, b: Resources): Resources {
  return {
    metal: a.metal + b.metal,
    crystal: a.crystal + b.crystal,
    deuterium: a.deuterium + b.deuterium,
  };
}

export function subtractResources(a: Resources, b: Resources): Resources {
  return {
    metal: a.metal - b.metal,
    crystal: a.crystal - b.crystal,
    deuterium: a.deuterium - b.deuterium,
  };
}

export function scaleResources(a: Resources, factor: number): Resources {
  return {
    metal: a.metal * factor,
    crystal: a.crystal * factor,
    deuterium: a.deuterium * factor,
  };
}

export const ZERO_RESOURCES: Resources = { metal: 0, crystal: 0, deuterium: 0 };

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

/**
 * Cost of upgrading a building *to* `level`.
 *
 *     cost(level) = floor(baseCost * costFactor^(level - 1))
 *
 * The `level - 1` exponent is what makes level 1 cost exactly the base cost
 * (anything^0 === 1). Passing level 0 or below is meaningless - you cannot
 * "build" a level you already have - so we clamp the exponent at 0.
 *
 * We floor each component independently, matching OGame's displayed costs.
 * That is why a level 2 metal mine costs 22 crystal and not 22.5.
 *
 * Examples:
 *   buildingCost('metalMine', 1) -> { metal: 60, crystal: 15, deuterium: 0 }
 *   buildingCost('metalMine', 2) -> { metal: 90, crystal: 22, deuterium: 0 }
 */
export function buildingCost(id: BuildingId, level: number): Resources {
  const def = BUILDINGS[id];
  const exponent = Math.max(0, level - 1);
  const multiplier = Math.pow(def.costFactor, exponent);
  return {
    metal: Math.floor(def.baseCost.metal * multiplier),
    crystal: Math.floor(def.baseCost.crystal * multiplier),
    deuterium: Math.floor(def.baseCost.deuterium * multiplier),
  };
}

/** Total cost the player has already sunk into a building, levels 1..level. */
export function totalInvested(id: BuildingId, level: number): Resources {
  let total = ZERO_RESOURCES;
  for (let l = 1; l <= level; l++) {
    total = addResources(total, buildingCost(id, l));
  }
  return total;
}

// ---------------------------------------------------------------------------
// Build time
// ---------------------------------------------------------------------------

/**
 * How long an upgrade takes, in seconds.
 *
 *     seconds = (metal + crystal) / (2500 * (1 + robotics) * speed) * 3600
 *
 * Reading it piece by piece:
 *
 * - `metal + crystal` - deuterium is deliberately excluded. In OGame deuterium
 *   is the "fuel" resource; it makes things *expensive*, not *slow*.
 * - `2500` - the base construction throughput, in (metal + crystal) per hour.
 *   The surrounding `/ ... * 3600` converts "hours of work" into seconds.
 * - `(1 + robotics)` - each Robotics Factory level adds one more unit of
 *   throughput, so level 1 halves build time, level 2 makes it a third, and so
 *   on. Strong early, sharply diminishing later, which is the intended shape:
 *   robotics is a good *first* investment, not an infinite one.
 * - `speed` - the universe speed multiplier. This denominator is exactly what
 *   OGame scales for "x2" / "x5" universes: doubling `speed` halves every build
 *   time across the board without touching any other table.
 *
 * Clamped to at least one second so the countdown UI always has something to
 * count, and so a zero-cost building can never produce a zero-length build.
 */
export function buildTimeSeconds(cost: Resources, roboticsLevel: number, speed: number): number {
  const structuralCost = cost.metal + cost.crystal;
  const throughputPerHour = BUILD_TIME_DIVISOR * (1 + roboticsLevel) * speed;
  const hours = structuralCost / throughputPerHour;
  return Math.max(MIN_BUILD_SECONDS, hours * 3600);
}

// ---------------------------------------------------------------------------
// Mine output
// ---------------------------------------------------------------------------
//
// All three mines share the same skeleton:
//
//     perHour = coefficient * level * 1.1^level * speed
//
// The `level * 1.1^level` term is the heart of OGame's pacing. It is not purely
// exponential: the linear `level` factor means early levels give a big absolute
// jump, while the 1.1^level factor means late levels compound. Since cost grows
// at 1.5^level (or 1.6^level), cost always outruns output - every level has a
// longer payback period than the one before it. That widening gap is the
// tension the whole game is built on.

/** Metal per hour from a metal mine of the given level. */
export function metalProductionPerHour(level: number, speed: number): number {
  return 30 * level * Math.pow(1.1, level) * speed;
}

/** Crystal per hour from a crystal mine of the given level. */
export function crystalProductionPerHour(level: number, speed: number): number {
  return 20 * level * Math.pow(1.1, level) * speed;
}

/**
 * Deuterium per hour from a synthesizer of the given level.
 *
 *     perHour = 10 * level * 1.1^level * (1.44 - 0.004 * avgTemp) * speed
 *
 * The extra `(1.44 - 0.004 * avgTemp)` factor is why **deuterium likes cold
 * planets**: the process condenses heavy water out of the atmosphere, and
 * condensation is easier when it is cold. Some concrete values:
 *
 *   avgTemp  -40 C -> factor 1.60  (a frozen outer-system world: +60%)
 *   avgTemp   10 C -> factor 1.40  (our Homeworld: a solid bonus)
 *   avgTemp  110 C -> factor 1.00  (a scorched inner world: no bonus at all)
 *
 * This becomes a real strategic lever once colonisation lands: a cold planet is
 * a deuterium planet, a hot one is not. The factor could in principle go
 * negative on an absurdly hot world, so we clamp it at zero.
 */
export function deuteriumProductionPerHour(level: number, avgTemp: number, speed: number): number {
  const temperatureFactor = Math.max(0, 1.44 - 0.004 * avgTemp);
  return 10 * level * Math.pow(1.1, level) * temperatureFactor * speed;
}

// ---------------------------------------------------------------------------
// Energy
// ---------------------------------------------------------------------------

/**
 * Energy produced by a Solar Plant of the given level.
 *
 * Note it uses the same `level * 1.1^level` shape as the mines but is *not*
 * multiplied by universe speed. Energy is a ratio problem, not a rate problem:
 * what matters is whether supply covers demand. Since demand is also
 * speed-independent, leaving speed out of both keeps the power balance
 * identical in a x1 and a x5 universe.
 */
export function solarPlantEnergy(level: number): number {
  return 20 * level * Math.pow(1.1, level);
}

/**
 * Energy drawn by a building of the given level.
 *
 * Metal and crystal mines draw `10 * level * 1.1^level`; the deuterium
 * synthesizer draws double that, which is the balancing cost of deuterium being
 * the most valuable resource.
 *
 * Because consumption grows at 1.1^level and a Solar Plant level also grows at
 * 1.1^level, you need roughly one solar level per two mine levels forever - a
 * steady tax on your economy rather than a one-off purchase.
 */
export function energyConsumption(id: BuildingId, level: number): number {
  if (level <= 0) return 0;
  switch (id) {
    case 'metalMine':
    case 'crystalMine':
      return 10 * level * Math.pow(1.1, level);
    case 'deuteriumSynthesizer':
      return 20 * level * Math.pow(1.1, level);
    default:
      // Storages and facilities are unpowered in this milestone. Fusion
      // reactors and research-driven energy tech arrive in a later one.
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * How much of one resource a planet can hold, given its storage building level.
 *
 *     capacity(level) = 5000 * floor(2.5 * e^(20 * level / 33))
 *
 * This is OGame's storage curve verbatim. Two things worth noticing:
 *
 * - **Level 0 gives 10,000.** e^0 = 1, floor(2.5 * 1) = 2, 2 * 5000 = 10,000.
 *   So every planet has a free silo; you only build storage once your mines
 *   start overflowing it.
 * - **The floor sits inside the multiplication.** That is what produces the
 *   characteristic round-ish capacities (10k, 20k, 40k, 75k, 140k, ...) instead
 *   of arbitrary decimals. Do not "simplify" this to `floor(12500 * e^...)`;
 *   that yields different, wrong numbers.
 *
 * Capacity grows at about e^0.606 = 1.83x per level, which is much faster than
 * mine output grows (1.1x). That is intentional: storage is a chore you visit
 * occasionally, not a treadmill you run forever.
 */
export function storageCapacity(level: number): number {
  return 5000 * Math.floor(2.5 * Math.exp((20 * level) / 33));
}

/** Capacity for each of the three resources, given a planet's building levels. */
export function storageCapacities(buildings: Record<BuildingId, number>): Resources {
  return {
    metal: storageCapacity(buildings[STORAGE_BUILDING.metal]),
    crystal: storageCapacity(buildings[STORAGE_BUILDING.crystal]),
    deuterium: storageCapacity(buildings[STORAGE_BUILDING.deuterium]),
  };
}
