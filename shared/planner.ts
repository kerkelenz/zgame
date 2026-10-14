import { BUILDINGS, TECHS, UNITS } from './data';
import { buildingCost, lvl, scaleRes, techCost, unitTime, type Levels } from './formulas';
import { pathTo } from './techtree';
import type { BuildingId, Res, TechId, UnitId } from './types';

/** "I want this many of that": what it costs, what has to be built or researched first, and how long the shipyard needs. Pure. */
export interface PlanStep { id: string; name: string; kind: 'building' | 'tech'; from: number; to: number; cost: Res }
export interface FleetPlan {
  unit: UnitId;
  count: number;
  /** the units themselves */
  cost: Res;
  /** buildings and research still missing, in the order to do them, each with the price of the levels between what you have and what is needed */
  steps: PlanStep[];
  prereqCost: Res;
  /** everything together */
  total: Res;
  /** what is missing from the stock, per resource (0 where covered) */
  shortfall: Res;
  unitMs: number;
  buildMs: number;
}
export interface PlanInput {
  unit: UnitId; count: number;
  buildings: Levels<BuildingId>; techs: Levels<TechId>; stock: Res;
  /** economy speed times the shipyard boost, and the commander's time factor, as the Shipyard page uses them */
  speed: number; timeFactor?: number;
}

const zero = (): Res => ({ metal: 0, crystal: 0, deuterium: 0 });
const add = (a: Res, b: Res): Res => ({ metal: a.metal + b.metal, crystal: a.crystal + b.crystal, deuterium: a.deuterium + b.deuterium });

export function planFleet(i: PlanInput): FleetPlan {
  const steps: PlanStep[] = [];
  let prereq = zero();
  for (const { id, level } of pathTo(i.unit)) {
    if (id === i.unit) continue;
    const isB = id in BUILDINGS;
    const have = isB ? lvl(i.buildings, id as BuildingId) : lvl(i.techs, id as TechId);
    if (have >= level) continue;
    let cost = zero();
    for (let l = have + 1; l <= level; l++) cost = add(cost, isB ? buildingCost(id as BuildingId, l) : techCost(id as TechId, l));
    steps.push({ id, name: isB ? BUILDINGS[id as BuildingId].name : TECHS[id as TechId].name, kind: isB ? 'building' : 'tech', from: have, to: level, cost });
    prereq = add(prereq, cost);
  }
  const count = Math.max(1, Math.floor(i.count));
  const cost = scaleRes(UNITS[i.unit].cost, count);
  const total = add(cost, prereq);
  const need = (k: keyof Res) => Math.max(0, total[k] - i.stock[k]);
  // the shipyard needs level 1 even when no path says so (every unit is built there)
  const yard = Math.max(1, lvl(i.buildings, 'shipyard'));
  const unitMs = unitTime(i.unit, yard, lvl(i.buildings, 'naniteFactory'), i.speed, i.timeFactor ?? 1) * 1000;
  return { unit: i.unit, count, cost, steps, prereqCost: prereq, total, shortfall: { metal: need('metal'), crystal: need('crystal'), deuterium: need('deuterium') }, unitMs, buildMs: unitMs * count };
}
