import type { MapLayout } from './techtree';

/**
 * Wiring for the tech tree map. Cards sit on a grid and every connection is a polyline of horizontal and vertical segments that runs only
 * through the free lanes between cards: it never crosses a card, so it is never on top of or behind one. Pure, so it can be tested.
 */
export const GEOM = { cell: 8, cardW: 168, cardH: 48, colGap: 96, rowGap: 24, bandGap: 40, bandLabel: 24, pad: 24 };

export interface Pt { x: number; y: number }
export interface Box { id: string; x: number; y: number; w: number; h: number }
export interface Geometry { pos: Map<string, Pt>; boxes: Box[]; bandTop: number[]; width: number; height: number }

/** pixel positions for a map layout: every coordinate is a multiple of the grid cell */
export function geometry(m: MapLayout): Geometry {
  const G = GEOM;
  const bandTop: number[] = [];
  let y = G.pad;
  m.bands.forEach((b, i) => { bandTop[i] = y + G.bandLabel; y += G.bandLabel + b.slots * (G.cardH + G.rowGap) + G.bandGap; });
  const pos = new Map<string, Pt>();
  const boxes: Box[] = [];
  for (const c of m.cells) {
    const p = { x: G.pad + c.col * (G.cardW + G.colGap), y: bandTop[c.band] + c.slot * (G.cardH + G.rowGap) };
    pos.set(c.id, p);
    boxes.push({ id: c.id, x: p.x, y: p.y, w: G.cardW, h: G.cardH });
  }
  return { pos, boxes, bandTop, width: G.pad * 2 + Math.max(1, m.cols) * (G.cardW + G.colGap) - G.colGap, height: y };
}

class Heap {
  private f: number[] = [];
  private s: number[] = [];
  get size() { return this.f.length; }
  push(f: number, s: number) {
    let i = this.f.length;
    this.f.push(f); this.s.push(s);
    while (i > 0) { const p = (i - 1) >> 1; if (this.f[p] <= this.f[i]) break; this.swap(i, p); i = p; }
  }
  pop(): number {
    const top = this.s[0];
    const lf = this.f.pop()!, ls = this.s.pop()!;
    if (this.f.length) {
      this.f[0] = lf; this.s[0] = ls;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.f.length && this.f[l] < this.f[m]) m = l;
        if (r < this.f.length && this.f[r] < this.f[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) { [this.f[a], this.f[b]] = [this.f[b], this.f[a]]; [this.s[a], this.s[b]] = [this.s[b], this.s[a]]; }
}

const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];            // right, down, left, up

/**
 * Route every edge from the right side of its source card to the left side of its target card. Wires go around cards, prefer few turns and
 * short ways, keep apart from each other, and merge into a shared trunk when they leave the same card or enter the same one.
 * Returns the polyline of each edge, keyed "from>to". Edges that cannot be routed are missing from the result (the tests make sure none are).
 */
export function routeEdges(g: Geometry, edges: { from: string; to: string }[]): Map<string, Pt[]> {
  const C = GEOM.cell;
  const W = Math.ceil(g.width / C), H = Math.ceil(g.height / C);
  const blocked = new Uint8Array(W * H);
  for (const b of g.boxes) for (let cy = b.y / C; cy < (b.y + b.h) / C; cy++) for (let cx = b.x / C; cx < (b.x + b.w) / C; cx++) blocked[cy * W + cx] = 1;
  const boxOf = new Map(g.boxes.map((b) => [b.id, b]));

  // spread the wires along a card's side: edges leaving a card take different rows, ordered by where they are going, so they do not cross at the card
  const rowsPerCard = GEOM.cardH / C;
  const outRow = new Map<string, number>(), inRow = new Map<string, number>();
  const assign = (key: (e: { from: string; to: string }) => string, other: (e: { from: string; to: string }) => string, into: Map<string, number>) => {
    const groups = new Map<string, { from: string; to: string }[]>();
    for (const e of edges) (groups.get(key(e)) ?? groups.set(key(e), []).get(key(e))!).push(e);
    for (const list of groups.values()) {
      list.sort((a, b) => boxOf.get(other(a))!.y - boxOf.get(other(b))!.y);
      list.forEach((e, i) => into.set(e.from + '>' + e.to, Math.min(rowsPerCard - 1, Math.floor(((i + 0.5) * rowsPerCard) / list.length))));
    }
  };
  assign((e) => e.from, (e) => e.to, outRow);
  assign((e) => e.to, (e) => e.from, inRow);

  const usedH = new Int32Array(W * H), usedV = new Int32Array(W * H);          // which source owns a wire in each cell, by axis
  const tgtH = new Int32Array(W * H), tgtV = new Int32Array(W * H);            // and which target
  const srcIds = new Map<string, number>(), dstIds = new Map<string, number>();
  for (const e of edges) { if (!srcIds.has(e.from)) srcIds.set(e.from, srcIds.size + 1); if (!dstIds.has(e.to)) dstIds.set(e.to, dstIds.size + 1); }

  const N = W * H * 4;
  const gScore = new Float32Array(N), seen = new Int32Array(N), parent = new Int32Array(N);
  let stamp = 0;
  const out = new Map<string, Pt[]>();

  const ports = (e: { from: string; to: string }) => {
    const a = boxOf.get(e.from)!, b = boxOf.get(e.to)!, k = e.from + '>' + e.to;
    return { sx: (a.x + a.w) / C, sy: a.y / C + outRow.get(k)!, tx: b.x / C - 1, ty: b.y / C + inRow.get(k)! };
  };
  const order = [...edges].sort((p, q) => {
    const a = ports(p), b = ports(q);
    return Math.abs(a.tx - a.sx) + Math.abs(a.ty - a.sy) - (Math.abs(b.tx - b.sx) + Math.abs(b.ty - b.sy));
  });

  for (const e of order) {
    const k = e.from + '>' + e.to;
    const { sx, sy, tx, ty } = ports(e);
    const src = srcIds.get(e.from)!, dst = dstIds.get(e.to)!;
    const start = sy * W + sx, goal = ty * W + tx;
    const heap = new Heap();
    stamp++;
    const s0 = start * 4;
    gScore[s0] = 0; seen[s0] = stamp; parent[s0] = -1;
    heap.push(Math.abs(tx - sx) + Math.abs(ty - sy), s0);
    let found = -1;
    while (heap.size) {
      const s = heap.pop();
      const cell = s >> 2, d = s & 3;
      if (cell === goal) { found = s; break; }
      const cx = cell % W, cy = (cell - cx) / W;
      const gs = gScore[s];
      for (let nd = 0; nd < 4; nd++) {
        if (nd === ((d + 2) & 3)) continue;
        const nx = cx + DX[nd], ny = cy + DY[nd];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nc = ny * W + nx;
        if (blocked[nc]) continue;
        let cost = 1 + (nd !== d ? 2 : 0);
        const horiz = nd === 0 || nd === 2;
        const own = horiz ? usedH[nc] : usedV[nc], ownT = horiz ? tgtH[nc] : tgtV[nc];
        if (own || ownT) cost += own === src || ownT === dst ? 0.2 : 9;           // share a trunk with wires of the same card, avoid overlapping others
        const cross = horiz ? usedV[nc] : usedH[nc];
        if (cross && cross !== src && (horiz ? tgtV[nc] : tgtH[nc]) !== dst) cost += 1.5;
        const ns = nc * 4 + nd, ng = gs + cost;
        if (seen[ns] !== stamp || ng < gScore[ns]) {
          seen[ns] = stamp; gScore[ns] = ng; parent[ns] = s;
          heap.push(ng + Math.abs(tx - nx) + Math.abs(ty - ny), ns);
        }
      }
    }
    if (found < 0) continue;
    // walk back to the start, marking the lanes this wire now uses
    const cells: number[] = [];
    const dirs: number[] = [];
    for (let s = found; s >= 0; s = parent[s]) { cells.push(s >> 2); dirs.push(s & 3); }
    cells.reverse(); dirs.reverse();
    for (let i = 1; i < cells.length; i++) {
      const horiz = dirs[i] === 0 || dirs[i] === 2;
      for (const c of [cells[i - 1], cells[i]]) {
        if (horiz) { usedH[c] = src; tgtH[c] = dst; } else { usedV[c] = src; tgtV[c] = dst; }
      }
    }
    // polyline: from the card edge, through the cell centres, to the other card edge; collinear points dropped
    const a = boxOf.get(e.from)!, b = boxOf.get(e.to)!;
    const centre = (c: number): Pt => ({ x: (c % W) * C + C / 2, y: Math.floor(c / W) * C + C / 2 });
    const pts: Pt[] = [{ x: a.x + a.w, y: centre(cells[0]).y }, ...cells.map(centre), { x: b.x, y: centre(cells[cells.length - 1]).y }];
    const clean: Pt[] = [];
    for (const p of pts) {
      const n = clean.length;
      if (n && clean[n - 1].x === p.x && clean[n - 1].y === p.y) continue;
      if (n >= 2 && ((clean[n - 2].x === clean[n - 1].x && clean[n - 1].x === p.x) || (clean[n - 2].y === clean[n - 1].y && clean[n - 1].y === p.y))) clean[n - 1] = p;
      else clean.push(p);
    }
    out.set(k, clean);
  }
  return out;
}
