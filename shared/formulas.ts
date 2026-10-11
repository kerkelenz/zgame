import { BUILDINGS, POSITION_BONUS, TECHS, UNITS, crawlerBonus } from './data';
import type { BuildingId, Coords, Fleet, Res, ShipId, TechId, UnitId } from './types';

export type Levels<K extends string> = Partial<Record<K, number>>;
export const lvl = <K extends string>(m: Levels<K> | undefined, k: K) => (m && m[k]) || 0;

export const addRes = (a: Res, b: Res): Res => ({ metal: a.metal + b.metal, crystal: a.crystal + b.crystal, deuterium: a.deuterium + b.deuterium });
export const subRes = (a: Res, b: Res): Res => ({ metal: a.metal - b.metal, crystal: a.crystal - b.crystal, deuterium: a.deuterium - b.deuterium });
export const scaleRes = (a: Res, k: number): Res => ({ metal: a.metal * k, crystal: a.crystal * k, deuterium: a.deuterium * k });
export const canAfford = (have: Res, cost: Res) => have.metal >= cost.metal && have.crystal >= cost.crystal && have.deuterium >= cost.deuterium;
export const totalRes = (a: Res) => a.metal + a.crystal + a.deuterium;
export const zeroRes = (): Res => ({ metal: 0, crystal: 0, deuterium: 0 });

/** cost to build the given level (level >= 1) */
export function buildingCost(id: BuildingId, level: number): Res {
  const d = BUILDINGS[id];
  const k = Math.pow(d.factor, level - 1);
  return { metal: Math.floor(d.base.metal * k), crystal: Math.floor(d.base.crystal * k), deuterium: Math.floor(d.base.deuterium * k) };
}
export function techCost(id: TechId, level: number): Res {
  const d = TECHS[id];
  const k = Math.pow(d.factor, level - 1);
  return { metal: Math.floor(d.base.metal * k), crystal: Math.floor(d.base.crystal * k), deuterium: Math.floor(d.base.deuterium * k) };
}

/** seconds */
export function buildingTime(cost: Res, robotics: number, nanite: number, speed: number, factor = 1): number {
  const hours = (cost.metal + cost.crystal) / (2500 * (1 + robotics) * Math.pow(2, nanite) * speed);
  return Math.max(1, Math.floor(hours * 3600 * factor));
}
export function researchTime(cost: Res, lab: number, speed: number, allianceBonus = 0, factor = 1): number {
  const hours = (cost.metal + cost.crystal) / (1000 * (1 + lab) * speed);
  return Math.max(1, Math.floor(hours * 3600 * (1 - allianceBonus) * factor));
}
export function unitTime(id: UnitId, shipyard: number, nanite: number, speed: number, factor = 1): number {
  const c = UNITS[id].cost;
  const hours = (c.metal + c.crystal) / (5000 * (1 + shipyard) * Math.pow(2, nanite) * speed);
  return Math.max(0.1, hours * 3600 * factor);
}

export function storageCapacity(level: number): number {
  return 5000 * Math.floor(2.5 * Math.exp((20 * level) / 33));
}

export interface ProductionInput {
  buildings: Levels<BuildingId>;
  techs: Levels<TechId>;
  maxTemp: number;
  satellites: number;
  /** 0..1 slider per source; default 1 */
  settings?: Partial<Record<'metalMine' | 'crystalMine' | 'deuteriumSynthesizer' | 'solarPlant' | 'fusionReactor' | 'solarSatellite', number>>;
  speed: number;
  /** alliance production bonus e.g. 0.04 */
  allianceBonus?: number;
  /** moons have no free basic income */
  noBasic?: boolean;
  /** multiplies mine output (officers, faction perks) */
  boost?: number;
  /** multiplies energy production (officers) */
  energyBoost?: number;
  /** orbit 1-15 of a planet (0 or undefined: none, e.g. a moon) for the position bonus */
  position?: number;
  crawlers?: number;
  /** class multiplier on crawler effectiveness */
  crawlerMul?: number;
}
/** Where one resource's mine output comes from, per hour. potential = raw + plasma + placement + crawlers + boosts; total = potential - lostToEnergy. */
export interface MineBreakdown { raw: number; plasma: number; placement: number; crawlers: number; boosts: number; potential: number; lostToEnergy: number; total: number }
export interface ProductionDetail {
  /** free income that needs no mine (not on moons) */
  basic: { metal: number; crystal: number };
  mine: { metal: MineBreakdown; crystal: MineBreakdown; deuterium: MineBreakdown };
  energy: { solar: number; fusion: number; satellites: number; boosts: number; usedMetal: number; usedCrystal: number; usedDeuterium: number };
}
export interface Production {
  /** per hour at current efficiency */
  metal: number; crystal: number; deuterium: number;
  energyProduced: number; energyUsed: number; efficiency: number;
  fusionDeutUse: number;
  detail: ProductionDetail;
}

export function production(i: ProductionInput): Production {
  const s = (k: keyof NonNullable<ProductionInput['settings']>) => Math.min(1, Math.max(0, i.settings?.[k] ?? 1));
  const m = lvl(i.buildings, 'metalMine'), c = lvl(i.buildings, 'crystalMine'), d = lvl(i.buildings, 'deuteriumSynthesizer');
  const sp = lvl(i.buildings, 'solarPlant'), fu = lvl(i.buildings, 'fusionReactor');
  const et = lvl(i.techs, 'energy'), pl = lvl(i.techs, 'plasma');

  const energyProduced = Math.floor((
    20 * sp * Math.pow(1.1, sp) * s('solarPlant') +
    30 * fu * Math.pow(1.05 + 0.01 * et, fu) * s('fusionReactor') +
    i.satellites * Math.max(0, Math.floor((i.maxTemp + 140) / 6)) * s('solarSatellite')) * (i.energyBoost ?? 1));
  const energyUsed =
    10 * m * Math.pow(1.1, m) * s('metalMine') +
    10 * c * Math.pow(1.1, c) * s('crystalMine') +
    20 * d * Math.pow(1.1, d) * s('deuteriumSynthesizer');
  const efficiency = energyUsed <= 0 ? 1 : Math.min(1, Math.max(0, energyProduced / energyUsed));
  const ab = (1 + (i.allianceBonus ?? 0)) * (i.boost ?? 1);
  const sp_ = i.speed;
  const basic = i.noBasic ? 0 : 1;
  const rawM = 30 * m * Math.pow(1.1, m) * s('metalMine') * sp_;
  const rawC = 20 * c * Math.pow(1.1, c) * s('crystalMine') * sp_;
  const rawD = 10 * d * Math.pow(1.1, d) * (1.44 - 0.004 * i.maxTemp) * s('deuteriumSynthesizer') * sp_;
  const pos = POSITION_BONUS[i.position ?? 0] ?? {};
  const crawlPct = crawlerBonus(i.crawlers ?? 0, m + c + d, i.crawlerMul ?? 1);
  const mine = (raw: number, plasmaPct: number, posPct = 0): MineBreakdown => {
    const plasma = raw * plasmaPct, placement = raw * posPct, crawlers = raw * crawlPct;
    const boosts = raw * (1 + plasmaPct + posPct + crawlPct) * (ab - 1);
    const potential = raw + plasma + placement + crawlers + boosts;
    return { raw, plasma, placement, crawlers, boosts, potential, lostToEnergy: potential * (1 - efficiency), total: potential * efficiency };
  };
  const mM = mine(rawM, 0.01 * pl, pos.metal), mC = mine(rawC, 0.0066 * pl, pos.crystal), mD = mine(rawD, 0.0033 * pl);
  const metal = basic * 30 * sp_ + mM.total;
  const crystal = basic * 15 * sp_ + mC.total;
  const deuterium = mD.total;
  const fusionDeutUse = 10 * fu * Math.pow(1.1, fu) * s('fusionReactor') * sp_;
  const solarE = 20 * sp * Math.pow(1.1, sp) * s('solarPlant');
  const fusionE = 30 * fu * Math.pow(1.05 + 0.01 * et, fu) * s('fusionReactor');
  const satE = i.satellites * Math.max(0, Math.floor((i.maxTemp + 140) / 6)) * s('solarSatellite');
  const detail: ProductionDetail = {
    basic: { metal: basic * 30 * sp_, crystal: basic * 15 * sp_ },
    mine: { metal: mM, crystal: mC, deuterium: mD },
    energy: {
      solar: solarE, fusion: fusionE, satellites: satE, boosts: energyProduced - (solarE + fusionE + satE),
      usedMetal: 10 * m * Math.pow(1.1, m) * s('metalMine'), usedCrystal: 10 * c * Math.pow(1.1, c) * s('crystalMine'), usedDeuterium: 20 * d * Math.pow(1.1, d) * s('deuteriumSynthesizer'),
    },
  };
  return { metal, crystal, deuterium: deuterium - fusionDeutUse, energyProduced, energyUsed, efficiency, fusionDeutUse, detail };
}

export const COORD_KEY = (c: Coords) => `${c.g}:${c.s}:${c.p}`;
export const sameCoords = (a: Coords, b: Coords) => a.g === b.g && a.s === b.s && a.p === b.p;

export function distance(a: Coords, b: Coords): number {
  if (a.g !== b.g) return 20000 * Math.abs(a.g - b.g);
  if (a.s !== b.s) return 2700 + 95 * Math.abs(a.s - b.s);
  if (a.p !== b.p) return 1000 + 5 * Math.abs(a.p - b.p);
  return 5;
}

/** effective speed of one ship given the owner's drive techs */
export function shipSpeed(id: ShipId, techs: Levels<TechId>, logisticsBonus = 0): number {
  const u = UNITS[id];
  if (!u.drive) return 0;
  const per = u.drive === 'combustionDrive' ? 0.1 : u.drive === 'impulseDrive' ? 0.2 : 0.3;
  let base = u.speed;
  // OGame: small cargo upgrades to impulse at impulse 5, bomber to hyperspace at 8
  if (id === 'smallCargo' && lvl(techs, 'impulseDrive') >= 5) return 10000 * (1 + 0.2 * lvl(techs, 'impulseDrive')) * (1 + logisticsBonus);
  if (id === 'bomber' && lvl(techs, 'hyperspaceDrive') >= 8) return 5000 * (1 + 0.3 * lvl(techs, 'hyperspaceDrive')) * (1 + logisticsBonus);
  return base * (1 + per * lvl(techs, u.drive)) * (1 + logisticsBonus);
}

export function fleetSpeed(fleet: Fleet, techs: Levels<TechId>, logisticsBonus = 0, extra?: (id: ShipId) => number): number {
  let min = Infinity;
  for (const [id, n] of Object.entries(fleet)) if (n && n > 0) min = Math.min(min, shipSpeed(id as ShipId, techs, logisticsBonus) * (1 + (extra ? extra(id as ShipId) : 0)));
  return Number.isFinite(min) ? min : 0;
}

/** seconds. speedPct 10..100 */
export function flightSeconds(dist: number, slowest: number, speedPct: number, universeFleetSpeed: number): number {
  if (slowest <= 0) return Infinity;
  return Math.max(1, Math.round((10 + (3500 / (speedPct / 100)) * Math.sqrt((10 * dist) / slowest)) / universeFleetSpeed));
}

/** one-way deuterium cost */
export function fuelUse(fleet: Fleet, dist: number, speedPct: number): number {
  let total = 0;
  for (const [id, n] of Object.entries(fleet)) {
    if (!n) continue;
    const u = UNITS[id as ShipId];
    if (!u.fuel) continue;
    total += ((u.fuel * n * dist) / 35000) * Math.pow(speedPct / 100 + 1, 2);
  }
  return Math.max(1, Math.round(total) + 1);
}

export function cargoCapacity(fleet: Fleet): number {
  let t = 0;
  for (const [id, n] of Object.entries(fleet)) if (n) t += UNITS[id as ShipId].cargo * n;
  return t;
}

export function unitPoints(id: UnitId, count: number): number {
  return (totalRes(UNITS[id].cost) * count) / 1000;
}
export function buildingPoints(id: BuildingId, level: number): number {
  let t = 0;
  for (let l = 1; l <= level; l++) t += totalRes(buildingCost(id, l));
  return t / 1000;
}
export function techPoints(id: TechId, level: number): number {
  let t = 0;
  for (let l = 1; l <= level; l++) t += totalRes(techCost(id, l));
  return t / 1000;
}

export function planetFields(planetFieldsBase: number, buildings: Levels<BuildingId>): { used: number; max: number } {
  let used = 0;
  for (const v of Object.values(buildings)) used += v || 0;
  return { used, max: planetFieldsBase };
}

export function techBonus(level: number) { return 1 + 0.1 * level; }
