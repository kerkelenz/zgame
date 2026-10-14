import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * How much the interface moves, chosen per device: full (entrances, slow drifts, glows, flights), reduced (short fades only) or off.
 * It starts from the device's own reduced-motion setting. The page carries the choice as `data-motion` on <html>, and the styles key on it.
 */
export type Motion = 'full' | 'reduced' | 'off';
const KEY = 'zg.motion';
export const isMotion = (v: unknown): v is Motion => v === 'full' || v === 'reduced' || v === 'off';
const prefersReduced = () => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

let current: Motion = (() => {
  try { const v = localStorage.getItem(KEY); if (isMotion(v)) return v; } catch { /* no storage */ }
  return prefersReduced() ? 'reduced' : 'full';
})();
const subs = new Set<() => void>();
const apply = () => { if (typeof document !== 'undefined') document.documentElement.dataset.motion = current; };
apply();

export const getMotion = (): Motion => current;
export function setMotion(m: Motion): void {
  current = m;
  try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  apply();
  subs.forEach((f) => f());
}
export const useMotion = (): Motion => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current);

export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** a number that glides to its new value instead of jumping (not at all when motion is off) */
export function useCountUp(value: number, ms = 700): number {
  const motion = useMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (motion !== 'full' || from.current === value) { from.current = value; setShown(value); return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = easeOut((t - start) / ms);
      setShown(Math.round(a + (value - a) * k));
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value, ms, motion]);
  return shown;
}

export interface FlightLike { phase: string; departAt: number; arriveAt: number; returnAt?: number; flightMs?: number }
/** where a fleet is on its way, 0 at its own planet and 1 at the target, and which way it is going */
export function flightProgress(m: FlightLike, now: number): { frac: number; dir: 'out' | 'back' | 'hold' } {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  if (m.phase === 'holding') return { frac: 1, dir: 'hold' };
  if (m.phase === 'returning') {
    const span = m.flightMs ?? Math.max(1, (m.returnAt ?? now) - m.arriveAt);
    const start = (m.returnAt ?? now) - span;
    return { frac: 1 - clamp((now - start) / Math.max(1, span)), dir: 'back' };
  }
  return { frac: clamp((now - m.departAt) / Math.max(1, m.arriveAt - m.departAt)), dir: 'out' };
}

/** how often and how long the other body of a planet and its moon crosses the banner */
export const FLYBY = { periodMs: 66_000, delayMs: 4_000, crossMs: 22_000 };
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
/**
 * Where the flying body is `elapsedMs` after the banner appeared, or null while it is away. It goes round half a circle seen from the side at a
 * steady pace: across the banner from left to right (x and y as shares of the banner), bigger and a little higher at the near point in the middle,
 * fading in and out beyond the edges.
 */
export function flybyPose(elapsedMs: number): { x: number; y: number; scale: number; opacity: number } | null {
  const since = elapsedMs - FLYBY.delayMs;
  if (since < 0) return null;
  const u = (since % FLYBY.periodMs) / FLYBY.crossMs;
  if (u >= 1) return null;
  const theta = Math.PI + u * Math.PI;                       // from the far left round the near side to the far right
  const near = -Math.sin(theta);                             // 0 at both ends, 1 in the middle
  return {
    x: 0.5 + 0.64 * Math.cos(theta),
    y: 0.64 - 0.2 * near,
    scale: 0.6 + 0.8 * near,
    opacity: smooth(u / 0.1) * smooth((1 - u) / 0.1),
  };
}
