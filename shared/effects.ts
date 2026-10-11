/**
 * What an item does at each level, computed from the same formulas the server runs.
 * Pure functions: the client renders them as "details" pages, tests compare them to the engine.
 */
import { BUILDINGS, GENERAL_FAST_SHIPS, TECHS, UNITS, isShip, wreckRepairShare } from './data';
import {
  buildingCost, buildingTime, production, researchTime, shipSpeed, storageCapacity, techCost, unitTime, lvl,
  type Levels, type ProductionInput,
} from './formulas';
import type { BuildingId, Requirement, Res, ShipId, TechId, UnitId } from './types';

/** Everything the effect tables depend on, taken from one planet and its owner. */
export interface DetailCtx {
  buildings: Levels<BuildingId>;
  techs: Levels<TechId>;
  maxTemp: number;
  satellites: number;
  isMoon: boolean;
  /** orbit of a planet (0 on a moon), crawlers working there, and the class multiplier on them */
  position?: number;
  crawlers?: number;
  crawlerMul?: number;
  settings?: ProductionInput['settings'];
  allianceProduction: number;
  allianceResearch: number;
  /** mine output multiplier (officers, faction) and energy multiplier (officers) */
  boost: number;
  energyBoost: number;
  /** construction/research/shipyard duration multiplier (Chief Engineer) */
  timeFactor: number;
  /** extra research-only duration multiplier (Discoverer) */
  researchFactor: number;
  /** class flight speed bonus for combat ships (General) */
  classSpeed: number;
  speeds: { production: number; construction: number; research: number; shipyard: number; storage: number; fleet: number };
}

export type ColFmt = 'int' | 'dec' | 'pct' | 'dur' | 'mult';
export interface Col { key: string; label: string; fmt: ColFmt; /** show the change from the previous level */ delta?: boolean; hint?: string }
export interface Row { level: number; cost: Res; seconds: number; v: Record<string, number> }
export interface TableDetails { columns: Col[]; rows: Row[]; notes: string[] }

export const prodInput = (ctx: DetailCtx, buildings = ctx.buildings, techs = ctx.techs): ProductionInput => ({
  buildings, techs, maxTemp: ctx.maxTemp, satellites: ctx.satellites, settings: ctx.settings,
  speed: ctx.speeds.production, allianceBonus: ctx.allianceProduction, noBasic: ctx.isMoon, boost: ctx.boost, energyBoost: ctx.energyBoost,
  position: ctx.position, crawlers: ctx.crawlers, crawlerMul: ctx.crawlerMul,
});
const withB = (ctx: DetailCtx, id: BuildingId, level: number) => production(prodInput(ctx, { ...ctx.buildings, [id]: level }));
const withT = (ctx: DetailCtx, id: TechId, level: number) => production(prodInput(ctx, ctx.buildings, { ...ctx.techs, [id]: level }));

export const DRIVE_SHIPS: Record<string, ShipId[]> = {
  combustionDrive: ['smallCargo', 'largeCargo', 'lightFighter', 'recycler'],
  impulseDrive: ['heavyFighter', 'cruiser', 'bomber', 'colonyShip'],
  hyperspaceDrive: ['battleship', 'battlecruiser', 'destroyer', 'deathstar'],
};

export const jumpCooldownSeconds = (level: number, fleetSpeed: number) => Math.max(30, 3600 / (Math.max(1, level) * fleetSpeed));

// ---------------------------------------------------------------- building effects

type Effect = { columns: Col[]; at: (level: number, ctx: DetailCtx) => Record<string, number>; notes?: string[] };

const MINE = (res: 'metal' | 'crystal' | 'deuterium', used: 'usedMetal' | 'usedCrystal' | 'usedDeuterium', label: string): Effect => ({
  columns: [
    { key: 'out', label: `${label} from this mine / h`, fmt: 'int', delta: true },
    { key: 'net', label: `Planet ${res} / h`, fmt: 'int', delta: true, hint: res === 'deuterium' ? 'after fusion reactors burn their share' : 'including the free basic income' },
    { key: 'energy', label: 'Energy used', fmt: 'int', delta: true },
    { key: 'eff', label: 'Energy efficiency', fmt: 'pct', hint: 'drops below 100% when the planet cannot power every mine' },
  ],
  at: (L, ctx) => {
    const p = withB(ctx, res === 'metal' ? 'metalMine' : res === 'crystal' ? 'crystalMine' : 'deuteriumSynthesizer', L);
    return { out: p.detail.mine[res].total, net: p[res], energy: p.detail.energy[used], eff: p.efficiency };
  },
  notes: res === 'deuterium' ? ['Output depends on the planet temperature: colder planets produce more vespene gas.'] : [],
});

const EFFECTS: Partial<Record<BuildingId, Effect>> = {
  metalMine: MINE('metal', 'usedMetal', 'Metal'),
  crystalMine: MINE('crystal', 'usedCrystal', 'Crystal'),
  deuteriumSynthesizer: { ...MINE('deuterium', 'usedDeuterium', 'Vespene Gas') },
  solarPlant: {
    columns: [
      { key: 'solar', label: 'Energy from solar plants', fmt: 'int', delta: true },
      { key: 'total', label: 'Planet energy', fmt: 'int', delta: true },
      { key: 'eff', label: 'Energy efficiency', fmt: 'pct' },
    ],
    at: (L, ctx) => { const p = withB(ctx, 'solarPlant', L); return { solar: p.detail.energy.solar, total: p.energyProduced, eff: p.efficiency }; },
  },
  fusionReactor: {
    columns: [
      { key: 'fusion', label: 'Energy from fusion', fmt: 'int', delta: true },
      { key: 'burn', label: 'Vespene Gas burned / h', fmt: 'int', delta: true },
      { key: 'total', label: 'Planet energy', fmt: 'int', delta: true },
      { key: 'eff', label: 'Energy efficiency', fmt: 'pct' },
    ],
    at: (L, ctx) => { const p = withB(ctx, 'fusionReactor', L); return { fusion: p.detail.energy.fusion, burn: p.fusionDeutUse, total: p.energyProduced, eff: p.efficiency }; },
    notes: ['Better Energy Technology makes every reactor level produce more.'],
  },
  metalStorage: storageEffect('metal', 'metalMine'),
  crystalStorage: storageEffect('crystal', 'crystalMine'),
  deuteriumTank: storageEffect('deuterium', 'deuteriumSynthesizer'),
  roboticsFactory: {
    columns: [{ key: 'speed', label: 'Construction speed', fmt: 'mult', delta: true, hint: 'relative to no Robotics Factory (Nanite Factory multiplies on top)' }],
    at: (L) => ({ speed: 1 + L }),
  },
  naniteFactory: {
    columns: [{ key: 'speed', label: 'Construction and shipyard speed', fmt: 'mult', delta: true, hint: 'doubles with every level' }],
    at: (L) => ({ speed: Math.pow(2, L) }),
  },
  shipyard: {
    columns: [{ key: 'speed', label: 'Ship and defense build speed', fmt: 'mult', delta: true }],
    at: (L) => ({ speed: 1 + L }),
    notes: ['Higher levels also unlock bigger hulls - see "Unlocks" below.'],
  },
  researchLab: {
    columns: [{ key: 'speed', label: 'Research speed', fmt: 'mult', delta: true }],
    at: (L) => ({ speed: 1 + L }),
    notes: ['Research runs on the planet you start it from, so build your best lab where you research.'],
  },
  missileSilo: {
    columns: [
      { key: 'slots', label: 'Missile slots', fmt: 'int', delta: true, hint: 'an interplanetary missile takes 2, an interceptor 1' },
      { key: 'range', label: 'Missile range (systems)', fmt: 'int', delta: true },
    ],
    at: (L) => ({ slots: 10 * L, range: Math.max(0, 5 * L - 1) }),
  },
  terraformer: {
    columns: [{ key: 'fields', label: 'Extra building fields', fmt: 'int', delta: true }],
    at: (L) => ({ fields: 5 * L }),
    notes: ['The Terraformer itself does not use up a field.'],
  },
  spaceDock: {
    columns: [{ key: 'share', label: 'Share of a wreck field rebuilt', fmt: 'pct', delta: true, hint: 'of the ships you lost defending this planet' }],
    at: (L) => ({ share: wreckRepairShare(L) }),
    notes: ['A wreck field forms when a battle destroys a lot of your ships; it drifts away after a few days. Repairs take time but cost nothing.', 'Only on planets, not moons.'],
  },
  lunarBase: {
    columns: [{ key: 'fields', label: 'Moon building fields', fmt: 'int', delta: true, hint: '1 base field + 3 per level' }],
    at: (L) => ({ fields: 1 + 3 * L }),
  },
  sensorPhalanx: {
    columns: [{ key: 'range', label: 'Scan range (systems)', fmt: 'int', delta: true }],
    at: (L) => ({ range: Math.max(0, L * L - 1) }),
    notes: ['Each scan costs 5,000 vespene gas from the moon.'],
  },
  jumpGate: {
    columns: [{ key: 'cooldown', label: 'Recharge after a jump', fmt: 'dur', delta: true }],
    at: (L, ctx) => ({ cooldown: jumpCooldownSeconds(L, ctx.speeds.fleet) }),
    notes: ['Both the sending and receiving gate must be ready.'],
  },
};

function storageEffect(res: 'metal' | 'crystal' | 'deuterium', mine: BuildingId): Effect {
  return {
    columns: [
      { key: 'cap', label: `${res[0].toUpperCase() + res.slice(1)} capacity`, fmt: 'int', delta: true },
      { key: 'fill', label: 'Time to fill from empty', fmt: 'dur', hint: 'at this planet\'s current production' },
    ],
    at: (L, ctx) => {
      const cap = storageCapacity(L) * ctx.speeds.storage;
      const rate = production(prodInput(ctx))[res];
      return { cap, fill: rate > 0 ? (cap / rate) * 3600 : Infinity };
    },
    notes: [`Mines stop filling a full store. Your ${mine === 'metalMine' ? 'metal' : mine === 'crystalMine' ? 'crystal' : 'deuterium'} production is what sets the fill time.`],
  };
}

// ---------------------------------------------------------------- research effects

const mulPct = (label: string): Effect => ({ columns: [{ key: 'mult', label, fmt: 'pct', delta: true }], at: (L) => ({ mult: 1 + 0.1 * L }) });
const driveEffect = (id: 'combustionDrive' | 'impulseDrive' | 'hyperspaceDrive', per: number): Effect => ({
  columns: [
    { key: 'bonus', label: 'Speed bonus', fmt: 'pct', delta: true },
    ...DRIVE_SHIPS[id].map((s) => ({ key: s, label: `${UNITS[s].name} speed`, fmt: 'int' as const, delta: true })),
  ],
  at: (L, ctx) => ({ bonus: per * L, ...Object.fromEntries(DRIVE_SHIPS[id].map((s) => [s, shipSpeed(s, { ...ctx.techs, [id]: L })])) }),
});

const TECH_EFFECTS: Partial<Record<TechId, Effect>> = {
  energy: {
    columns: [
      { key: 'base', label: 'Fusion growth per reactor level', fmt: 'dec', hint: 'each reactor level multiplies output by this' },
      { key: 'fusion', label: 'Energy from your fusion reactors', fmt: 'int', delta: true },
      { key: 'total', label: 'Planet energy', fmt: 'int', delta: true },
    ],
    at: (L, ctx) => { const p = withT(ctx, 'energy', L); return { base: 1.05 + 0.01 * L, fusion: p.detail.energy.fusion, total: p.energyProduced }; },
    notes: ['Energy Technology unlocks most of the advanced research tree.'],
  },
  plasma: {
    columns: [
      { key: 'm', label: 'Metal bonus', fmt: 'pct', delta: true },
      { key: 'c', label: 'Crystal bonus', fmt: 'pct', delta: true },
      { key: 'd', label: 'Vespene Gas bonus', fmt: 'pct', delta: true },
      { key: 'metal', label: 'This planet\'s metal / h', fmt: 'int', delta: true },
      { key: 'crystal', label: 'This planet\'s crystal / h', fmt: 'int', delta: true },
    ],
    at: (L, ctx) => { const p = withT(ctx, 'plasma', L); return { m: 0.01 * L, c: 0.0066 * L, d: 0.0033 * L, metal: p.metal, crystal: p.crystal }; },
  },
  combustionDrive: driveEffect('combustionDrive', 0.1),
  impulseDrive: driveEffect('impulseDrive', 0.2),
  hyperspaceDrive: driveEffect('hyperspaceDrive', 0.3),
  computer: {
    columns: [{ key: 'slots', label: 'Fleet slots', fmt: 'int', delta: true, hint: 'a Fleet Admiral officer adds more' }],
    at: (L) => ({ slots: 1 + L }),
  },
  astrophysics: {
    columns: [
      { key: 'colonies', label: 'Planets you may hold', fmt: 'int', delta: true },
      { key: 'exp', label: 'Expedition slots', fmt: 'int', delta: true },
    ],
    at: (L) => ({ colonies: 1 + Math.ceil(L / 2), exp: Math.floor(Math.sqrt(L)) }),
  },
  weapons: mulPct('Weapon damage'),
  shielding: mulPct('Shield strength'),
  armour: mulPct('Hull strength'),
  graviton: {
    columns: [{ key: 'energy', label: 'Energy production needed on the planet', fmt: 'int', delta: true }],
    at: (L) => ({ energy: (TECHS.graviton.energyReq ?? 0) * Math.pow(3, L - 1) }),
    notes: ['Costs no resources - the price is the energy output of a single planet.'],
  },
  espionage: {
    columns: [],
    at: () => ({}),
    notes: [
      'Spy report detail = probes sent + (your level - their level)², or minus that if they are ahead.',
      'Detail 2 shows fleets, 3 defenses, 5 buildings, 7 research.',
      'A higher level than the target also makes your probes much harder to catch.',
    ],
  },
};

// ---------------------------------------------------------------- tables

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

export function buildingTable(id: BuildingId, ctx: DetailCtx, from: number, to: number): TableDetails {
  const fx = EFFECTS[id];
  const rows = range(Math.max(1, from), to).map((L) => {
    const cost = buildingCost(id, L);
    return { level: L, cost, seconds: buildingTime(cost, lvl(ctx.buildings, 'roboticsFactory'), lvl(ctx.buildings, 'naniteFactory'), ctx.speeds.construction, ctx.timeFactor), v: fx ? fx.at(L, ctx) : {} };
  });
  return { columns: fx?.columns ?? [], rows, notes: fx?.notes ?? [] };
}

export function techTable(id: TechId, ctx: DetailCtx, from: number, to: number): TableDetails {
  const fx = TECH_EFFECTS[id];
  const rows = range(Math.max(1, from), to).map((L) => {
    const cost = techCost(id, L);
    return { level: L, cost, seconds: researchTime(cost, lvl(ctx.buildings, 'researchLab'), ctx.speeds.research, ctx.allianceResearch, ctx.timeFactor * ctx.researchFactor), v: fx ? fx.at(L, ctx) : {} };
  });
  return { columns: fx?.columns ?? [], rows, notes: fx?.notes ?? [] };
}

// ---------------------------------------------------------------- requirements and unlocks

export type ItemKind = 'building' | 'tech' | 'ship' | 'defense';
export const kindOf = (id: string): ItemKind | null =>
  id in BUILDINGS ? 'building' : id in TECHS ? 'tech' : id in UNITS ? (UNITS[id as UnitId].kind === 'ship' ? 'ship' : 'defense') : null;
export const nameOf = (id: string): string => (BUILDINGS as Record<string, { name: string }>)[id]?.name ?? (TECHS as Record<string, { name: string }>)[id]?.name ?? (UNITS as Record<string, { name: string }>)[id]?.name ?? id;
export const requirementsOf = (id: string): Requirement[] =>
  (BUILDINGS as Record<string, { requires: Requirement[] }>)[id]?.requires ?? (TECHS as Record<string, { requires: Requirement[] }>)[id]?.requires ?? (UNITS as Record<string, { requires: Requirement[] }>)[id]?.requires ?? [];

export interface Unlock { id: string; kind: ItemKind; name: string; level: number; /** other requirements it also needs */ also: Requirement[] }

/** Everything that needs this building/tech, sorted by the level at which it first appears. */
export function unlocksOf(id: string): Unlock[] {
  const out: Unlock[] = [];
  const scan = (defs: Record<string, { requires: Requirement[] }>) => {
    for (const [other, def] of Object.entries(defs)) {
      const r = def.requires.find((x) => x.id === id);
      if (r) out.push({ id: other, kind: kindOf(other)!, name: nameOf(other), level: r.level, also: def.requires.filter((x) => x.id !== id) });
    }
  };
  scan(BUILDINGS as never); scan(TECHS as never); scan(UNITS as never);
  return out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export interface RequirementStatus extends Requirement { have: number; met: boolean; name: string; kind: ItemKind }
export function requirementStatus(reqs: Requirement[], ctx: Pick<DetailCtx, 'buildings' | 'techs'>): RequirementStatus[] {
  return reqs.map((r) => {
    const have = r.id in BUILDINGS ? lvl(ctx.buildings, r.id as BuildingId) : lvl(ctx.techs, r.id as TechId);
    return { ...r, have, met: have >= r.level, name: nameOf(r.id), kind: kindOf(r.id)! };
  });
}

// ---------------------------------------------------------------- units

export interface UnitStats { attack: number; shield: number; hull: number; cargo: number; speed: number; fuel: number }
export interface UnitDetails {
  id: UnitId; kind: 'ship' | 'defense';
  base: UnitStats;
  /** with the owner's weapons / shielding / armour / drive tech applied */
  effective: UnitStats;
  cost: Res;
  seconds: number;
  rapidFireAgainst: { id: UnitId; value: number; /** average shots */ shots: number }[];
  rapidFireFrom: { id: UnitId; value: number }[];
  /** how each stat grows with its tech, level 0..max */
  techRows: { level: number; attack: number; shield: number; hull: number; speed: number }[];
  drive: string | null;
}

export function unitDetails(id: UnitId, ctx: DetailCtx, maxTech = 10): UnitDetails {
  const u = UNITS[id];
  const w = lvl(ctx.techs, 'weapons'), s = lvl(ctx.techs, 'shielding'), a = lvl(ctx.techs, 'armour');
  const classMul = 1 + (GENERAL_FAST_SHIPS.includes(id) ? ctx.classSpeed : 0);
  const speedAt = (techs: Levels<TechId>) => (isShip(id) ? shipSpeed(id, techs) * classMul : 0);
  const base: UnitStats = { attack: u.attack, shield: u.shield, hull: u.hull, cargo: u.cargo, speed: u.speed, fuel: u.fuel };
  const effective: UnitStats = { ...base, attack: u.attack * (1 + 0.1 * w), shield: u.shield * (1 + 0.1 * s), hull: u.hull * (1 + 0.1 * a), speed: speedAt(ctx.techs) };
  return {
    id, kind: u.kind, base, effective, cost: u.cost,
    seconds: unitTime(id, lvl(ctx.buildings, 'shipyard'), lvl(ctx.buildings, 'naniteFactory'), ctx.speeds.shipyard, ctx.timeFactor),
    rapidFireAgainst: Object.entries(u.rapidFire).map(([t, v]) => ({ id: t as UnitId, value: v as number, shots: v as number })).sort((x, y) => y.value - x.value),
    rapidFireFrom: (Object.keys(UNITS) as UnitId[]).filter((o) => UNITS[o].rapidFire[id]).map((o) => ({ id: o, value: UNITS[o].rapidFire[id] as number })).sort((x, y) => y.value - x.value),
    techRows: range(0, maxTech).map((L) => ({
      level: L, attack: u.attack * (1 + 0.1 * L), shield: u.shield * (1 + 0.1 * L), hull: u.hull * (1 + 0.1 * L),
      speed: u.drive ? speedAt({ ...ctx.techs, [u.drive]: L }) : 0,
    })),
    drive: u.drive,
  };
}

export const hasEffects = (id: string) => id in EFFECTS || id in TECH_EFFECTS;

/** The part of a planet view the effect tables need (the server sends this under `detail`). */
export interface PlanetViewForDetails {
  buildings: Levels<BuildingId>;
  maxTemp: number;
  isMoon?: boolean;
  coords?: { p: number };
  fleet: { solarSatellite?: number; crawler?: number };
  settings: Record<string, number>;
  detail: Pick<DetailCtx, 'allianceProduction' | 'allianceResearch' | 'boost' | 'energyBoost' | 'timeFactor' | 'researchFactor' | 'classSpeed' | 'speeds'> & { crawlerMul?: number };
}
export function detailCtxFrom(planet: PlanetViewForDetails, techs: Levels<TechId>): DetailCtx {
  return {
    buildings: planet.buildings, techs, maxTemp: planet.maxTemp, satellites: planet.fleet.solarSatellite || 0, isMoon: !!planet.isMoon,
    position: planet.isMoon ? 0 : planet.coords?.p ?? 0, crawlers: planet.fleet.crawler || 0,
    settings: planet.settings as ProductionInput['settings'], ...planet.detail,
  };
}

/** Effect values at one level (also level 0), used for "change from the previous level". */
export const buildingEffectsAt = (id: BuildingId, level: number, ctx: DetailCtx): Record<string, number> => EFFECTS[id]?.at(level, ctx) ?? {};
export const techEffectsAt = (id: TechId, level: number, ctx: DetailCtx): Record<string, number> => TECH_EFFECTS[id]?.at(level, ctx) ?? {};
