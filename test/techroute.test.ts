import { describe, expect, it } from 'vitest';
import { GEOM, geometry, routeEdges, type Geometry, type Pt } from '../shared/techroute';
import { ITEM_EDGES, TREE, VISIBLE_EDGES, mapLayout, pathSet } from '../shared/techtree';

/** does the open segment a-b pass through the inside of any box? (touching a card's edge at its own port is fine) */
function crosses(g: Geometry, a: Pt, b: Pt, allow: string[]) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return g.boxes.filter((box) => !allow.includes(box.id) || true).filter((box) => x1 > box.x && x0 < box.x + box.w && y1 > box.y && y0 < box.y + box.h).map((box) => box.id);
}

function check(layoutOnly: ReadonlySet<string> | undefined, edges: { from: string; to: string }[]) {
  const g = geometry(mapLayout(layoutOnly));
  const wires = routeEdges(g, edges);
  expect(wires.size, 'every edge is routed').toBe(edges.length);
  const box = new Map(g.boxes.map((b) => [b.id, b]));
  for (const e of edges) {
    const pts = wires.get(e.from + '>' + e.to)!;
    const from = box.get(e.from)!, to = box.get(e.to)!;
    expect(pts[0].x, 'starts at the right side of the source').toBe(from.x + from.w);
    expect(pts[0].y).toBeGreaterThan(from.y); expect(pts[0].y).toBeLessThan(from.y + from.h);
    expect(pts[pts.length - 1].x, 'ends at the left side of the target').toBe(to.x);
    expect(pts[pts.length - 1].y).toBeGreaterThan(to.y); expect(pts[pts.length - 1].y).toBeLessThan(to.y + to.h);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      expect(a.x === b.x || a.y === b.y, `${e.from}>${e.to} segment ${i} is horizontal or vertical`).toBe(true);
      expect(crosses(g, a, b, []), `${e.from}>${e.to} segment ${i} runs through a card`).toEqual([]);
    }
  }
  return wires;
}

describe('tech tree wiring', () => {
  it('puts every card on the grid', () => {
    const g = geometry(mapLayout());
    for (const b of g.boxes) { expect(b.x % GEOM.cell).toBe(0); expect(b.y % GEOM.cell).toBe(0); expect(b.w % GEOM.cell).toBe(0); expect(b.h % GEOM.cell).toBe(0); }
    expect(g.boxes.length).toBe(TREE.length);
  });

  it('routes every connection of the whole map with straight horizontal and vertical lines that never touch a card', () => {
    const t = Date.now();
    check(undefined, VISIBLE_EDGES);
    expect(Date.now() - t).toBeLessThan(5000);
  });

  it('does the same for the path to any goal', () => {
    for (const goal of ['deathstar', 'fusionReactor', 'plasmaTurret', 'jumpGate', 'astrophysics']) {
      const only = pathSet(goal);
      check(only, ITEM_EDGES.filter((e) => only.has(e.from) && only.has(e.to)));
    }
  });

  it('merges wires that leave the same card, instead of laying a separate one for each', () => {
    const wires = check(undefined, VISIBLE_EDGES);
    const fromShipyard = VISIBLE_EDGES.filter((e) => e.from === 'shipyard').map((e) => wires.get(e.from + '>' + e.to)!);
    expect(fromShipyard.length).toBeGreaterThan(10);
    const verticals = new Set<number>();
    for (const w of fromShipyard) for (let i = 1; i < w.length; i++) if (w[i].x === w[i - 1].x && w[i].y !== w[i - 1].y) verticals.add(w[i].x);
    expect(verticals.size).toBeLessThan(fromShipyard.length);                  // fewer vertical lanes than wires: they share trunks
  });

  it('is deterministic', () => {
    const g = geometry(mapLayout());
    const a = routeEdges(g, VISIBLE_EDGES), b = routeEdges(g, VISIBLE_EDGES);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});
