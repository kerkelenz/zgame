import { lvl } from '../shared/formulas';
import type { BuildingId, TechId } from '../shared/types';
import { ALLIANCE_UPGRADES } from '../shared/data';
import { allianceBonuses, maxFields, planetCapacity, planetProduction, updatePlanet, usedFields } from './economy';
import { activeSlots } from './fleet';
import { wreckView } from './wrecks';
import { classSpeedBonus, crawlerMul, energyBoost, mineBoost, researchFactor, timeFactor } from './perks';
import { colonyCount, maxPlanets, playerPoints } from './galaxy';
import { sameCoords } from '../shared/formulas';
import { upgradeCost } from './alliance';
import { isAdmin, isMuted } from './account';
import { merchantDeal } from './economy';
import { permsOf } from './alliance';
import { seasonBanner } from './season';
import { invasionBanner } from './invasion';
import { contractsView } from './contracts';
import { featuresOf } from './features';
import { warsView } from './wars';
import { fleetEvents, intelFields } from './events';
const intelView = (w: World, p: Player, m: Movement) => { const { count, ...rest } = intelFields(w, p, m); return { ...rest, shipCount: count }; };
import { ALLIANCE_PERMS } from './world';
import { ACHIEVEMENTS, OBJECTIVES, currentObjective } from './progress';
import { OFFICERS, OFFICER_MAX, FACTIONS, JOIN_REP, FACTION_BY_ID, CHAR_CLASSES, CLASS_CHANGE_COST } from '../shared/data';
import { planetAt, type Alliance, type Movement, type Planet, type Player, type World } from './world';

export function planetView(w: World, planet: Planet, now: number) {
  updatePlanet(w, planet, now);
  const prod = planetProduction(w, planet);
  return {
    id: planet.id, name: planet.name, coords: planet.coords, fields: maxFields(planet), usedFields: usedFields(planet), isMoon: !!planet.isMoon, parentId: planet.parentId ?? null,
    jumpReadyAt: planet.jumpReadyAt ?? 0,
    maxTemp: planet.maxTemp, isHome: planet.isHome, buildings: planet.buildings, resources: planet.resources,
    capacity: planetCapacity(w, planet),
    diameter: planet.diameter ?? null,
    production: {
      metal: prod.metal, crystal: prod.crystal, deuterium: prod.deuterium,
      energyProduced: prod.energyProduced, energyUsed: prod.energyUsed, efficiency: prod.efficiency,
    },
    settings: planet.settings,
    /** the multipliers behind this planet's numbers, so the client can reproduce them exactly (details pages, economy planner) */
    detail: (() => {
      const owner = w.players[planet.ownerId], ab = allianceBonuses(w, owner), c = w.config;
      return {
        allianceProduction: ab.production, allianceResearch: ab.research, boost: mineBoost(owner), energyBoost: energyBoost(owner), crawlerMul: crawlerMul(owner), timeFactor: timeFactor(owner), researchFactor: researchFactor(owner), classSpeed: classSpeedBonus(owner),
        speeds: {
          production: c.economySpeed * c.productionBoost, construction: c.economySpeed * c.constructionBoost, research: c.economySpeed * c.researchBoost,
          shipyard: c.economySpeed * c.shipyardBoost, storage: Math.max(1, c.economySpeed) * c.storageBoost, fleet: c.fleetSpeed,
        },
      };
    })(),
    wreck: wreckView(w, planet),
    plan: planet.plan ? { name: planet.plan.name, status: planet.plan.status, steps: planet.plan.steps.length, left: planet.plan.steps.filter((s) => (s.kind === 'building' ? lvl(planet.buildings, s.id as BuildingId) : lvl(w.players[planet.ownerId].techs, s.id as TechId)) < s.level).length } : null,
    buildQueue: planet.buildQueue, buildBacklog: planet.buildBacklog ?? [], shipyardQueue: planet.shipyardQueue,
    fleet: planet.fleet, defenses: planet.defenses, updatedAt: planet.updatedAt,
  };
}

export function allianceView(w: World, a: Alliance, viewer: Player) {
  const myRole = a.members.find((m) => m.playerId === viewer.id)?.role;
  const myPerms = permsOf(a, viewer.id);
  const officer = myPerms.includes('applications');
  const tagOf = (id: string) => { const o = w.alliances[id]; return o ? { id: o.id, tag: o.tag, name: o.name } : null; };
  return {
    id: a.id, tag: a.tag, name: a.name, description: a.description, open: a.open, createdAt: a.createdAt,
    bank: a.bank, upgrades: a.upgrades, myRole, myPerms,
    ranks: a.ranks ?? [], allPerms: ALLIANCE_PERMS,
    bulletin: [...(a.bulletin ?? [])].sort((x, y) => Number(y.pinned) - Number(x.pinned) || y.at - x.at),
    diplomacy: Object.entries(a.diplomacy ?? {}).map(([id, t]) => ({ ...tagOf(id)!, kind: t.kind, since: t.since })).filter((x) => x.id),
    war: warsView(w, a),
    proposals: (a.proposals ?? []).map((x) => ({ ...tagOf(x.fromId)!, at: x.at })).filter((x) => x.id),
    offered: Object.values(w.alliances).filter((o) => o.proposals?.some((x) => x.fromId === a.id)).map((o) => o.id),
    members: a.members.map((m) => {
      const p = w.players[m.playerId];
      return { id: p.id, username: p.username, home: w.planets[p.planetIds[0]]?.coords ?? null, role: m.role, rankId: m.rankId ?? null, rank: m.rankId ? a.ranks?.find((r) => r.id === m.rankId)?.name ?? null : null, points: playerPoints(w, p).total, lastSeen: p.lastSeen, joinedAt: m.joinedAt };
    }),
    applications: officer ? a.applications.map((x) => ({ playerId: x.playerId, username: w.players[x.playerId]?.username, text: x.text, at: x.at })) : [],
    log: a.log.slice(-40).reverse(),
    upgradeInfo: Object.values(ALLIANCE_UPGRADES).map((u) => ({
      id: u.id, name: u.name, desc: u.desc, level: a.upgrades[u.id] || 0, next: upgradeCost(u.id, a.upgrades[u.id] || 0),
    })),
  };
}

export function meView(w: World, p: Player, now: number) {
  const a = p.allianceId ? w.alliances[p.allianceId] : null;
  return {
    now,
    season: seasonBanner(w, now),
    invasion: invasionBanner(w),
    contractsClaimable: contractsView(w, p, now).claimable,
    features: featuresOf(w, p),
    player: {
      id: p.id, username: p.username, techs: p.techs, research: p.research, researchBacklog: p.researchBacklog ?? [], officers: p.officers, charClass: p.charClass, allianceId: p.allianceId,
      points: playerPoints(w, p), stats: p.stats, deal: merchantDeal(w, p, now), admin: isAdmin(p), muted: isMuted(p, now) ? p.muted : null,
    },
    planets: p.planetIds.map((id) => {
      const pl = w.planets[id];
      return { id: pl.id, name: pl.name, coords: pl.coords, isHome: pl.isHome, isMoon: !!pl.isMoon };
    }),
    alliance: a ? { id: a.id, tag: a.tag, name: a.name } : null,
    allianceBonuses: allianceBonuses(w, p),
    config: w.config,
    slots: activeSlots(w, p),
    maxPlanets: maxPlanets(p),
    colonies: colonyCount(w, p),
    unread: w.messages.filter((m) => m.to === p.id && !m.read).length,
    credits: Math.floor(p.credits),
    vacation: p.vacation,
    faction: p.faction,
    pendingTributes: p.tributes.filter((t) => !t.answered).length,
    objective: (() => { const o = currentObjective(p); return o ? { id: o.id, name: o.name, hint: o.hint, step: OBJECTIVES.indexOf(o) + 1, of: OBJECTIVES.length } : null; })(),
  };
}

export function commandView(w: World, p: Player) {
  const cur = currentObjective(p);
  return {
    credits: Math.floor(p.credits),
    officers: OFFICERS.map((o) => {
      const rank = p.officers[o.id] ?? 0;
      return { id: o.id, name: o.name, desc: o.desc, rank, max: OFFICER_MAX, nextCost: rank < OFFICER_MAX ? o.cost[rank] : null };
    }),
    faction: p.faction,
    charClass: p.charClass,
    classes: CHAR_CLASSES.map((c) => ({ ...c, chosen: p.charClass === c.id })),
    classChangeCost: p.charClass ? CLASS_CHANGE_COST : 0,
    factions: FACTIONS.map((f) => ({
      id: f.id, name: f.name, tag: f.tag, perk: f.perk, rival: f.rival, rivalName: FACTION_BY_ID[f.rival].name,
      rep: Math.round(p.rep[f.id] || 0), joinRep: JOIN_REP, joined: p.faction === f.id,
      empires: Object.values(w.players).filter((x) => x.npc?.faction === f.id).length,
    })),
    achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, desc: a.desc, reward: a.reward, doneAt: p.achievements[a.id] ?? null })),
    objectives: OBJECTIVES.map((o) => ({ id: o.id, name: o.name, hint: o.hint, reward: o.reward, doneAt: p.objectives[o.id] ?? null, current: cur?.id === o.id })),
    stats: p.stats,
    tributes: p.tributes.filter((t) => !t.answered).map((t) => ({ id: t.id, npc: w.players[t.npc]?.username ?? '?', want: t.want, deadline: t.deadline })),
  };
}

const mv = (m: Movement, mine: boolean, w?: World) => ({
  fromName: (w && m.fromPlanetId ? w.planets[m.fromPlanetId]?.name : undefined) ?? undefined,
  fromMoon: (w && m.fromPlanetId ? !!w.planets[m.fromPlanetId]?.isMoon : undefined),
  ownerAlliance: (w && m.ownerId ? w.alliances[w.players[m.ownerId]?.allianceId ?? '']?.tag : undefined),
  id: m.id, mission: m.mission, phase: m.phase, from: m.from, to: m.to, ships: m.ships,
  cargo: mine ? m.cargo : undefined, arriveAt: m.arriveAt, returnAt: m.returnAt, holdUntil: m.holdUntil,
  acsId: m.acsId, toMoon: m.toMoon, missiles: m.missiles, ownerName: m.ownerName, ownerId: m.ownerId, speedPct: m.speedPct, flightMs: m.flightMs, departAt: m.departAt,
});

export function fleetsView(w: World, p: Player) {
  const myCoords = p.planetIds.map((id) => w.planets[id].coords);
  const allyIds = new Set<string>();
  const ally = p.allianceId ? w.alliances[p.allianceId] : null;
  if (ally) for (const m of ally.members) allyIds.add(m.playerId);
  const allyCoords = [...allyIds].flatMap((id) => w.players[id].planetIds.map((pid) => ({ owner: w.players[id].username, ownerId: id, c: w.planets[pid].coords, name: w.planets[pid].name })));

  const mine: ReturnType<typeof mv>[] = [];
  const incoming: (ReturnType<typeof mv> & { target: string; ally: boolean; intel?: string; shipCount?: number | null; shipTypes?: string[] | null; fleet?: Record<string, number | undefined> | null; targetOwnerId?: string; targetOwner?: string; targetName?: string })[] = [];
  const stationed: ReturnType<typeof mv>[] = [];
  const joinable: (ReturnType<typeof mv> & { targetName: string })[] = [];
  for (const m of Object.values(w.movements)) {
    if (m.ownerId === p.id) mine.push(mv(m, true));
    if ((m.mission === 'attack' || m.mission === 'missile' || m.mission === 'destroy') && m.phase === 'outbound' && m.ownerId !== p.id) {
      const hitMe = myCoords.some((c) => sameCoords(c, m.to));
      const hitAlly = allyCoords.find((a) => sameCoords(a.c, m.to));
      if (hitMe) incoming.push({ ...mv(m, false, w), ships: {}, target: 'you', ally: false, ...intelView(w, p, m) });
      else if (hitAlly) incoming.push({ ...mv(m, false, w), ships: {}, target: `${hitAlly.owner} (${hitAlly.name})`, ally: true, ...intelView(w, p, m), targetOwnerId: hitAlly.ownerId, targetOwner: hitAlly.owner, targetName: hitAlly.name });
    }
    if (m.mission === 'attack' && m.phase === 'outbound' && m.ownerId && !m.acsId && (m.ownerId === p.id || allyIds.has(m.ownerId))) {
      joinable.push({ ...mv(m, false), ships: {}, targetName: planetAt(w, m.to, !!m.toMoon)?.name ?? '?' });
    }
    if (m.mission === 'hold' && m.phase === 'holding' && m.ownerId !== p.id && myCoords.some((c) => sameCoords(c, m.to))) stationed.push(mv(m, false));
  }
  return { mine, incoming, stationed, joinable, events: fleetEvents(w, p) };
}
