import { describe, expect, it } from 'vitest';
import { VIEW, bodyPoint, layoutBodies, bodySize, crumbs, depth, lerp, orbitAngle, orbitRadius, parentOf, shortNum, spiralPoint } from '../client/src/map/geometry';

describe('the map geometry', () => {
  it('puts every system on a spiral inside the picture, apart from each other', () => {
    const pts = Array.from({ length: 200 }, (_, i) => spiralPoint(i, 200));
    for (const p of pts) { expect(p.x).toBeGreaterThan(0); expect(p.x).toBeLessThan(VIEW.w); expect(p.y).toBeGreaterThan(0); expect(p.y).toBeLessThan(VIEW.h); }
    let closest = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) closest = Math.min(closest, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    expect(closest).toBeGreaterThan(5);
  });
  it('orbits grow outwards, and a position always has the same angle', () => {
    for (let p = 2; p <= 15; p++) expect(orbitRadius(p, 15)).toBeGreaterThan(orbitRadius(p - 1, 15));
    expect(orbitAngle(1, 5, 6)).toBe(orbitAngle(1, 5, 6));
    expect(orbitAngle(1, 5, 6)).not.toBe(orbitAngle(1, 5, 7));
    const a = bodyPoint(2, 9, 4, 15), b = bodyPoint(2, 9, 4, 15);
    expect(a).toEqual(b);
    expect(a.x).toBeGreaterThan(0); expect(a.x).toBeLessThan(VIEW.w);
  });
  it('scales a planet by its size, within limits', () => {
    expect(bodySize(4000)).toBe(22);
    expect(bodySize(16000)).toBe(46);
    expect(bodySize(null)).toBeGreaterThan(22);
    expect(bodySize(100000)).toBe(46);
    expect(bodySize(12800)).toBeGreaterThan(bodySize(8000));
  });
  it('writes numbers short and finds the point along a line', () => {
    expect(shortNum(950)).toBe('950');
    expect(shortNum(12_400)).toBe('12.4k');
    expect(shortNum(3_400_000)).toBe('3.4M');
    expect(lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 });
  });
  it('knows the way up and the trail of a view', () => {
    expect(parentOf({ level: 'planet', g: 2, s: 7, planetId: 'x' })).toEqual({ level: 'system', g: 2, s: 7 });
    expect(parentOf({ level: 'system', g: 2, s: 7 })).toEqual({ level: 'galaxy', g: 2 });
    expect(parentOf({ level: 'galaxy', g: 2 })).toEqual({ level: 'universe' });
    expect(parentOf({ level: 'universe' })).toBeNull();
    expect(depth('planet')).toBeGreaterThan(depth('system'));
    expect(crumbs({ level: 'planet', g: 2, s: 7, planetId: 'x', planetName: 'Ryza' }).map((c) => c.label)).toEqual(['Universe', 'Galaxy 2', 'System 2:7', 'Ryza']);
    expect(crumbs({ level: 'universe' }).map((c) => c.label)).toEqual(['Universe']);
  });

  it('spreads a crowded system so every body has room for its label', () => {
    const ps = Array.from({ length: 15 }, (_, k) => k + 1);
    for (let sys = 1; sys <= 60; sys++) {
      const m = layoutBodies(1, sys, ps, 15);
      for (let a = 1; a <= 15; a++) for (let b = a + 1; b <= 15; b++) { const A = m.get(a)!, B = m.get(b)!; expect(Math.hypot(A.x - B.x, A.y - B.y), `system ${sys} ${a}/${b}`).toBeGreaterThan(60); }
    }
    expect(layoutBodies(1, 4, ps, 15)).toEqual(layoutBodies(1, 4, ps, 15));
  });

  it('never draws two bodies of one system on top of each other', () => {
    for (let sys = 1; sys <= 60; sys++) {
      const pts = Array.from({ length: 15 }, (_, k) => bodyPoint(1, sys, k + 1, 15));
      for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) expect(Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y), `system ${sys} ${a + 1}/${b + 1}`).toBeGreaterThan(40);
    }
  });
});
