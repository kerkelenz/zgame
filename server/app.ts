import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BUILDINGS, TECHS, UNITS } from '../shared/data';
import { bus } from './bus';
import { authenticate, login, register } from './accounts';
import * as AL from './alliance';
import { abandonPlanet, tradeResources, cancelBuilding, cancelResearch, cancelShipyardJob, processPlayer, queueBuilding, queueResearch, queueUnits, unqueueBuilding, unqueueResearch, moveQueuedBuilding, moveQueuedResearch } from './economy';
import { flightPlan, jumpGate, launchMissiles, phalanxScan, recallFleet, sendFleet } from './fleet';
import { colonyCount, galaxyView, inBounds, playerPoints } from './galaxy';
import { notifyPlayer } from './messages';
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
import { recoverAccount } from './account';
import { CATEGORIES, mask, sendTest, validateTarget } from './external';
import { GameError, ownedPlanet, uid, type Player, type World } from './world';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { player?: Player } }
}

const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}

const str = (v: unknown, max = 200) => String(v ?? '').slice(0, max);

export function createApp(w: World, opts: { staticDir?: string; clock?: () => number } = {}) {
  const now = opts.clock ?? Date.now;
  const app = express();
  // behind a reverse proxy, rate limits must key on the real client address
  if (process.env.OGAME_TRUST_PROXY) app.set('trust proxy', process.env.OGAME_TRUST_PROXY === 'true' ? true : Number(process.env.OGAME_TRUST_PROXY) || process.env.OGAME_TRUST_PROXY);
  app.use(express.json({ limit: '100kb' }));

  const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => {
    try {
      const out = fn(req, res);
      if (out !== undefined && !res.headersSent) res.json(out);
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
    const { player, token } = register(w, str(req.body.username, 40), str(req.body.password, 200), now());
    bus.push({ to: '*', type: 'refresh' });
    return { token, id: player.id };
  }));
  app.post('/api/login', wrap((req) => {
    if (limited('login:' + req.ip, 20, 60_000)) throw new GameError('Too many attempts, slow down', 429);
    const { player, token } = login(w, str(req.body.username, 40), str(req.body.password, 200), now());
    return { token, id: player.id };
  }));
  app.post('/api/recover', wrap((req) => {
    if (limited('recover:' + req.ip, 8, 60_000)) throw new GameError('Too many attempts, slow down', 429);
    const p = recoverAccount(w, str(req.body.username, 40), str(req.body.key, 60), str(req.body.password, 200));
    return { ok: true, username: p.username };
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
  A.get('/spy-archive', wrap((req) => SOC.spyArchiveView(w, req.player!)));
  A.post('/report', wrap((req) => { SOC.reportPlayer(w, req.player!, str(req.body.id), str(req.body.reason, 300), now()); return { ok: true }; }));

  // ---------------------------------------------------------------- admin
  A.get('/admin/reports', wrap((req) => { ACC.requireAdmin(req.player!); return (w.reports ?? []).filter((r) => !r.resolved).sort((x, y) => y.at - x.at); }));
  A.post('/admin/reports/resolve', wrap((req) => { ACC.requireAdmin(req.player!); SOC.resolveReport(w, str(req.body.id)); return { ok: true }; }));
  const admin = (req: Request) => ACC.requireAdmin(req.player!);
  A.get('/admin/overview', wrap((req) => { admin(req); return ACC.adminOverview(w, now(), (p) => playerPoints(w, p).total); }));
  A.post('/admin/ban', wrap((req) => { admin(req); ACC.ban(w, str(req.body.id), req.body.hours ? Number(req.body.hours) : null, str(req.body.reason), now()); return { ok: true }; }));
  A.post('/admin/unban', wrap((req) => { admin(req); ACC.unban(w, str(req.body.id)); return { ok: true }; }));
  A.post('/admin/mute', wrap((req) => { admin(req); ACC.mute(w, str(req.body.id), req.body.hours ? Number(req.body.hours) : null, str(req.body.reason), now()); return { ok: true }; }));
  A.post('/admin/unmute', wrap((req) => { admin(req); ACC.unmute(w, str(req.body.id)); return { ok: true }; }));
  A.post('/admin/announce', wrap((req) => { admin(req); ACC.announce(w, str(req.body.text, 500)); return { ok: true }; }));
  A.post('/admin/raid', wrap((req) => {
    admin(req);
    const t = w.players[str(req.body.id)];
    if (!t || t.npc) throw new GameError('No such commander', 404);
    return { sent: !!spawnRaid(w, now(), Math.random, { targetPlayerId: t.id }) };
  }));
  A.post('/admin/gift', wrap((req) => {
    admin(req);
    const t = w.players[str(req.body.id)];
    if (!t || t.npc) throw new GameError('No such commander', 404);
    const home = w.planets[t.planetIds[0]];
    for (const k of ['metal', 'crystal', 'deuterium'] as const) home.resources[k] += Math.max(0, Math.min(1e12, Math.floor(Number(req.body[k]) || 0)));
    return { ok: true };
  }));
  A.post('/admin/delete', wrap((req) => {
    admin(req);
    const t = w.players[str(req.body.id)];
    if (!t || t.npc) throw new GameError('No such commander', 404);
    if (ACC.isAdmin(t)) throw new GameError('Admins cannot be removed here', 403);
    ACC.removePlayer(w, t);
    return { ok: true };
  }));

  // ---------------------------------------------------------------- planet actions
  A.post('/planets/:id/build', wrap((req) => {
    const p = req.player!;
    queueBuilding(w, p, ownedPlanet(w, p.id, req.params.id), str(req.body.id) as never, now());
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
  A.post('/planets/:id/rename', wrap((req) => {
    const planet = ownedPlanet(w, req.player!.id, req.params.id);
    const name = str(req.body.name, 24).trim();
    if (name.length < 2) throw new GameError('Name too short');
    planet.name = name;
    return planetView(w, planet, now());
  }));

  // ---------------------------------------------------------------- fleets
  A.get('/fleets', wrap((req) => fleetsView(w, req.player!)));
  A.post('/fleets/plan', wrap((req) => {
    const p = req.player!;
    const planet = ownedPlanet(w, p.id, str(req.body.fromPlanetId));
    const to = { g: Number(req.body.to?.g), s: Number(req.body.to?.s), p: Number(req.body.to?.p) };
    if (!inBounds(w, to, true)) throw new GameError('Invalid destination');
    return flightPlan(w, p, req.body.ships || {}, planet.coords, to, Number(req.body.speedPct) || 100);
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
  A.get('/galaxy/:g/:s', wrap((req) => {
    const g = Number(req.params.g), s = Number(req.params.s);
    if (!inBounds(w, { g, s, p: 1 })) throw new GameError('Out of bounds');
    return { g, s, slots: galaxyView(w, req.player!, g, s, now()) };
  }));
  A.get('/players/:id', wrap((req) => profileView(w, req.params.id, now())));
  A.get('/highscore', wrap((req) => {
    const category = typeof req.query.cat === 'string' ? req.query.cat : 'total';
    const players = categoryRows(w, category, true);
    const byId = new Map(players.map((r) => [r.id, r.value]));
    const alliances = Object.values(w.alliances).map((a) => ({
      id: a.id, tag: a.tag, name: a.name, members: a.members.length,
      total: a.members.reduce((s, m) => s + (byId.get(m.playerId) ?? 0), 0),
    })).sort((a, b) => b.total - a.total).map((a, i) => ({ rank: i + 1, ...a }));
    return { players, alliances, category, categories: SCORE_CATEGORIES.map((c) => ({ id: c.id, label: c.label, unit: c.unit })) };
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
  A.get('/alliances', wrap(() => Object.values(w.alliances).map((a) => ({
    id: a.id, tag: a.tag, name: a.name, description: a.description, open: a.open, members: a.members.length,
  }))));
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
  A.post('/alliance/pact', wrap((req) => { AL.proposePact(w, req.player!, str(req.body.id)); return mine(req); }));
  A.post('/alliance/pact/respond', wrap((req) => { AL.respondPact(w, req.player!, str(req.body.id), !!req.body.accept); return mine(req); }));
  A.post('/alliance/war', wrap((req) => { AL.declareWar(w, req.player!, str(req.body.id)); return mine(req); }));
  A.post('/alliance/treaty/end', wrap((req) => { AL.endTreaty(w, req.player!, str(req.body.id)); return mine(req); }));
  A.post('/alliance/upgrade', wrap((req) => { AL.buyUpgrade(w, req.player!, str(req.body.key)); return mine(req); }));

  app.use('/api', A);
  app.use('/api', (_req, _res, next) => next(new GameError('Not found', 404)));

  const dir = opts.staticDir;
  if (dir && existsSync(join(dir, 'index.html'))) {
    app.use(express.static(dir));
    app.get('*', (_req, res) => res.sendFile(join(dir, 'index.html')));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof GameError) return res.status(err.status).json({ error: err.message });
    const status = (err as { status?: number })?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) return res.status(status).json({ error: 'Bad request' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
