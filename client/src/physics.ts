/**
 * The tech tree layout. The space is divided into columns and every node sits in exactly one of them, so a node can only be moved up and down
 * inside its column. Every arrow runs from a column to a later one, so progress always reads left to right. Physics decides the vertical order
 * and spacing: arrows are springs that pull a node level with what it connects to (short, even arrows), and nodes in a column push each other
 * apart. Pure and deterministic, so it can be tested without a browser.
 */
export interface SimNode { key: string; /** column index, 0 on the left */ column: number; /** left edge of the column's node */ x: number; /** where the tidy layout would put it vertically */ y: number; w: number; h: number }
export interface SimEdge { from: string; to: string; kind: 'level' | 'needs' }
export interface Body { key: string; column: number; /** fixed: a node never leaves its column */ x: number; y: number; vy: number; w: number; h: number; homeY: number; pinned: boolean }

export const PHYSICS = {
  /** spring strength pulling the two ends of an arrow level with each other: chains of levels stay straight, other arrows pull more gently */
  kLevel: 0.22, kNeeds: 0.07,
  /** nodes in a column push each other apart: boxes that touch are separated hard, and a soft push within this range spreads clusters out */
  repel: 900, repelRange: 140,
  overlap: 0.45, gap: 8,
  /** a faint pull toward the tidy layout's height, so unconnected nodes do not wander and the picture stays in view */
  home: 0.004,
  damping: 0.78, maxSpeed: 14,
  alphaDecay: 0.988, alphaMin: 0.012,
};

/** length of an arrow from the right edge of its source to the left edge of its target */
export const edgeLength = (a: Body, b: Body) => Math.hypot(b.x - (a.x + a.w), b.y + b.h / 2 - (a.y + a.h / 2));

export interface Sim {
  bodies: Body[];
  byKey: Map<string, Body>;
  /** 1 while hot, falls toward 0 as the picture settles; the loop stops below alphaMin */
  alpha: number;
  step(): void;
  /** make the picture move again (after a drag) */
  reheat(a?: number): void;
  settled(): boolean;
}

/** how long and how even the arrows are: the quantities the layout tries to keep small */
export function edgeStats(sim: Sim, edges: SimEdge[]) {
  const lens = edges.map((e) => edgeLength(sim.byKey.get(e.from)!, sim.byKey.get(e.to)!));
  const mean = lens.reduce((s, x) => s + x, 0) / Math.max(1, lens.length);
  const sd = Math.sqrt(lens.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, lens.length));
  // columns fix the horizontal distance, so what physics can improve is how far arrows climb or drop
  const rises = edges.map((e) => Math.abs((sim.byKey.get(e.to)!.y + sim.byKey.get(e.to)!.h / 2) - (sim.byKey.get(e.from)!.y + sim.byKey.get(e.from)!.h / 2)));
  return { mean, sd, max: Math.max(0, ...lens), total: lens.reduce((s, x) => s + x, 0), rise: rises.reduce((s, x) => s + x, 0), maxRise: Math.max(0, ...rises) };
}

/** small deterministic jitter so a perfectly regular start does not stay frozen */
const rand = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; };

export function createSim(nodes: SimNode[], edges: SimEdge[], seed = 7): Sim {
  const r = rand(seed);
  const bodies: Body[] = nodes.map((n) => ({ key: n.key, column: n.column, x: n.x, y: n.y + (r() - 0.5) * 4, vy: 0, w: n.w, h: n.h, homeY: n.y, pinned: false }));
  const byKey = new Map(bodies.map((b) => [b.key, b]));
  const links = edges.map((e) => ({ a: byKey.get(e.from)!, b: byKey.get(e.to)!, kind: e.kind }));
  const columns = new Map<number, Body[]>();
  for (const b of bodies) (columns.get(b.column) ?? columns.set(b.column, []).get(b.column)!).push(b);
  const P = PHYSICS;
  const sim: Sim = {
    bodies, byKey, alpha: 1,
    reheat(a = 0.6) { sim.alpha = Math.max(sim.alpha, a); },
    settled() { return sim.alpha < P.alphaMin; },
    step() {
      const a = sim.alpha;
      // arrows pull both ends level with each other
      for (const l of links) {
        const dy = (l.b.y + l.b.h / 2) - (l.a.y + l.a.h / 2);
        const f = (l.kind === 'level' ? P.kLevel : P.kNeeds) * dy * a;
        l.b.vy -= f; l.a.vy += f;
      }
      // nodes in one column push each other apart
      for (const col of columns.values()) {
        for (let i = 0; i < col.length; i++) {
          const p = col[i];
          for (let j = i + 1; j < col.length; j++) {
            const q = col[j];
            const dy = (q.y + q.h / 2) - (p.y + p.h / 2);
            const ad = Math.abs(dy);
            const touch = (p.h + q.h) / 2 + P.gap;
            let f = 0;
            if (ad < touch) f = Math.sign(dy || (i % 2 ? 1 : -1)) * (touch - ad) * P.overlap;
            else if (ad < P.repelRange) f = Math.sign(dy) * (P.repel / (ad * ad)) * a;
            q.vy += f; p.vy -= f;
          }
        }
      }
      for (const b of bodies) {
        if (b.pinned) { b.vy = 0; continue; }
        b.vy += (b.homeY - b.y) * P.home * a;
        b.vy = Math.max(-P.maxSpeed, Math.min(P.maxSpeed, b.vy * P.damping));
        b.y += b.vy;
      }
      sim.alpha *= P.alphaDecay;
    },
  };
  return sim;
}

/** run the simulation until it settles (used to open the page already relaxed) */
export function settle(sim: Sim, maxSteps = 700) {
  for (let i = 0; i < maxSteps && !sim.settled(); i++) sim.step();
}
