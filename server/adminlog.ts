import { announce } from './account';
import { GameError, uid, type Player, type World } from './world';

const HOUR = 3_600_000, DAY = 86_400_000, MIN = 60_000;

/**
 * Tools for the people who run a server: an audit log of everything an admin did, announcements that go out later (once or on repeat), and
 * a daily count of new and active commanders. All three are small, capped lists in the save.
 */
export interface AuditEntry { id: string; at: number; admin: string; action: string; targetId?: string; targetName?: string; detail?: string }
export interface ScheduledAnnouncement { id: string; at: number; text: string; by: string; /** hours between repeats; 0 = once */ repeatHours: number }
export interface DayStat { day: string; /** accounts created that day */ registered: number; /** distinct commanders seen that day */ active: number; /** of those, how many had registered on an earlier day */ returning: number; /** only on the row for today: who has been seen so far */ seen?: string[] }

export const AUDIT_CAP = 500, STATS_DAYS = 60, SCHEDULE_CAP = 20;

export function audit(w: World, admin: Player, action: string, now: number, target?: { id: string; username: string } | null, detail?: string): void {
  const log = (w.auditLog ??= []);
  log.unshift({ id: uid(), at: now, admin: admin.username, action, targetId: target?.id, targetName: target?.username, detail: detail?.slice(0, 300) });
  if (log.length > AUDIT_CAP) log.length = AUDIT_CAP;
}

export const auditView = (w: World, limit = 100) => (w.auditLog ?? []).slice(0, Math.max(1, Math.min(AUDIT_CAP, limit)));

// ------------------------------------------------------------------ scheduled announcements

export function scheduleAnnouncement(w: World, admin: Player, text: string, afterMinutes: number, repeatHours: number, now: number): ScheduledAnnouncement {
  text = (text || '').trim().slice(0, 500);
  if (!text) throw new GameError('Write the announcement first');
  const delay = Math.max(1, Math.min(60 * 24 * 60, Math.round(afterMinutes || 0)));
  const repeat = Math.max(0, Math.min(24 * 30, Math.round(repeatHours || 0)));
  const list = (w.scheduledAnnouncements ??= []);
  if (list.length >= SCHEDULE_CAP) throw new GameError(`At most ${SCHEDULE_CAP} scheduled announcements; cancel one first`);
  const s: ScheduledAnnouncement = { id: uid(), at: now + delay * MIN, text, by: admin.username, repeatHours: repeat };
  list.push(s);
  list.sort((a, b) => a.at - b.at);
  audit(w, admin, 'schedule announcement', now, null, `in ${delay} min${repeat ? `, every ${repeat} h` : ''}: ${text}`);
  return s;
}

export function cancelScheduled(w: World, admin: Player, id: string, now: number): void {
  const list = w.scheduledAnnouncements ?? [];
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) throw new GameError('No such scheduled announcement', 404);
  const [s] = list.splice(i, 1);
  audit(w, admin, 'cancel scheduled announcement', now, null, s.text);
}

/** Runs about once a minute: announcements whose time has come go out; repeating ones are set for their next turn */
export function processScheduled(w: World, now: number): void {
  const list = w.scheduledAnnouncements;
  if (!list?.length) return;
  const due = list.filter((s) => s.at <= now);
  if (!due.length) return;
  for (const s of due) {
    try { announce(w, s.text); } catch { /* an empty text cannot happen; ignore */ }
    if (s.repeatHours > 0) { while (s.at <= now) s.at += s.repeatHours * HOUR; } else list.splice(list.indexOf(s), 1);
  }
  list.sort((a, b) => a.at - b.at);
}

// ------------------------------------------------------------------ daily numbers

export const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Runs about once a minute: counts the commanders seen today and the accounts created today */
export function recordDayStats(w: World, now: number): void {
  const stats = (w.dailyStats ??= []);
  const day = dayOf(now), start = Date.parse(day + 'T00:00:00Z');
  let row = stats.find((r) => r.day === day);
  if (!row) {
    for (const r of stats) delete r.seen;                                  // yesterday's list of ids is no longer needed
    row = { day, registered: 0, active: 0, returning: 0, seen: [] };
    stats.push(row);
    if (stats.length > STATS_DAYS) stats.splice(0, stats.length - STATS_DAYS);
  }
  const seen = new Set(row.seen ?? []);
  let registered = 0;
  for (const p of Object.values(w.players)) {
    if (p.npc || !p.planetIds.length) continue;
    if (p.createdAt >= start && p.createdAt < start + DAY) registered++;
    if (p.lastSeen >= start && !seen.has(p.id)) seen.add(p.id);
  }
  row.registered = registered;
  row.seen = [...seen];
  row.active = seen.size;
  row.returning = [...seen].filter((id) => (w.players[id]?.createdAt ?? now) < start).length;
}

export const statsView = (w: World, days = 14) => (w.dailyStats ?? []).slice(-Math.max(1, days)).map(({ seen: _s, ...r }) => r);
