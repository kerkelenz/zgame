/**
 * Core data shapes for the simulation.
 *
 * Everything here is a plain, JSON-serialisable value. That is not an accident:
 * the whole `GameState` gets `JSON.stringify`-ed into AsyncStorage by
 * `src/state/persistence.ts`. If you are ever tempted to put a `Date`, a `Map`,
 * a `Set` or a class instance in here — don't. They do not survive a
 * stringify/parse round-trip intact, and a save file that silently changes
 * shape when reloaded is a miserable bug to track down.
 *
 * Timestamps are therefore **numbers**: milliseconds since the Unix epoch,
 * exactly what `Date.now()` returns.
 */

/** The three currencies of the empire. */
export type Resources = {
  metal: number;
  crystal: number;
  deuterium: number;
};

/** Convenient alias for "one of the three resource fields". */
export type ResourceId = keyof Resources;

/**
 * Every building that can exist on a planet.
 *
 * Using a string-literal union (rather than an enum or bare `string`) buys us a
 * lot: `Record<BuildingId, number>` is exhaustively checked, a typo in a
 * building id is a compile error, and `switch` statements can be proven
 * exhaustive by the compiler.
 */
export type BuildingId =
  | 'metalMine'
  | 'crystalMine'
  | 'deuteriumSynthesizer'
  | 'solarPlant'
  | 'roboticsFactory'
  | 'shipyard'
  | 'researchLab'
  | 'metalStorage'
  | 'crystalStorage'
  | 'deuteriumTank';

/** Where a planet sits in the universe: galaxy:system:position, e.g. 1:42:8. */
export type Coordinates = {
  galaxy: number;
  system: number;
  position: number;
};

/**
 * One pending upgrade.
 *
 * We store `startedAt` as well as `finishesAt` even though only the latter is
 * needed to know *when* it lands — `startedAt` lets the UI draw a progress bar
 * without re-deriving the original build duration from the cost tables.
 *
 * `targetLevel` is the level the building will have *after* this item
 * completes. Storing the target rather than a delta means a save file is
 * self-describing: you can look at a queue item in isolation and know exactly
 * what it does.
 */
export type BuildQueueItem = {
  buildingId: BuildingId;
  targetLevel: number;
  /** ms since epoch */
  startedAt: number;
  /** ms since epoch */
  finishesAt: number;
};

export type Planet = {
  id: string;
  name: string;
  coords: Coordinates;
  /** In kilometres. Governs how many building slots the planet has (later milestone). */
  diameter: number;
  /**
   * Surface temperature range in °C. The *average* of min and max drives
   * deuterium output — see `deuteriumProductionPerHour`.
   */
  temperature: { min: number; max: number };
  resources: Resources;
  buildings: Record<BuildingId, number>;
  queue: BuildQueueItem[];
};

export type GameState = {
  /**
   * Save-format version. Bumped whenever the shape of `GameState` changes in a
   * way old saves cannot be read as-is; `src/state/persistence.ts#migrate`
   * upgrades older saves to the current version on load.
   */
  version: number;
  /** ms since epoch — when this empire was founded. */
  createdAt: number;
  /**
   * ms since epoch — the last moment the simulation was advanced to.
   * Everything between `lastTick` and `Date.now()` is production the player has
   * earned but not yet been credited with, which is exactly how offline
   * progress works: we do not need a background process, just arithmetic.
   */
  lastTick: number;
  /**
   * Universe speed multiplier. 1 = classic OGame pace. Higher values speed up
   * both production and build times, which is why it is threaded through so
   * many formulas rather than applied once at the end.
   */
  speed: number;
  planets: Planet[];
  homePlanetId: string;
};

/**
 * Result type for "can the player do this?" checks.
 *
 * A discriminated union rather than a bare boolean, so the UI can *explain* the
 * refusal ("Not enough crystal", "Another building is already under
 * construction") instead of just greying out a button and leaving the player
 * to guess.
 */
export type Check = { ok: true } | { ok: false; reason: string };
