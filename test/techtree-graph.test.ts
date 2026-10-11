import { describe, expect, it } from 'vitest';
import { TREE, levelGraph, levelKey, levelsShown, nodeOf, reach } from '../shared/techtree';

describe('the level graph', () => {
  const g = levelGraph();
  const byKey = new Map(g.nodes.map((n) => [n.key, n]));

  it('has a node for every level that something requires, and for every unit', () => {
    for (const n of TREE) for (const r of n.requires) expect(byKey.has(levelKey(r.id, r.level)), `${r.id} level ${r.level}`).toBe(true);
    expect(levelsShown('energy')).toBe(12);
    expect(byKey.has(levelKey('energy', 12))).toBe(true);
    expect(byKey.has(levelKey('weapons', 5))).toBe(true);      // nothing needs more than 3, a few extra levels still show
    expect(byKey.has(levelKey('deathstar', 1))).toBe(true);
    expect(byKey.has(levelKey('deathstar', 2))).toBe(false);
  });

  it('chains the levels of an item and links requirements to the first level', () => {
    expect(g.edges).toContainEqual({ from: 'energy@2', to: 'energy@3', kind: 'level' });
    expect(g.edges).toContainEqual({ from: 'energy@3', to: 'fusionReactor@1', kind: 'needs', at: 3 });
    expect(g.edges).toContainEqual({ from: 'deuteriumSynthesizer@5', to: 'fusionReactor@1', kind: 'needs', at: 5 });
  });

  it('flows left to right with no cycles: every edge goes to a later layer', () => {
    for (const e of g.edges) expect(byKey.get(e.to)!.layer, `${e.from} -> ${e.to}`).toBeGreaterThan(byKey.get(e.from)!.layer);
  });

  it('gives every item its own lane', () => {
    expect(new Set(g.nodes.map((n) => n.lane)).size).toBe(TREE.length);
    for (const n of g.nodes) expect(n.lane).toBe(g.lanes.indexOf(n.id));
  });

  it('follows the chain backward and forward', () => {
    const back = reach(g, 'fusionReactor@1', true);
    expect(back.has('energy@3')).toBe(true);
    expect(back.has('energy@1')).toBe(true);
    expect(back.has('researchLab@1')).toBe(true);
    expect(back.has('energy@4')).toBe(false);
    const fwd = reach(g, 'researchLab@1', false);
    expect(fwd.has('energy@1')).toBe(true);
    expect(fwd.has('researchLab@12')).toBe(true);
    expect(nodeOf('metalMine')).toBeTruthy();
  });
});
