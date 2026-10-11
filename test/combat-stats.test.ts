import { describe, expect, it } from 'vitest';
import { makeRng, simulateCombat, type Combatant } from '../shared/combat';

const side = (name: string, fleet: Combatant['fleet'], defenses?: Combatant['defenses']): Combatant => ({ owner: null, name, weapons: 3, shielding: 2, armour: 1, fleet, defenses });
const total = (log: { a: Record<string, number>; d: Record<string, number> }, who: 'a' | 'd') => Object.values(log[who]).reduce((s, n) => s + (n || 0), 0);

describe('round statistics of a battle', () => {
  const res = simulateCombat([side('A', { cruiser: 30, lightFighter: 40 })], [side('D', { battleship: 8 }, { rocketLauncher: 60, lightLaser: 20 })], makeRng(42));

  it('has one entry per round', () => {
    expect(res.rounds).toBeGreaterThan(1);
    expect(res.roundStats).toHaveLength(res.rounds);
    expect(res.roundLog).toHaveLength(res.rounds + 1);
  });

  it('adds up: every point of damage was either absorbed by a shield or reached a hull', () => {
    for (const r of res.roundStats) for (const s of [r.attackers, r.defenders]) {
      expect(s.shots).toBeGreaterThan(0);
      expect(s.damage).toBeGreaterThan(0);
      expect(s.absorbed + s.hullDamage).toBeCloseTo(s.damage, 3);
      expect(s.absorbed).toBeGreaterThanOrEqual(0);
      expect(s.hullDamage).toBeGreaterThanOrEqual(0);
    }
  });

  it('counts the units each side destroyed, matching what the other side lost', () => {
    res.roundStats.forEach((r, i) => {
      expect(r.attackers.destroyed).toBe(total(res.roundLog[i], 'd') - total(res.roundLog[i + 1], 'd'));
      expect(r.defenders.destroyed).toBe(total(res.roundLog[i], 'a') - total(res.roundLog[i + 1], 'a'));
    });
  });

  it('is the same every time for the same seed', () => {
    const again = simulateCombat([side('A', { cruiser: 30, lightFighter: 40 })], [side('D', { battleship: 8 }, { rocketLauncher: 60, lightLaser: 20 })], makeRng(42));
    expect(again.roundStats).toEqual(res.roundStats);
  });

  it('shows weak shots bouncing off strong shields', () => {
    const bounce = simulateCombat([side('A', { lightFighter: 10 })], [side('D', {}, { largeShield: 1, smallShield: 1 })], makeRng(1));
    const first = bounce.roundStats[0].attackers;
    expect(first.absorbed).toBeCloseTo(first.damage, 3);                         // nothing reached a hull
    expect(first.hullDamage).toBe(0);
  });
});
