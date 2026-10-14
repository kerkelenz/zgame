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
