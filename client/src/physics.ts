/**
 * A small physics simulation for the tech tree: every node is a body, every arrow a spring that wants its target to sit to the right of its source,
 * and nodes push each other apart. Pure and deterministic, so it can be tested without a browser.
 */
export interface SimNode { key: string; /** where the tidy left-to-right layout would put it */ x: number; y: number; w: number; h: number }
export interface SimEdge { from: string; to: string; kind: 'level' | 'needs' }
export interface Body { key: string; x: number; y: number; vx: number; vy: number; w: number; h: number; homeX: number; homeY: number; pinned: boolean }

export const PHYSICS = {
  /** the length an arrow wants (end of the source node to start of the target), by kind: short and even is the goal */
  restLevel: 14, restNeeds: 60,
  /** spring strength along an arrow (it pulls both ends toward the rest length) */
  kLevel: 0.16, kNeeds: 0.12,
  /** an arrow never runs backwards: when the target is less than this far to the right of the source it is pushed right */
  minForward: 8, kForward: 0.25,
  /** every node pushes every other away, falling off with distance, within this range; boxes that touch are separated hard */
  repel: 2600, repelRange: 420,
  overlap: 0.4, gapX: 12, gapY: 8,
  /** a faint pull toward where the tidy layout would put a node, so the picture keeps its overall order and never drifts away */
  home: 0.0005,
  damping: 0.8, maxSpeed: 16,
  alphaDecay: 0.988, alphaMin: 0.012,
};

/** length of an arrow from the right edge of its source to the left edge of its target */
export const edgeLength = (a: Body, b: Body) => Math.hypot(b.x - (a.x + a.w), b.y + b.h / 2 - (a.y + a.h / 2));

/** how long and how even the arrows are: the quantities the layout tries to keep small */
export function edgeStats(sim: Sim, edges: SimEdge[]) {
  const lens = edges.map((e) => edgeLength(sim.byKey.get(e.from)!, sim.byKey.get(e.to)!));
  const mean = lens.reduce((s, x) => s + x, 0) / Math.max(1, lens.length);
  const sd = Math.sqrt(lens.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, lens.length));
  return { mean, sd, max: Math.max(0, ...lens), total: lens.reduce((s, x) => s + x, 0) };
}

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

/** small deterministic jitter so a perfectly regular start does not stay frozen */
const rand = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; };

export function createSim(nodes: SimNode[], edges: SimEdge[], seed = 7): Sim {
  const r = rand(seed);
  const bodies: Body[] = nodes.map((n) => ({ key: n.key, x: n.x + (r() - 0.5) * 6, y: n.y + (r() - 0.5) * 6, vx: 0, vy: 0, w: n.w, h: n.h, homeX: n.x, homeY: n.y, pinned: false }));
  const byKey = new Map(bodies.map((b) => [b.key, b]));
  const links = edges.map((e) => ({ a: byKey.get(e.from)!, b: byKey.get(e.to)!, kind: e.kind }));
  const P = PHYSICS;
  const sim: Sim = {
    bodies, byKey, alpha: 1,
    reheat(a = 0.6) { sim.alpha = Math.max(sim.alpha, a); },
    settled() { return sim.alpha < P.alphaMin; },
    step() {
      const a = sim.alpha;
      // arrows: springs toward a short rest length, and never backwards
      for (const l of links) {
        const level = l.kind === 'level';
        const rest = level ? P.restLevel : P.restNeeds;
        const sx = l.a.x + l.a.w, sy = l.a.y + l.a.h / 2, tx = l.b.x, ty = l.b.y + l.b.h / 2;
        const dx = tx - sx, dy = ty - sy;
        const d = Math.hypot(dx, dy) || 1;
        const f = (level ? P.kLevel : P.kNeeds) * (d - rest) * a;
        let fx = (dx / d) * f, fy = (dy / d) * f;
        if (dx < P.minForward) fx += (dx - P.minForward) * P.kForward * a;
        l.b.vx -= fx; l.b.vy -= fy; l.a.vx += fx; l.a.vy += fy;
      }
      // nodes push each other apart: hard when boxes touch, softly at a distance
      for (let i = 0; i < bodies.length; i++) {
        const p = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
          const q = bodies[j];
          const dx = q.x - p.x, dy = q.y - p.y;
          if (Math.abs(dx) > P.repelRange || Math.abs(dy) > P.repelRange) continue;
          const ox = (p.w + q.w) / 2 + P.gapX - Math.abs(dx), oy = (p.h + q.h) / 2 + P.gapY - Math.abs(dy);
          let fx = 0, fy = 0;
          if (ox > 0 && oy > 0) {
            // overlapping: separate along the axis that needs the smaller move (boxes are wide, so mostly up and down)
            if (oy < ox) fy = Math.sign(dy || (i % 2 ? 1 : -1)) * oy * P.overlap * 0.5; else fx = Math.sign(dx || 1) * ox * P.overlap * 0.5;
          } else {
            const d = Math.sqrt(dx * dx + dy * dy) + 8;
            const f = (P.repel / d / d) * a * Math.max(0, 1 - d / (P.repelRange * 1.5));
            fx = (dx / d) * f; fy = (dy / d) * f;
          }
          q.vx += fx; q.vy += fy; p.vx -= fx; p.vy -= fy;
        }
      }
      for (const b of bodies) {
        if (b.pinned) { b.vx = 0; b.vy = 0; continue; }
        b.vx += (b.homeX - b.x) * P.home * a; b.vy += (b.homeY - b.y) * P.home * a;
        b.vx *= P.damping; b.vy *= P.damping;
        const v = Math.hypot(b.vx, b.vy);
        if (v > P.maxSpeed) { b.vx = (b.vx / v) * P.maxSpeed; b.vy = (b.vy / v) * P.maxSpeed; }
        b.x += b.vx; b.y += b.vy;
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
