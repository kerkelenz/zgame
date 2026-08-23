/**
 * The engine's public API.
 *
 * Everything outside `src/engine` should import from here (`@/engine`) rather
 * than reaching into individual files. That gives us one place to see the whole
 * surface area, and the freedom to reorganise the internals without touching a
 * single call site.
 *
 * Remember the rule this module enforces by convention and eslint.config.js
 * enforces mechanically: **the engine is timeless**. Nothing in here reads a
 * clock, touches storage, or knows React exists. `now` is always a parameter.
 */

// ---- Types -----------------------------------------------------------------
export type {
  BuildQueueItem,
  BuildingId,
  Check,
  Coordinates,
  GameState,
  Planet,
  ResourceId,
  Resources,
} from './types';

// ---- Balance data ----------------------------------------------------------
export {
  BASE_PRODUCTION_PER_HOUR,
  BUILDINGS,
  BUILDING_IDS,
  DEFAULT_SPEED,
  SAVE_VERSION,
  STARTING_RESOURCES,
  STORAGE_BUILDING,
  emptyBuildings,
} from './constants';
export type { BuildingCategory, BuildingDefinition } from './constants';

// ---- Formulas --------------------------------------------------------------
export {
  ZERO_RESOURCES,
  addResources,
  buildTimeSeconds,
  buildingCost,
  crystalProductionPerHour,
  deuteriumProductionPerHour,
  energyConsumption,
  metalProductionPerHour,
  scaleResources,
  solarPlantEnergy,
  storageCapacities,
  storageCapacity,
  subtractResources,
  totalInvested,
} from './formulas';

// ---- Production ------------------------------------------------------------
export {
  applyProduction,
  averageTemperature,
  computeEnergy,
  computeProduction,
} from './production';
export type { EnergyReport, ProductionReport } from './production';

// ---- Commands --------------------------------------------------------------
export {
  canAfford,
  canQueue,
  cancelBuild,
  nextLevel,
  nextLevelBuildSeconds,
  nextLevelCost,
  shortfall,
  startBuild,
} from './buildings';

// ---- Queue + time ----------------------------------------------------------
export { completeFinishedBuilds } from './queue';
export type { CompletionResult } from './queue';
export { tick } from './tick';
export type { TickCompletion, TickResult } from './tick';

// ---- World generation ------------------------------------------------------
export { createNewGame, mulberry32, randomInt } from './newGame';
