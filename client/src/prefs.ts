/** Small per-browser preferences. */
const PROBES_KEY = 'zg.probes';
export const DEFAULT_PROBES = 1;

/** how many Espionage Probes the Fleet page prepares when you press Spy in the galaxy (0 = prepare none) */
export function getProbes(): number {
  try { const v = localStorage.getItem(PROBES_KEY); if (v !== null) { const n = Math.floor(Number(v)); if (Number.isFinite(n) && n >= 0 && n <= 1000) return n; } } catch { /* ignore */ }
  return DEFAULT_PROBES;
}
export function setProbes(n: number) {
  try { localStorage.setItem(PROBES_KEY, String(Math.max(0, Math.min(1000, Math.floor(n))))); } catch { /* ignore */ }
}
