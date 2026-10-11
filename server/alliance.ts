import { ALLIANCE_UPGRADES } from '../shared/data';
import { addRes, canAfford, subRes, totalRes } from '../shared/formulas';
import type { Res } from '../shared/types';
import { updatePlanet } from './economy';
import { bus } from './bus';
import { notifyPlayer } from './messages';
import { concedeWar, startWar } from './wars';
import { ALLIANCE_PERMS, GameError, uid, type Alliance, type AlliancePerm, type Player, type World } from './world';

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

/** What a member may do: founders everything, ranked members their rank's list, plain officers the full default set. */
export function permsOf(a: Alliance, id: string): AlliancePerm[] {
  const m = a.members.find((x) => x.playerId === id);
  if (!m) return [];
  if (m.role === 'founder') return [...ALLIANCE_PERMS];
  const rank = m.rankId ? a.ranks?.find((r) => r.id === m.rankId) : undefined;
  if (rank) return rank.perms;
  return m.role === 'officer' ? [...ALLIANCE_PERMS] : [];
}
const can = (a: Alliance, id: string, perm: AlliancePerm) => permsOf(a, id).includes(perm);
function need(a: Alliance, p: Player, perm: AlliancePerm) {
  if (!can(a, p.id, perm)) throw new GameError('Your rank does not allow that', 403);
}
/** members with any standing (officer or a ranked member with permissions) */
const elevated = (a: Alliance, id: string) => roleOf(a, id) === 'founder' || roleOf(a, id) === 'officer' || permsOf(a, id).length > 0;

/** Remove an alliance and every treaty or offer that mentions it. */
export function dropAlliance(w: World, a: Alliance) {
  delete w.alliances[a.id];
  for (const [k, h] of Object.entries(w.sectors ?? {})) if (h.allianceId === a.id) delete w.sectors![k]; // the alliance itself is gone, so no count to refresh
  for (const o of Object.values(w.alliances)) {
    if (o.diplomacy) delete o.diplomacy[a.id];
    if (o.proposals) o.proposals = o.proposals.filter((x) => x.fromId !== a.id);
  }
}

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
    upgrades: { production: 0, research: 0, logistics: 0, command: 0 }, log: [], createdAt: Date.now(),
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
  for (const m of a.members) if (can(a, m.playerId, 'applications')) notifyPlayer(w, m.playerId, 'alliance', 'New application', `${p.username} wants to join ${a.name}.`);
}

export function reviewApplication(w: World, actor: Player, applicantId: string, accept: boolean) {
  const a = requireAlliance(w, actor);
  need(a, actor, 'applications');
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
  if (!a.members.length) dropAlliance(w, a);
  else log(a, `${p.username} left.`);
}

export function kickMember(w: World, actor: Player, targetId: string) {
  const a = requireAlliance(w, actor);
  need(a, actor, 'kick');
  const t = w.players[targetId];
  if (!t || t.allianceId !== a.id) throw new GameError('Not a member');
  if (targetId === actor.id) throw new GameError('Use leave instead');
  if (roleOf(a, targetId) === 'founder' || (elevated(a, targetId) && !isLeader(a, actor.id))) throw new GameError('Insufficient rank', 403);
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
  if (role === 'founder') m.rankId = undefined;
  log(a, `${w.players[targetId].username} is now ${role}.`);
}

export function updateAlliance(w: World, actor: Player, patch: { description?: string; open?: boolean }) {
  const a = requireAlliance(w, actor);
  need(a, actor, 'edit');
  if (typeof patch.description === 'string') a.description = patch.description.slice(0, 500);
  if (typeof patch.open === 'boolean') a.open = patch.open;
}

export function disbandAlliance(w: World, actor: Player) {
  const a = requireAlliance(w, actor);
  if (!isLeader(a, actor.id)) throw new GameError('Only the founder can disband', 403);
  for (const m of a.members) releaseHolds(w, m.playerId);
  for (const m of a.members) { const pl = w.players[m.playerId]; if (pl) pl.allianceId = null; }
  dropAlliance(w, a);
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
  need(a, actor, 'bank');
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
  notifyPlayer(w, t.id, 'alliance', 'Alliance grant', `${actor.username} sent you ${take.metal} metal, ${take.crystal} crystal, ${take.deuterium} vespene gas from the alliance bank.`);
}

export function upgradeCost(key: string, level: number): Res {
  const u = ALLIANCE_UPGRADES[key];
  const k = Math.pow(u.factor, level);
  return { metal: Math.floor(u.base.metal * k), crystal: Math.floor(u.base.crystal * k), deuterium: Math.floor(u.base.deuterium * k) };
}

export function buyUpgrade(w: World, actor: Player, key: string) {
  const a = requireAlliance(w, actor);
  need(a, actor, 'upgrades');
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

// ------------------------------------------------------------------ ranks
const MAX_RANKS = 8;

export function createRank(w: World, actor: Player, name: string, perms: unknown) {
  const a = requireAlliance(w, actor);
  if (!isLeader(a, actor.id)) throw new GameError('Only the founder can manage ranks', 403);
  name = (name || '').trim();
  if (name.length < 2 || name.length > 20) throw new GameError('Rank names are 2-20 characters');
  const list = (a.ranks ||= []);
  if (list.length >= MAX_RANKS) throw new GameError(`At most ${MAX_RANKS} ranks`);
  if (list.some((r) => r.name.toLowerCase() === name.toLowerCase())) throw new GameError('That rank already exists');
  const ok = (Array.isArray(perms) ? perms : []).filter((x): x is AlliancePerm => ALLIANCE_PERMS.includes(x as AlliancePerm));
  const rank = { id: uid(3), name, perms: [...new Set(ok)] };
  list.push(rank);
  log(a, `${actor.username} created the rank ${name}.`);
  return rank;
}

export function updateRank(w: World, actor: Player, rankId: string, patch: { name?: string; perms?: unknown }) {
  const a = requireAlliance(w, actor);
  if (!isLeader(a, actor.id)) throw new GameError('Only the founder can manage ranks', 403);
  const r = a.ranks?.find((x) => x.id === rankId);
  if (!r) throw new GameError('No such rank', 404);
  if (typeof patch.name === 'string') {
    const n = patch.name.trim();
    if (n.length < 2 || n.length > 20) throw new GameError('Rank names are 2-20 characters');
    r.name = n;
  }
  if (Array.isArray(patch.perms)) r.perms = [...new Set(patch.perms.filter((x): x is AlliancePerm => ALLIANCE_PERMS.includes(x as AlliancePerm)))];
}

export function deleteRank(w: World, actor: Player, rankId: string) {
  const a = requireAlliance(w, actor);
  if (!isLeader(a, actor.id)) throw new GameError('Only the founder can manage ranks', 403);
  if (!a.ranks?.some((x) => x.id === rankId)) throw new GameError('No such rank', 404);
  a.ranks = a.ranks.filter((x) => x.id !== rankId);
  for (const m of a.members) if (m.rankId === rankId) m.rankId = undefined;
}

export function assignRank(w: World, actor: Player, targetId: string, rankId: string | null) {
  const a = requireAlliance(w, actor);
  if (!isLeader(a, actor.id)) throw new GameError('Only the founder can assign ranks', 403);
  const m = a.members.find((x) => x.playerId === targetId);
  if (!m || m.role === 'founder') throw new GameError('Invalid target');
  if (rankId && !a.ranks?.some((r) => r.id === rankId)) throw new GameError('No such rank', 404);
  m.rankId = rankId ?? undefined;
  log(a, `${w.players[targetId].username} is now ${rankId ? a.ranks!.find((r) => r.id === rankId)!.name : 'a plain ' + m.role}.`);
}

// ------------------------------------------------------------------ bulletin and mass message
export function postBulletin(w: World, actor: Player, text: string, pinned = false) {
  const a = requireAlliance(w, actor);
  need(a, actor, 'bulletin');
  text = (text || '').trim().slice(0, 600);
  if (!text) throw new GameError('Empty post');
  const board = (a.bulletin ||= []);
  board.push({ id: uid(3), authorId: actor.id, author: actor.username, text, at: Date.now(), pinned: !!pinned });
  while (board.length > 50) { const i = board.findIndex((x) => !x.pinned); board.splice(i < 0 ? 0 : i, 1); }
}

export function removeBulletin(w: World, actor: Player, id: string) {
  const a = requireAlliance(w, actor);
  const post = a.bulletin?.find((x) => x.id === id);
  if (!post) throw new GameError('No such post', 404);
  if (post.authorId !== actor.id) need(a, actor, 'bulletin');
  a.bulletin = a.bulletin!.filter((x) => x.id !== id);
}

export function pinBulletin(w: World, actor: Player, id: string, pinned: boolean) {
  const a = requireAlliance(w, actor);
  need(a, actor, 'bulletin');
  const post = a.bulletin?.find((x) => x.id === id);
  if (!post) throw new GameError('No such post', 404);
  post.pinned = pinned;
}

export function massMessage(w: World, actor: Player, subject: string, text: string) {
  const a = requireAlliance(w, actor);
  need(a, actor, 'message');
  text = (text || '').trim().slice(0, 1000);
  if (!text) throw new GameError('Empty message');
  subject = (subject || '').trim().slice(0, 60) || `Message from ${a.tag}`;
  let n = 0;
  for (const m of a.members) if (m.playerId !== actor.id) { notifyPlayer(w, m.playerId, 'alliance', `[${a.tag}] ${subject}`, text, undefined, actor.username); n++; }
  log(a, `${actor.username} sent a message to all members.`);
  return n;
}

// ------------------------------------------------------------------ diplomacy
function otherAlliance(w: World, a: Alliance, otherId: string): Alliance {
  const o = w.alliances[otherId];
  if (!o || o.id === a.id) throw new GameError('No such alliance', 404);
  return o;
}
const note = (w: World, a: Alliance, perm: AlliancePerm, subject: string, body: string) => {
  for (const m of a.members) if (can(a, m.playerId, perm)) notifyPlayer(w, m.playerId, 'alliance', subject, body);
};

export function proposePact(w: World, actor: Player, otherId: string) {
  const a = requireAlliance(w, actor);
  need(a, actor, 'diplomacy');
  const o = otherAlliance(w, a, otherId);
  if (a.diplomacy?.[o.id]?.kind === 'pact') throw new GameError('You already have a pact');
  // they already offered us one: sign it
  if (a.proposals?.some((x) => x.fromId === o.id)) return respondPact(w, actor, o.id, true);
  const props = (o.proposals ||= []);
  if (props.some((x) => x.fromId === a.id)) throw new GameError('You already made an offer');
  props.push({ fromId: a.id, at: Date.now() });
  note(w, o, 'diplomacy', 'Pact offer', `[${a.tag}] ${a.name} proposes a non-aggression pact.`);
  log(a, `${actor.username} offered [${o.tag}] a pact.`);
}

export function respondPact(w: World, actor: Player, fromId: string, accept: boolean) {
  const a = requireAlliance(w, actor);
  need(a, actor, 'diplomacy');
  const o = w.alliances[fromId];
  if (!a.proposals?.some((x) => x.fromId === fromId)) throw new GameError('No such offer', 404);
  a.proposals = a.proposals.filter((x) => x.fromId !== fromId);
  if (!o) return;
  if (!accept) { note(w, o, 'diplomacy', 'Pact declined', `[${a.tag}] declined your pact offer.`); return; }
  const since = Date.now();
  (a.diplomacy ||= {})[o.id] = { kind: 'pact', since };
  (o.diplomacy ||= {})[a.id] = { kind: 'pact', since };
  log(a, `Pact signed with [${o.tag}].`); log(o, `Pact signed with [${a.tag}].`);
  for (const m of [...a.members, ...o.members]) notifyPlayer(w, m.playerId, 'alliance', 'Pact signed', `[${a.tag}] and [${o.tag}] will not attack each other.`);
}

export function declareWar(w: World, actor: Player, otherId: string) {
  const a = requireAlliance(w, actor);
  need(a, actor, 'diplomacy');
  const o = otherAlliance(w, a, otherId);
  if (a.diplomacy?.[o.id]?.kind === 'war') throw new GameError('Already at war');
  const war = startWar(w, a, o);
  const hours = Math.round((war.endsAt - war.startedAt) / 3_600_000);
  log(a, `${actor.username} declared war on [${o.tag}] (${hours} hours).`); log(o, `[${a.tag}] declared war on us (${hours} hours).`);
  for (const m of o.members) notifyPlayer(w, m.playerId, 'alliance', 'War declared', `[${a.tag}] ${a.name} has declared war on your alliance. It lasts ${hours} hours: destroy their units and hold systems to out-score them.`);
  for (const m of a.members) if (m.playerId !== actor.id) notifyPlayer(w, m.playerId, 'alliance', 'War declared', `${actor.username} declared war on [${o.tag}]. It lasts ${hours} hours.`);
}

export function endTreaty(w: World, actor: Player, otherId: string) {
  const a = requireAlliance(w, actor);
  need(a, actor, 'diplomacy');
  const o = otherAlliance(w, a, otherId);
  const t = a.diplomacy?.[o.id];
  if (!t) throw new GameError('No treaty with that alliance');
  if (t.kind === 'war') {
    const war = (w.wars ?? []).find((x) => x.id === t.warId && !x.endedAt);
    if (war) { concedeWar(w, war, a.id); log(a, `${actor.username} conceded the war with [${o.tag}].`); log(o, `[${a.tag}] conceded the war.`); return; }
  }
  delete a.diplomacy![o.id];
  if (o.diplomacy) delete o.diplomacy[a.id];
  log(a, `${actor.username} ended the ${t.kind} with [${o.tag}].`); log(o, `[${a.tag}] ended the ${t.kind}.`);
  for (const m of o.members) notifyPlayer(w, m.playerId, 'alliance', t.kind === 'pact' ? 'Pact cancelled' : 'War ended', `[${a.tag}] ended the ${t.kind} with your alliance.`);
}
