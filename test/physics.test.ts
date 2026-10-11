import { describe, expect, it } from 'vitest';
import { levelGraph } from '../shared/techtree';
import { createSim, edgeStats, settle } from '../client/src/physics';

const W = 116, H = 26, COL = 128;
const g = levelGraph();
const edges = g.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind }));
const build = () => createSim(g.nodes.map((n) => ({ key: n.key, column: n.layer, x: 16 + n.layer * COL, y: 16 + n.lane * 34, w: W, h: H })), edges);

describe('the tech tree columns and physics', () => {
  it('puts every node in exactly one column and never moves it out', () => {
    const sim = build();
    const start = new Map(sim.bodies.map((b) => [b.key, b.x]));
    settle(sim);
    for (const n of g.nodes) {
      const b = sim.byKey.get(n.key)!;
      expect(b.x).toBe(start.get(n.key));
      expect(b.x).toBe(16 + n.layer * COL);
      expect(b.column).toBe(n.layer);
    }
  });

  it('only has arrows that go from a column to a later one (children sit to the right of their parents)', () => {
    const sim = build();
    settle(sim);
    for (const e of g.edges) {
      const a = sim.byKey.get(e.from)!, b = sim.byKey.get(e.to)!;
      expect(b.column, `${e.from} -> ${e.to}`).toBeGreaterThan(a.column);
      expect(b.x).toBeGreaterThan(a.x + a.w - 1);
    }
  });

  it('settles on its own, and stays finite', () => {
    const sim = build();
    settle(sim);
    expect(sim.settled()).toBe(true);
    for (const b of sim.bodies) { expect(Number.isFinite(b.y)).toBe(true); expect(Math.abs(b.vy)).toBeLessThan(1); }
  });

  it('does not leave nodes of a column on top of each other', () => {
    const sim = build();
    settle(sim);
    const byColumn = new Map<number, typeof sim.bodies>();
    for (const b of sim.bodies) (byColumn.get(b.column) ?? byColumn.set(b.column, []).get(b.column)!).push(b);
    for (const col of byColumn.values()) {
      col.sort((a, b) => a.y - b.y);
      for (let i = 1; i < col.length; i++) expect(col[i].y - col[i - 1].y, `${col[i - 1].key} / ${col[i].key}`).toBeGreaterThan(H - 6);
    }
  });

  it('optimises arrow length: shorter and more even than the tidy grid it starts from', () => {
    const sim = build();
    const before = edgeStats(sim, edges);
    settle(sim);
    const after = edgeStats(sim, edges);
    expect(after.total).toBeLessThan(before.total);
    expect(after.rise).toBeLessThan(before.rise * 0.4);
    expect(after.maxRise).toBeLessThan(before.maxRise * 0.6);
  });

  it('is deterministic', () => {
    const a = build(), b = build();
    settle(a); settle(b);
    expect(a.bodies.map((x) => Math.round(x.y))).toEqual(b.bodies.map((x) => Math.round(x.y)));
  });

  it('reacts to a dragged node, which can only slide in its column, and relaxes again', () => {
    const sim = build();
    settle(sim);
    const grabbed = sim.byKey.get('energy@3')!, next = sim.byKey.get('energy@4')!;
    const before = next.y, x = grabbed.x;
    grabbed.pinned = true; grabbed.y += 160;
    sim.reheat(0.8);
    for (let i = 0; i < 80; i++) sim.step();
    expect(Math.abs(next.y - before)).toBeGreaterThan(20);              // the chain follows
    expect(grabbed.x).toBe(x);
    grabbed.pinned = false;
    sim.reheat(0.8);
    settle(sim);
    expect(sim.settled()).toBe(true);
  });
});
