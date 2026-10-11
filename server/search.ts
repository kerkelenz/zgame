import { playerPoints } from './galaxy';
import type { World } from './world';

export const SEARCH = { minChars: 2, limit: 10 };

export interface PlayerHit { id: string; username: string; alliance: string | null; points: number; npc: string | null }

/**
 * Find commanders by name for the search box: names that start with what was typed come first, then names that contain it; the
 * strongest commanders come first among equals. Computer empires are included (they have profiles too), banned accounts are not.
 */
export function searchPlayers(w: World, query: string, limit = SEARCH.limit): PlayerHit[] {
  const q = query.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (q.length < SEARCH.minChars) return [];
  const scored: { p: (typeof w.players)[string]; rank: number }[] = [];
  for (const p of Object.values(w.players)) {
    if (!p.planetIds.length || p.banned) continue;
    const name = p.username.toLowerCase();
    const tag = p.allianceId ? w.alliances[p.allianceId]?.tag.toLowerCase() : undefined;
    const rank = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : tag === q ? 3 : -1;
    if (rank >= 0) scored.push({ p, rank });
  }
  const hits = scored.map((s) => ({ ...s, pts: playerPoints(w, s.p).total }));
  hits.sort((a, b) => a.rank - b.rank || b.pts - a.pts || a.p.username.localeCompare(b.p.username));
  return hits.slice(0, limit).map(({ p, pts }) => ({
    id: p.id, username: p.username, alliance: p.allianceId ? w.alliances[p.allianceId]?.tag ?? null : null, points: pts, npc: p.npc?.status ?? null,
  }));
}
