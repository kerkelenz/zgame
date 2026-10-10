import { UNITS } from '../shared/data';
import type { Res, UnitId } from '../shared/types';

const KEYS = ['metal', 'crystal', 'deuterium'] as const;

export type Mix = [UnitId, number][];
export const NPC_DEF_MIX: Mix[] = [
  [['rocketLauncher', 6], ['lightLaser', 3]],
  [['rocketLauncher', 4], ['lightLaser', 4], ['heavyLaser', 2], ['ionCannon', 1]],
  [['rocketLauncher', 3], ['lightLaser', 3], ['heavyLaser', 2], ['gaussCannon', 2], ['ionCannon', 1]],
  [['rocketLauncher', 3], ['lightLaser', 3], ['heavyLaser', 2], ['gaussCannon', 2], ['plasmaTurret', 1], ['ionCannon', 1]],
];
export const NPC_FLEET_MIX: Mix[] = [
  [['lightFighter', 6], ['smallCargo', 2]],
  [['lightFighter', 4], ['heavyFighter', 2], ['cruiser', 2], ['largeCargo', 1]],
  [['lightFighter', 3], ['cruiser', 3], ['battleship', 3], ['largeCargo', 1]],
  [['cruiser', 2], ['battleship', 3], ['battlecruiser', 3], ['destroyer', 1], ['bomber', 1], ['largeCargo', 1]],
];
export const RAID_MIX: Mix[] = [
  [['lightFighter', 6], ['heavyFighter', 2]],
  [['lightFighter', 3], ['heavyFighter', 3], ['cruiser', 4]],
  [['cruiser', 4], ['battleship', 3], ['bomber', 3]],
  [['battleship', 3], ['battlecruiser', 3], ['bomber', 3], ['destroyer', 1]],
];
export const tierOf = (points: number) => (points < 800 ? 0 : points < 8000 ? 1 : points < 60000 ? 2 : 3);


/** Spend a resource budget on a weighted unit mix; returns what was bought. */
export function buyUnits(budget: Res, mix: Mix): Record<string, number> {
  const total = mix.reduce((a, [, wt]) => a + wt, 0);
  const bought: Record<string, number> = {};
  for (const [id, wt] of mix) {
    const cost = UNITS[id].cost, share = wt / total;
    let n = Infinity;
    for (const k of KEYS) if (cost[k] > 0) n = Math.min(n, Math.floor((budget[k] * share) / cost[k]));
    if (!isFinite(n) || n <= 0) continue;
    bought[id] = (bought[id] || 0) + n;
    for (const k of KEYS) budget[k] -= cost[k] * n;
  }
  return bought;
}
