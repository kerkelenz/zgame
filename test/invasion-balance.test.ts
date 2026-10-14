import { describe, expect, it } from 'vitest';
import { runInvasion, type Setup } from '../server/invasionSim';

const base: Setup = { players: 20, joining: 1, fleet: 40_000_000, sent: 1, tech: 6, mix: 'balanced' };
const wins = (s: Setup) => [11, 22, 33, 44, 55, 66].filter((seed) => runInvasion(s, seed).won).length;

describe('invasion balance (dry run, no supplies)', () => {
  it('one commander never beats the invasion alone, even sending everything', () => {
    expect(wins({ ...base, joining: 1 })).toBe(0);
  });
  it('a few commanders with half the fleets between them are not enough', () => {
    expect(wins({ ...base, joining: 3, sent: 0.5 })).toBe(0);
  });
  it('about a third of the server fleets together win it with light losses', () => {
    const s = { ...base, joining: 6 };
    expect(wins(s)).toBe(6);
    expect(runInvasion(s, 11).lostShare).toBeLessThan(0.35);
  });
  it('the whole server wins it almost for free', () => {
    expect(runInvasion({ ...base, joining: 20 }, 11).lostShare).toBeLessThan(0.1);
  });
});
