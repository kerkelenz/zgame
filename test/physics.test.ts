import { describe, expect, it } from 'vitest';
import { levelGraph } from '../shared/techtree';
import { PHYSICS, createSim, edgeStats, settle } from '../client/src/physics';

const W = 116, H = 26;
const build = () => {
  const g = levelGraph();
  return createSim(
    g.nodes.map((n) => ({ key: n.key, x: 16 + n.layer * 128, y: 16 + n.lane * 34, w: W, h: H })),
    g.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
  );
};

describe('the tech tree physics', () => {
  it('settles on its own, and stays finite', () => {
    const sim = build();
    settle(sim);
    expect(sim.settled()).toBe(true);
    for (const b of sim.bodies) { expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true); expect(Math.hypot(b.vx, b.vy)).toBeLessThan(1); }
  });

  it('keeps levels in a chain and arrows flowing left to right', () => {
    const sim = build();
    settle(sim);
    const g = levelGraph();
    for (const e of g.edges) expect(sim.byKey.get(e.to)!.x, `${e.from} -> ${e.to}`).toBeGreaterThan(sim.byKey.get(e.from)!.x);
  });

  it('does not leave nodes sitting on top of each other', () => {
    const sim = build();
    settle(sim);
    let worst = 0;
    for (let i = 0; i < sim.bodies.length; i++) for (let j = i + 1; j < sim.bodies.length; j++) {
      const a = sim.bodies[i], b = sim.bodies[j];
      const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x), oy = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
      if (ox > 0 && oy > 0) worst = Math.max(worst, Math.min(ox, oy));
    }
    expect(worst).toBeLessThan(H / 2);
  });

  it('is deterministic', () => {
    const a = build(), b = build();
    settle(a); settle(b);
    expect(a.bodies.map((x) => Math.round(x.x))).toEqual(b.bodies.map((x) => Math.round(x.x)));
  });

  it('reacts to a dragged node and relaxes again afterwards', () => {
    const sim = build();
    settle(sim);
    const grabbed = sim.byKey.get('energy@3')!, next = sim.byKey.get('energy@4')!;
    const before = next.y;
    grabbed.pinned = true; grabbed.y += 160;
    sim.reheat(0.8);
    for (let i = 0; i < 80; i++) sim.step();
    expect(Math.abs(next.y - before)).toBeGreaterThan(20);              // the chain follows
    grabbed.pinned = false;
    sim.reheat(0.8);
    settle(sim);
    expect(sim.settled()).toBe(true);
    expect(PHYSICS.alphaMin).toBeGreaterThan(0);
  });

  it('optimises arrow length: much shorter and more even than the tidy grid it starts from', () => {
    const g = levelGraph();
    const edges = g.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind }));
    const sim = build();
    const before = edgeStats(sim, edges);
    settle(sim);
    const after = edgeStats(sim, edges);
    expect(after.mean).toBeLessThan(before.mean * 0.5);
    expect(after.total).toBeLessThan(before.total * 0.5);
    expect(after.sd).toBeLessThan(before.sd * 0.4);
    expect(after.max).toBeLessThan(before.max * 0.4);
  });

  it('pushes nodes apart: no two nodes end up closer than their boxes allow', () => {
    const sim = build();
    settle(sim);
    for (let i = 0; i < sim.bodies.length; i++) for (let j = i + 1; j < sim.bodies.length; j++) {
      const a = sim.bodies[i], b = sim.bodies[j];
      const gapX = Math.abs(a.x - b.x) - (a.w + b.w) / 2, gapY = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
      expect(Math.max(gapX, gapY), `${a.key} / ${b.key}`).toBeGreaterThan(-H / 2);
    }
  });
});
