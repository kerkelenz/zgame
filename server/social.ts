import type { Coords } from '../shared/types';
import { playerPoints } from './galaxy';
import { activityOf } from './vacation';
import { GameError, uid, type Player, type World } from './world';

const NOTE_KEY = /^(p:[a-f0-9]{4,32}|c:\d{1,3}:\d{1,4}:\d{1,3})$/;
const MAX = { blocked: 100, buddies: 100, notes: 150, bookmarks: 30, recent: 10, spy: 60 };

function other(w: World, p: Player, id: string): Player {
  const t = w.players[id];
  if (!t || t.npc) throw new GameError('No such commander', 404);
  if (t.id === p.id) throw new GameError('That is you');
  return t;
}

// ------------------------------------------------------------------ block list
export function block(w: World, p: Player, id: string) {
  const t = other(w, p, id);
  const list = (p.blocked ||= []);
  if (list.includes(t.id)) return;
  if (list.length >= MAX.blocked) throw new GameError('Your block list is full');
  list.push(t.id);
  p.buddies = p.buddies?.filter((x) => x !== t.id);
}
export function unblock(p: Player, id: string) { p.blocked = p.blocked?.filter((x) => x !== id); }
/** true if the recipient has blocked the sender, so private messages are dropped without telling the sender */
export const blockedBy = (w: World, senderId: string, recipientId: string) => !!w.players[recipientId]?.blocked?.includes(senderId);

// ------------------------------------------------------------------ buddies
export function addBuddy(w: World, p: Player, id: string) {
  const t = other(w, p, id);
  const list = (p.buddies ||= []);
  if (list.includes(t.id)) return;
  if (p.blocked?.includes(t.id)) throw new GameError('Unblock them first');
  if (list.length >= MAX.buddies) throw new GameError('Your buddy list is full');
  list.push(t.id);
}
export function removeBuddy(p: Player, id: string) { p.buddies = p.buddies?.filter((x) => x !== id); }

// ------------------------------------------------------------------ notes
export function setNote(p: Player, key: string, text: string) {
  if (!NOTE_KEY.test(key)) throw new GameError('Invalid note target');
  const notes = (p.notes ||= {});
  text = (text || '').trim().slice(0, 500);
  if (!text) { delete notes[key]; return; }
  if (!(key in notes) && Object.keys(notes).length >= MAX.notes) throw new GameError('You have too many notes');
  notes[key] = text;
}

// ------------------------------------------------------------------ bookmarks and recent targets
const okCoords = (w: World, c: Coords) => Number.isInteger(c?.g) && Number.isInteger(c?.s) && Number.isInteger(c?.p)
  && c.g >= 1 && c.g <= w.config.galaxies && c.s >= 1 && c.s <= w.config.systems && c.p >= 1 && c.p <= w.config.positions + 1;

export function addBookmark(w: World, p: Player, name: string, coords: Coords) {
  if (!okCoords(w, coords)) throw new GameError('Invalid coordinates');
  name = (name || '').trim().slice(0, 30) || `${coords.g}:${coords.s}:${coords.p}`;
  const list = (p.bookmarks ||= []);
  if (list.length >= MAX.bookmarks) throw new GameError(`At most ${MAX.bookmarks} bookmarks`);
  if (list.some((b) => b.coords.g === coords.g && b.coords.s === coords.s && b.coords.p === coords.p)) throw new GameError('Already bookmarked');
  list.push({ id: uid(3), name, coords: { g: coords.g, s: coords.s, p: coords.p } });
}
export function removeBookmark(p: Player, id: string) { p.bookmarks = p.bookmarks?.filter((b) => b.id !== id); }

export function rememberTarget(p: Player, c: Coords) {
  const list = (p.recent ||= []);
  const i = list.findIndex((x) => x.g === c.g && x.s === c.s && x.p === c.p);
  if (i >= 0) list.splice(i, 1);
  list.unshift({ g: c.g, s: c.s, p: c.p });
  if (list.length > MAX.recent) list.length = MAX.recent;
}

// ------------------------------------------------------------------ spy archive
export function archiveSpy(p: Player, planetId: string, report: unknown, at: number) {
  const a = (p.spyArchive ||= {});
  a[planetId] = { at, report };
  const keys = Object.keys(a);
  if (keys.length > MAX.spy) for (const k of keys.sort((x, y) => a[x].at - a[y].at).slice(0, keys.length - MAX.spy)) delete a[k];
}

// ------------------------------------------------------------------ player reports (for admins)
export function reportPlayer(w: World, p: Player, id: string, reason: string, now: number) {
  const t = other(w, p, id);
  reason = (reason || '').trim().slice(0, 300);
  if (reason.length < 5) throw new GameError('Say what happened (5+ characters)');
  const list = (w.reports ||= []);
  if (list.some((r) => r.by === p.id && r.target === t.id && !r.resolved)) throw new GameError('You already reported them; an admin will look at it');
  if (list.filter((r) => r.by === p.id && now - r.at < 86_400_000).length >= 5) throw new GameError('Too many reports today');
  list.push({ id: uid(3), by: p.id, byName: p.username, target: t.id, targetName: t.username, reason, at: now, resolved: false });
  if (list.length > 500) list.splice(0, list.length - 500);
}
export function resolveReport(w: World, id: string) {
  const r = w.reports?.find((x) => x.id === id);
  if (!r) throw new GameError('No such report', 404);
  r.resolved = true;
}

// ------------------------------------------------------------------ views
export function socialView(w: World, p: Player, now: number) {
  const named = (id: string) => w.players[id] && !w.players[id].npc ? { id, username: w.players[id].username } : null;
  return {
    blocked: (p.blocked ?? []).map(named).filter(Boolean),
    buddies: (p.buddies ?? []).map((id) => {
      const b = w.players[id];
      if (!b || b.npc) return null;
      return {
        id, username: b.username, activity: activityOf(w, b, now), vacation: !!b.vacation, points: playerPoints(w, b).total,
        alliance: b.allianceId ? w.alliances[b.allianceId]?.tag ?? null : null, home: w.planets[b.planetIds[0]]?.coords ?? null,
      };
    }).filter(Boolean),
    notes: p.notes ?? {},
    bookmarks: p.bookmarks ?? [],
    recent: p.recent ?? [],
  };
}

export function spyArchiveView(w: World, p: Player) {
  return Object.entries(p.spyArchive ?? {})
    .map(([planetId, e]) => ({ planetId, name: w.planets[planetId]?.name ?? null, at: e.at, report: e.report }))
    .sort((a, b) => b.at - a.at);
}
