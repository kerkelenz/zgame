/**
 * Alerts outside the game: Discord webhooks and ntfy.sh push messages.
 * Targets are checked against a strict allowlist so a player can never make the server call an arbitrary URL.
 */
import { GameError, type Player, type World } from './world';

export type Category = 'attacks' | 'allies' | 'tribute' | 'completions' | 'messages';
export const CATEGORIES: Category[] = ['attacks', 'allies', 'tribute', 'completions', 'messages'];

export interface NotifySettings {
  discord: string | null;
  ntfy: string | null;
  events: Record<Category, boolean>;
  /** only alert when you have not been in the game for a couple of minutes */
  onlyWhenAway: boolean;
}

export const defaultNotify = (): NotifySettings => ({
  discord: null, ntfy: null, onlyWhenAway: true,
  events: { attacks: true, allies: true, tribute: true, completions: false, messages: false },
});

const DISCORD = /^https:\/\/(?:(?:ptb|canary)\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,25}\/[A-Za-z0-9_-]{20,120}$/;
const NTFY = /^https:\/\/ntfy\.sh\/[A-Za-z0-9_-]{8,64}$/;

/** Validate and normalise a channel target. Empty clears it. Throws a GameError for anything not on the allowlist. */
export function validateTarget(channel: 'discord' | 'ntfy', raw: unknown): string | null {
  let v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return null;
  if (channel === 'ntfy' && /^[A-Za-z0-9_-]{8,64}$/.test(v)) v = `https://ntfy.sh/${v}`; // a bare topic name is fine
  if (v.length > 300) throw new GameError('That address is too long');
  if (channel === 'discord' && !DISCORD.test(v)) throw new GameError('That is not a Discord webhook address (https://discord.com/api/webhooks/...)');
  if (channel === 'ntfy' && !NTFY.test(v)) throw new GameError('Use an ntfy.sh topic: a name of 8-64 letters, numbers, - or _ (or https://ntfy.sh/<topic>)');
  return v;
}

/** the address with its secret part hidden, for showing back to the player */
export const mask = (v: string | null): string | null => (v ? v.slice(0, v.lastIndexOf('/') + 1) + '••••' + v.slice(-4) : null);

export interface SendInit { method: 'POST'; headers: Record<string, string>; body: string }
export type Sender = (url: string, init: SendInit) => Promise<{ ok: boolean; status: number }>;

const defaultSender: Sender = async (url, init) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try { const r = await fetch(url, { ...init, signal: ctl.signal, redirect: 'error' }); return { ok: r.ok, status: r.status }; }
  catch { return { ok: false, status: 0 }; }
  finally { clearTimeout(timer); }
};
let sender: Sender = defaultSender;
/** tests replace the network */
export function setSender(s: Sender | null) { sender = s ?? defaultSender; }

const AWAY_MS = 2 * 60_000;
const WINDOW_MS = 5 * 60_000, MAX_PER_WINDOW = 5, MAX_PER_HOUR = 30;
const recent = new Map<string, number[]>();
const hourly = new Map<string, number[]>();
export const resetLimits = () => { recent.clear(); hourly.clear(); };

function allow(player: Player, category: Category, now: number): boolean {
  const k = `${player.id}:${category}`;
  const a = (recent.get(k) ?? []).filter((t) => now - t < WINDOW_MS);
  const h = (hourly.get(player.id) ?? []).filter((t) => now - t < 3_600_000);
  if (a.length >= MAX_PER_WINDOW || h.length >= MAX_PER_HOUR) return false;
  a.push(now); h.push(now);
  recent.set(k, a); hourly.set(player.id, h);
  return true;
}

import { pushToPlayer } from './push';

const TAGS: Record<Category, string> = { attacks: 'rotating_light', allies: 'handshake', tribute: 'moneybag', completions: 'white_check_mark', messages: 'envelope' };

function deliver(channel: 'discord' | 'ntfy', url: string, category: Category, title: string, body: string): Promise<{ ok: boolean; status: number }> {
  if (channel === 'discord') {
    return sender(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'Stellar Frontier', content: `**${title}**\n${body}`.slice(0, 1900), allowed_mentions: { parse: [] } }) });
  }
  return sender(url, { method: 'POST', headers: { Title: title.slice(0, 120), Priority: category === 'attacks' ? 'urgent' : 'default', Tags: TAGS[category], 'content-type': 'text/plain; charset=utf-8' }, body: body.slice(0, 1900) });
}

/** a dead webhook (deleted channel, revoked topic) is switched off and the player told in-game */
function disableDead(w: World, p: Player, channel: 'discord' | 'ntfy') {
  p.notify[channel] = null;
  w.messages.push({ id: Math.random().toString(16).slice(2), to: p.id, from: null, kind: 'system', subject: 'External alerts switched off',
    body: `Your ${channel === 'discord' ? 'Discord webhook' : 'ntfy topic'} stopped accepting messages, so it was removed. Add it again in Settings.`, at: Date.now(), read: false });
}

/** Send an alert to the player's configured channels, if the category is on and (optionally) they are away. */
export function externalNotify(w: World, playerId: string, category: Category, title: string, body: string, now = Date.now()): void {
  const p = w.players[playerId];
  if (!p || p.npc) return;
  const n = p.notify;
  const hasPush = !!p.pushSubs?.length;
  if (!n || (!n.discord && !n.ntfy && !hasPush) || !n.events[category]) return;
  if (n.onlyWhenAway && now - p.lastSeen < AWAY_MS) return;
  if (!allow(p, category, now)) return;
  if (hasPush) void pushToPlayer(w, p, { title, body, tag: category }).catch(() => undefined);
  for (const channel of ['discord', 'ntfy'] as const) {
    const url = n[channel];
    if (!url) continue;
    void deliver(channel, url, category, title, body).then((r) => {
      if (!r.ok && (r.status === 404 || r.status === 401 || r.status === 403 || r.status === 410)) disableDead(w, p, channel);
    });
  }
}

/** Send a test message right now to every configured channel and report what happened. */
export async function sendTest(w: World, p: Player): Promise<{ channel: 'discord' | 'ntfy'; ok: boolean; status: number }[]> {
  const out: { channel: 'discord' | 'ntfy'; ok: boolean; status: number }[] = [];
  for (const channel of ['discord', 'ntfy'] as const) {
    const url = p.notify[channel];
    if (!url) continue;
    const r = await deliver(channel, url, 'attacks', 'Stellar Frontier test', `Hello ${p.username}! Alerts are working. You will get messages like this when a fleet is heading for you.`);
    out.push({ channel, ok: r.ok, status: r.status });
  }
  if (!out.length) throw new GameError('Add a Discord webhook or ntfy topic first');
  return out;
}

/** Which alert category an in-game message belongs to (null = not worth a push). */
export function categoryOf(kind: string, subject: string): Category | null {
  if (kind === 'raid') return /^Ally under raid/i.test(subject) ? 'allies' : 'attacks';
  if (kind === 'system') {
    if (/Hostile fleet detected|Missile launch detected/i.test(subject)) return 'attacks';
    if (/Construction complete|Research complete|Production complete|Objective complete/i.test(subject)) return 'completions';
    return null;
  }
  if (kind === 'news' && /demands tribute/i.test(subject)) return 'tribute';
  if (kind === 'player') return 'messages';
  return null;
}
