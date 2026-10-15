/** Where things go on the Map: pure arithmetic, so it can be tested without a browser. */
export const VIEW = { w: 1000, h: 560 };
export type Pt = { x: number; y: number };

/** the i-th of n systems on a spiral (the golden angle spreads them evenly) inside the picture */
export function spiralPoint(i: number, n: number, w = VIEW.w, h = VIEW.h): Pt {
  const r = Math.sqrt((i + 0.5) / Math.max(1, n));
  const a = i * 2.399963;
  return { x: w / 2 + Math.cos(a) * r * (w / 2 - 54), y: h / 2 + Math.sin(a) * r * (h / 2 - 44) };
}

/** the orbit of a position round the star: the first is closest, the last farthest */
export const orbitRadius = (p: number, positions: number, min = 82, max = 262) => (positions <= 1 ? min : min + ((p - 1) * (max - min)) / (positions - 1));

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** a fixed angle for a position: the golden angle between neighbours keeps bodies of nearby orbits apart, a hash of the system turns the whole picture */
export const orbitAngle = (g: number, s: number, p: number) => ((hash(`${g}:${s}`) / 4294967296) * Math.PI * 2 + p * 2.399963) % (Math.PI * 2);

/** where a body sits: on its orbit at its angle, the orbits drawn a little flattened to look like a view from above at an angle */
export function bodyPoint(g: number, s: number, p: number, positions: number, cx = VIEW.w / 2, cy = VIEW.h / 2, squash = 0.8): Pt {
  const r = orbitRadius(p, positions), a = orbitAngle(g, s, p);
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * squash };
}

/**
 * Where every body of a system sits, with room for its name and numbers: each starts on its own orbit at its fixed angle, then any two closer than
 * `gap` are turned apart along their orbits (a few passes, always the same result). A crowded system spreads out instead of piling up.
 */
export function layoutBodies(g: number, s: number, ps: number[], positions: number, cx = VIEW.w / 2, cy = VIEW.h / 2, squash = 0.8, gap = 84): Map<number, Pt> {
  const ang = new Map(ps.map((p) => [p, orbitAngle(g, s, p)]));
  const at = (p: number): Pt => { const r = orbitRadius(p, positions), a = ang.get(p)!; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * squash }; };
  for (let pass = 0; pass < 120; pass++) {
    let moved = false;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = at(ps[i]), b = at(ps[j]), d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d >= gap) continue;
      moved = true;
      // turn the inner one back and the outer one on, by an angle that grows with how much room is missing (smaller on outer orbits, which are longer)
      const step = (gap - d) / 2 / Math.max(40, orbitRadius(ps[i], positions)) + 0.004, stepJ = (gap - d) / 2 / Math.max(40, orbitRadius(ps[j], positions)) + 0.004;
      const dir = Math.sin((ang.get(ps[j])! - ang.get(ps[i])!)) >= 0 ? 1 : -1;
      ang.set(ps[i], ang.get(ps[i])! - dir * step); ang.set(ps[j], ang.get(ps[j])! + dir * stepJ);
    }
    if (!moved) break;
  }
  return new Map(ps.map((p) => [p, at(p)]));
}

/** the drawn size of a planet from its diameter in km (22 to 46 px) */
export const bodySize = (diameter: number | null | undefined) => Math.round(22 + Math.min(1, Math.max(0, ((diameter ?? 9000) - 4000) / 12000)) * 24);

export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export const shortNum = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k` : String(Math.round(n)));

export type Level = 'universe' | 'galaxy' | 'system' | 'planet';
export const LEVELS: Level[] = ['universe', 'galaxy', 'system', 'planet'];
export interface MapAt { level: Level; g?: number; s?: number; planetId?: string; planetName?: string }
/** how deep a view is, so the picture can zoom in or out when it changes */
export const depth = (l: Level) => LEVELS.indexOf(l);

/** the way back up: from a planet to its system, from a system to its galaxy, from a galaxy to the universe */
export function parentOf(at: MapAt): MapAt | null {
  if (at.level === 'planet') return { level: 'system', g: at.g, s: at.s };
  if (at.level === 'system') return { level: 'galaxy', g: at.g };
  if (at.level === 'galaxy') return { level: 'universe' };
  return null;
}
export function crumbs(at: MapAt): { label: string; to: MapAt }[] {
  const out: { label: string; to: MapAt }[] = [{ label: 'Universe', to: { level: 'universe' } }];
  if (at.g !== undefined && at.level !== 'universe') out.push({ label: `Galaxy ${at.g}`, to: { level: 'galaxy', g: at.g } });
  if (at.s !== undefined && (at.level === 'system' || at.level === 'planet')) out.push({ label: `System ${at.g}:${at.s}`, to: { level: 'system', g: at.g, s: at.s } });
  if (at.level === 'planet') out.push({ label: at.planetName ?? 'Planet', to: at });
  return out;
}
