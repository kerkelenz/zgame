/**
 * Where a fleet is on its journey, worked out from the times the server sends. Pure, so it can be tested; the picture is in ExpeditionMap.tsx.
 * A journey is out (home to the target), exploring (waiting there: an expedition looks around, a hold fleet stands guard) and back.
 */
export interface Flight {
  id: string;
  mission: string;
  phase: 'outbound' | 'holding' | 'returning';
  departAt?: number;
  arriveAt: number;
  holdUntil?: number;
  returnAt?: number;
  flightMs: number;
  /** how long an expedition was told to stay out (hours); the real stay can be shorter */
  holdHours?: number;
}
export type Stage = 'out' | 'exploring' | 'back';

export interface Legs { out: [number, number]; stay: [number, number]; back: [number, number]; /** the stay is a plan (not yet known to be this long) */ stayPlanned: boolean }

export function legs(m: Flight): Legs {
  const outStart = m.departAt ?? m.arriveAt - m.flightMs;
  const planned = m.holdUntil === undefined;
  const stayEnd = m.holdUntil ?? m.arriveAt + (m.holdHours ?? 0) * 3_600_000;
  const backStart = m.returnAt !== undefined ? m.returnAt - m.flightMs : stayEnd;
  return { out: [outStart, m.arriveAt], stay: [m.arriveAt, Math.max(m.arriveAt, stayEnd)], back: [backStart, backStart + m.flightMs], stayPlanned: planned && m.phase === 'outbound' };
}

export interface FlightState {
  stage: Stage;
  /** how far from home the fleet is, 0 at home to 1 at the target */
  distance: number;
  /** how far through the current stage, 0 to 1 */
  stageProgress: number;
  /** time until the current stage ends, and until the fleet is home again (the stay of an outbound expedition counts at its planned length) */
  stageLeftMs: number;
  homeInMs: number;
  /** where the whole planned journey is, 0 to 1, for the timeline bar */
  journey: number;
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const frac = (a: number, b: number, t: number) => (b <= a ? 1 : clamp((t - a) / (b - a)));

export function flightState(m: Flight, now: number): FlightState {
  const l = legs(m);
  const stage: Stage = m.phase === 'outbound' ? 'out' : m.phase === 'holding' ? 'exploring' : 'back';
  const stageProgress = stage === 'out' ? frac(l.out[0], l.out[1], now) : stage === 'exploring' ? frac(l.stay[0], l.stay[1], now) : frac(l.back[0], l.back[1], now);
  const distance = stage === 'out' ? stageProgress : stage === 'exploring' ? 1 : 1 - stageProgress;
  const end = stage === 'out' ? l.out[1] : stage === 'exploring' ? l.stay[1] : l.back[1];
  const home = l.back[1];
  const start = l.out[0];
  return { stage, distance, stageProgress, stageLeftMs: Math.max(0, end - now), homeInMs: Math.max(0, home - now), journey: frac(start, home, now) };
}

/** the three parts of the timeline bar as shares of the whole journey (the middle one can be zero when the fleet does not stay) */
export function shares(m: Flight): { out: number; stay: number; back: number } {
  const l = legs(m);
  const out = l.out[1] - l.out[0], stay = l.stay[1] - l.stay[0], back = l.back[1] - l.back[0];
  const total = Math.max(1, out + stay + back);
  return { out: out / total, stay: stay / total, back: back / total };
}

/** the spokes of the chart: n expeditions spread round the circle, starting at the top */
export function angles(n: number): number[] {
  return Array.from({ length: n }, (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n));
}

export function polar(cx: number, cy: number, r: number, a: number): { x: number; y: number } {
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}

export const stageLabel: Record<Stage, string> = { out: 'Flying out', exploring: 'Exploring', back: 'Coming home' };
