/** The address bar as the single source of where the player is: `#/buildings`, `#/item/metalMine`, `#/player/<id>`, `#/galaxy/1/34`. Pure, so it can be tested. */
export interface Route { page: string; item?: string; player?: string; galaxy?: { g: number; s: number } }

export const DEFAULT_PAGE = 'overview';

export function encodeRoute(r: Route): string {
  if (r.page === 'detail' && r.item) return `#/item/${encodeURIComponent(r.item)}`;
  if (r.page === 'battle' && r.item) return `#/battle/${encodeURIComponent(r.item)}`;
  if (r.page === 'profile' && r.player) return `#/player/${encodeURIComponent(r.player)}`;
  if (r.page === 'galaxy' && r.galaxy) return `#/galaxy/${r.galaxy.g}/${r.galaxy.s}`;
  return `#/${r.page || DEFAULT_PAGE}`;
}

export function decodeRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const [head, a, b] = parts;
  if (!head) return { page: DEFAULT_PAGE };
  if (head === 'item') return a ? { page: 'detail', item: a } : { page: DEFAULT_PAGE };
  if (head === 'battle') return a ? { page: 'battle', item: a } : { page: 'fleet' };
  if (head === 'player') return a ? { page: 'profile', player: a } : { page: DEFAULT_PAGE };
  if (head === 'galaxy' && /^\d+$/.test(a ?? '') && /^\d+$/.test(b ?? '')) return { page: 'galaxy', galaxy: { g: Number(a), s: Number(b) } };
  return { page: head };
}

export const sameRoute = (a: Route, b: Route) => encodeRoute(a) === encodeRoute(b);
