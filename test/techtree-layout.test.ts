import { describe, expect, it } from 'vitest';
import { ITEM_EDGES, VISIBLE_EDGES, TREE, columns, levelsShown, nodeOf, pathTo } from '../shared/techtree';

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
