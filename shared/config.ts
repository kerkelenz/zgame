/** Universe-wide tunables. Override via env on the server (see server/config.ts). */
export interface UniverseConfig {
  galaxies: number;
  systems: number;
  positions: number;
  /** multiplies production and divides build/research/ship times */
  economySpeed: number;
  /** extra multiplier on resource production (mines, basic income, energy-driven output) */
  productionBoost: number;
  /** extra multiplier on research speed (divides research time) */
  researchBoost: number;
  /** extra multiplier on building construction speed (divides construction time) */
  constructionBoost: number;
  /** extra multiplier on ship and defense build speed (divides shipyard time) */
  shipyardBoost: number;
  /** extra multiplier on storage capacity (level-0 storage = 10,000 x economySpeed x storageBoost) */
  storageBoost: number;
  /** divides fleet flight times */
  fleetSpeed: number;
  /** players below this many points can't be attacked (and can't attack) */
  protectionPoints: number;
  /** attacker/defender strength ratio above which the weaker side is protected */
  protectionRatio: number;
  /** minutes between NPC raid waves (0 disables) */
  raidIntervalMin: number;
  /** share of free slots settled by computer empires at world creation (0 = none) */
  npcDensity: number;
  /** multiplies the size of raiding fleets (0.6 relaxed, 1 standard, 1.35 brutal) */
  raidStrength: number;
  /** vacation mode lasts at least this many real hours */
  vacationMinHours: number;
  /** days without a login before a commander shows as inactive (i) and long inactive (I) */
  inactiveDays: number;
  longInactiveDays: number;
  /** registration closes at this many commanders */
  maxPlayers: number;
  startResources: { metal: number; crystal: number; deuterium: number };
}

export const DEFAULT_CONFIG: UniverseConfig = {
  galaxies: 2,
  systems: 40,
  positions: 15,
  economySpeed: 20,
  productionBoost: 5,
  researchBoost: 5,
  constructionBoost: 5,
  shipyardBoost: 5,
  storageBoost: 5,
  fleetSpeed: 10,
  protectionPoints: 200,
  protectionRatio: 5,
  raidIntervalMin: 45,
  npcDensity: 0.3,
  raidStrength: 1,
  vacationMinHours: 48,
  inactiveDays: 7,
  longInactiveDays: 28,
  maxPlayers: 500,
  startResources: { metal: 1500, crystal: 800, deuterium: 300 },
};
