import type { World } from './world';

export type FeedKind = 'attack' | 'defense' | 'offense' | 'raid' | 'build' | 'help';
const MAX = 100;

/**
 * One line in the alliance activity feed for something a member did or went through. Members without an alliance are ignored.
 * The same text is kept once if it repeats within a minute (several fleets of one raid, a build finishing twice).
 */
export function allianceEvent(w: World, playerId: string, kind: FeedKind, text: string, now = Date.now()): void {
  const p = w.players[playerId];
  const a = p?.allianceId ? w.alliances[p.allianceId] : null;
  if (!a || p.npc) return;
  const last = a.log[a.log.length - 1];
  if (last && last.text === text && now - last.at < 60_000) return;
  a.log.push({ at: now, text, kind, by: playerId });
  if (a.log.length > MAX) a.log.shift();
}
