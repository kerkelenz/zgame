import { colonyCount, playerPoints, type Points } from './galaxy';
import type { NpcStatus, World } from './world';

export interface RankRow extends Points {
  rank: number;
  id: string;
  username: string;
  alliance: string | null;
  faction: string | null;
  planets: number;
  /** set for computer empires */
  npc: NpcStatus | null;
  vacation: boolean;
}

const cache = new WeakMap<World, { at: number; rows: RankRow[] }>();
const TTL = 15_000;

/** Everyone (commanders and computer empires) by points. Cached for 15 s unless forced. */
export function rankings(w: World, force = false): RankRow[] {
  const hit = cache.get(w);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.rows;
  const rows = Object.values(w.players)
    .filter((p) => p.planetIds.length > 0)
    .map((p) => ({
      id: p.id, username: p.username, alliance: p.allianceId ? w.alliances[p.allianceId]?.tag ?? null : null,
      faction: p.npc ? p.npc.faction : p.faction, planets: colonyCount(w, p), npc: p.npc?.status ?? null, vacation: !!p.vacation, ...playerPoints(w, p),
    }))
    .sort((a, b) => b.total - a.total)
    .map((r, i) => ({ rank: i + 1, ...r }));
  cache.set(w, { at: Date.now(), rows });
  return rows;
}

export const rankOf = (w: World, id: string, force = false) => rankings(w, force).find((r) => r.id === id)?.rank ?? Infinity;
