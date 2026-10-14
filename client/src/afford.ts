import type { Res } from '../../shared/types';

export interface AffordWait { ms: number | null; why?: 'storage' | 'income' }
const KEYS = ['metal', 'crystal', 'deuterium'] as const;

/**
 * How long until `cost` can be paid at the planet's current hourly production. `ms` is 0 when it can be paid now; `null` when it never can:
 * the cost is bigger than the storage (`why: 'storage'`) or a missing resource has no income (`why: 'income'`).
 */
export function affordWait(cost: Res, have: Res, rate: Res, capacity: Res): AffordWait {
  let hours = 0;
  for (const k of KEYS) {
    const need = cost[k] - have[k];
    if (need <= 0) continue;
    if (cost[k] > capacity[k]) return { ms: null, why: 'storage' };
    if (rate[k] <= 0) return { ms: null, why: 'income' };
    hours = Math.max(hours, need / rate[k]);
  }
  return { ms: Math.ceil(hours * 3_600_000) };
}

const FILTER_KEY = 'zg.onlyStartable';
export const getOnlyStartable = (): boolean => { try { return localStorage.getItem(FILTER_KEY) === '1'; } catch { return false; } };
export const setOnlyStartable = (on: boolean) => { try { localStorage.setItem(FILTER_KEY, on ? '1' : '0'); } catch { /* ignore */ } };

/** how long until a store is full at its current rate: 0 when full already, null when it is not filling */
export function timeToFull(current: number, rate: number, capacity: number): number | null {
  if (current >= capacity) return 0;
  if (rate <= 0) return null;
  return Math.ceil(((capacity - current) / rate) * 3_600_000);
}

/** the colour class for a resource chip: full, or filling up within the hour */
export function fullState(ms: number | null): '' | 'full' | 'soon' {
  return ms === 0 ? 'full' : ms !== null && ms < 3_600_000 ? 'soon' : '';
}
