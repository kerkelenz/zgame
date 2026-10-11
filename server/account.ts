import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { bus } from './bus';
import { dropAlliance, releaseHolds } from './alliance';
import { notifyPlayer } from './messages';
import { GameError, type Player, type World } from './world';

const hash = (pw: string, salt: string) => scryptSync(pw, salt, 32).toString('hex');
const same = (a: string, b: string) => { const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex'); return x.length === y.length && timingSafeEqual(x, y); };
const DAY = 86_400_000;

export const USERNAME_RE = /^[A-Za-z0-9_\-]{3,16}$/;

export function checkPassword(p: Player, pw: string) {
  if (!same(hash(pw || '', p.salt), p.hash)) throw new GameError('Wrong password', 403);
}

export function changePassword(w: World, p: Player, current: string, next: string, keepToken?: string) {
  checkPassword(p, current);
  if (!next || next.length < 6) throw new GameError('Password must be at least 6 characters');
  if (next === current) throw new GameError('Pick a different password');
  p.salt = randomBytes(8).toString('hex');
  p.hash = hash(next, p.salt);
  for (const [t, id] of Object.entries(w.sessions)) if (id === p.id && t !== keepToken) delete w.sessions[t];
}

export function renameAccount(w: World, p: Player, password: string, name: string, now: number) {
  checkPassword(p, password);
  name = (name || '').trim();
  if (!USERNAME_RE.test(name)) throw new GameError('Username must be 3-16 letters, numbers, - or _');
  if (name === p.username) throw new GameError('That is already your name');
  if (p.renamedAt && now - p.renamedAt < 7 * DAY) throw new GameError('You can rename once every 7 days');
  if (Object.values(w.players).some((x) => x.id !== p.id && x.username.toLowerCase() === name.toLowerCase())) throw new GameError('Username already taken');
  const old = p.username;
  p.username = name;
  p.renamedAt = now;
  for (const m of Object.values(w.movements)) if (m.ownerId === p.id) m.ownerName = name;
  for (const pl of Object.values(w.planets)) {
    if (pl.ownerId !== p.id) continue;
    if (pl.name === `${old}'s Homeworld`) pl.name = `${name}'s Homeworld`;
    else if (pl.name === `${old}'s Homeworld Moon`) pl.name = `${name}'s Homeworld Moon`;
  }
}

/** Without email there is nothing to send a reset link to, so recovery works with a one-time key the commander keeps. */
export function createRecoveryKey(p: Player, password: string): string {
  checkPassword(p, password);
  const key = randomBytes(10).toString('hex').match(/.{5}/g)!.join('-');
  const salt = randomBytes(8).toString('hex');
  p.recovery = { salt, hash: hash(key, salt) };
  return key;
}

export function recoverAccount(w: World, username: string, key: string, next: string) {
  const p = Object.values(w.players).find((x) => !x.npc && x.username.toLowerCase() === (username || '').trim().toLowerCase());
  const bad = new GameError('Wrong username or recovery key', 403);
  if (!p?.recovery) throw bad;
  if (!same(hash((key || '').trim().toLowerCase(), p.recovery.salt), p.recovery.hash)) throw bad;
  if (!next || next.length < 6) throw new GameError('Password must be at least 6 characters');
  p.salt = randomBytes(8).toString('hex');
  p.hash = hash(next, p.salt);
  p.recovery = undefined; // single use
  for (const [t, id] of Object.entries(w.sessions)) if (id === p.id) delete w.sessions[t];
  return p;
}

/** Remove a commander and everything they own. Leadership of a non-empty alliance must be handed over first. */
export function deleteAccount(w: World, p: Player, password: string, confirmName: string) {
  checkPassword(p, password);
  if (confirmName !== p.username) throw new GameError('Type your username to confirm');
  const ally = p.allianceId ? w.alliances[p.allianceId] : null;
  if (ally && ally.founderId === p.id && ally.members.length > 1) throw new GameError('Transfer alliance leadership before deleting your account');
  removePlayer(w, p);
}

export function removePlayer(w: World, p: Player) {
  releaseHolds(w, p.id);
  const ally = p.allianceId ? w.alliances[p.allianceId] : null;
  if (ally) {
    ally.members = ally.members.filter((m) => m.playerId !== p.id);
    if (!ally.members.length) dropAlliance(w, ally);
  }
  for (const a of Object.values(w.alliances)) a.applications = a.applications.filter((x) => x.playerId !== p.id);
  for (const m of Object.values(w.movements)) if (m.ownerId === p.id) delete w.movements[m.id];
  for (const id of p.planetIds) { delete w.wrecks[id]; delete w.planets[id]; }
  for (const [t, id] of Object.entries(w.sessions)) if (id === p.id) delete w.sessions[t];
  w.messages = w.messages.filter((m) => m.to !== p.id);
  delete w.players[p.id];
  for (const o of Object.values(w.players)) { o.blocked = o.blocked?.filter((x) => x !== p.id); o.buddies = o.buddies?.filter((x) => x !== p.id); delete o.notes?.[`p:${p.id}`]; }
  bus.push({ to: '*', type: 'refresh' });
}

// ------------------------------------------------------------------ moderation
export const adminNames = () => (process.env.OGAME_ADMINS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
export const isAdmin = (p: Player) => !p.npc && adminNames().includes(p.username.toLowerCase());
export const requireAdmin = (p: Player) => { if (!isAdmin(p)) throw new GameError('Admins only', 403); };

const active = (s: { until: number | null } | undefined, now: number) => !!s && (s.until === null || s.until > now);
export const isBanned = (p: Player, now: number) => active(p.banned, now);
export const isMuted = (p: Player, now: number) => active(p.muted, now);
export function assertNotMuted(p: Player, now: number) {
  if (isMuted(p, now)) throw new GameError(`You are muted${p.muted!.until ? ` until ${new Date(p.muted!.until).toLocaleString()}` : ''}: ${p.muted!.reason || 'no reason given'}`, 403);
}

function target(w: World, id: string): Player {
  const t = w.players[id];
  if (!t || t.npc) throw new GameError('No such commander', 404);
  if (isAdmin(t)) throw new GameError('Admins cannot be moderated', 403);
  return t;
}

export function ban(w: World, id: string, hours: number | null, reason: string, now: number) {
  const t = target(w, id);
  t.banned = { until: hours && hours > 0 ? now + hours * 3_600_000 : null, reason: reason.slice(0, 200) };
  for (const [tok, pid] of Object.entries(w.sessions)) if (pid === t.id) delete w.sessions[tok];
}
export function unban(w: World, id: string) { target(w, id).banned = undefined; }
export function mute(w: World, id: string, hours: number | null, reason: string, now: number) {
  const t = target(w, id);
  t.muted = { until: hours && hours > 0 ? now + hours * 3_600_000 : null, reason: reason.slice(0, 200) };
  notifyPlayer(w, t.id, 'system', 'You have been muted', t.muted.reason || 'An admin muted you.');
}
export function unmute(w: World, id: string) { target(w, id).muted = undefined; }

export function announce(w: World, text: string) {
  text = (text || '').trim().slice(0, 500);
  if (!text) throw new GameError('Empty announcement');
  for (const p of Object.values(w.players)) if (!p.npc) notifyPlayer(w, p.id, 'news', 'Announcement', text);
  bus.push({ to: '*', type: 'toast', data: `Announcement: ${text}` });
}

export function adminOverview(w: World, now: number, pointsOf: (p: Player) => number) {
  const humans = Object.values(w.players).filter((p) => !p.npc);
  return {
    world: {
      humans: humans.length, empires: Object.values(w.players).length - humans.length, planets: Object.keys(w.planets).length,
      fleetsInFlight: Object.keys(w.movements).length, messages: w.messages.length, alliances: Object.keys(w.alliances).length, wrecks: Object.keys(w.wrecks).length,
      sessions: Object.keys(w.sessions).length,
    },
    players: humans.map((p) => ({
      id: p.id, username: p.username, createdAt: p.createdAt, lastSeen: p.lastSeen, planets: p.planetIds.length, points: pointsOf(p),
      alliance: p.allianceId ? w.alliances[p.allianceId]?.tag ?? null : null, admin: isAdmin(p), vacation: !!p.vacation,
      banned: isBanned(p, now) ? p.banned : null, muted: isMuted(p, now) ? p.muted : null,
    })).sort((a, b) => b.lastSeen - a.lastSeen),
  };
}
