/**
 * A small physics simulation for the tech tree: every node is a body, every arrow a spring that wants its target to sit to the right of its source,
 * and nodes push each other apart. Pure and deterministic, so it can be tested without a browser.
 */
export interface SimNode { key: string; /** where the tidy left-to-right layout would put it */ x: number; y: number; w: number; h: number }
export interface SimEdge { from: string; to: string; kind: 'level' | 'needs' }
export interface Body { key: string; x: number; y: number; vx: number; vy: number; w: number; h: number; homeX: number; homeY: number; pinned: boolean }

export const PHYSICS = {
  /** the horizontal distance an arrow wants between the left edges of its two nodes */
  restLevel: 128, restNeeds: 176,
  /** spring strength along and across an arrow */
  kxLevel: 0.08, kyLevel: 0.14, kxNeeds: 0.03, kyNeeds: 0.012,
  /** short-range push when boxes overlap, and a soft long-range push so clusters spread out */
  overlap: 0.35, gapX: 10, gapY: 6, repel: 900, repelRange: 220,
  /** a faint pull toward where the tidy layout would put a node, so the picture never drifts away */
  home: 0.02,
  damping: 0.82, maxSpeed: 14,
  alphaDecay: 0.985, alphaMin: 0.015,
};

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
      // arrows: pull the target to the right of the source and level with it
      for (const l of links) {
        const level = l.kind === 'level';
        const rest = level ? P.restLevel : P.restNeeds;
        const ex = l.b.x - l.a.x - rest, ey = l.b.y - l.a.y;
        // a 'needs' arrow may be longer than its rest length (it costs little) but never shorter
        const fx = (level ? P.kxLevel : ex < 0 ? P.kxNeeds * 2 : P.kxNeeds * 0.25) * ex * a;
        const fy = (level ? P.kyLevel : P.kyNeeds) * ey * a;
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
            const d2 = dx * dx + dy * dy + 40;
            const f = (P.repel / d2) * a;
            const d = Math.sqrt(d2);
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
export function settle(sim: Sim, maxSteps = 400) {
  for (let i = 0; i < maxSteps && !sim.settled(); i++) sim.step();
}
