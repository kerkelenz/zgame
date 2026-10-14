import type { Res } from './types';

/**
 * Things to spend on, over and over: empire upgrades (a level at a time, with no end except a cap), planet projects (the same, per planet),
 * boosts (a few hours of an effect, bought again when they run out) and monuments (once each, for the standing). Costs scale with the economy
 * speed so they are the same share of an income at any server speed. Pure data and arithmetic: the engine reads the effects through perks.ts.
 */
export interface Levelled { name: string; desc: string; max: number; base: Res; growth: number; /** what level n gives, in words */ effect: (n: number) => string }

export type EmpireId = 'constructionQueue' | 'researchQueue' | 'fleetCommand' | 'engineering' | 'archives' | 'tradeNetwork' | 'relay';
export type ProjectId = 'surveyors' | 'annex' | 'habitat' | 'vault';
export type BoostId = 'rapidBuild' | 'researchSurge' | 'fuelSaver';

const r = (metal = 0, crystal = 0, deuterium = 0): Res => ({ metal, crystal, deuterium });
const pct = (n: number, per: number) => `${Math.round(n * per * 10) / 10}%`;

export const EMPIRE_UPGRADES: Record<EmpireId, Levelled> = {
  constructionQueue: { name: 'Construction Bureau', desc: 'More buildings can wait in the construction queue.', max: 8, base: r(8000, 4000, 1500), growth: 1.9, effect: (n) => `${4 + n} buildings in the queue` },
  researchQueue: { name: 'Research Council', desc: 'More projects can wait in the research queue.', max: 8, base: r(5000, 9000, 3000), growth: 1.9, effect: (n) => `${4 + n} projects in the queue` },
  fleetCommand: { name: 'Fleet Command', desc: 'More fleets can be in flight at once.', max: 6, base: r(10000, 6000, 4000), growth: 2, effect: (n) => `+${n} fleet slot${n === 1 ? '' : 's'}` },
  engineering: { name: 'Engineering Guild', desc: 'Everything is built faster: buildings, research and ships.', max: 10, base: r(12000, 6000, 2000), growth: 1.75, effect: (n) => `${pct(n, 1.5)} shorter build, research and ship times` },
  archives: { name: 'Archives', desc: 'Research alone is finished faster.', max: 10, base: r(6000, 12000, 4000), growth: 1.75, effect: (n) => `${pct(n, 2)} shorter research` },
  tradeNetwork: { name: 'Trade Network', desc: 'The travelling merchant keeps a smaller cut.', max: 10, base: r(9000, 9000, 3000), growth: 1.7, effect: (n) => `the merchant's cut is ${pct(n, 0.6)} lower` },
  relay: { name: 'Deep-Space Relay', desc: 'Expeditions bring back more.', max: 10, base: r(8000, 8000, 8000), growth: 1.8, effect: (n) => `+${pct(n, 4)} from expeditions` },
};

export const PLANET_PROJECTS: Record<ProjectId, Levelled> = {
  surveyors: { name: 'Orbital Surveyors', desc: 'Satellites chart the richest seams: the mines of this planet yield more.', max: 10, base: r(10000, 8000, 3000), growth: 1.8, effect: (n) => `+${pct(n, 1.5)} mine output here` },
  annex: { name: 'Storage Annex', desc: 'Extra vaults for all three stores of this planet.', max: 10, base: r(6000, 3000, 0), growth: 1.7, effect: (n) => `+${pct(n, 8)} storage here` },
  habitat: { name: 'Habitat Rings', desc: 'Orbital rings add building fields to this planet.', max: 10, base: r(20000, 12000, 6000), growth: 2, effect: (n) => `+${2 * n} building fields here` },
  vault: { name: 'Fortified Vault', desc: 'Part of the stock here is out of the reach of raiders.', max: 10, base: r(15000, 10000, 2000), growth: 1.8, effect: (n) => `${pct(n, 4)} less taken when this planet is raided` },
};

export interface Boost { name: string; desc: string; hours: number; cost: Res }
export const BOOSTS: Record<BoostId, Boost> = {
  rapidBuild: { name: 'Rapid Assembly', desc: 'Every build, research and ship timer runs a quarter shorter.', hours: 4, cost: r(20000, 10000, 4000) },
  researchSurge: { name: 'Research Surge', desc: 'Research runs a quarter shorter, on top of anything else.', hours: 4, cost: r(10000, 20000, 6000) },
  fuelSaver: { name: 'Fuel Reserve', desc: 'Fleets burn 30% less Vespene Gas.', hours: 6, cost: r(0, 4000, 16000) },
};
export const BOOST_MAX_HOURS = 24;

export interface Monument { id: string; name: string; desc: string; cost: Res }
const m = (k: number): Res => r(250_000 * k, 200_000 * k, 100_000 * k);
export const MONUMENTS: Monument[] = [
  { id: 'beacon', name: 'Beacon', desc: 'A tower of light above your capital, seen from the next system.', cost: m(1) },
  { id: 'obelisk', name: 'Obelisk', desc: 'A black spire inscribed with your victories.', cost: m(5) },
  { id: 'spire', name: 'Spire', desc: 'A crown of crystal reaching into orbit.', cost: m(25) },
  { id: 'monolith', name: 'Monolith', desc: 'A moon-sized monument that casts a shadow on your capital.', cost: m(125) },
  { id: 'throne', name: 'Star Throne', desc: 'A throne built from a captured star.', cost: m(625) },
];

export interface PlayerUpgrades {
  /** empire upgrade levels */
  levels: Partial<Record<EmpireId, number>>;
  /** when each boost runs out */
  boosts: Partial<Record<BoostId, number>>;
  /** the monuments built */
  monuments: string[];
  /** resources spent on all of this, in unscaled value: one standing point for every thousand */
  spent: number;
}

/** the price of the next level (level 1 is the first purchase) at an economy speed */
export function levelCost(def: { base: Res; growth: number }, nextLevel: number, economySpeed: number): Res {
  const k = Math.max(1, economySpeed) * Math.pow(def.growth, Math.max(0, nextLevel - 1));
  const round = (v: number) => Math.round((v * k) / 100) * 100;
  return { metal: round(def.base.metal), crystal: round(def.base.crystal), deuterium: round(def.base.deuterium) };
}
export const scaledCost = (c: Res, economySpeed: number): Res => ({ metal: Math.round(c.metal * Math.max(1, economySpeed)), crystal: Math.round(c.crystal * Math.max(1, economySpeed)), deuterium: Math.round(c.deuterium * Math.max(1, economySpeed)) });
/** unscaled value of a price: what it would have cost at speed 1, metal + crystal as points count them */
export const unscaledValue = (c: Res, economySpeed: number) => (c.metal + c.crystal + c.deuterium) / Math.max(1, economySpeed);

export const empireLevel = (u: PlayerUpgrades | undefined, id: EmpireId) => u?.levels?.[id] ?? 0;
export const boostActive = (u: PlayerUpgrades | undefined, id: BoostId, now: number) => (u?.boosts?.[id] ?? 0) > now;
export const upgradePoints = (u: PlayerUpgrades | undefined) => Math.floor((u?.spent ?? 0) / 1000);
