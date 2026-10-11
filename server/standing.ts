import { SCORE_CATEGORIES, categoryRows } from './rankings';
import type { World } from './world';

const DAY = 24 * 3_600_000;

/** What the table looked like at the last daily snapshot: value and place per commander, in every category. */
export interface StandingDay { at: number; byCat: Record<string, Record<string, { v: number; r: number }>> }

function takeSnapshot(w: World, now: number): StandingDay {
  const byCat: StandingDay['byCat'] = {};
  for (const c of SCORE_CATEGORIES) {
    const rows: Record<string, { v: number; r: number }> = {};
    for (const r of categoryRows(w, c.id, true)) rows[r.id] = { v: r.value, r: r.rank };
    byCat[c.id] = rows;
  }
  return { at: now, byCat };
}

/** Once every 24 hours the standing is written down; the table then shows how far everyone has moved since. */
export function refreshStandingDay(w: World, now: number): boolean {
  if (w.standingDay && now - w.standingDay.at < DAY) return false;
  w.standingDay = takeSnapshot(w, now);
  return true;
}

/** the change since the snapshot for one commander in one category: points gained (or lost) and places climbed (negative = fell); null for someone who was not listed then */
export function standingChange(w: World, cat: string, id: string, value: number, rank: number): { points: number; places: number } | null {
  const was = w.standingDay?.byCat[cat]?.[id];
  return was ? { points: value - was.v, places: was.r - rank } : null;
}
