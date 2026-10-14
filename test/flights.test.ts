import { describe, expect, it } from 'vitest';
import { angles, flightState, legs, polar, shares, type Flight } from '../client/src/flights';

const H = 3_600_000;
const T0 = 1_700_000_000_000;
const out: Flight = { id: 'e', mission: 'expedition', phase: 'outbound', departAt: T0, arriveAt: T0 + 2 * H, flightMs: 2 * H, holdHours: 2 };

describe('where a fleet is on its journey', () => {
  it('flies out: the distance grows with the time and the stay is counted at its planned length', () => {
    const s = flightState(out, T0 + H / 2);
    expect(s.stage).toBe('out');
    expect(s.distance).toBeCloseTo(0.25);
    expect(s.stageLeftMs).toBe(1.5 * H);
    expect(s.homeInMs).toBe(1.5 * H + 2 * H + 2 * H);                                  // the rest of the way out, the planned two hours, the way back
    expect(legs(out).stayPlanned).toBe(true);
    expect(flightState(out, T0 - 1000).distance).toBe(0);                             // never negative
  });
  it('explores at the target: full distance, counting down to when it leaves', () => {
    const holding: Flight = { ...out, phase: 'holding', holdUntil: T0 + 3 * H };      // the result came in: it stays one hour
    const s = flightState(holding, T0 + 2.5 * H);
    expect(s).toMatchObject({ stage: 'exploring', distance: 1 });
    expect(s.stageProgress).toBeCloseTo(0.5);
    expect(s.stageLeftMs).toBe(0.5 * H);
    expect(s.homeInMs).toBe(0.5 * H + 2 * H);
    expect(legs(holding).stayPlanned).toBe(false);
  });
  it('comes home: the distance shrinks to zero as it arrives', () => {
    const back: Flight = { ...out, phase: 'returning', holdUntil: T0 + 3 * H, returnAt: T0 + 5 * H };
    expect(flightState(back, T0 + 4 * H)).toMatchObject({ stage: 'back', distance: 0.5, stageLeftMs: H, homeInMs: H });
    expect(flightState(back, T0 + 6 * H)).toMatchObject({ distance: 0, stageLeftMs: 0, journey: 1 });
  });
  it('a quick trip with no stay has an empty middle', () => {
    const quick: Flight = { ...out, phase: 'returning', holdUntil: T0 + 2 * H, returnAt: T0 + 4 * H };
    expect(legs(quick).stay[1] - legs(quick).stay[0]).toBe(0);
    const sh = shares(quick);
    expect(sh.stay).toBe(0);
    expect(sh.out + sh.back).toBeCloseTo(1);
  });
  it('splits the timeline into shares that add up to one', () => {
    const sh = shares(out);
    expect(sh.out + sh.stay + sh.back).toBeCloseTo(1);
    expect(sh.stay).toBeCloseTo(2 / 6);
  });
});

describe('the chart geometry', () => {
  it('spreads the spokes round the circle starting at the top', () => {
    expect(angles(1)).toEqual([-Math.PI / 2]);
    const a = angles(4);
    expect(a).toHaveLength(4);
    expect(a[1] - a[0]).toBeCloseTo(Math.PI / 2);
    expect(angles(0)).toEqual([]);
  });
  it('turns a distance and an angle into a point', () => {
    const p = polar(100, 100, 50, -Math.PI / 2);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50);
  });
});
