import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { isBanned } from './account';
import { createPlanet, findHomeSlot } from './galaxy';
import { GameError, blankPlayer, uid, type Player, type World } from './world';

export const MAX_SESSIONS = 8;
/** a login that has not been used for this long stops working */
export const SESSION_TTL_MS = 30 * 24 * 3_600_000;
// hashing a throwaway password for unknown usernames keeps the response time the same as for real ones
const DUMMY_SALT = randomBytes(8).toString('hex');
const hash = (pw: string, salt: string) => scryptSync(pw, salt, 32).toString('hex');

export function register(w: World, username: string, password: string, now = Date.now()): { player: Player; token: string } {
  username = (username || '').trim();
  if (!/^[A-Za-z0-9_\-]{3,16}$/.test(username)) throw new GameError('Username must be 3-16 letters, numbers, - or _');
  if (!password || password.length < 6) throw new GameError('Password must be at least 6 characters');
  if (Object.values(w.players).some((p) => p.username.toLowerCase() === username.toLowerCase())) throw new GameError('Username already taken');
  if (Object.values(w.players).filter((p) => !p.npc).length >= w.config.maxPlayers) throw new GameError('This universe is full', 503);
  const salt = randomBytes(8).toString('hex');
  const player = blankPlayer(uid(), username, now, { salt, hash: hash(password, salt) });
  w.players[player.id] = player;
  createPlanet(w, player, findHomeSlot(w), { home: true, name: `${username}'s Homeworld`, now });
  return { player, token: issueToken(w, player, now) };
}

export function login(w: World, username: string, password: string, now = Date.now()): { player: Player; token: string } {
  const player = Object.values(w.players).find((p) => !p.npc && p.username.toLowerCase() === (username || '').trim().toLowerCase());
  const bad = new GameError('Invalid username or password', 401);
  if (!player) { hash(password || '', DUMMY_SALT); throw bad; }
  const a = Buffer.from(hash(password || '', player.salt), 'hex');
  const b = Buffer.from(player.hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw bad;
  if (isBanned(player, now)) throw new GameError(`This account is banned${player.banned!.until ? ` until ${new Date(player.banned!.until).toLocaleString()}` : ''}: ${player.banned!.reason || 'no reason given'}`, 403);
  return { player, token: issueToken(w, player, now) };
}

function issueToken(w: World, p: Player, now = Date.now()): string {
  const token = randomBytes(24).toString('hex');
  // keep at most MAX_SESSIONS live tokens per player (oldest are revoked first; object keys keep insertion order)
  const mine = Object.keys(w.sessions).filter((t) => w.sessions[t] === p.id);
  for (const old of mine.slice(0, Math.max(0, mine.length - (MAX_SESSIONS - 1)))) dropSession(w, old);
  w.sessions[token] = p.id;
  (w.sessionAt ||= {})[token] = now;
  return token;
}

export function dropSession(w: World, token: string) {
  delete w.sessions[token];
  if (w.sessionAt) delete w.sessionAt[token];
}

/** Revoke one login (the Log out button), so a stolen or forgotten token stops working. */
export function logout(w: World, token: string | undefined) {
  if (token && Object.hasOwn(w.sessions, token)) dropSession(w, token);
}

export function authenticate(w: World, token: string | undefined, now = Date.now()): Player | null {
  if (!token || !Object.hasOwn(w.sessions, token)) return null; // hasOwn: tokens like "__proto__" must not reach inherited properties
  const seen = w.sessionAt?.[token];
  if (seen !== undefined && now - seen > SESSION_TTL_MS) { dropSession(w, token); return null; }
  if (seen === undefined || now - seen > 60_000) (w.sessionAt ||= {})[token] = now;
  return w.players[w.sessions[token]] ?? null;
}

/** Forget expired logins and timestamps of tokens that no longer exist. */
export function pruneSessions(w: World, now = Date.now()): number {
  let n = 0;
  for (const t of Object.keys(w.sessions)) {
    const seen = w.sessionAt?.[t];
    if (!w.players[w.sessions[t]] || (seen !== undefined && now - seen > SESSION_TTL_MS)) { dropSession(w, t); n++; }
  }
  for (const t of Object.keys(w.sessionAt ?? {})) if (!Object.hasOwn(w.sessions, t)) { delete w.sessionAt![t]; n++; }
  return n;
}
