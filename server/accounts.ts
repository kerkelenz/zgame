import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createPlanet, findHomeSlot } from './galaxy';
import { GameError, uid, type Player, type World } from './world';

export const MAX_SESSIONS = 8;
const hash = (pw: string, salt: string) => scryptSync(pw, salt, 32).toString('hex');

export function register(w: World, username: string, password: string, now = Date.now()): { player: Player; token: string } {
  username = (username || '').trim();
  if (!/^[A-Za-z0-9_\-]{3,16}$/.test(username)) throw new GameError('Username must be 3-16 letters, numbers, - or _');
  if (!password || password.length < 6) throw new GameError('Password must be at least 6 characters');
  if (Object.values(w.players).some((p) => p.username.toLowerCase() === username.toLowerCase())) throw new GameError('Username already taken');
  const salt = randomBytes(8).toString('hex');
  const player: Player = {
    id: uid(), username, salt, hash: hash(password, salt), createdAt: now, lastSeen: now,
    techs: {}, research: null, researchBacklog: [], allianceId: null, planetIds: [],
    stats: { raidsRepelled: 0, battlesWon: 0, battlesLost: 0, expeditions: 0 },
  };
  w.players[player.id] = player;
  createPlanet(w, player, findHomeSlot(w), { home: true, name: `${username}'s Homeworld`, now });
  return { player, token: issueToken(w, player) };
}

export function login(w: World, username: string, password: string): { player: Player; token: string } {
  const player = Object.values(w.players).find((p) => p.username.toLowerCase() === (username || '').trim().toLowerCase());
  const bad = new GameError('Invalid username or password', 401);
  if (!player) throw bad;
  const a = Buffer.from(hash(password || '', player.salt), 'hex');
  const b = Buffer.from(player.hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw bad;
  return { player, token: issueToken(w, player) };
}

function issueToken(w: World, p: Player): string {
  const token = randomBytes(24).toString('hex');
  // keep at most MAX_SESSIONS live tokens per player (oldest are revoked first; object keys keep insertion order)
  const mine = Object.keys(w.sessions).filter((t) => w.sessions[t] === p.id);
  for (const old of mine.slice(0, Math.max(0, mine.length - (MAX_SESSIONS - 1)))) delete w.sessions[old];
  w.sessions[token] = p.id;
  return token;
}

export function authenticate(w: World, token: string | undefined): Player | null {
  if (!token) return null;
  const id = w.sessions[token];
  return id ? w.players[id] ?? null : null;
}
