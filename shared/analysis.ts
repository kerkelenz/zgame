/** Economy analysis: where income comes from, when stores fill, and which upgrade pays back fastest. Pure and testable. */
import { BUILDINGS, TRADE_VALUE } from './data';
import { prodInput, requirementStatus, type DetailCtx } from './effects';
import { buildingCost, buildingTime, production, lvl, type Production } from './formulas';
import type { BuildingId, Res } from './types';

export const KEYS = ['metal', 'crystal', 'deuterium'] as const;
export type ResKey = (typeof KEYS)[number];

/** Resources in metal-equivalents at the merchant's 3:2:1 rates (a fair way to compare unlike things). */
export const resValue = (r: Res) => r.metal * TRADE_VALUE.metal + r.crystal * TRADE_VALUE.crystal + r.deuterium * TRADE_VALUE.deuterium;

export interface PlanetEconomy {
  production: Production;
  /** per hour, after energy and fusion burn */
  rates: Res;
  perDay: Res;
  energy: { produced: number; used: number; balance: number; efficiency: number };
  /** output lost every hour because mines are short of energy, in each resource and in metal-equivalents */
  lostToEnergy: Res & { value: number };
  /** seconds until a store is full: 0 = already full, null = not filling */
  fullIn: Record<ResKey, number | null>;
  /** seconds until a draining resource runs out (fusion burning more than is made) */
  emptyIn: Record<ResKey, number | null>;
}

export function planetEconomy(ctx: DetailCtx, stock: Res, capacity: Res): PlanetEconomy {
  const p = production(prodInput(ctx));
  const rates: Res = { metal: p.metal, crystal: p.crystal, deuterium: p.deuterium };
  const lost = { metal: p.detail.mine.metal.lostToEnergy, crystal: p.detail.mine.crystal.lostToEnergy, deuterium: p.detail.mine.deuterium.lostToEnergy };
  const fullIn = {} as Record<ResKey, number | null>, emptyIn = {} as Record<ResKey, number | null>;
  for (const k of KEYS) {
    fullIn[k] = stock[k] >= capacity[k] ? 0 : rates[k] > 0 ? ((capacity[k] - stock[k]) / rates[k]) * 3600 : null;
    emptyIn[k] = rates[k] < 0 ? (stock[k] / -rates[k]) * 3600 : null;
  }
  return {
    production: p, rates,
    perDay: { metal: rates.metal * 24, crystal: rates.crystal * 24, deuterium: rates.deuterium * 24 },
    energy: { produced: p.energyProduced, used: p.energyUsed, balance: p.energyProduced - p.energyUsed, efficiency: p.efficiency },
    lostToEnergy: { ...lost, value: resValue(lost) },
    fullIn, emptyIn,
  };
}

/** Stock after `hours` at constant rates, bounded by storage (a full store stops filling, a draining one stops at 0). */
export function projectStock(stock: Res, rates: Res, capacity: Res, hours: number): Res {
  const f = (k: ResKey) => (rates[k] >= 0 ? (stock[k] >= capacity[k] ? stock[k] : Math.min(capacity[k], stock[k] + rates[k] * hours)) : Math.max(0, stock[k] + rates[k] * hours));
  return { metal: f('metal'), crystal: f('crystal'), deuterium: f('deuterium') };
}

export interface UpgradeOption {
  id: BuildingId;
  level: number;
  cost: Res;
  costValue: number;
  seconds: number;
  /** change per hour once built */
  delta: Res & { energy: number };
  deltaValue: number;
  /** hours of the extra output needed to repay the cost; null if it adds nothing */
  paybackHours: number | null;
  /** energy efficiency after the upgrade */
  efficiencyAfter: number;
  available: boolean;
  /** seconds of current income needed before you can afford it (0 = now, Infinity = never at current rates) */
  waitSeconds: number;
}

export const ECONOMY_BUILDINGS: BuildingId[] = ['metalMine', 'crystalMine', 'deuteriumSynthesizer', 'solarPlant', 'fusionReactor'];

/** One-level upgrades of the income buildings, with what each adds and how long it takes to pay for itself. */
export function upgradeOptions(ctx: DetailCtx, stock: Res, ids: BuildingId[] = ECONOMY_BUILDINGS): UpgradeOption[] {
  const now = production(prodInput(ctx));
  const out: UpgradeOption[] = ids.map((id) => {
    const level = lvl(ctx.buildings, id) + 1;
    const next = production(prodInput(ctx, { ...ctx.buildings, [id]: level }));
    const cost = buildingCost(id, level);
    const delta = { metal: next.metal - now.metal, crystal: next.crystal - now.crystal, deuterium: next.deuterium - now.deuterium, energy: next.energyProduced - now.energyProduced };
    const deltaValue = resValue(delta);
    const costValue = resValue(cost);
    let wait = 0;
    for (const k of KEYS) {
      if (cost[k] <= stock[k]) continue;
      const rate = now[k];
      wait = Math.max(wait, rate > 0 ? ((cost[k] - stock[k]) / rate) * 3600 : Infinity);
    }
    return {
      id, level, cost, costValue,
      seconds: buildingTime(cost, lvl(ctx.buildings, 'roboticsFactory'), lvl(ctx.buildings, 'naniteFactory'), ctx.speeds.construction, ctx.timeFactor),
      delta, deltaValue, paybackHours: deltaValue > 0 ? costValue / deltaValue : null,
      efficiencyAfter: next.efficiency,
      available: requirementStatus(BUILDINGS[id].requires, ctx).every((r) => r.met),
      waitSeconds: wait,
    };
  });
  return out;
}

/** The sensible next step: the available upgrade that repays fastest. */
export const bestUpgrade = (opts: UpgradeOption[]): UpgradeOption | null =>
  opts.filter((o) => o.available && o.paybackHours != null).sort((a, b) => a.paybackHours! - b.paybackHours!)[0] ?? null;

export interface EmpireTotals { perHour: Res; perDay: Res; stock: Res; capacity: Res; value: { perHour: number; perDay: number; stock: number }; lostValuePerHour: number; energyBalance: number }

export function empireTotals(planets: { economy: PlanetEconomy; stock: Res; capacity: Res }[]): EmpireTotals {
  const z = (): Res => ({ metal: 0, crystal: 0, deuterium: 0 });
  const t: EmpireTotals = { perHour: z(), perDay: z(), stock: z(), capacity: z(), value: { perHour: 0, perDay: 0, stock: 0 }, lostValuePerHour: 0, energyBalance: 0 };
  for (const p of planets) {
    for (const k of KEYS) { t.perHour[k] += p.economy.rates[k]; t.perDay[k] += p.economy.perDay[k]; t.stock[k] += p.stock[k]; t.capacity[k] += p.capacity[k]; }
    t.lostValuePerHour += p.economy.lostToEnergy.value;
    t.energyBalance += p.economy.energy.balance;
  }
  t.value = { perHour: resValue(t.perHour), perDay: resValue(t.perDay), stock: resValue(t.stock) };
  return t;
}
