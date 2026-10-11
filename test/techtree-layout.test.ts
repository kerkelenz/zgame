import { describe, expect, it } from 'vitest';
import { ITEM_EDGES, VISIBLE_EDGES, levelGraph, levelKey, reach, TREE, columns, levelsShown, nodeOf, pathTo } from '../shared/techtree';

describe('the tech tree layout', () => {
  it('puts every item in exactly one column, by step', () => {
    const cols = columns();
    const all = cols.flat();
    expect(all.length).toBe(TREE.length);
    expect(new Set(all).size).toBe(TREE.length);
    cols.forEach((c, t) => c.forEach((id) => expect(nodeOf(id)!.tier).toBe(t)));
  });

  it('only draws arrows left to right', () => {
    for (const e of ITEM_EDGES) expect(nodeOf(e.from)!.tier).toBeLessThan(nodeOf(e.to)!.tier);
  });

  it('shows every level something needs, and a few more', () => {
    expect(levelsShown('energy')).toBe(12);
    expect(levelsShown('weapons')).toBeGreaterThanOrEqual(5);
    expect(levelsShown('deathstar')).toBe(1);
    for (const e of ITEM_EDGES) expect(levelsShown(e.from)).toBeGreaterThanOrEqual(e.level);
  });

  it('lists the path to an item in order, with the level each step needs', () => {
    const path = pathTo('fusionReactor');
    expect(path).toContainEqual({ id: 'deuteriumSynthesizer', level: 5 });
    expect(path).toContainEqual({ id: 'energy', level: 3 });
    expect(path.map((p) => p.id).indexOf('researchLab')).toBeLessThan(path.map((p) => p.id).indexOf('energy'));
    expect(pathTo('metalMine')).toEqual([]);
  });

  it('leaves out arrows another requirement already guarantees, and marks the busy hubs', () => {
    const has = (a: string, b: string) => VISIBLE_EDGES.some((e) => e.from === a && e.to === b);
    expect(VISIBLE_EDGES.length).toBeLessThan(ITEM_EDGES.length);
    expect(has('researchLab', 'laser')).toBe(false);       // Energy 2 already needs the lab
    expect(has('energy', 'laser')).toBe(true);
    expect(has('deuteriumSynthesizer', 'fusionReactor')).toBe(true);
    expect(VISIBLE_EDGES.find((e) => e.from === 'shipyard')!.hub).toBe(true);
    expect(VISIBLE_EDGES.find((e) => e.from === 'laser' && e.to === 'plasma')!.hub).toBe(false);
  });
});

describe('the level graph', () => {
  const g = levelGraph();
  const byKey = new Map(g.nodes.map((n) => [n.key, n]));

  it('has a node for every level that something requires and for every unit', () => {
    for (const e of ITEM_EDGES) expect(byKey.has(levelKey(e.from, e.level)), `${e.from} ${e.level}`).toBe(true);
    expect(byKey.has(levelKey('energy', 12))).toBe(true);
    expect(byKey.has(levelKey('weapons', 5))).toBe(true);
    expect(byKey.has(levelKey('deathstar', 1))).toBe(true);
    expect(byKey.has(levelKey('deathstar', 2))).toBe(false);
  });

  it('chains levels and links requirements to the first level', () => {
    expect(g.edges).toContainEqual({ from: 'energy@2', to: 'energy@3', kind: 'level', hub: false });
    expect(g.edges.find((e) => e.from === 'energy@3' && e.to === 'fusionReactor@1')).toMatchObject({ kind: 'needs', at: 3 });
    expect(g.edges.some((e) => e.from === 'deuteriumSynthesizer@5' && e.to === 'fusionReactor@1')).toBe(true);
  });

  it('flows left to right: every edge goes to a later layer', () => {
    for (const e of g.edges) expect(byKey.get(e.to)!.layer, `${e.from} -> ${e.to}`).toBeGreaterThan(byKey.get(e.from)!.layer);
  });

  it('gives every item one lane', () => {
    expect(new Set(g.nodes.map((n) => n.lane)).size).toBe(TREE.length);
  });

  it('follows the chain both ways', () => {
    const back = reach(g, 'fusionReactor@1', true);
    for (const k of ['energy@3', 'energy@1', 'researchLab@1', 'deuteriumSynthesizer@5']) expect(back.has(k), k).toBe(true);
    expect(back.has('energy@4')).toBe(false);
    const fwd = reach(g, 'researchLab@1', false);
    expect(fwd.has('energy@1')).toBe(true);
    expect(fwd.has('researchLab@12')).toBe(true);
  });
});
