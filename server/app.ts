import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDINGS, TECHS, UNITS } from '../shared/data';
import { cargoFor } from './perks';
import { bus } from './bus';
import { authenticate, login, logout, register } from './accounts';
import * as AL from './alliance';
import { abandonPlanet, tradeResources, cancelBuilding, cancelResearch, cancelShipyardJob, processPlayer, queueBuilding, queueResearch, queueUnits, startDemolition, unqueueBuilding, unqueueResearch, moveQueuedBuilding, moveQueuedResearch } from './economy';
import { flightPlan, jumpGate, launchMissiles, phalanxScan, recallFleet, sendFleet } from './fleet';
import { colonyCount, galaxyView, inBounds, playerPoints } from './galaxy';
import { notifyPlayer } from './messages';
import { cancelForge, startForge } from './forge';
import { playerNames, searchPlayers } from './search';
import { refreshStandingDay, standingChange } from './standing';
import { allianceView, commandView, fleetsView, meView, planetView } from './views';
import { checkProgress, chooseClass, hireOfficer, joinFaction, leaveFaction } from './progress';
import { answerTribute } from './empires';
import { spawnRaid } from './npc';
import { SCORE_CATEGORIES, categoryRows } from './rankings';
import { profileView } from './profile';
import { endVacation, startVacation } from './vacation';
import { startRepair } from './wrecks';
import * as ACC from './account';
import * as SOC from './social';
import { endSeason, resetSeason, seasonView } from './season';
import { gatherResources } from './logistics';
import { buyItem, shopView } from './shop';
import { outpostList } from './outposts';
import { audit, auditView, cancelScheduled, scheduleAnnouncement, statsView } from './adminlog';
import { buyOffer, cancelOffer, listOffer, marketView } from './market';
import * as AUTO from './automation';
import { addSubscription, pushToPlayer, pushView, removeSubscription } from './push';
import { sectorOf, sectorsView, territoryCount } from './sectors';
import { announceInvasion, finish as finishInvasion, invasionView } from './invasion';
import { claimContract, contractsView } from './contracts';
import { recoverAccount } from './account';
import { defenseReport } from './advisor';
import { recruitingList } from './recruiting';
import { healthView, recordError } from './health';
import { closeOperation, createOperation, operationsView, signUp, withdraw } from './operations';
import { isRole } from '../shared/roles';
import { orderCard, planetCard, publish as publishCard } from './share';
import { CATEGORIES, mask, sendTest, validateTarget } from './external';
import { GameError, ownedPlanet, uid, type Player, type World } from './world';
import { env } from './env';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { player?: Player } }
}

const hits = new Map<string, number[]>();
/** the key space (IPs, usernames) is attacker-controlled, so drop stale entries instead of growing forever */
function sweepHits() {
  const now = Date.now();
  for (const [k, arr] of hits) if (!arr.length || now - arr[arr.length - 1] > 86_400_000) hits.delete(k);
}
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}

/** how many recent events a key has (without adding one) */
function recent(key: string, windowMs: number) {
  const now = Date.now();
  return (hits.get(key) || []).filter((t) => now - t < windowMs).length;
}
const record = (key: string) => { const arr = hits.get(key) || []; arr.push(Date.now()); hits.set(key, arr); };

const str = (v: unknown, max = 200) => String(v ?? '').slice(0, max);

export function createApp(w: World, opts: { staticDir?: string; clock?: () => number } = {}) {
  const now = opts.clock ?? Date.now;
  const app = express();
  const sweeper = setInterval(sweepHits, 10 * 60_000);
  sweeper.unref();
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });
  // behind a reverse proxy, rate limits must key on the real client address
  if (env('TRUST_PROXY')) app.set('trust proxy', env('TRUST_PROXY') === 'true' ? true : Number(env('TRUST_PROXY')) || env('TRUST_PROXY'));
  app.use(express.json({ limit: '100kb' }));

  const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = fn(req, res);
      if (out && typeof (out as Promise<unknown>).then === 'function') {
        (out as Promise<unknown>).then((v) => { if (v !== undefined && !res.headersSent) res.json(v); }, next);
      } else if (out !== undefined && !res.headersSent) res.json(out);
    } catch (e) { next(e); }
  };
  const auth = (req: Request, _res: Response, next: NextFunction) => {
    const h = req.headers.authorization;
    const p = authenticate(w, h?.startsWith('Bearer ') ? h.slice(7) : undefined);
    if (!p) return next(new GameError('Not logged in', 401));
    if (ACC.isBanned(p, now())) return next(new GameError('This account is banned', 403));
    p.lastSeen = now();
    req.player = p;
    next();
  };
  const A = express.Router();
  A.use(auth);

  // ---------------------------------------------------------------- public
  app.post('/api/register', wrap((req) => {
    if (limited('reg:' + req.ip, 10, 60_000) || limited('regday:' + req.ip, 40, 86_400_000)) throw new GameError('Too many attempts, slow down', 429);
    const wanted = str(req.body.username, 40);
    if (ACC.reservedAdminName(w, wanted) && !ACC.mayRegisterReserved(str(req.body.adminKey, 100), req.ip)) throw new GameError('That name is reserved for an administrator. Enter the admin setup key (ZGAME_ADMIN_KEY), or register it on the server machine itself.', 403);
    const { player, token } = register(w, wanted, str(req.body.password, 200), now());
    bus.push({ to: '*', type: 'refresh' });
    return { token, id: player.id };
  }));
  app.post('/api/login', wrap((req) => {
    if (limited('login:' + req.ip, 20, 60_000)) throw new GameError('Too many attempts, slow down', 429);
    // per account too, so a password cannot be ground down from many addresses (and one address cannot lock everyone out)
    // only wrong guesses count, so normal logins are never blocked
    const who = str(req.body.username, 40).trim().toLowerCase();
    const k1 = `loginfail:${req.ip}:${who}`, k2 = 'loginfail:' + who;
    if (recent(k1, 15 * 60_000) >= 8 || recent(k2, 15 * 60_000) >= 40) throw new GameError('Too many failed attempts for this account, try again later', 429);
    try {
      const { player, token } = login(w, str(req.body.username, 40), str(req.body.password, 200), now());
      hits.delete(k1);
      return { token, id: player.id };
    } catch (e) {
      if (e instanceof GameError && e.status === 401) { record(k1); record(k2); }
      throw e;
    }
  }));
  app.post('/api/logout', wrap((req) => {
    const h = req.headers.authorization;
    logout(w, h?.startsWith('Bearer ') ? h.slice(7) : undefined);
    return { ok: true };
  }));
  app.post('/api/recover', wrap((req) => {
    if (limited('recover:' + req.ip, 8, 60_000)) throw new GameError('Too many attempts, slow down', 429);
    const p = recoverAccount(w, str(req.body.username, 40), str(req.body.key, 60), str(req.body.password, 200));
    return { ok: true, username: p.username };
  }));
  app.get('/api/shared/:id', wrap((req) => {
    if (limited('shared:' + req.ip, 60, 60_000)) throw new GameError('Slow down', 429);
    const s = w.shared?.[req.params.id];
    if (!s) throw new GameError('That report is not shared (or was removed)', 404);
    return s;
  }));
  app.get('/api/health', wrap(() => ({ ok: true, players: Object.keys(w.players).length })));

  // ---------------------------------------------------------------- state
  A.get('/me', wrap((req) => {
    const p = req.player!;
    processPlayer(w, p, now());
    checkProgress(w, p, now());
    return meView(w, p, now());
  }));
  A.get('/planets/:id', wrap((req) => {
    const p = req.player!;
    processPlayer(w, p, now());
    return planetView(w, ownedPlanet(w, p.id, req.params.id), now());
  }));
  A.get('/planets/:id/defense-advice', wrap((req) => {
    const p = req.player!;
    processPlayer(w, p, now());
    return defenseReport(w, p, ownedPlanet(w, p.id, req.params.id), now());
  }));
  A.get('/planets', wrap((req) => {
    const p = req.player!;
    processPlayer(w, p, now());
    return p.planetIds.map((id) => planetView(w, w.planets[id], now()));
  }));

  // ---------------------------------------------------------------- account
  const bearer = (req: Request) => (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined);
  A.post('/account/password', wrap((req) => {
    if (limited('pw:' + req.player!.id, 8, 60_000)) throw new GameError('Too many attempts, slow down', 429);
    ACC.changePassword(w, req.player!, str(req.body.current, 200), str(req.body.next, 200), bearer(req));
    return { ok: true };
  }));
  A.post('/account/rename', wrap((req) => {
    if (limited('rn:' + req.player!.id, 8, 60_000)) throw new GameError('Too many attempts, slow down', 429);
    ACC.renameAccount(w, req.player!, str(req.body.password, 200), str(req.body.name, 40), now());
    bus.push({ to: '*', type: 'refresh' });
    return meView(w, req.player!, now());
  }));
  A.post('/account/recovery-key', wrap((req) => {
    if (limited('rk:' + req.player!.id, 8, 60_000)) throw new GameError('Too many attempts, slow down', 429);
    return { key: ACC.createRecoveryKey(req.player!, str(req.body.password, 200)) };
  }));
  A.post('/account/delete', wrap((req) => {
    if (limited('del:' + req.player!.id, 5, 60_000)) throw new GameError('Too many attempts, slow down', 429);
    ACC.deleteAccount(w, req.player!, str(req.body.password, 200), str(req.body.confirm, 40));
    return { ok: true };
  }));

  // ---------------------------------------------------------------- social
  A.get('/social', wrap((req) => SOC.socialView(w, req.player!, now())));
  A.post('/social/block', wrap((req) => { SOC.block(w, req.player!, str(req.body.id)); return SOC.socialView(w, req.player!, now()); }));
  A.post('/social/unblock', wrap((req) => { SOC.unblock(req.player!, str(req.body.id)); return SOC.socialView(w, req.player!, now()); }));
  A.post('/social/buddy', wrap((req) => { SOC.addBuddy(w, req.player!, str(req.body.id)); return SOC.socialView(w, req.player!, now()); }));
  A.post('/social/buddy/remove', wrap((req) => { SOC.removeBuddy(req.player!, str(req.body.id)); return SOC.socialView(w, req.player!, now()); }));
  A.post('/social/note', wrap((req) => { SOC.setNote(req.player!, str(req.body.key, 60), str(req.body.text, 500)); return SOC.socialView(w, req.player!, now()); }));
  A.post('/social/bookmark', wrap((req) => { SOC.addBookmark(w, req.player!, str(req.body.name, 30), req.body.coords); return SOC.socialView(w, req.player!, now()); }));
  A.post('/social/bookmark/remove', wrap((req) => { SOC.removeBookmark(req.player!, str(req.body.id)); return SOC.socialView(w, req.player!, now()); }));
  A.post('/presets', wrap((req) => { SOC.savePreset(req.player!, str(req.body.name, 24), req.body.ships || {}); return SOC.socialView(w, req.player!, now()); }));
  A.post('/presets/remove', wrap((req) => { SOC.removePreset(req.player!, str(req.body.id)); return SOC.socialView(w, req.player!, now()); }));
  A.get('/market', wrap((req) => marketView(w, req.player!, now())));
  A.post('/market/offer', wrap((req) => {
    const p = req.player!;
    listOffer(w, p, ownedPlanet(w, p.id, str(req.body.planetId)), { give: str(req.body.give), giveAmount: Number(req.body.giveAmount), want: str(req.body.want), wantAmount: Number(req.body.wantAmount), scope: req.body.scope ? str(req.body.scope) : undefined }, now());
    return marketView(w, p, now());
  }));
  A.post('/market/cancel', wrap((req) => { cancelOffer(w, req.player!, str(req.body.id), now()); return marketView(w, req.player!, now()); }));
  A.post('/market/buy', wrap((req) => {
    const p = req.player!;
    const r = buyOffer(w, p, ownedPlanet(w, p.id, str(req.body.planetId)), str(req.body.id), now());
    return { ...r, market: marketView(w, p, now()) };
  }));
  A.get('/shop', wrap((req) => shopView(req.player!)));
  A.post('/shop/buy', wrap((req) => {
    const p = req.player!;
    const result = buyItem(w, p, ownedPlanet(w, p.id, str(req.body.planetId)), str(req.body.id), now());
    return { result, credits: Math.floor(p.credits) };
  }));
  A.get('/admin/player/:id', wrap((req) => {
    ACC.requireAdmin(req.player!);
    const t = w.players[req.params.id];
    if (!t) throw new GameError('No such player', 404);
    const { salt, hash, recovery, ...safe } = t as unknown as Record<string, unknown>;
    void salt; void hash; void recovery;
    return { player: safe, planets: t.planetIds.map((id) => w.planets[id]), movements: Object.values(w.movements).filter((m) => m.ownerId === t.id) };
  }));
  A.get('/automation', wrap((req) => AUTO.automationView(w, req.player!)));
  A.post('/automation/orders', wrap((req) => { AUTO.saveOrder(req.player!, str(req.body.name, 30), req.body.steps); return AUTO.automationView(w, req.player!); }));
  A.post('/automation/orders/remove', wrap((req) => { AUTO.removeOrder(req.player!, str(req.body.id)); return AUTO.automationView(w, req.player!); }));
  A.post('/automation/start', wrap((req) => {
    const p = req.player!;
    AUTO.startPlan(w, p, ownedPlanet(w, p.id, str(req.body.planetId)), { orderId: req.body.orderId ? str(req.body.orderId) : undefined, template: req.body.template ? str(req.body.template) : undefined }, now());
    return AUTO.automationView(w, p);
  }));
  A.post('/automation/stop', wrap((req) => { const p = req.player!; AUTO.stopPlan(p, ownedPlanet(w, p.id, str(req.body.planetId)), now()); return AUTO.automationView(w, p); }));
  A.post('/automation/rules', wrap((req) => { AUTO.setRules(req.player!, req.body || {}); return AUTO.automationView(w, req.player!); }));
  A.get('/contracts', wrap((req) => contractsView(w, req.player!, now())));
  A.post('/contracts/claim', wrap((req) => {
    const r = claimContract(w, req.player!, str(req.body.id), now());
    return { ...r, view: contractsView(w, req.player!, now()), credits_total: Math.floor(req.player!.credits) };
  }));
  A.get('/sectors', wrap((req) => sectorsView(w, req.player!.allianceId)));
  A.get('/invasion', wrap((req) => invasionView(w, req.player!.id, now())));
  A.post('/admin/invasion/start', wrap((req) => {
    ACC.requireAdmin(req.player!);
    const mins = req.body.delayMinutes === undefined ? 10 : Math.max(0, Math.min(72 * 60, Number(req.body.delayMinutes) || 0));
    announceInvasion(w, now(), mins * 60_000);
    audit(w, req.player!, 'start invasion', now(), null, `rift opens in ${mins} min`);
    return invasionView(w, req.player!.id, now());
  }));
  A.post('/admin/invasion/end', wrap((req) => {
    ACC.requireAdmin(req.player!);
    if (!w.invasion) throw new GameError('There is no invasion');
    finishInvasion(w, now(), 'lost');
    audit(w, req.player!, 'end invasion', now());
    return invasionView(w, req.player!.id, now());
  }));
  A.get('/push', wrap((req) => pushView(w, req.player!)));
  A.post('/push/subscribe', wrap((req) => {
    if (limited('pushsub:' + req.player!.id, 10, 60_000)) throw new GameError('Slow down', 429);
    addSubscription(req.player!, req.body.subscription, str(req.body.label, 60), now());
    return pushView(w, req.player!);
  }));
  A.post('/push/unsubscribe', wrap((req) => { removeSubscription(req.player!, str(req.body.endpoint, 600)); return pushView(w, req.player!); }));
  A.post('/push/test', wrap(async (req) => {
    const p = req.player!;
    if (limited('pushtest:' + p.id, 5, 60_000)) throw new GameError('Slow down', 429);
    if (!p.pushSubs?.length) throw new GameError('No device is subscribed yet');
    return pushToPlayer(w, p, { title: 'Zgame', body: 'Push notifications work on this device.', tag: 'test' });
  }));
  A.get('/spy-archive', wrap((req) => SOC.spyArchiveView(w, req.player!)));
  A.post('/report', wrap((req) => { SOC.reportPlayer(w, req.player!, str(req.body.id), str(req.body.reason, 300), now()); return { ok: true }; }));

  // ---------------------------------------------------------------- admin
  A.get('/season', wrap(() => seasonView(w, now())));
  A.post('/admin/season/end', wrap((req) => { ACC.requireAdmin(req.player!); audit(w, req.player!, 'end season', now()); endSeason(w, now(), 'admin'); return seasonView(w, now()); }));
  A.post('/admin/season/reset', wrap((req) => { ACC.requireAdmin(req.player!); if (!w.season?.ended) throw new GameError('End the season first'); audit(w, req.player!, 'reset universe', now()); resetSeason(w, now()); return seasonView(w, now()); }));
  A.get('/admin/health', wrap((req) => { ACC.requireAdmin(req.player!); return healthView(w, now()); }));
  A.get('/admin/reports', wrap((req) => { ACC.requireAdmin(req.player!); return (w.reports ?? []).filter((r) => !r.resolved).sort((x, y) => y.at - x.at); }));
  A.post('/admin/reports/resolve', wrap((req) => { ACC.requireAdmin(req.player!); SOC.resolveReport(w, str(req.body.id)); audit(w, req.player!, 'resolve report', now(), null, str(req.body.id)); return { ok: true }; }));
  const admin = (req: Request) => ACC.requireAdmin(req.player!);
  A.get('/admin/overview', wrap((req) => { admin(req); return ACC.adminOverview(w, now(), (p) => playerPoints(w, p).total); }));
  A.post('/admin/ban', wrap((req) => { admin(req); ACC.ban(w, str(req.body.id), req.body.hours ? Number(req.body.hours) : null, str(req.body.reason), now()); audit(w, req.player!, 'ban', now(), w.players[str(req.body.id)], `${req.body.hours ? Number(req.body.hours) + ' h' : 'permanent'}: ${str(req.body.reason)}`); return { ok: true }; }));
  A.post('/admin/unban', wrap((req) => { admin(req); ACC.unban(w, str(req.body.id)); audit(w, req.player!, 'unban', now(), w.players[str(req.body.id)]); return { ok: true }; }));
  A.post('/admin/mute', wrap((req) => { admin(req); ACC.mute(w, str(req.body.id), req.body.hours ? Number(req.body.hours) : null, str(req.body.reason), now()); audit(w, req.player!, 'mute', now(), w.players[str(req.body.id)], `${req.body.hours ? Number(req.body.hours) + ' h' : 'permanent'}: ${str(req.body.reason)}`); return { ok: true }; }));
  A.post('/admin/unmute', wrap((req) => { admin(req); ACC.unmute(w, str(req.body.id)); audit(w, req.player!, 'unmute', now(), w.players[str(req.body.id)]); return { ok: true }; }));
  A.post('/admin/announce', wrap((req) => { admin(req); ACC.announce(w, str(req.body.text, 500)); audit(w, req.player!, 'announce', now(), null, str(req.body.text, 500)); return { ok: true }; }));
  A.get('/admin/audit', wrap((req) => { admin(req); return auditView(w, Number(req.query.limit) || 100); }));
  A.get('/admin/stats', wrap((req) => { admin(req); return statsView(w, Number(req.query.days) || 14); }));
  A.get('/admin/schedule', wrap((req) => { admin(req); return w.scheduledAnnouncements ?? []; }));
  A.post('/admin/schedule', wrap((req) => { admin(req); scheduleAnnouncement(w, req.player!, str(req.body.text, 500), Number(req.body.minutes), Number(req.body.repeatHours) || 0, now()); return w.scheduledAnnouncements ?? []; }));
  A.post('/admin/schedule/cancel', wrap((req) => { admin(req); cancelScheduled(w, req.player!, str(req.body.id), now()); return w.scheduledAnnouncements ?? []; }));
  A.post('/admin/raid', wrap((req) => {
    admin(req);
    const t = w.players[str(req.body.id)];
    if (!t || t.npc) throw new GameError('No such commander', 404);
    audit(w, req.player!, 'raid', now(), t);
    return { sent: !!spawnRaid(w, now(), Math.random, { targetPlayerId: t.id }) };
  }));
  A.post('/admin/gift', wrap((req) => {
    admin(req);
    const t = w.players[str(req.body.id)];
    if (!t || t.npc) throw new GameError('No such commander', 404);
    const home = w.planets[t.planetIds[0]];
    for (const k of ['metal', 'crystal', 'deuterium'] as const) home.resources[k] += Math.max(0, Math.min(1e12, Math.floor(Number(req.body[k]) || 0)));
    audit(w, req.player!, 'gift', now(), t, `${Math.floor(Number(req.body.metal) || 0)} metal, ${Math.floor(Number(req.body.crystal) || 0)} crystal, ${Math.floor(Number(req.body.deuterium) || 0)} vespene gas`);
    return { ok: true };
  }));
  A.post('/admin/delete', wrap((req) => {
    admin(req);
    const t = w.players[str(req.body.id)];
    if (!t || t.npc) throw new GameError('No such commander', 404);
    if (ACC.isAdmin(t)) throw new GameError('Admins cannot be removed here', 403);
    audit(w, req.player!, 'remove commander', now(), t);
    ACC.removePlayer(w, t);
    return { ok: true };
  }));

  // ---------------------------------------------------------------- planet actions
  A.post('/planets/:id/build', wrap((req) => {
    const p = req.player!;
    queueBuilding(w, p, ownedPlanet(w, p.id, req.params.id), str(req.body.id) as never, now());
    return planetView(w, w.planets[req.params.id], now());
  }));
  A.post('/planets/:id/demolish', wrap((req) => {
    const p = req.player!;
    startDemolition(w, p, ownedPlanet(w, p.id, req.params.id), str(req.body.id) as never, now());
    return planetView(w, w.planets[req.params.id], now());
  }));
  A.post('/planets/:id/build/cancel', wrap((req) => {
    const p = req.player!;
    cancelBuilding(w, ownedPlanet(w, p.id, req.params.id), now());
    return planetView(w, w.planets[req.params.id], now());
  }));
  A.post('/planets/:id/research', wrap((req) => {
    const p = req.player!;
    queueResearch(w, p, ownedPlanet(w, p.id, req.params.id), str(req.body.id) as never, now());
    return planetView(w, w.planets[req.params.id], now());
  }));
  A.post('/planets/:id/build/unqueue', wrap((req) => {
    unqueueBuilding(ownedPlanet(w, req.player!.id, req.params.id), Number(req.body.index));
    return planetView(w, w.planets[req.params.id], now());
  }));
  A.post('/planets/:id/build/move', wrap((req) => {
    moveQueuedBuilding(ownedPlanet(w, req.player!.id, req.params.id), Number(req.body.index), Number(req.body.dir));
    return planetView(w, w.planets[req.params.id], now());
  }));
  A.post('/research/move', wrap((req) => {
    moveQueuedResearch(req.player!, Number(req.body.index), Number(req.body.dir));
    return { ok: true };
  }));
  A.post('/research/unqueue', wrap((req) => {
    unqueueResearch(w, req.player!, Number(req.body.index));
    return { ok: true };
  }));
  A.post('/research/cancel', wrap((req) => {
    cancelResearch(w, req.player!, now());
    return { ok: true };
  }));
  A.post('/planets/:id/produce', wrap((req) => {
    const p = req.player!;
    queueUnits(w, p, ownedPlanet(w, p.id, req.params.id), str(req.body.id) as never, Number(req.body.count), now());
    return planetView(w, w.planets[req.params.id], now());
  }));
  A.post('/planets/:id/produce/cancel', wrap((req) => {
    const p = req.player!;
    cancelShipyardJob(w, ownedPlanet(w, p.id, req.params.id), Number(req.body.index), now());
    return planetView(w, w.planets[req.params.id], now());
  }));
  A.post('/planets/:id/settings', wrap((req) => {
    const p = req.player!;
    const planet = ownedPlanet(w, p.id, req.params.id);
    processPlayer(w, p, now());
    const allowed = ['metalMine', 'crystalMine', 'deuteriumSynthesizer', 'solarPlant', 'fusionReactor', 'solarSatellite'];
    for (const [k, v] of Object.entries(req.body || {})) {
      if (!allowed.includes(k)) continue;
      planet.settings[k] = Math.min(1, Math.max(0, Math.round(Number(v) * 10) / 10));
    }
    return planetView(w, planet, now());
  }));
  A.post('/planets/:id/role', wrap((req) => {
    const planet = ownedPlanet(w, req.player!.id, req.params.id);
    const role = req.body?.role;
    if (role === null || role === '') delete planet.role;
    else if (isRole(role)) planet.role = role;
    else throw new GameError('Unknown role');
    return planetView(w, planet, now());
  }));
  A.post('/planets/:id/abandon', wrap((req) => {
    abandonPlanet(w, req.player!, ownedPlanet(w, req.player!.id, req.params.id), str(req.body.name, 40), now());
    return { ok: true };
  }));
  A.post('/planets/:id/phalanx', wrap((req) => {
    const b = req.body || {};
    return phalanxScan(w, req.player!, req.params.id, { g: Number(b.to?.g), s: Number(b.to?.s), p: Number(b.to?.p) }, now());
  }));
  A.post('/planets/:id/jump', wrap((req) => jumpGate(w, req.player!, req.params.id, str(req.body.toPlanetId), req.body.ships || {}, now())));
  A.post('/planets/:id/trade', wrap((req) => {
    const p = req.player!;
    const out = tradeResources(w, ownedPlanet(w, p.id, req.params.id), str(req.body.give), str(req.body.get), Number(req.body.amount), now());
    return { out, planet: planetView(w, w.planets[req.params.id], now()) };
  }));
  A.post('/planets/:id/wreck/repair', wrap((req) => {
    const p = req.player!;
    startRepair(w, p, ownedPlanet(w, p.id, req.params.id), now());
    return planetView(w, w.planets[req.params.id], now());
  }));
  A.post('/prefs', wrap((req) => {
    const p = req.player!;
    p.prefs = { ...p.prefs };
    for (const k of ['quietCompletions', 'worldNews'] as const) if (typeof req.body[k] === 'boolean') p.prefs[k] = req.body[k];
    return { quietCompletions: !!p.prefs.quietCompletions, worldNews: !!p.prefs.worldNews };
  }));
  A.post('/planets/:id/forge/start', wrap((req) => {
    const p = req.player!;
    startForge(w, p, ownedPlanet(w, p.id, req.params.id), now());
    return planetView(w, w.planets[req.params.id], now());
  }));
  A.post('/planets/:id/forge/cancel', wrap((req) => {
    const p = req.player!;
    cancelForge(w, p, ownedPlanet(w, p.id, req.params.id));
    return planetView(w, w.planets[req.params.id], now());
  }));
  A.post('/planets/:id/rename', wrap((req) => {
    const planet = ownedPlanet(w, req.player!.id, req.params.id);
    const name = str(req.body.name, 24).trim();
    if (name.length < 2) throw new GameError('Name too short');
    planet.name = name;
    return planetView(w, planet, now());
  }));

  // ---------------------------------------------------------------- fleets
  A.get('/fleets', wrap((req) => fleetsView(w, req.player!)));
  A.post('/empire/gather', wrap((req) => {
    const p = req.player!;
    if (limited('gather:' + p.id, 10, 60_000)) throw new GameError('Slow down', 429);
    const r = gatherResources(w, p, str(req.body.toPlanetId), Number(req.body.percent), Array.isArray(req.body.resources) ? req.body.resources.map(String) : [], now());
    bus.push({ to: p.id, type: 'refresh' });
    return r;
  }));
  A.post('/fleets/plan', wrap((req) => {
    const p = req.player!;
    const planet = ownedPlanet(w, p.id, str(req.body.fromPlanetId));
    const to = { g: Number(req.body.to?.g), s: Number(req.body.to?.s), p: Number(req.body.to?.p) };
    if (!inBounds(w, to, true)) throw new GameError('Invalid destination');
    const ships = req.body.ships || {};
    return { ...flightPlan(w, p, ships, planet.coords, to, Number(req.body.speedPct) || 100), capacity: cargoFor(p, ships), recycleCapacity: (Number(ships.recycler) || 0) * UNITS.recycler.cargo };
  }));
  A.post('/fleets/send', wrap((req) => {
    const p = req.player!;
    const b = req.body || {};
    const m = sendFleet(w, p, {
      fromPlanetId: str(b.fromPlanetId), to: { g: Number(b.to?.g), s: Number(b.to?.s), p: Number(b.to?.p) },
      ships: b.ships || {}, mission: str(b.mission) as never, speedPct: Number(b.speedPct) || 100, cargo: b.cargo || {}, holdHours: Number(b.holdHours) || 1, toMoon: !!b.toMoon, joinFleetId: b.joinFleetId ? str(b.joinFleetId) : undefined,
    }, now());
    return { id: m.id, arriveAt: m.arriveAt };
  }));
  A.post('/fleets/missile', wrap((req) => {
    const b = req.body || {};
    const m = launchMissiles(w, req.player!, str(b.fromPlanetId), { g: Number(b.to?.g), s: Number(b.to?.s), p: Number(b.to?.p) }, Number(b.count), now());
    return { id: m.id, arriveAt: m.arriveAt };
  }));
  A.post('/fleets/:id/recall', wrap((req) => {
    recallFleet(w, req.player!, req.params.id, now());
    return { ok: true };
  }));

  // ---------------------------------------------------------------- galaxy & highscore
  A.get('/outposts', wrap(() => outpostList(w)));
  A.get('/galaxy/:g/:s', wrap((req) => {
    const g = Number(req.params.g), s = Number(req.params.s);
    if (!inBounds(w, { g, s, p: 1 })) throw new GameError('Out of bounds');
    return { g, s, slots: galaxyView(w, req.player!, g, s, now()), sector: sectorOf(w, g, s, req.player!.allianceId) };
  }));
  A.get('/search/players', wrap((req) => {
    if (limited('psearch:' + req.player!.id, 90, 60_000)) throw new GameError('Searching too fast, wait a moment', 429);
    return searchPlayers(w, typeof req.query.q === 'string' ? req.query.q.slice(0, 40) : '');
  }));
  A.get('/players/names', wrap(() => playerNames(w)));
  A.get('/players/:id', wrap((req) => profileView(w, req.params.id, now())));
  A.get('/highscore', wrap((req) => {
    const category = typeof req.query.cat === 'string' ? req.query.cat : 'total';
    refreshStandingDay(w, now());
    const players = categoryRows(w, category).map((r) => ({ ...r, change: standingChange(w, category, r.id, r.value, r.rank) })); // cached for 15 s: recomputing everyone's points per request would let a few clients keep the server busy
    const byId = new Map(players.map((r) => [r.id, r.value]));
    const alliances = Object.values(w.alliances).map((a) => ({
      id: a.id, tag: a.tag, name: a.name, members: a.members.length,
      total: a.members.reduce((s, m) => s + (byId.get(m.playerId) ?? 0), 0), sectors: territoryCount(w, a.id),
    })).sort((a, b) => b.total - a.total).map((a, i) => ({ rank: i + 1, ...a }));
    return { players, alliances, category, since: w.standingDay?.at ?? null, categories: SCORE_CATEGORIES.map((c) => ({ id: c.id, label: c.label, unit: c.unit })) };
  }));
  A.get('/command', wrap((req) => commandView(w, req.player!)));
  A.post('/officers/hire', wrap((req) => { hireOfficer(w, req.player!, str(req.body.id)); return commandView(w, req.player!); }));
  A.post('/vacation/start', wrap((req) => { startVacation(w, req.player!, now()); return meView(w, req.player!, now()); }));
  A.post('/vacation/end', wrap((req) => { endVacation(w, req.player!, now()); return meView(w, req.player!, now()); }));
  const notifyView = (p: Player) => ({ discord: mask(p.notify.discord), ntfy: mask(p.notify.ntfy), events: p.notify.events, onlyWhenAway: p.notify.onlyWhenAway });
  A.get('/notify', wrap((req) => notifyView(req.player!)));
  A.post('/notify', wrap((req) => {
    const p = req.player!, b = req.body || {}, n = p.notify;
    if ('discord' in b) n.discord = validateTarget('discord', b.discord);
    if ('ntfy' in b) n.ntfy = validateTarget('ntfy', b.ntfy);
    if (typeof b.onlyWhenAway === 'boolean') n.onlyWhenAway = b.onlyWhenAway;
    if (b.events && typeof b.events === 'object') for (const c of CATEGORIES) if (typeof b.events[c] === 'boolean') n.events[c] = b.events[c];
    return notifyView(p);
  }));
  A.post('/notify/test', (req, res, next) => {
    if (limited('ntest:' + req.player!.id, 5, 60_000)) return next(new GameError('Slow down', 429));
    sendTest(w, req.player!).then((results) => res.json({ results })).catch(next);
  });
  A.get('/history', wrap((req) => req.player!.history));
  A.post('/tribute/:id', wrap((req) => {
    const p = req.player!;
    const answer = str(req.body.answer) === 'pay' ? 'pay' : 'refuse';
    answerTribute(w, p, req.params.id, answer, now(), (npcId) => { spawnRaid(w, now(), Math.random, { targetPlayerId: p.id, sourceNpcId: npcId }); });
    return commandView(w, p);
  }));
  A.post('/class/choose', wrap((req) => { chooseClass(req.player!, str(req.body.id)); return commandView(w, req.player!); }));
  A.post('/faction/join', wrap((req) => { joinFaction(req.player!, str(req.body.id)); return commandView(w, req.player!); }));
  A.post('/faction/leave', wrap((req) => { leaveFaction(req.player!); return commandView(w, req.player!); }));
  A.get('/defs', wrap(() => ({ BUILDINGS, TECHS, UNITS })));

  // ---------------------------------------------------------------- messages & chat
  A.get('/messages', wrap((req) => w.messages.filter((m) => m.to === req.player!.id).sort((a, b) => b.at - a.at)));
  A.post('/messages/read', wrap((req) => {
    for (const m of w.messages) if (m.to === req.player!.id && (!req.body.id || m.id === req.body.id)) m.read = true;
    return { ok: true };
  }));
  A.delete('/messages/:id', wrap((req) => {
    w.messages = w.messages.filter((m) => !(m.id === req.params.id && m.to === req.player!.id));
    return { ok: true };
  }));
  A.post('/messages/clear', wrap((req) => {
    w.messages = w.messages.filter((m) => m.to !== req.player!.id);
    return { ok: true };
  }));
  A.post('/planets/:id/share', wrap((req) => {
    const p = req.player!;
    if (limited('share:' + p.id, 20, 3_600_000)) throw new GameError('You are sharing too many links', 429);
    const planet = ownedPlanet(w, p.id, req.params.id);
    return { id: publishCard(w, planetCard(p, planet, !!req.body?.ships), `${planet.name} of ${p.username}`, now()) };
  }));
  A.post('/planets/:id/share-order', wrap((req) => {
    const p = req.player!;
    if (limited('share:' + p.id, 20, 3_600_000)) throw new GameError('You are sharing too many links', 429);
    const card = orderCard(p, ownedPlanet(w, p.id, req.params.id));
    if (!card.steps.length) throw new GameError('Nothing is queued to share');
    return { id: publishCard(w, card, `Build order of ${p.username}`, now()) };
  }));
  A.post('/messages/:id/share', wrap((req) => {
    const m = w.messages.find((x) => x.id === req.params.id && x.to === req.player!.id);
    if (!m || (m.kind !== 'combat' && m.kind !== 'raid') || !m.data || !(m.data as { attackers?: unknown }).attackers) throw new GameError('Only battle reports can be shared');
    if (limited('share:' + req.player!.id, 20, 3_600_000)) throw new GameError('You are sharing too many reports', 429);
    const shared = (w.shared ||= {});
    const id = 'r' + uid(5);
    shared[id] = { id, at: now(), subject: m.subject, report: m.data };
    const ids = Object.keys(shared);
    if (ids.length > 500) for (const old of ids.sort((x, y) => shared[x].at - shared[y].at).slice(0, ids.length - 500)) delete shared[old];
    return { id };
  }));
  A.post('/messages/send', wrap((req) => {
    const p = req.player!;
    ACC.assertNotMuted(p, now());
    if (limited('msg:' + p.id, 20, 60_000)) throw new GameError('You are sending messages too fast', 429);
    const to = Object.values(w.players).find((x) => !x.npc && x.username.toLowerCase() === str(req.body.to, 40).toLowerCase());
    if (!to) throw new GameError('No such player', 404);
    const text = str(req.body.text, 1000).trim();
    if (!text) throw new GameError('Empty message');
    if (!SOC.blockedBy(w, p.id, to.id)) notifyPlayer(w, to.id, 'player', str(req.body.subject, 60).trim() || `Message from ${p.username}`, text, undefined, p.username);
    return { ok: true };
  }));
  A.get('/chat', wrap((req) => {
    const p = req.player!;
    const ch = req.query.channel === 'alliance' ? 'alliance' : 'global';
    const muted = new Set((p.blocked ?? []).map((id) => w.players[id]?.username));
    return w.chat.filter((c) => c.channel === ch && (ch === 'global' || c.allianceId === p.allianceId) && !muted.has(c.from)).slice(-100);
  }));
  A.post('/chat', wrap((req) => {
    const p = req.player!;
    ACC.assertNotMuted(p, now());
    if (limited('chat:' + p.id, 15, 15_000)) throw new GameError('Slow down', 429);
    const text = str(req.body.text, 300).trim();
    if (!text) throw new GameError('Empty message');
    const channel = req.body.channel === 'alliance' ? 'alliance' : 'global';
    if (channel === 'alliance' && !p.allianceId) throw new GameError('You are not in an alliance');
    const msg = { id: uid(), channel, allianceId: channel === 'alliance' ? p.allianceId! : undefined, from: p.username, text, at: now() } as const;
    w.chat.push({ ...msg });
    if (w.chat.length > 500) w.chat.splice(0, w.chat.length - 500);
    if (channel === 'global') bus.push({ to: '*', type: 'chat', data: msg });
    else for (const m of w.alliances[p.allianceId!].members) bus.push({ to: m.playerId, type: 'chat', data: msg });
    return { ok: true };
  }));

  // ---------------------------------------------------------------- alliances
  A.get('/alliances', wrap(() => recruitingList(w, now())));
  A.get('/alliance', wrap((req) => {
    const p = req.player!;
    const a = p.allianceId ? w.alliances[p.allianceId] : null;
    return a ? allianceView(w, a, p) : null;
  }));
  const mine = (req: Request) => allianceView(w, w.alliances[req.player!.allianceId!], req.player!);
  A.post('/alliance/create', wrap((req) => { AL.createAlliance(w, req.player!, str(req.body.tag, 10), str(req.body.name, 40)); return mine(req); }));
  A.post('/alliance/join', wrap((req) => { AL.joinAlliance(w, req.player!, str(req.body.id), str(req.body.text, 300)); return { ok: true }; }));
  A.post('/alliance/leave', wrap((req) => { AL.leaveAlliance(w, req.player!); return { ok: true }; }));
  A.post('/alliance/review', wrap((req) => { AL.reviewApplication(w, req.player!, str(req.body.playerId), !!req.body.accept); return mine(req); }));
  A.post('/alliance/kick', wrap((req) => { AL.kickMember(w, req.player!, str(req.body.playerId)); return mine(req); }));
  A.post('/alliance/role', wrap((req) => { AL.setRole(w, req.player!, str(req.body.playerId), str(req.body.role) as never); return mine(req); }));
  A.post('/alliance/update', wrap((req) => { AL.updateAlliance(w, req.player!, { description: req.body.description, open: req.body.open }); return mine(req); }));
  A.post('/alliance/disband', wrap((req) => { AL.disbandAlliance(w, req.player!); return { ok: true }; }));
  A.post('/alliance/donate', wrap((req) => { AL.donate(w, req.player!, str(req.body.planetId), req.body.amount || {}, now()); return mine(req); }));
  A.post('/alliance/withdraw', wrap((req) => { AL.withdraw(w, req.player!, str(req.body.playerId), req.body.amount || {}, now()); return mine(req); }));
  A.post('/alliance/rank', wrap((req) => { AL.createRank(w, req.player!, str(req.body.name, 30), req.body.perms); return mine(req); }));
  A.post('/alliance/rank/update', wrap((req) => { AL.updateRank(w, req.player!, str(req.body.id), { name: req.body.name, perms: req.body.perms }); return mine(req); }));
  A.post('/alliance/rank/delete', wrap((req) => { AL.deleteRank(w, req.player!, str(req.body.id)); return mine(req); }));
  A.post('/alliance/rank/assign', wrap((req) => { AL.assignRank(w, req.player!, str(req.body.playerId), req.body.rankId ? str(req.body.rankId) : null); return mine(req); }));
  A.post('/alliance/bulletin', wrap((req) => { AL.postBulletin(w, req.player!, str(req.body.text, 600), !!req.body.pinned); return mine(req); }));
  A.post('/alliance/bulletin/remove', wrap((req) => { AL.removeBulletin(w, req.player!, str(req.body.id)); return mine(req); }));
  A.post('/alliance/bulletin/pin', wrap((req) => { AL.pinBulletin(w, req.player!, str(req.body.id), !!req.body.pinned); return mine(req); }));
  A.post('/alliance/message', wrap((req) => {
    const p = req.player!;
    ACC.assertNotMuted(p, now());
    if (limited('amsg:' + p.id, 5, 60_000)) throw new GameError('You are sending messages too fast', 429);
    return { sent: AL.massMessage(w, p, str(req.body.subject, 60), str(req.body.text, 1000)) };
  }));
  A.get('/alliance/operations', wrap((req) => operationsView(w, req.player!)));
  A.post('/alliance/operations', wrap((req) => {
    const b = req.body || {};
    createOperation(w, req.player!, { kind: str(b.kind), name: str(b.name, 40), note: str(b.note, 300), target: { g: Number(b.target?.g), s: Number(b.target?.s), p: Number(b.target?.p) }, toMoon: !!b.toMoon, arriveAt: b.arriveAt == null ? null : Number(b.arriveAt) }, now());
    return operationsView(w, req.player!);
  }));
  A.post('/alliance/operations/signup', wrap((req) => { signUp(w, req.player!, str(req.body.id), str(req.body.planetId), str(req.body.mode), now()); return operationsView(w, req.player!); }));
  A.post('/alliance/operations/withdraw', wrap((req) => { withdraw(w, req.player!, str(req.body.id)); return operationsView(w, req.player!); }));
  A.post('/alliance/operations/close', wrap((req) => { closeOperation(w, req.player!, str(req.body.id)); return operationsView(w, req.player!); }));
  A.post('/alliance/help', wrap((req) => { AL.requestHelp(w, req.player!, str(req.body.fleetId), now()); return { ok: true }; }));
  A.post('/alliance/pact', wrap((req) => { AL.proposePact(w, req.player!, str(req.body.id)); return mine(req); }));
  A.post('/alliance/pact/respond', wrap((req) => { AL.respondPact(w, req.player!, str(req.body.id), !!req.body.accept); return mine(req); }));
  A.post('/alliance/war', wrap((req) => { AL.declareWar(w, req.player!, str(req.body.id)); return mine(req); }));
  A.post('/alliance/treaty/end', wrap((req) => { AL.endTreaty(w, req.player!, str(req.body.id)); return mine(req); }));
  A.post('/alliance/upgrade', wrap((req) => { AL.buyUpgrade(w, req.player!, str(req.body.key)); return mine(req); }));

  app.use('/api', A);
  app.use('/api', (_req, _res, next) => next(new GameError('Not found', 404)));

  const dir = opts.staticDir;
  if (dir && existsSync(join(dir, 'index.html'))) {
    // the build names every file in /assets after its content, so a file there can be kept for a year
    app.use(express.static(dir, { setHeaders: (res, path) => { if (/[\\/]assets[\\/]/.test(path)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); } }));
    app.get('*', (_req, res) => res.sendFile(join(dir, 'index.html')));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof GameError) return res.status(err.status).json({ error: err.message });
    const status = (err as { status?: number })?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) return res.status(status).json({ error: 'Bad request' });
    console.error(err);
    recordError(`${_req.method} ${_req.path}: ${(err as Error)?.message ?? err}`);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
