import { describe, expect, it, beforeEach } from 'vitest';
import { loadLastSend, repeatable, saveLastSend, type LastSend } from '../client/src/lastSend';

const base: LastSend = { ships: { largeCargo: 10, smallCargo: 4 }, to: { g: 1, s: 34, p: 7 }, mission: 'transport', speedPct: 100, cargo: { metal: 1, crystal: 0, deuterium: 0 }, holdHours: 1, toMoon: false };

describe('last dispatch', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };
  });
  it('is remembered and read back', () => {
    saveLastSend(base);
    expect(loadLastSend()).toEqual(base);
  });
  it('ignores garbage and an empty fleet', () => {
    localStorage.setItem('zg.lastSend', '{"mission":1}');
    expect(loadLastSend()).toBeNull();
    saveLastSend({ ...base, ships: { largeCargo: 0 } });
    expect(loadLastSend()).toBeNull();
  });
  it('prepares only the ships that are at this planet, capped at what is there', () => {
    expect(repeatable(base, { largeCargo: 3, smallCargo: 9 })!.ships).toEqual({ largeCargo: 3, smallCargo: 4 });
    expect(repeatable(base, { cruiser: 5 })).toBeNull();
  });
});
