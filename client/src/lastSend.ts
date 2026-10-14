import type { Mission, ShipId } from '../../shared/types';

/** The last fleet you dispatched, kept in this browser so the Fleet page can offer to prepare the same one again. */
export interface LastSend {
  ships: Partial<Record<ShipId, number>>;
  to: { g: number; s: number; p: number };
  mission: Mission;
  speedPct: number;
  cargo: { metal: number; crystal: number; deuterium: number };
  holdHours: number;
  toMoon: boolean;
}
const KEY = 'zg.lastSend';

export function saveLastSend(s: LastSend) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }

export function loadLastSend(): LastSend | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as LastSend | null;
    if (!v || typeof v.mission !== 'string' || !v.ships || !v.to || ![v.to.g, v.to.s, v.to.p].every(Number.isFinite)) return null;
    return Object.values(v.ships).some((n) => (n ?? 0) > 0) ? v : null;
  } catch { return null; }
}

/** what the stored dispatch would prepare from this planet: only ships that are there, and nothing if none are */
export function repeatable(s: LastSend, here: Record<string, number | undefined>): LastSend | null {
  const ships: Partial<Record<ShipId, number>> = {};
  for (const [id, n] of Object.entries(s.ships)) { const k = Math.min(n ?? 0, here[id] ?? 0); if (k > 0) ships[id as ShipId] = k; }
  return Object.keys(ships).length ? { ...s, ships } : null;
}
