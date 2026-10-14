import { colonyCount, movementsByOwner, playerPoints, type Points } from './galaxy';
import { GameError, type NpcStatus, type World } from './world';

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
const TTL = process.env.VITEST ? 0 : 15_000; // tests want fresh numbers every call

/** Everyone (commanders and computer empires) by points. Cached for 15 s unless forced. */
export function rankings(w: World, force = false): RankRow[] {
  const hit = cache.get(w);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.rows;
  const flights = movementsByOwner(w);
  const rows = Object.values(w.players)
    .filter((p) => p.planetIds.length > 0 && !p.npc?.outpost)
    .map((p) => ({
      id: p.id, username: p.username, alliance: p.allianceId ? w.alliances[p.allianceId]?.tag ?? null : null,
      faction: p.npc ? p.npc.faction : p.faction, planets: colonyCount(w, p), npc: p.npc?.status ?? null, vacation: !!p.vacation, ...playerPoints(w, p, flights),
    }))
    .sort((a, b) => b.total - a.total)
    .map((r, i) => ({ rank: i + 1, ...r }));
  cache.set(w, { at: Date.now(), rows });
  return rows;
}

export const rankOf = (w: World, id: string, force = false) => rankings(w, force).find((r) => r.id === id)?.rank ?? Infinity;

/** The standings you can switch between: the five point categories plus achievements of play. */
export const SCORE_CATEGORIES: { id: string; label: string; unit: string; of: (r: RankRow, w: World) => number }[] = [
  { id: 'total', label: 'Total points', unit: 'points', of: (r) => r.total },
  { id: 'buildings', label: 'Economy', unit: 'points', of: (r) => r.buildings },
  { id: 'research', label: 'Research', unit: 'points', of: (r) => r.research },
  { id: 'fleet', label: 'Fleet', unit: 'points', of: (r) => r.fleet },
  { id: 'defense', label: 'Defense', unit: 'points', of: (r) => r.defense },
  { id: 'battles', label: 'Battles won', unit: 'wins', of: (r, w) => w.players[r.id].stats.battlesWon },
  { id: 'destroyed', label: 'Destroyed', unit: 'resources', of: (r, w) => w.players[r.id].stats.destroyed },
  { id: 'plundered', label: 'Plundered', unit: 'resources', of: (r, w) => w.players[r.id].stats.plundered },
  { id: 'harvested', label: 'Recycled', unit: 'resources', of: (r, w) => w.players[r.id].stats.harvested },
  { id: 'expeditions', label: 'Expeditions', unit: 'trips', of: (r, w) => w.players[r.id].stats.expeditions },
  { id: 'raids', label: 'Raids repelled', unit: 'raids', of: (r, w) => w.players[r.id].stats.raidsRepelled },
  { id: 'moons', label: 'Moons destroyed', unit: 'moons', of: (r, w) => w.players[r.id].stats.moonsDestroyed },
];

export interface CategoryRow extends RankRow { value: number }

/** Everyone ranked by one category (rank is within the category; activity categories only list those with a score). */
export function categoryRows(w: World, cat: string, force = false): CategoryRow[] {
  const def = SCORE_CATEGORIES.find((c) => c.id === cat);
  if (!def) throw new GameError('Unknown category', 400);
  const pointCat = ['total', 'buildings', 'research', 'fleet', 'defense'].includes(cat);
  return rankings(w, force)
    .map((r) => ({ ...r, value: def.of(r, w) }))
    .filter((r) => pointCat || r.value > 0)
    .sort((a, b) => b.value - a.value || a.rank - b.rank)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
