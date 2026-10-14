import { describe, expect, it } from 'vitest';
import { affordWait } from '../client/src/afford';

const r = (metal = 0, crystal = 0, deuterium = 0) => ({ metal, crystal, deuterium });
describe('affordWait', () => {
  it('is zero when the cost is already covered', () => {
    expect(affordWait(r(100, 50), r(100, 50), r(10, 10), r(1000, 1000, 1000))).toEqual({ ms: 0 });
  });
  it('waits for the slowest missing resource', () => {
    // metal needs 2h, crystal needs 1h
    expect(affordWait(r(300, 150), r(100, 100), r(100, 50), r(1000, 1000, 1000))).toEqual({ ms: 2 * 3_600_000 });
  });
  it('never gets there when the cost does not fit the storage or a missing resource has no income', () => {
    expect(affordWait(r(5000), r(0), r(100), r(1000, 1000, 1000))).toEqual({ ms: null, why: 'storage' });
    expect(affordWait(r(0, 0, 100), r(0), r(100, 0, 0), r(1000, 1000, 1000))).toEqual({ ms: null, why: 'income' });
    expect(affordWait(r(0, 0, 100), r(0), r(100, 0, -5), r(1000, 1000, 1000))).toEqual({ ms: null, why: 'income' });
  });
});

import { fullState, timeToFull } from '../client/src/afford';
describe('timeToFull', () => {
  it('counts the hours left to the cap, and is zero when full or null when not filling', () => {
    expect(timeToFull(500, 100, 1000)).toBe(5 * 3_600_000);
    expect(timeToFull(1000, 100, 1000)).toBe(0);
    expect(timeToFull(1200, 100, 1000)).toBe(0);
    expect(timeToFull(500, 0, 1000)).toBeNull();
    expect(timeToFull(500, -3, 1000)).toBeNull();
  });
  it('flags full and full-within-the-hour', () => {
    expect(fullState(0)).toBe('full');
    expect(fullState(30 * 60_000)).toBe('soon');
    expect(fullState(2 * 3_600_000)).toBe('');
    expect(fullState(null)).toBe('');
  });
});
