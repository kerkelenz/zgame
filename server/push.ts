import webpush from 'web-push';
import { GameError, type Player, type World } from './world';

/** Browser push subscriptions (a phone or desktop that installed the app or allowed notifications). */
export interface PushSub { endpoint: string; keys: { p256dh: string; auth: string }; createdAt: number; label: string }
export interface Vapid { publicKey: string; privateKey: string }

export const MAX_SUBS = 5;

export type PushSender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, vapid: Vapid & { subject: string }) => Promise<{ statusCode: number }>;
const defaultSender: PushSender = (sub, payload, v) =>
  webpush.sendNotification(sub, payload, { vapidDetails: { subject: v.subject, publicKey: v.publicKey, privateKey: v.privateKey }, TTL: 3600, urgency: 'high' })
    .then((r) => ({ statusCode: r.statusCode }))
    .catch((e: { statusCode?: number }) => ({ statusCode: e?.statusCode ?? 0 }));
let sender: PushSender = defaultSender;
export function setPushSender(s: PushSender | null) { sender = s ?? defaultSender; }

/** The server's VAPID identity is created once and kept in the save, so subscriptions survive restarts. */
export function ensureVapid(w: World): Vapid {
  if (!w.vapid) w.vapid = webpush.generateVAPIDKeys();
  return w.vapid;
}
const subject = () => process.env.OGAME_PUSH_SUBJECT || 'mailto:admin@example.com';

/** Only real push-service endpoints over https are accepted; the server will post to whatever is stored here. */
export function cleanSubscription(raw: unknown): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const r = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof r?.endpoint === 'string' ? r.endpoint.trim() : '';
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new GameError('That is not a push subscription'); }
  if (url.protocol !== 'https:' || endpoint.length > 600) throw new GameError('Push endpoints must be https');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':') || !host.includes('.')) throw new GameError('That is not a public push service');
  const p256dh = String(r?.keys?.p256dh ?? ''), auth = String(r?.keys?.auth ?? '');
  const b64url = /^[A-Za-z0-9_-]+={0,2}$/;
  if (!b64url.test(p256dh) || p256dh.length < 80 || p256dh.length > 100 || !b64url.test(auth) || auth.length < 20 || auth.length > 30) throw new GameError('The subscription keys are invalid');
  return { endpoint, keys: { p256dh, auth } };
}

export function addSubscription(p: Player, raw: unknown, label: string, now: number): PushSub {
  const sub = cleanSubscription(raw);
  const list = (p.pushSubs ||= []);
  const same = list.find((s) => s.endpoint === sub.endpoint);
  if (same) { same.keys = sub.keys; same.label = label.slice(0, 60); return same; }
  if (list.length >= MAX_SUBS) list.shift(); // the oldest device makes room
  const entry: PushSub = { ...sub, createdAt: now, label: label.slice(0, 60) || 'A device' };
  list.push(entry);
  return entry;
}
export function removeSubscription(p: Player, endpoint: string) { p.pushSubs = p.pushSubs?.filter((s) => s.endpoint !== endpoint); }

export interface PushMessage { title: string; body: string; tag?: string; url?: string }

/** Send to every device of a player; devices the push service says are gone (404/410) are forgotten. */
export async function pushToPlayer(w: World, p: Player, msg: PushMessage): Promise<{ sent: number; dropped: number; failed: number }> {
  const subs = [...(p.pushSubs ?? [])];
  const v = ensureVapid(w);
  const payload = JSON.stringify({ title: msg.title.slice(0, 80), body: msg.body.slice(0, 240), tag: msg.tag ?? 'zgame', url: msg.url ?? '/' });
  let sent = 0, dropped = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    const r = await sender({ endpoint: s.endpoint, keys: s.keys }, payload, { ...v, subject: subject() });
    if (r.statusCode >= 200 && r.statusCode < 300) sent++;
    else if (r.statusCode === 404 || r.statusCode === 410) { removeSubscription(p, s.endpoint); dropped++; }
    else failed++;
  }));
  return { sent, dropped, failed };
}

export const pushView = (w: World, p: Player) => ({
  publicKey: ensureVapid(w).publicKey,
  devices: (p.pushSubs ?? []).map((s) => ({ endpoint: s.endpoint.slice(-24), full: s.endpoint, label: s.label, createdAt: s.createdAt })),
});
