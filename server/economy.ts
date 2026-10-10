import { ALLIANCE_UPGRADES, BUILDINGS, TECHS, UNITS } from '../shared/data';
import {
  buildingCost, buildingTime, canAfford, production, researchTime, scaleRes, storageCapacity,
  subRes, addRes, techCost, unitTime, lvl,
} from '../shared/formulas';
import type { BuildingId, Requirement, Res, TechId, UnitId } from '../shared/types';
import { bus } from './bus';
import { notifyPlayer } from './messages';
import { GameError, allianceOf, type Planet, type Player, type World } from './world';

export interface AllianceBonuses { production: number; research: number; logistics: number }

export function allianceBonuses(w: World, player: Player): AllianceBonuses {
  const a = allianceOf(w, player);
  const b = { production: 0, research: 0, logistics: 0 };
  if (!a) return b;
  for (const k of Object.keys(b) as (keyof AllianceBonuses)[]) b[k] = (a.upgrades[k] || 0) * ALLIANCE_UPGRADES[k].perLevel;
  return b;
}

export function planetProduction(w: World, planet: Planet) {
  const owner = w.players[planet.ownerId];
  return production({
    buildings: planet.buildings,
    techs: owner.techs,
    maxTemp: planet.maxTemp,
    satellites: planet.fleet.solarSatellite || 0,
    settings: planet.settings,
    speed: w.config.economySpeed,
    allianceBonus: allianceBonuses(w, owner).production,
  });
}

export function planetCapacity(planet: Planet): Res {
  return {
    metal: storageCapacity(lvl(planet.buildings, 'metalStorage')),
    crystal: storageCapacity(lvl(planet.buildings, 'crystalStorage')),
    deuterium: storageCapacity(lvl(planet.buildings, 'deuteriumTank')),
  };
}

function accrue(w: World, planet: Planet, from: number, to: number) {
  const dt = (to - from) / 3_600_000;
  if (dt <= 0) return;
  const prod = planetProduction(w, planet);
  const cap = planetCapacity(planet);
  const r = planet.resources;
  const step = (cur: number, rate: number, max: number) => {
    const next = cur + rate * dt;
    if (rate >= 0) return cur >= max ? cur : Math.min(max, next);
    return Math.max(0, next);
  };
  r.metal = step(r.metal, prod.metal, cap.metal);
  r.crystal = step(r.crystal, prod.crystal, cap.crystal);
  r.deuterium = step(r.deuterium, prod.deuterium, cap.deuterium);
}

/** Bring a planet up to `now`: accrue resources, finish construction and ship jobs. */
export function updatePlanet(w: World, planet: Planet, now: number) {
  let t = planet.updatedAt;
  if (now <= t) return;
  const job = planet.buildQueue;
  if (job && job.end <= now) {
    accrue(w, planet, t, job.end);
    t = job.end;
    planet.buildings[job.id] = job.level;
    planet.buildQueue = null;
    notifyPlayer(w, planet.ownerId, 'system', `Construction complete`, `${BUILDINGS[job.id].name} on ${planet.name} is now level ${job.level}.`);
    bus.push({ to: planet.ownerId, type: 'toast', data: `${BUILDINGS[job.id].name} level ${job.level} done on ${planet.name}` });
  }
  accrue(w, planet, t, now);
  processShipyard(w, planet, now);
  planet.updatedAt = now;
  // a second queued completion cannot exist (single slot), so one pass suffices
}

function processShipyard(w: World, planet: Planet, now: number) {
  const q = planet.shipyardQueue;
  while (q.length) {
    const j = q[0];
    const n = Math.min(j.remaining, Math.floor((now - j.start) / j.unitMs));
    if (n <= 0) break;
    j.remaining -= n;
    j.start += n * j.unitMs;
    const u = UNITS[j.id];
    if (u.kind === 'ship') planet.fleet[j.id as keyof typeof planet.fleet] = (planet.fleet[j.id as keyof typeof planet.fleet] || 0) + n;
    else planet.defenses[j.id as keyof typeof planet.defenses] = (planet.defenses[j.id as keyof typeof planet.defenses] || 0) + n;
    if (j.remaining <= 0) {
      q.shift();
      if (q[0]) q[0].start = j.start;
      notifyPlayer(w, planet.ownerId, 'system', 'Production complete', `${j.total}× ${u.name} finished on ${planet.name}.`);
    } else break;
  }
}

export function processPlayer(w: World, player: Player, now: number) {
  const job = player.research;
  if (job && job.end <= now) {
    player.techs[job.id] = job.level;
    player.research = null;
    notifyPlayer(w, player.id, 'system', 'Research complete', `${TECHS[job.id].name} is now level ${job.level}.`);
    bus.push({ to: player.id, type: 'toast', data: `Research: ${TECHS[job.id].name} level ${job.level}` });
  }
  for (const pid of player.planetIds) updatePlanet(w, w.planets[pid], now);
}

export function requirementsMet(planet: Planet | null, player: Player, reqs: Requirement[]): boolean {
  return reqs.every((r) => {
    if (r.id in BUILDINGS) return !!planet && lvl(planet.buildings, r.id as BuildingId) >= r.level;
    return lvl(player.techs, r.id as TechId) >= r.level;
  });
}

export function usedFields(planet: Planet): number {
  let n = 0;
  for (const v of Object.values(planet.buildings)) n += v || 0;
  if (planet.buildQueue) n += 1;
  return n;
}

function pay(planet: Planet, cost: Res) {
  if (!canAfford(planet.resources, cost)) throw new GameError('Not enough resources');
  planet.resources = subRes(planet.resources, cost);
}

export function startBuilding(w: World, player: Player, planet: Planet, id: BuildingId, now: number) {
  updatePlanet(w, planet, now);
  const def = BUILDINGS[id];
  if (!def) throw new GameError('Unknown building');
  if (planet.buildQueue) throw new GameError('Construction already in progress');
  if (!requirementsMet(planet, player, def.requires)) throw new GameError('Requirements not met');
  if (usedFields(planet) >= planet.fields) throw new GameError('No free fields left on this planet');
  if (id === 'researchLab' && player.research) throw new GameError('Cannot upgrade the lab while research is running');
  const level = lvl(planet.buildings, id) + 1;
  const cost = buildingCost(id, level);
  pay(planet, cost);
  const secs = buildingTime(cost, lvl(planet.buildings, 'roboticsFactory'), lvl(planet.buildings, 'naniteFactory'), w.config.economySpeed);
  planet.buildQueue = { id, level, start: now, end: now + secs * 1000, cost };
}

export function cancelBuilding(w: World, planet: Planet, now: number) {
  updatePlanet(w, planet, now);
  const j = planet.buildQueue;
  if (!j) throw new GameError('Nothing to cancel');
  planet.resources = addRes(planet.resources, j.cost);
  planet.buildQueue = null;
}

export function startResearch(w: World, player: Player, planet: Planet, id: TechId, now: number) {
  updatePlanet(w, planet, now);
  const def = TECHS[id];
  if (!def) throw new GameError('Unknown technology');
  if (player.research) throw new GameError('Research already in progress');
  if (planet.buildQueue?.id === 'researchLab') throw new GameError('The research lab is being upgraded');
  if (!requirementsMet(planet, player, def.requires)) throw new GameError('Requirements not met');
  const level = lvl(player.techs, id) + 1;
  const cost = techCost(id, level);
  pay(planet, cost);
  const secs = researchTime(cost, lvl(planet.buildings, 'researchLab'), w.config.economySpeed, allianceBonuses(w, player).research);
  player.research = { id, level, start: now, end: now + secs * 1000, cost, planetId: planet.id };
}

export function cancelResearch(w: World, player: Player, now: number) {
  const j = player.research;
  if (!j) throw new GameError('Nothing to cancel');
  const p = w.planets[j.planetId] ?? w.planets[player.planetIds[0]];
  updatePlanet(w, p, now);
  p.resources = addRes(p.resources, j.cost);
  player.research = null;
}

export function queueUnits(w: World, player: Player, planet: Planet, id: UnitId, count: number, now: number) {
  updatePlanet(w, planet, now);
  const def = UNITS[id];
  if (!def) throw new GameError('Unknown unit');
  count = Math.floor(count);
  if (!(count >= 1) || count > 1_000_000) throw new GameError('Invalid amount');
  if (lvl(planet.buildings, 'shipyard') < 1) throw new GameError('A shipyard is required');
  if (planet.buildQueue && (planet.buildQueue.id === 'shipyard' || planet.buildQueue.id === 'naniteFactory')) throw new GameError('The shipyard is being upgraded');
  if (!requirementsMet(planet, player, def.requires)) throw new GameError('Requirements not met');
  if (def.max) {
    const have = (planet.defenses as Record<string, number>)[id] || 0;
    const queued = planet.shipyardQueue.filter((j) => j.id === id).reduce((s, j) => s + j.remaining, 0);
    if (have + queued + count > def.max) throw new GameError(`Only ${def.max} allowed per planet`);
  }
  const total = scaleRes(def.cost, count);
  pay(planet, total);
  const unitMs = unitTime(id, lvl(planet.buildings, 'shipyard'), lvl(planet.buildings, 'naniteFactory'), w.config.economySpeed) * 1000;
  const start = planet.shipyardQueue.length ? now : now;
  planet.shipyardQueue.push({ id, total: count, remaining: count, unitMs, start, unitCost: def.cost });
  if (planet.shipyardQueue.length === 1) planet.shipyardQueue[0].start = now;
}

export function cancelShipyardJob(w: World, planet: Planet, index: number, now: number) {
  updatePlanet(w, planet, now);
  const j = planet.shipyardQueue[index];
  if (!j) throw new GameError('No such job');
  planet.resources = addRes(planet.resources, scaleRes(j.unitCost, j.remaining));
  planet.shipyardQueue.splice(index, 1);
  if (index === 0 && planet.shipyardQueue[0]) planet.shipyardQueue[0].start = now;
}
