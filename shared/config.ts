/** Universe-wide tunables. Override via env on the server (see server/config.ts). */
export interface UniverseConfig {
  galaxies: number;
  systems: number;
  positions: number;
  /** multiplies production and divides build/research/ship times */
  economySpeed: number;
  /** divides fleet flight times */
  fleetSpeed: number;
  /** players below this many points can't be attacked (and can't attack) */
  protectionPoints: number;
  /** attacker/defender strength ratio above which the weaker side is protected */
  protectionRatio: number;
  /** minutes between NPC raid waves (0 disables) */
  raidIntervalMin: number;
  startResources: { metal: number; crystal: number; deuterium: number };
}

export const DEFAULT_CONFIG: UniverseConfig = {
  galaxies: 2,
  systems: 40,
  positions: 15,
  economySpeed: 20,
  fleetSpeed: 10,
  protectionPoints: 200,
  protectionRatio: 5,
  raidIntervalMin: 45,
  startResources: { metal: 1500, crystal: 800, deuterium: 300 },
};
