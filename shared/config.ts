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
  /** a battle leaves a repairable wreck field when the defender loses at least this much (metal + crystal) in ships */
  wreckMinValue: number;
  /** hours a wreck field stays before it drifts away */
  wreckHours: number;
  /** vacation mode lasts at least this many real hours */
  vacationMinHours: number;
  /** days without a login before a commander shows as inactive (i) and long inactive (I) */
  inactiveDays: number;
  longInactiveDays: number;
  /** 1: new commanders follow the quest line and the menu opens page by page as they progress; 0: everyone has every page from the start */
  onboarding: number;
  /** a season lasts this many days, then the universe resets (0 = endless) */
  seasonDays: number;
  /** hours between the end of a season and the automatic reset (0 = wait for an admin) */
  seasonResetHours: number;
  /** the first commander to reach this many points wins early (0 = disabled) */
  victoryPoints: number;
  /** hours between Void invasions (0 = none) */
  invasionIntervalHours: number;
  /** hours of warning before an invasion arrives, and how long it lasts */
  invasionAnnounceHours: number;
  invasionDurationHours: number;
  /** minutes between engagements at the front */
  invasionEngageMinutes: number;
  /** how many waves an invasion has (1 = a single Armada), the chance each active commander is hit by a strike team per wave, their strength, and the pause after a wave is cleared (minutes) */
  invasionWaves: number;
  invasionHomeShare: number;
  invasionStrikeStrength: number;
  invasionBreatherMinutes: number;
  /** the Armada's size as a share of all commanders' combat fleets (by resource value) when it is announced */
  invasionStrength: number;
  /** hours a Moon Forge takes (0 = the Moon Forge is switched off) */
  forgeHours: number;
  /** share of destroyed ships' metal and crystal that stays behind as a debris field, before Geologist and class bonuses */
  debrisShare: number;
  /** deuterium per hour a planet's stationed ships burn, as a share of their metal and crystal value (0 = no upkeep); it grows with the size of the fleet on one planet, doubling at `fleetUpkeepKnee` value */
  fleetUpkeep: number;
  fleetUpkeepKnee: number;
  /** Deuterium every Deathstar burns to take part in a combat mission (attack, moon destruction, invasion), and the hours its planet's Deathstars then wait before the next one (0 = none) */
  deathstarFuel: number;
  deathstarCooldownHours: number;
  /** share of a fleet's surviving ships that come home from a battle damaged (0 = no damage), the hours they then spend in repair on their home planet and the share of their metal and crystal value the repair costs */
  battleDamage: number;
  repairHours: number;
  repairCost: number;
  /** hours a player-market offer stands before it expires (0 = the market is switched off), the fee in percent the market keeps from what a buyer receives (not on alliance offers), and how many offers one commander may have open */
  marketHours: number;
  marketFeePercent: number;
  marketMaxOffers: number;
  /** minutes of active play between encounters at a commander's planets: somewhere in this range (0 = no encounters) */
  encounterMinMinutes: number;
  encounterMaxMinutes: number;
  /** at most this many encounters per commander per UTC day (0 = no limit): keeps the bonus a small share of the income */
  encounterDailyMax: number;
  /** pirate and alien outposts settled in each galaxy (0 = none), and the hours before a cleared one is rebuilt */
  outpostsPerGalaxy: number;
  outpostRespawnHours: number;
  /** length of an alliance war in hours (0 = wars are switched off) */
  warHours: number;
  /** no invasions until this many commanders have started playing */
  invasionMinPlayers: number;
  /** registration closes at this many commanders */
  maxPlayers: number;
  startResources: { metal: number; crystal: number; deuterium: number };
}

export const DEFAULT_CONFIG: UniverseConfig = {
  galaxies: 2,
  systems: 40,
  positions: 15,
  economySpeed: 20,
  productionBoost: 1,
  researchBoost: 1,
  constructionBoost: 1,
  shipyardBoost: 1,
  storageBoost: 5,
  fleetSpeed: 10,
  protectionPoints: 200,
  protectionRatio: 5,
  raidIntervalMin: 45,
  npcDensity: 0.3,
  raidStrength: 1,
  wreckMinValue: 100_000,
  wreckHours: 72,
  invasionIntervalHours: 72,
  invasionAnnounceHours: 12,
  invasionDurationHours: 24,
  invasionEngageMinutes: 30,
  invasionWaves: 4,
  invasionHomeShare: 0.5,
  invasionStrikeStrength: 1,
  invasionBreatherMinutes: 20,
  invasionStrength: 0.35,
  invasionMinPlayers: 2,
  warHours: 48,
  forgeHours: 12,
  debrisShare: 0.15,
  fleetUpkeep: 0.0003,
  fleetUpkeepKnee: 20_000_000,
  deathstarFuel: 500_000,
  deathstarCooldownHours: 12,
  battleDamage: 0.3,
  repairHours: 3,
  repairCost: 0.1,
  marketHours: 48,
  encounterMinMinutes: 20,
  encounterMaxMinutes: 40,
  encounterDailyMax: 6,
  outpostsPerGalaxy: 6,
  outpostRespawnHours: 12,
  marketFeePercent: 5,
  marketMaxOffers: 5,
  onboarding: 1,
  seasonDays: 0,
  seasonResetHours: 24,
  victoryPoints: 0,
  vacationMinHours: 48,
  inactiveDays: 7,
  longInactiveDays: 28,
  maxPlayers: 500,
  startResources: { metal: 1500, crystal: 800, deuterium: 300 },
};
