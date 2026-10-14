import { describe, expect, it } from 'vitest';
import { ALIEN_KINDS, buildWave, planWaves } from '../shared/aliens';
import { fleetValue } from '../server/npc';

describe('alien kinds', () => {
  it('are made of real combat ships whose shares add up to one', () => {
    for (const k of Object.values(ALIEN_KINDS)) {
      expect(k.mix.reduce((s, [, x]) => s + x, 0), k.id).toBeCloseTo(1);
      expect(k.hint.length).toBeGreaterThan(40);
      expect(k.regen).toBeGreaterThan(0);
    }
  });
  it('build a fleet worth about the budget, in the kind\'s mix', () => {
    const budget = 50_000_000;
    for (const k of Object.values(ALIEN_KINDS)) {
      const f = buildWave(k.id, budget);
      expect(fleetValue(f) / budget, k.id).toBeGreaterThan(0.95);
      expect(fleetValue(f), k.id).toBeLessThanOrEqual(budget);
      expect(Object.keys(f).sort()).toEqual(k.mix.map(([id]) => id).sort());
    }
    expect(buildWave('swarm', 50_000_000).lightFighter!).toBeGreaterThan(buildWave('swarm', 50_000_000).cruiser!);
  });
  it('differ in the ways the hints say', () => {
    expect(ALIEN_KINDS.bio.regen).toBeGreaterThan(ALIEN_KINDS.swarm.regen * 2);
    expect(ALIEN_KINDS.breaker.tech.weapons).toBeGreaterThan(ALIEN_KINDS.carrier.tech.weapons);
    expect(ALIEN_KINDS.carrier.tech.armour).toBeGreaterThan(ALIEN_KINDS.breaker.tech.armour);
    expect(ALIEN_KINDS.breaker.tech.shielding).toBeLessThan(0);
  });
});

describe('the waves of an invasion', () => {
  it('start with a swarm, grow, and end with the mothership; the shares add up to one', () => {
    const p = planWaves(4, 1);
    expect(p).toHaveLength(4);
    expect(p[0].kind).toBe('swarm');
    expect(p[3].kind).toBe('mothership');
    expect(p.map((x) => x.name)).toEqual(['Scouts', 'Assault 1', 'Assault 2', 'Mothership']);
    expect(p.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1);
    for (let i = 1; i < p.length; i++) expect(p[i].share).toBeGreaterThan(p[i - 1].share);
  });
  it('are a single mothership when there is one, and never more than eight', () => {
    expect(planWaves(1, 1)).toEqual([{ index: 0, kind: 'mothership', name: 'The Armada', share: 1 }]);
    expect(planWaves(20, 1)).toHaveLength(8);
    expect(planWaves(0, 1)).toHaveLength(1);
  });
  it('vary the middle waves from one invasion to the next', () => {
    const kinds = (n: number) => planWaves(5, n).slice(1, 4).map((x) => x.kind);
    expect(kinds(1)).not.toEqual(kinds(2));
    for (const n of [1, 2, 3]) for (const k of kinds(n)) expect(['breaker', 'bio', 'carrier']).toContain(k);
  });
});
