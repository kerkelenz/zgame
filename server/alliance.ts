import { ALLIANCE_UPGRADES } from '../shared/data';
import { addRes, canAfford, subRes, totalRes } from '../shared/formulas';
import type { Res } from '../shared/types';
import { updatePlanet } from './economy';
import { bus } from './bus';
import { notifyPlayer } from './messages';
import { GameError, uid, type Alliance, type Player, type World } from './world';

const MAX_MEMBERS = 50;

const log = (a: Alliance, text: string) => {
  a.log.push({ at: Date.now(), text });
  if (a.log.length > 100) a.log.shift();
};

function requireAlliance(w: World, p: Player): Alliance {
  const a = p.allianceId ? w.alliances[p.allianceId] : null;
  if (!a) throw new GameError('You are not in an alliance');
  return a;
}
const roleOf = (a: Alliance, id: string) => a.members.find((m) => m.playerId === id)?.role;
const isLeader = (a: Alliance, id: string) => roleOf(a, id) === 'founder';
const isOfficer = (a: Alliance, id: string) => roleOf(a, id) === 'founder' || roleOf(a, id) === 'officer';

export function createAlliance(w: World, p: Player, tag: string, name: string): Alliance {
  if (p.allianceId) throw new GameError('Leave your current alliance first');
  tag = (tag || '').trim().toUpperCase();
  name = (name || '').trim();
  if (!/^[A-Z0-9]{3,8}$/.test(tag)) throw new GameError('Tag must be 3-8 letters/numbers');
  if (name.length < 3 || name.length > 30) throw new GameError('Name must be 3-30 characters');
  if (Object.values(w.alliances).some((a) => a.tag === tag || a.name.toLowerCase() === name.toLowerCase())) throw new GameError('Tag or name already taken');
  const a: Alliance = {
    id: uid(), tag, name, description: '', open: true, founderId: p.id,
    members: [{ playerId: p.id, role: 'founder', joinedAt: Date.now() }],
    applications: [], bank: { metal: 0, crystal: 0, deuterium: 0 },
    upgrades: { production: 0, research: 0, logistics: 0 }, log: [], createdAt: Date.now(),
  };
  log(a, `${p.username} founded the alliance.`);
  w.alliances[a.id] = a;
  p.allianceId = a.id;
  return a;
}

function addMember(w: World, a: Alliance, p: Player) {
  if (a.members.length >= MAX_MEMBERS) throw new GameError('Alliance is full');
  a.members.push({ playerId: p.id, role: 'member', joinedAt: Date.now() });
  a.applications = a.applications.filter((x) => x.playerId !== p.id);
  p.allianceId = a.id;
  log(a, `${p.username} joined.`);
  for (const m of a.members) if (m.playerId !== p.id) notifyPlayer(w, m.playerId, 'alliance', 'New member', `${p.username} joined ${a.name}.`);
}

export function joinAlliance(w: World, p: Player, allianceId: string, text = '') {
  if (p.allianceId) throw new GameError('Leave your current alliance first');
  const a = w.alliances[allianceId];
  if (!a) throw new GameError('Unknown alliance', 404);
  if (a.open) return addMember(w, a, p);
  if (a.applications.some((x) => x.playerId === p.id)) throw new GameError('You already applied');
  a.applications.push({ playerId: p.id, text: text.slice(0, 300), at: Date.now() });
  for (const m of a.members) if (isOfficer(a, m.playerId)) notifyPlayer(w, m.playerId, 'alliance', 'New application', `${p.username} wants to join ${a.name}.`);
}

export function reviewApplication(w: World, actor: Player, applicantId: string, accept: boolean) {
  const a = requireAlliance(w, actor);
  if (!isOfficer(a, actor.id)) throw new GameError('Officers only', 403);
  const app = a.applications.find((x) => x.playerId === applicantId);
  if (!app) throw new GameError('No such application');
  const applicant = w.players[applicantId];
  a.applications = a.applications.filter((x) => x.playerId !== applicantId);
  if (accept && applicant && !applicant.allianceId) addMember(w, a, applicant);
  else if (applicant) notifyPlayer(w, applicantId, 'alliance', 'Application declined', `${a.name} declined your application.`);
}

/** Fleets stationed with allies go home when the alliance bond ends (in either direction). */
export function releaseHolds(w: World, playerId: string) {
  const mine = new Set(w.players[playerId]?.planetIds ?? []);
  for (const m of Object.values(w.movements)) {
    if (m.mission !== 'hold' || m.phase !== 'holding') continue;
    const host = Object.values(w.planets).find((pl) => !!pl.isMoon === !!m.toMoon && pl.coords.g === m.to.g && pl.coords.s === m.to.s && pl.coords.p === m.to.p);
    if (m.ownerId === playerId || (host && mine.has(host.id))) {
      m.phase = 'returning';
      m.returnAt = Date.now() + m.flightMs;
      if (m.ownerId) {
        notifyPlayer(w, m.ownerId, 'alliance', 'Fleet recalled', 'Your stationed fleet is returning home because the alliance bond ended.');
        bus.push({ to: m.ownerId, type: 'refresh' });
      }
    }
  }
}

export function leaveAlliance(w: World, p: Player) {
  const a = requireAlliance(w, p);
  if (isLeader(a, p.id) && a.members.length > 1) throw new GameError('Transfer leadership before leaving');
  releaseHolds(w, p.id);
  a.members = a.members.filter((m) => m.playerId !== p.id);
  p.allianceId = null;
  if (!a.members.length) delete w.alliances[a.id];
  else log(a, `${p.username} left.`);
}

export function kickMember(w: World, actor: Player, targetId: string) {
  const a = requireAlliance(w, actor);
  if (!isOfficer(a, actor.id)) throw new GameError('Officers only', 403);
  const t = w.players[targetId];
  if (!t || t.allianceId !== a.id) throw new GameError('Not a member');
  if (targetId === actor.id) throw new GameError('Use leave instead');
  if (roleOf(a, targetId) === 'founder' || (roleOf(a, targetId) === 'officer' && !isLeader(a, actor.id))) throw new GameError('Insufficient rank', 403);
  releaseHolds(w, targetId);
  a.members = a.members.filter((m) => m.playerId !== targetId);
  t.allianceId = null;
  log(a, `${t.username} was removed by ${actor.username}.`);
  notifyPlayer(w, targetId, 'alliance', 'Removed from alliance', `You were removed from ${a.name}.`);
}

export function setRole(w: World, actor: Player, targetId: string, role: 'officer' | 'member' | 'founder') {
  const a = requireAlliance(w, actor);
  if (!isLeader(a, actor.id)) throw new GameError('Only the founder can do that', 403);
  const m = a.members.find((x) => x.playerId === targetId);
  if (!m || targetId === actor.id) throw new GameError('Invalid target');
  if (role === 'founder') {
    a.members.find((x) => x.playerId === actor.id)!.role = 'officer';
    a.founderId = targetId;
  }
  m.role = role;
  log(a, `${w.players[targetId].username} is now ${role}.`);
}

export function updateAlliance(w: World, actor: Player, patch: { description?: string; open?: boolean }) {
  const a = requireAlliance(w, actor);
  if (!isOfficer(a, actor.id)) throw new GameError('Officers only', 403);
  if (typeof patch.description === 'string') a.description = patch.description.slice(0, 500);
  if (typeof patch.open === 'boolean') a.open = patch.open;
}

export function disbandAlliance(w: World, actor: Player) {
  const a = requireAlliance(w, actor);
  if (!isLeader(a, actor.id)) throw new GameError('Only the founder can disband', 403);
  for (const m of a.members) releaseHolds(w, m.playerId);
  for (const m of a.members) { const pl = w.players[m.playerId]; if (pl) pl.allianceId = null; }
  delete w.alliances[a.id];
}

export function donate(w: World, p: Player, planetId: string, amount: Partial<Res>, now: number) {
  const a = requireAlliance(w, p);
  const planet = w.planets[planetId];
  if (!planet || planet.ownerId !== p.id) throw new GameError('Not your planet', 403);
  updatePlanet(w, planet, now);
  const give: Res = { metal: Math.max(0, Math.floor(amount.metal || 0)), crystal: Math.max(0, Math.floor(amount.crystal || 0)), deuterium: Math.max(0, Math.floor(amount.deuterium || 0)) };
  if (!totalRes(give)) throw new GameError('Nothing to donate');
  if (!canAfford(planet.resources, give)) throw new GameError('Not enough resources');
  planet.resources = subRes(planet.resources, give);
  a.bank = addRes(a.bank, give);
  log(a, `${p.username} donated ${give.metal} M / ${give.crystal} C / ${give.deuterium} D.`);
}

export function withdraw(w: World, actor: Player, targetId: string, amount: Partial<Res>, now: number) {
  const a = requireAlliance(w, actor);
  if (!isOfficer(a, actor.id)) throw new GameError('Officers only', 403);
  const t = w.players[targetId];
  if (!t || t.allianceId !== a.id) throw new GameError('Target is not a member');
  const take: Res = { metal: Math.max(0, Math.floor(amount.metal || 0)), crystal: Math.max(0, Math.floor(amount.crystal || 0)), deuterium: Math.max(0, Math.floor(amount.deuterium || 0)) };
  if (!totalRes(take)) throw new GameError('Nothing to withdraw');
  if (!canAfford(a.bank, take)) throw new GameError('The alliance bank does not hold that much');
  const planet = w.planets[t.planetIds[0]];
  updatePlanet(w, planet, now);
  a.bank = subRes(a.bank, take);
  planet.resources = addRes(planet.resources, take);
  log(a, `${actor.username} granted ${take.metal} M / ${take.crystal} C / ${take.deuterium} D to ${t.username}.`);
  notifyPlayer(w, t.id, 'alliance', 'Alliance grant', `${actor.username} sent you ${take.metal} metal, ${take.crystal} crystal, ${take.deuterium} deuterium from the alliance bank.`);
}

export function upgradeCost(key: string, level: number): Res {
  const u = ALLIANCE_UPGRADES[key];
  const k = Math.pow(u.factor, level);
  return { metal: Math.floor(u.base.metal * k), crystal: Math.floor(u.base.crystal * k), deuterium: Math.floor(u.base.deuterium * k) };
}

export function buyUpgrade(w: World, actor: Player, key: string) {
  const a = requireAlliance(w, actor);
  if (!isOfficer(a, actor.id)) throw new GameError('Officers only', 403);
  if (!Object.hasOwn(ALLIANCE_UPGRADES, key)) throw new GameError('Unknown upgrade');
  const level = a.upgrades[key] || 0;
  if (level >= 10) throw new GameError('Maximum level reached');
  const cost = upgradeCost(key, level);
  if (!canAfford(a.bank, cost)) throw new GameError('The alliance bank cannot afford this');
  a.bank = subRes(a.bank, cost);
  a.upgrades[key] = level + 1;
  log(a, `${actor.username} upgraded ${ALLIANCE_UPGRADES[key].name} to level ${level + 1}.`);
  for (const m of a.members) notifyPlayer(w, m.playerId, 'alliance', 'Alliance upgrade', `${ALLIANCE_UPGRADES[key].name} is now level ${level + 1}.`);
}
