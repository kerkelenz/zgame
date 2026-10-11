import { describe, expect, it } from 'vitest';
import { ITEM_EDGES, VISIBLE_EDGES, TREE, columns, levelsShown, nodeOf, pathTo, CATEGORIES, categoryOf, mapLayout, pathSet } from '../shared/techtree';

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

describe('the map layout', () => {
  it('gives every item exactly one cell, in a column by step and a row band by category', () => {
    const m = mapLayout();
    expect(m.cells.length).toBe(TREE.length);
    expect(new Set(m.cells.map((c) => c.id)).size).toBe(TREE.length);
    for (const c of m.cells) {
      expect(c.col).toBe(nodeOf(c.id)!.tier);
      expect(m.bands[c.band].id).toBe(categoryOf(c.id));
      expect(c.slot).toBeLessThan(m.bands[c.band].slots);
    }
    expect(m.bands.map((b) => b.id)).toEqual(CATEGORIES.map((c) => c.id));
  });

  it('never puts two items in the same place', () => {
    const seen = new Set<string>();
    for (const c of mapLayout().cells) { const k = `${c.band}:${c.col}:${c.slot}`; expect(seen.has(k), k).toBe(false); seen.add(k); }
  });

  it('keeps arrows flowing to later columns', () => {
    const m = mapLayout();
    const col = new Map(m.cells.map((c) => [c.id, c.col]));
    for (const e of ITEM_EDGES) expect(col.get(e.to)!, `${e.from} -> ${e.to}`).toBeGreaterThan(col.get(e.from)!);
  });

  it('sorts items into sensible rows', () => {
    expect(categoryOf('metalMine')).toBe('economy');
    expect(categoryOf('crawler')).toBe('economy');
    expect(categoryOf('researchLab')).toBe('research');
    expect(categoryOf('energy')).toBe('research');
    expect(categoryOf('shipyard')).toBe('fleet');
    expect(categoryOf('deathstar')).toBe('fleet');
    expect(categoryOf('plasmaTurret')).toBe('defense');
    expect(categoryOf('missileSilo')).toBe('defense');
    expect(categoryOf('jumpGate')).toBe('moon');
  });

  it('lays out just the path to a goal, with empty columns and bands closed up', () => {
    const path = pathSet('deathstar');
    expect(path.has('deathstar') && path.has('graviton') && path.has('shipyard') && path.has('researchLab')).toBe(true);
    expect(path.has('metalMine')).toBe(false);
    const m = mapLayout(path);
    expect(m.cells.length).toBe(path.size);
    expect(m.bands.map((b) => b.id)).toEqual(['economy', 'research', 'fleet'].filter((id) => [...path].some((p) => categoryOf(p) === id)));
    expect(m.cols).toBeLessThanOrEqual(new Set([...path].map((id) => nodeOf(id)!.tier)).size);
    const col = new Map(m.cells.map((c) => [c.id, c.col]));
    expect(col.get('deathstar')).toBe(m.cols - 1);
    for (const e of ITEM_EDGES) if (path.has(e.from) && path.has(e.to)) expect(col.get(e.to)!).toBeGreaterThan(col.get(e.from)!);
  });
});
