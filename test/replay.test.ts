import { describe, expect, it } from 'vitest';
import { TIMING, beamCount, canReplay, framesOf, iconPlan, iconsAlive, momentAt, roundMs, roundStart, roundText, seeded, totalMs } from '../client/src/replay';

const stat = (shots: number, damage: number) => ({ shots, damage, absorbed: 10, hullDamage: damage - 10, destroyed: 1 });
const data = {
  roundLog: [{ a: { cruiser: 10 }, d: { lightFighter: 20, rocketLauncher: 6 } }, { a: { cruiser: 9 }, d: { lightFighter: 9, rocketLauncher: 6 } }, { a: { cruiser: 9 }, d: { lightFighter: 0, rocketLauncher: 2 } }],
  roundStats: [{ attackers: stat(10, 5000), defenders: stat(26, 800) }, { attackers: stat(9, 4500), defenders: stat(15, 400) }],
};

describe('how many pictures a fleet gets', () => {
  it('shows every ship of a small fleet and scales a big one down to the cap', () => {
    expect(iconPlan({ cruiser: 5, lightFighter: 3 })).toEqual({ per: 1, icons: { cruiser: 5, lightFighter: 3 } });
    const big = iconPlan({ cruiser: 100_000, lightFighter: 40_000, bomber: 7 }, 36);
    expect(Object.values(big.icons).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(36);
    expect(big.icons.bomber).toBe(1);                                                // a type that exists always shows
    expect(big.per).toBeGreaterThan(1000);
  });
  it('ignores empty types and shrinks the standing pictures as units die, never below one while any live', () => {
    const plan = iconPlan({ cruiser: 1000, bomber: 0, lightFighter: 10 }, 12);
    expect(Object.keys(plan.icons).sort()).toEqual(['cruiser', 'lightFighter']);
    const half = iconsAlive(plan, { cruiser: 500, lightFighter: 10 });
    expect(half.cruiser).toBeLessThan(plan.icons.cruiser);
    expect(iconsAlive(plan, { cruiser: 1, lightFighter: 0 })).toEqual({ cruiser: 1, lightFighter: 0 });
    expect(iconsAlive(plan, {})).toEqual({ cruiser: 0, lightFighter: 0 });
  });
});

describe('the rounds', () => {
  it('turn the census of each round into losses per type', () => {
    const f = framesOf(data);
    expect(f).toHaveLength(2);
    expect(f[0].lost).toEqual({ a: { cruiser: 1 }, d: { lightFighter: 11 } });
    expect(f[1].lost.d).toEqual({ lightFighter: 9, rocketLauncher: 4 });
    expect(f[0].stats!.d.shots).toBe(26);
    expect(framesOf({ roundLog: data.roundLog })[0].stats).toBeNull();                // an old report without stats still replays
  });
  it('describe a round in words', () => {
    const t = roundText(framesOf(data)[0], (n) => String(n));
    expect(t).toMatch(/^Round 1: attackers fired 10 shots \(5000 damage, 10 absorbed by shields\) and the other side lost 11 units; defenders fired 26 shots/);
  });
  it('only replay a report that has the census of every round', () => {
    expect(canReplay(data)).toBe(true);
    expect(canReplay({ roundLog: [data.roundLog[0]] })).toBe(false);
    expect(canReplay(null)).toBe(false);
    expect(canReplay({})).toBe(false);
  });
});

describe('the timeline', () => {
  it('walks through intro, fire, hit and rest of every round, then the outro', () => {
    expect(momentAt(0, 3)).toMatchObject({ phase: 'intro', round: 0 });
    expect(momentAt(roundStart(0) + 10, 3)).toMatchObject({ phase: 'fire', round: 0 });
    expect(momentAt(roundStart(0) + TIMING.fire + 10, 3)).toMatchObject({ phase: 'hit', round: 0 });
    expect(momentAt(roundStart(0) + TIMING.fire + TIMING.hit + 10, 3)).toMatchObject({ phase: 'rest', round: 0 });
    expect(momentAt(roundStart(2) + 10, 3)).toMatchObject({ phase: 'fire', round: 2 });
    expect(momentAt(roundStart(3) + 10, 3)).toMatchObject({ phase: 'outro', round: 2, done: false });
    expect(momentAt(totalMs(3), 3).done).toBe(true);
    expect(momentAt(-50, 3).phase).toBe('intro');
  });
  it('has a round start for every round and a total that fits them', () => {
    expect(roundStart(1) - roundStart(0)).toBe(roundMs());
    expect(totalMs(4)).toBe(TIMING.intro + 4 * roundMs() + TIMING.outro);
    for (let t = 0; t < totalMs(3); t += 137) { const m = momentAt(t, 3); expect(m.p).toBeGreaterThanOrEqual(0); expect(m.p).toBeLessThanOrEqual(1); }
  });
  it('handles a battle with no rounds', () => {
    expect(momentAt(5000, 0).phase).toBe('outro');
    expect(momentAt(5000, 0).done).toBe(true);
  });
});

describe('beams and randomness', () => {
  it('draws more beams for more shots but never a wall of them, and none for no shots', () => {
    expect(beamCount(0)).toBe(0);
    expect(beamCount(1)).toBe(3);
    expect(beamCount(1000)).toBeGreaterThan(beamCount(10));
    expect(beamCount(1e12)).toBe(28);
  });
  it('repeats the same sequence for the same seed', () => {
    const a = seeded(7), b = seeded(7), c = seeded(8);
    const xs = [a(), a(), a()], ys = [b(), b(), b()];
    expect(xs).toEqual(ys);
    expect(c()).not.toBe(xs[0]);
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
});
