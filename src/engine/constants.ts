/**
 * Balance tables.
 *
 * These numbers are lifted from classic OGame so the game "feels right" to
 * anyone who has played it: the cost curves, the 1.1^level production growth
 * and the storage curve are all recognisable. Keeping every tunable in one file
 * means re-balancing later is a single-file diff rather than a treasure hunt.
 */

import type { BuildingId, Resources } from './types';

/**
 * Every building id, in the order we want to show them in the UI.
 *
 * Typed as `readonly BuildingId[]` so adding a new id to the union without
 * adding it here is caught by the `BUILDINGS` record below (which must be
 * exhaustive), and so nothing can accidentally push into this array at runtime.
 */
export const BUILDING_IDS = [
  'metalMine',
  'crystalMine',
  'deuteriumSynthesizer',
  'solarPlant',
  'roboticsFactory',
  'shipyard',
  'researchLab',
  'metalStorage',
  'crystalStorage',
  'deuteriumTank',
] as const satisfies readonly BuildingId[];

/** Broad grouping, used by the UI to decide which extra stats to show. */
export type BuildingCategory = 'mine' | 'energy' | 'storage' | 'facility';

export type BuildingDefinition = {
  id: BuildingId;
  name: string;
  category: BuildingCategory;
  /** Cost of level 1. Every later level is this scaled by `costFactor`. */
  baseCost: Resources;
  /**
   * Geometric growth of cost per level: `baseCost * costFactor^(level-1)`.
   *
   * Why geometric and not linear? It is what makes an OGame-like game a game.
   * Mine *output* grows by a factor of 1.1 per level while *cost* grows by 1.5,
   * so each level takes longer to pay for itself than the last. That widening
   * gap is the entire pacing mechanism — it is what stops you from simply
   * spamming the metal mine forever and forces you to branch into crystal,
   * energy, storage and (later) research.
   */
  costFactor: number;
  /** One-line flavour/explanation shown on the building card. */
  description: string;
};

/**
 * The master building table.
 *
 * `Record<BuildingId, ...>` makes this exhaustive: add a member to the
 * `BuildingId` union and TypeScript will refuse to compile until it is
 * described here too.
 */
export const BUILDINGS: Record<BuildingId, BuildingDefinition> = {
  metalMine: {
    id: 'metalMine',
    name: 'Metal Mine',
    category: 'mine',
    baseCost: { metal: 60, crystal: 15, deuterium: 0 },
    costFactor: 1.5,
    description: 'Strip-mines the crust. Metal is the bulk material for everything you build.',
  },
  crystalMine: {
    id: 'crystalMine',
    name: 'Crystal Mine',
    category: 'mine',
    baseCost: { metal: 48, crystal: 24, deuterium: 0 },
    costFactor: 1.6,
    // Note the steeper 1.6 factor: crystal is scarcer than metal by design,
    // which is what makes crystal the bottleneck resource in the mid-game.
    description: 'Extracts crystalline ore used in electronics and shielding.',
  },
  deuteriumSynthesizer: {
    id: 'deuteriumSynthesizer',
    name: 'Deuterium Synthesizer',
    category: 'mine',
    baseCost: { metal: 225, crystal: 75, deuterium: 0 },
    costFactor: 1.5,
    description: 'Condenses heavy water from the atmosphere. Works better on cold worlds.',
  },
  solarPlant: {
    id: 'solarPlant',
    name: 'Solar Plant',
    category: 'energy',
    baseCost: { metal: 75, crystal: 30, deuterium: 0 },
    costFactor: 1.5,
    description: 'Powers your mines. Without enough energy, every mine runs at reduced output.',
  },
  roboticsFactory: {
    id: 'roboticsFactory',
    name: 'Robotics Factory',
    category: 'facility',
    baseCost: { metal: 400, crystal: 120, deuterium: 200 },
    costFactor: 2,
    description: 'Construction drones. Each level speeds up every future build on this planet.',
  },
  shipyard: {
    id: 'shipyard',
    name: 'Shipyard',
    category: 'facility',
    baseCost: { metal: 400, crystal: 200, deuterium: 100 },
    costFactor: 2,
    description: 'Assembles ships and defences. (Reserved for a later milestone.)',
  },
  researchLab: {
    id: 'researchLab',
    name: 'Research Lab',
    category: 'facility',
    baseCost: { metal: 200, crystal: 400, deuterium: 200 },
    costFactor: 2,
    description: 'Unlocks and accelerates technologies. (Reserved for a later milestone.)',
  },
  metalStorage: {
    id: 'metalStorage',
    name: 'Metal Storage',
    category: 'storage',
    baseCost: { metal: 1000, crystal: 0, deuterium: 0 },
    costFactor: 2,
    description: 'Raises the metal ceiling. Production stops dead once storage is full.',
  },
  crystalStorage: {
    id: 'crystalStorage',
    name: 'Crystal Storage',
    category: 'storage',
    baseCost: { metal: 1000, crystal: 500, deuterium: 0 },
    costFactor: 2,
    description: 'Raises the crystal ceiling.',
  },
  deuteriumTank: {
    id: 'deuteriumTank',
    name: 'Deuterium Tank',
    category: 'storage',
    baseCost: { metal: 1000, crystal: 1000, deuterium: 0 },
    costFactor: 2,
    description: 'Raises the deuterium ceiling.',
  },
};

/**
 * Which storage building raises the ceiling for which resource.
 *
 * Expressed as a lookup rather than hard-coded `if`s so `applyProduction` can
 * loop over the three resources uniformly.
 */
export const STORAGE_BUILDING: Record<keyof Resources, BuildingId> = {
  metal: 'metalStorage',
  crystal: 'crystalStorage',
  deuterium: 'deuteriumTank',
};

/**
 * The "free" trickle every planet produces with zero mines, per hour.
 *
 * OGame gives this so that a brand-new player (or one who has just been raided
 * down to nothing) is never permanently stuck at zero income. It is deliberately
 * tiny — a level 5 metal mine already out-produces it eight times over — but it
 * guarantees the game can always recover.
 *
 * Note that it is *not* affected by the energy shortage penalty: this trickle
 * represents ambient scavenging, not powered industry.
 */
export const BASE_PRODUCTION_PER_HOUR: Resources = {
  metal: 30,
  crystal: 15,
  deuterium: 0,
};

/** What a fresh empire starts with. Enough for a couple of early mine levels. */
export const STARTING_RESOURCES: Resources = {
  metal: 500,
  crystal: 500,
  deuterium: 0,
};

/** Default universe speed. 1 = classic OGame pacing. */
export const DEFAULT_SPEED = 1;

/**
 * Save-format version. Bump this whenever `GameState`'s shape changes
 * incompatibly, and add a step to `migrate()` in `src/state/persistence.ts`.
 */
export const SAVE_VERSION = 1;

/**
 * Divisor in the build-time formula. In OGame this constant is what universe
 * speed scales, so a "x5 universe" builds five times faster.
 */
export const BUILD_TIME_DIVISOR = 2500;

/** A build can never be instant; the UI needs at least one frame of countdown. */
export const MIN_BUILD_SECONDS = 1;

/** All building levels start at zero on a new planet. */
export function emptyBuildings(): Record<BuildingId, number> {
  return {
    metalMine: 0,
    crystalMine: 0,
    deuteriumSynthesizer: 0,
    solarPlant: 0,
    roboticsFactory: 0,
    shipyard: 0,
    researchLab: 0,
    metalStorage: 0,
    crystalStorage: 0,
    deuteriumTank: 0,
  };
}
