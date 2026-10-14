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

describe('the fly-past of the other body across the banner', () => {
  it('is away at first, then crosses once a minute or so and is away in between', async () => {
    const { FLYBY, flybyPose } = await import('../client/src/motion');
    expect(flybyPose(0)).toBeNull();
    expect(flybyPose(FLYBY.delayMs - 1)).toBeNull();
    expect(flybyPose(FLYBY.delayMs + FLYBY.crossMs / 2)).not.toBeNull();
    expect(flybyPose(FLYBY.delayMs + FLYBY.crossMs + 500)).toBeNull();
    expect(flybyPose(FLYBY.delayMs + FLYBY.periodMs + FLYBY.crossMs / 2)).not.toBeNull();
  });
  it('goes from off the left edge to off the right edge, biggest and highest in the middle, fading in and out', async () => {
    const { FLYBY, flybyPose } = await import('../client/src/motion');
    const at = (u: number) => flybyPose(FLYBY.delayMs + u * FLYBY.crossMs - (u === 0 ? -1 : 0))!;
    const start = at(0.001), mid = at(0.5), end = at(0.999);
    expect(start.x).toBeLessThan(0);
    expect(end.x).toBeGreaterThan(1);
    expect(mid.x).toBeCloseTo(0.5, 2);
    expect(mid.scale).toBeGreaterThan(start.scale * 2);
    expect(mid.y).toBeLessThan(start.y);
    expect(start.opacity).toBeLessThan(0.05);
    expect(mid.opacity).toBe(1);
    expect(end.opacity).toBeLessThan(0.05);
  });
  it('moves at a steady pace with no jumps from one frame to the next', async () => {
    const { FLYBY, flybyPose } = await import('../client/src/motion');
    let prev = flybyPose(FLYBY.delayMs + 100)!, maxStep = 0;
    for (let t = FLYBY.delayMs + 116; t < FLYBY.delayMs + FLYBY.crossMs - 100; t += 16) {
      const p = flybyPose(t)!;
      maxStep = Math.max(maxStep, Math.abs(p.x - prev.x), Math.abs(p.y - prev.y), Math.abs(p.scale - prev.scale));
      prev = p;
    }
    expect(maxStep).toBeLessThan(0.004);                                       // a 1000 px banner moves at most a few pixels per frame
  });
});
