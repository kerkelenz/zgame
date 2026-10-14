import { playerPoints } from './galaxy';
import type { World } from './world';

export interface RecruitRow { id: string; tag: string; name: string; description: string; open: boolean; members: number; points: number; active: number; territory: number }

const ACTIVE_MS = 48 * 3_600_000;

/**
 * The list a player without an alliance picks from: the ones anyone can join first, then the strongest, so a newcomer sees where the action is.
 * `points` is the members' combined points and `active` how many of them were in the game in the last two days.
 */
export function recruitingList(w: World, now: number): RecruitRow[] {
  const rows = Object.values(w.alliances).map((a) => {
    const members = a.members.map((m) => w.players[m.playerId]).filter(Boolean);
    return {
      id: a.id, tag: a.tag, name: a.name, description: a.description, open: a.open, members: a.members.length,
      points: Math.round(members.reduce((s, p) => s + playerPoints(w, p).total, 0)),
      active: members.filter((p) => now - p.lastSeen < ACTIVE_MS).length,
      territory: a.territory ?? 0,
    };
  });
  return rows.sort((x, y) => Number(y.open) - Number(x.open) || y.points - x.points || y.members - x.members || x.tag.localeCompare(y.tag));
}
