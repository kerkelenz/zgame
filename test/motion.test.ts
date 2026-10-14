import { describe, expect, it } from 'vitest';
import { easeOut, flightProgress, getMotion, isMotion, setMotion } from '../client/src/motion';

describe('motion', () => {
  it('knows the three settings and nothing else', () => {
    expect(['full', 'reduced', 'off'].every(isMotion)).toBe(true);
    expect(isMotion('loud')).toBe(false);
    expect(isMotion(undefined)).toBe(false);
  });
  it('starts on full without a device preference, and a choice sticks', () => {
    expect(['full', 'reduced']).toContain(getMotion());
    setMotion('off');
    expect(getMotion()).toBe('off');
    setMotion('full');
    expect(getMotion()).toBe('full');
  });
  it('eases out: quick at the start, settling at the end, never outside 0..1', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(-3)).toBe(0);
    expect(easeOut(9)).toBe(1);
  });
});

describe('where a fleet is on its way', () => {
  const m = { departAt: 1000, arriveAt: 3000 };
  it('goes from 0 to 1 on the way out and stays within it', () => {
    expect(flightProgress({ ...m, phase: 'outbound' }, 1000)).toEqual({ frac: 0, dir: 'out' });
    expect(flightProgress({ ...m, phase: 'outbound' }, 2000).frac).toBeCloseTo(0.5, 9);
    expect(flightProgress({ ...m, phase: 'outbound' }, 9000).frac).toBe(1);
    expect(flightProgress({ ...m, phase: 'outbound' }, 0).frac).toBe(0);
  });
  it('waits at the target while holding', () => {
    expect(flightProgress({ ...m, phase: 'holding' }, 2000)).toEqual({ frac: 1, dir: 'hold' });
  });
  it('comes back from 1 to 0 over the length of the flight', () => {
    const back = { ...m, phase: 'returning', returnAt: 13_000, flightMs: 2000 };      // left the target at 11,000
    expect(flightProgress(back, 11_000)).toEqual({ frac: 1, dir: 'back' });
    expect(flightProgress(back, 12_000).frac).toBeCloseTo(0.5, 9);
    expect(flightProgress(back, 13_000).frac).toBe(0);
    expect(flightProgress(back, 20_000).frac).toBe(0);
  });
});
