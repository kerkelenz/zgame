import { ALLIANCE_UPGRADES } from '../shared/data';
import { allianceBonuses, planetCapacity, planetProduction, updatePlanet, usedFields } from './economy';
import { activeSlots } from './fleet';
import { maxPlanets, playerPoints } from './galaxy';
import { sameCoords } from '../shared/formulas';
import { upgradeCost } from './alliance';
import { planetAt, type Alliance, type Movement, type Planet, type Player, type World } from './world';

export function planetView(w: World, planet: Planet, now: number) {
  updatePlanet(w, planet, now);
  const prod = planetProduction(w, planet);
  return {
    id: planet.id, name: planet.name, coords: planet.coords, fields: planet.fields, usedFields: usedFields(planet),
    maxTemp: planet.maxTemp, isHome: planet.isHome, buildings: planet.buildings, resources: planet.resources,
    capacity: planetCapacity(planet),
    production: {
      metal: prod.metal, crystal: prod.crystal, deuterium: prod.deuterium,
      energyProduced: prod.energyProduced, energyUsed: prod.energyUsed, efficiency: prod.efficiency,
    },
    settings: planet.settings,
    buildQueue: planet.buildQueue, buildBacklog: planet.buildBacklog ?? [], shipyardQueue: planet.shipyardQueue,
    fleet: planet.fleet, defenses: planet.defenses, updatedAt: planet.updatedAt,
  };
}

export function allianceView(w: World, a: Alliance, viewer: Player) {
  const myRole = a.members.find((m) => m.playerId === viewer.id)?.role;
  const officer = myRole === 'founder' || myRole === 'officer';
  return {
    id: a.id, tag: a.tag, name: a.name, description: a.description, open: a.open, createdAt: a.createdAt,
    bank: a.bank, upgrades: a.upgrades, myRole,
    members: a.members.map((m) => {
      const p = w.players[m.playerId];
      return { id: p.id, username: p.username, role: m.role, points: playerPoints(w, p).total, lastSeen: p.lastSeen, joinedAt: m.joinedAt };
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
    player: {
      id: p.id, username: p.username, techs: p.techs, research: p.research, researchBacklog: p.researchBacklog ?? [], allianceId: p.allianceId,
      points: playerPoints(w, p), stats: p.stats,
    },
    planets: p.planetIds.map((id) => {
      const pl = w.planets[id];
      return { id: pl.id, name: pl.name, coords: pl.coords, isHome: pl.isHome };
    }),
    alliance: a ? { id: a.id, tag: a.tag, name: a.name } : null,
    allianceBonuses: allianceBonuses(w, p),
    config: w.config,
    slots: activeSlots(w, p),
    maxPlanets: maxPlanets(p),
    unread: w.messages.filter((m) => m.to === p.id && !m.read).length,
  };
}

const mv = (m: Movement, mine: boolean) => ({
  id: m.id, mission: m.mission, phase: m.phase, from: m.from, to: m.to, ships: m.ships,
  cargo: mine ? m.cargo : undefined, arriveAt: m.arriveAt, returnAt: m.returnAt, holdUntil: m.holdUntil,
  acsId: m.acsId, missiles: m.missiles, ownerName: m.ownerName, ownerId: m.ownerId, speedPct: m.speedPct, flightMs: m.flightMs, departAt: m.departAt,
});

export function fleetsView(w: World, p: Player) {
  const myCoords = p.planetIds.map((id) => w.planets[id].coords);
  const allyIds = new Set<string>();
  const ally = p.allianceId ? w.alliances[p.allianceId] : null;
  if (ally) for (const m of ally.members) allyIds.add(m.playerId);
  const allyCoords = [...allyIds].flatMap((id) => w.players[id].planetIds.map((pid) => ({ owner: w.players[id].username, ownerId: id, c: w.planets[pid].coords, name: w.planets[pid].name })));

  const mine: ReturnType<typeof mv>[] = [];
  const incoming: (ReturnType<typeof mv> & { target: string; ally: boolean })[] = [];
  const stationed: ReturnType<typeof mv>[] = [];
  const joinable: (ReturnType<typeof mv> & { targetName: string })[] = [];
  for (const m of Object.values(w.movements)) {
    if (m.ownerId === p.id) mine.push(mv(m, true));
    if ((m.mission === 'attack' || m.mission === 'missile') && m.phase === 'outbound' && m.ownerId !== p.id) {
      const hitMe = myCoords.some((c) => sameCoords(c, m.to));
      const hitAlly = allyCoords.find((a) => sameCoords(a.c, m.to));
      if (hitMe) incoming.push({ ...mv(m, false), ships: {}, target: 'you', ally: false });
      else if (hitAlly) incoming.push({ ...mv(m, false), ships: {}, target: `${hitAlly.owner} (${hitAlly.name})`, ally: true });
    }
    if (m.mission === 'attack' && m.phase === 'outbound' && m.ownerId && !m.acsId && (m.ownerId === p.id || allyIds.has(m.ownerId))) {
      joinable.push({ ...mv(m, false), ships: {}, targetName: planetAt(w, m.to)?.name ?? '?' });
    }
    if (m.mission === 'hold' && m.phase === 'holding' && m.ownerId !== p.id && myCoords.some((c) => sameCoords(c, m.to))) stationed.push(mv(m, false));
  }
  return { mine, incoming, stationed, joinable };
}
