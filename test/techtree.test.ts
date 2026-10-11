import { describe, expect, it } from 'vitest';
import { BUILDINGS, TECHS, UNITS } from '../shared/data';
import { FLOWS, TREE, ancestors, descendants, nodeOf } from '../shared/techtree';

describe('the tech tree', () => {
  it('has a node for every building, research, ship and defense', () => {
    expect(TREE.length).toBe(Object.keys(BUILDINGS).length + Object.keys(TECHS).length + Object.keys(UNITS).length);
    expect(new Set(TREE.map((n) => n.id)).size).toBe(TREE.length);
  });

  it('only requires things that exist, and has no cycles', () => {
    for (const n of TREE) for (const r of n.requires) {
      expect(nodeOf(r.id), `${n.id} needs ${r.id}`).toBeTruthy();
      expect(nodeOf(r.id)!.tier, `${n.id} comes after ${r.id}`).toBeLessThan(n.tier);
    }
  });

  it('puts things that need nothing at the start, and deeper items later', () => {
    expect(nodeOf('metalMine')!.tier).toBe(0);
    expect(nodeOf('shipyard')!.tier).toBeGreaterThan(nodeOf('roboticsFactory')!.tier);
    expect(nodeOf('deathstar')!.tier).toBeGreaterThan(nodeOf('destroyer')!.tier - 1);
  });

  it('finds the whole chain behind an item and everything it opens', () => {
    const a = ancestors('fusionReactor');
    expect(a.get('deuteriumSynthesizer')).toBe(5);
    expect(a.get('energy')).toBe(3);
    expect(a.get('researchLab')).toBeGreaterThanOrEqual(1);          // energy needs a lab
    expect(descendants('researchLab').has('energy')).toBe(true);
    expect(descendants('researchLab').has('laser')).toBe(true);
    expect(descendants('metalMine').size).toBe(0);
  });

  it('links the production web only to real items', () => {
    for (const f of FLOWS) for (const b of [...f.boosts, ...(f.limits ?? [])]) if (b.id) expect(nodeOf(b.id), `${f.id}: ${b.id}`).toBeTruthy();
  });
});
