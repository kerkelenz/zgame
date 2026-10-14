import { ALLIANCE_UPGRADES, BUILDINGS, DEAL_FEE, TECHS, UNITS, buildingAllowed, dailyDeal, resName, tradeQuote } from '../shared/data';
import {
  buildingCost, buildingTime, canAfford, production, researchTime, scaleRes, storageCapacity,
  subRes, addRes, techCost, totalRes, unitTime, lvl,
} from '../shared/formulas';
import type { BuildingId, Requirement, Res, TechId, UnitId } from '../shared/types';
import { bus } from './bus';
import { notifyPlayer } from './messages';
import { territoryBonus } from './sectors';
import { crawlerMul, energyBoost, mineBoost, researchFactor, timeFactor, tradeFee } from './perks';
import { assertActive } from './vacation';
import { GameError, allianceOf, type BuildJob, type Planet, type Player, type World } from './world';

export interface AllianceBonuses { production: number; research: number; logistics: number; command: number }

export function allianceBonuses(w: World, player: Player): AllianceBonuses {
  const a = allianceOf(w, player);
  const b = { production: 0, research: 0, logistics: 0, command: 0 };
  if (!a) return b;
  for (const k of Object.keys(b) as (keyof AllianceBonuses)[]) b[k] = (a.upgrades[k] || 0) * ALLIANCE_UPGRADES[k].perLevel;
  b.production += territoryBonus(w, a.id); // every system the alliance holds adds a little
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
    speed: w.config.economySpeed * w.config.productionBoost,
    allianceBonus: allianceBonuses(w, owner).production,
    noBasic: !!planet.isMoon,
    boost: mineBoost(owner),
    energyBoost: energyBoost(owner),
    position: planet.isMoon ? 0 : planet.coords.p,
    crawlers: planet.fleet.crawler || 0,
    crawlerMul: crawlerMul(owner),
  });
}

/** Storage scales with universe speed: at x20 the mines fill twenty times faster, so a classic-sized silo would waste almost everything. */
export function planetCapacity(w: World, planet: Planet): Res {
  const k = Math.max(1, w.config.economySpeed) * w.config.storageBoost;
  return {
    metal: storageCapacity(lvl(planet.buildings, 'metalStorage')) * k,
    crystal: storageCapacity(lvl(planet.buildings, 'crystalStorage')) * k,
    deuterium: storageCapacity(lvl(planet.buildings, 'deuteriumTank')) * k,
  };
}

function accrue(w: World, planet: Planet, from: number, to: number) {
  const dt = (to - from) / 3_600_000;
  if (dt <= 0) return;
  const prod = planetProduction(w, planet);
  const cap = planetCapacity(w, planet);
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
  if (w.players[planet.ownerId]?.vacation) { planet.updatedAt = now; return; } // vacation: nothing is produced
  settleWreck(w, planet, now);
  for (let job = planet.buildQueue; job && job.end <= now; job = planet.buildQueue) {
    accrue(w, planet, t, job.end);
    t = job.end;
    planet.buildings[job.id] = job.level;
    planet.buildQueue = null;
    if (job.down) {
      if (job.refund) planet.resources = addRes(planet.resources, job.refund);
      notifyPlayer(w, planet.ownerId, 'system', 'Demolition complete', `${BUILDINGS[job.id].name} on ${planet.name} was taken down to level ${job.level}${job.refund ? ` and returned ${Math.round(totalRes(job.refund)).toLocaleString('en-US')} resources` : ''}.`);
      bus.push({ to: planet.ownerId, type: 'toast', data: `${BUILDINGS[job.id].name} demolished to level ${job.level} on ${planet.name}` });
      startNextBuilding(w, planet, t);
      if (!planet.buildQueue) { planet.idleSince = t; planet.idleAlerted = false; }
      continue;
    }
    const ownerP = w.players[planet.ownerId];
    if (ownerP) ownerP.stats.buildingsDone++;
    notifyPlayer(w, planet.ownerId, 'system', `Construction complete`, `${BUILDINGS[job.id].name} on ${planet.name} is now level ${job.level}.`);
    bus.push({ to: planet.ownerId, type: 'toast', data: `${BUILDINGS[job.id].name} level ${job.level} done on ${planet.name}` });
    startNextBuilding(w, planet, t);
    if (!planet.buildQueue) { planet.idleSince = t; planet.idleAlerted = false; }
  }
  accrue(w, planet, t, now);
  processShipyard(w, planet, now);
  planet.updatedAt = now;
}

/** Begin the next affordable queued building at time `at`; unstartable entries are dropped with a message. */
function startNextBuilding(w: World, planet: Planet, at: number) {
  const owner = w.players[planet.ownerId];
  const backlog = (planet.buildBacklog ||= []);
  const paidList = (planet.buildPaid ||= []);
  while (backlog.length && !planet.buildQueue) {
    const id = backlog.shift()!;
    const paid = paidList.shift();
    try { beginBuilding(w, owner, planet, id, at, paid); }
    catch (e) {
      if (!(e instanceof GameError)) throw e;
      if (paid) planet.resources = addRes(planet.resources, paid);
      notifyPlayer(w, owner.id, 'system', 'Queued building dropped', `${BUILDINGS[id].name} on ${planet.name} could not start: ${e.message}.`);
    }
  }
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
    const builder = w.players[planet.ownerId];
    if (builder) builder.stats.shipsBuilt += n;
    if (u.kind === 'ship') planet.fleet[j.id as keyof typeof planet.fleet] = (planet.fleet[j.id as keyof typeof planet.fleet] || 0) + n;
    else planet.defenses[j.id as keyof typeof planet.defenses] = (planet.defenses[j.id as keyof typeof planet.defenses] || 0) + n;
    if (j.remaining <= 0) {
      q.shift();
      if (q[0]) q[0].start = j.start;
      notifyPlayer(w, planet.ownerId, 'system', 'Production complete', `${j.total}× ${u.name} finished on ${planet.name}.`);
    } else break;
  }
}

/** a finished repair returns its ships; an untouched wreck field eventually drifts away */
function settleWreck(w: World, planet: Planet, now: number) {
  const wreck = w.wrecks?.[planet.id];
  if (!wreck) return;
  if (wreck.repair) {
    if (wreck.repair.endsAt > now) return;
    for (const [id, n] of Object.entries(wreck.repair.ships)) planet.fleet[id as keyof typeof planet.fleet] = (planet.fleet[id as keyof typeof planet.fleet] || 0) + (n || 0);
    const count = Object.values(wreck.repair.ships).reduce((a, b) => a + (b || 0), 0);
    delete w.wrecks[planet.id];
    notifyPlayer(w, planet.ownerId, 'system', 'Repairs complete', `The Space Dock on ${planet.name} rebuilt ${count} ships from the wreck field.`);
    return;
  }
  if (wreck.expiresAt <= now) delete w.wrecks[planet.id];
}

export function processPlayer(w: World, player: Player, now: number) {
  for (let job = player.research; job && job.end <= now; job = player.research) {
    player.techs[job.id] = job.level;
    player.research = null;
    player.stats.researchDone++;
    notifyPlayer(w, player.id, 'system', 'Research complete', `${TECHS[job.id].name} is now level ${job.level}.`);
    bus.push({ to: player.id, type: 'toast', data: `Research: ${TECHS[job.id].name} level ${job.level}` });
    startNextResearch(w, player, job.end);
    if (!player.research) { player.researchIdleSince = job.end; player.researchIdleAlerted = false; }
  }
  for (const pid of player.planetIds) updatePlanet(w, w.planets[pid], now);
}

function startNextResearch(w: World, player: Player, at: number) {
  const backlog = (player.researchBacklog ||= []);
  while (backlog.length && !player.research) {
    const next = backlog.shift()!;
    const planet = w.planets[next.planetId] ?? w.planets[player.planetIds[0]];
    try {
      updatePlanet(w, planet, at);
      beginResearch(w, player, planet, next.id, at, next.paid);
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      if (next.paid) planet.resources = addRes(planet.resources, next.paid);
      notifyPlayer(w, player.id, 'system', 'Queued research dropped', `${TECHS[next.id].name} could not start: ${e.message}.`);
    }
  }
}

export function requirementsMet(planet: Planet | null, player: Player, reqs: Requirement[]): boolean {
  return reqs.every((r) => {
    if (r.id in BUILDINGS) return !!planet && lvl(planet.buildings, r.id as BuildingId) >= r.level;
    return lvl(player.techs, r.id as TechId) >= r.level;
  });
}

export function maxFields(planet: Planet): number {
  return planet.fields + (planet.isMoon ? 3 * lvl(planet.buildings, 'lunarBase') : 5 * lvl(planet.buildings, 'terraformer'));
}

export function usedFields(planet: Planet): number {
  let n = 0;
  for (const v of Object.values(planet.buildings)) n += v || 0;
  if (planet.buildQueue && !planet.buildQueue.down) n += 1;          // a building going up will take a field; one coming down already gave it back
  return n;
}

function pay(planet: Planet, cost: Res, what = '') {
  if (!canAfford(planet.resources, cost)) {
    const short = (['metal', 'crystal', 'deuterium'] as const).filter((k) => planet.resources[k] < cost[k]).map((k) => `${Math.ceil(cost[k] - planet.resources[k]).toLocaleString('en-US')} ${resName(k)}`);
    throw new GameError(`Not enough resources${what ? ` for ${what}` : ''} - short by ${short.join(', ')}`);
  }
  planet.resources = subRes(planet.resources, cost);
}

export function startBuilding(w: World, player: Player, planet: Planet, id: BuildingId, now: number) {
  assertActive(player, 'build');
  updatePlanet(w, planet, now);
  beginBuilding(w, player, planet, id, now);
}

export const MAX_BACKLOG = 4;

/** Start now if idle, otherwise line up behind the active job (paid when queued). */
export function queueBuilding(w: World, player: Player, planet: Planet, id: BuildingId, now: number) {
  assertActive(player, 'build');
  updatePlanet(w, planet, now);
  if (!Object.hasOwn(BUILDINGS, id)) throw new GameError('Unknown building');
  if (!planet.buildQueue) return beginBuilding(w, player, planet, id, now);
  const backlog = (planet.buildBacklog ||= []);
  if (backlog.length >= MAX_BACKLOG) throw new GameError(`Queue is full (${MAX_BACKLOG})`);
  if (!buildingAllowed(id, !!planet.isMoon)) throw new GameError(planet.isMoon ? 'That cannot be built on a moon' : 'That can only be built on a moon');
  if (id !== 'terraformer' && usedFields(planet) + backlog.length >= maxFields(planet)) throw new GameError('No free fields left on this planet');
  const level = lvl(planet.buildings, id) + 1 + (planet.buildQueue?.id === id ? 1 : 0) + backlog.filter((b) => b === id).length;
  const cost = buildingCost(id, level);
  pay(planet, cost, `${BUILDINGS[id].name} level ${level}`); // reserved now, so a queued job can never fail for lack of resources later
  const paid = (planet.buildPaid ||= []);
  while (paid.length < backlog.length) paid.push({ metal: 0, crystal: 0, deuterium: 0 }); // legacy entries carry no reservation
  backlog.push(id);
  paid.push(cost);
}

/** Swap a queued entry with its neighbour (dir -1 = earlier, +1 = later). Reservations travel with the entries. */
function swapIn<T>(list: T[] | undefined, i: number, j: number) {
  if (!list || i >= list.length || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}
export function moveQueuedBuilding(planet: Planet, index: number, dir: number) {
  const j = index + (dir < 0 ? -1 : 1);
  if (!planet.buildBacklog?.[index] || j < 0 || j >= planet.buildBacklog.length) throw new GameError('Cannot move that entry');
  swapIn(planet.buildBacklog, index, j);
  swapIn(planet.buildPaid, index, j);
}
export function moveQueuedResearch(player: Player, index: number, dir: number) {
  const j = index + (dir < 0 ? -1 : 1);
  if (!player.researchBacklog?.[index] || j < 0 || j >= player.researchBacklog.length) throw new GameError('Cannot move that entry');
  swapIn(player.researchBacklog, index, j);
}

export function unqueueBuilding(planet: Planet, index: number) {
  if (!planet.buildBacklog?.[index]) throw new GameError('No such queue entry');
  planet.buildBacklog.splice(index, 1);
  const [paid] = planet.buildPaid?.splice(index, 1) ?? [];
  if (paid) planet.resources = addRes(planet.resources, paid);
}

function beginBuilding(w: World, player: Player, planet: Planet, id: BuildingId, now: number, prepaid?: Res) {
  const def = BUILDINGS[id];
  if (!Object.hasOwn(BUILDINGS, id)) throw new GameError('Unknown building');
  if (planet.buildQueue) throw new GameError('Construction already in progress');
  if (!requirementsMet(planet, player, def.requires)) throw new GameError('Requirements not met');
  if (!buildingAllowed(id, !!planet.isMoon)) throw new GameError(planet.isMoon ? 'That cannot be built on a moon' : 'That can only be built on a moon');
  if (id !== 'terraformer' && usedFields(planet) >= maxFields(planet)) throw new GameError('No free fields left on this planet');
  if (id === 'researchLab' && player.research) throw new GameError('Cannot upgrade the lab while research is running');
  const level = lvl(planet.buildings, id) + 1;
  const cost = prepaid && (prepaid.metal || prepaid.crystal || prepaid.deuterium) ? prepaid : buildingCost(id, level);
  if (cost !== prepaid) pay(planet, cost, `${def.name} level ${level}`);
  const secs = buildingTime(cost, lvl(planet.buildings, 'roboticsFactory'), lvl(planet.buildings, 'naniteFactory'), w.config.economySpeed * w.config.constructionBoost, timeFactor(player));
  planet.buildQueue = { id, level, start: now, end: now + secs * 1000, cost };
  planet.idleSince = undefined; planet.idleAlerted = false;
}

/** Taking a building down one level: half the time it took to build that level, and 30% of its price comes back at the end. */
export const DEMOLISH = { timeShare: 0.5, refundShare: 0.3 };

/**
 * Demolish one level of a building. It uses the build slot of the planet, so nothing else can be queued there meanwhile and the queue has
 * to be empty to start. A level may not go if the fields or silo slots it provides are in use.
 */
export function startDemolition(w: World, player: Player, planet: Planet, id: BuildingId, now: number): BuildJob {
  assertActive(player, 'demolish');
  updatePlanet(w, planet, now);
  if (!Object.hasOwn(BUILDINGS, id)) throw new GameError('Unknown building');
  const have = lvl(planet.buildings, id);
  if (have < 1) throw new GameError(`There is no ${BUILDINGS[id].name} to demolish`);
  if (planet.buildQueue || planet.buildBacklog?.length) throw new GameError('Finish or cancel the building queue on this planet first');
  if (id === 'researchLab' && player.research) throw new GameError('Cannot take the lab down while research is running');
  if ((id === 'shipyard' || id === 'naniteFactory') && planet.shipyardQueue.length) throw new GameError('Empty the shipyard queue first');
  // the fields this level provides must not be in use
  const fieldsLost = id === 'terraformer' ? 5 : id === 'lunarBase' && planet.isMoon ? 3 : 0;
  if (fieldsLost && usedFields(planet) - 1 > maxFields(planet) - fieldsLost) throw new GameError(`The ${fieldsLost} fields this level gives are in use: demolish other buildings first`);
  if (id === 'missileSilo') {
    const slots = (u: string) => (u === 'interplanetaryMissile' ? 2 : 1);
    const stored = Object.entries(planet.defenses).reduce((s, [k, n]) => s + (UNITS[k as UnitId].missile ? slots(k) * (n || 0) : 0), 0);
    if (stored > 10 * (have - 1)) throw new GameError('The missiles stored in the silo would no longer fit: fire or remove some first');
  }
  const price = buildingCost(id, have);
  const secs = buildingTime(price, lvl(planet.buildings, 'roboticsFactory'), lvl(planet.buildings, 'naniteFactory'), w.config.economySpeed * w.config.constructionBoost, timeFactor(player)) * DEMOLISH.timeShare;
  const job: BuildJob = { id, level: have - 1, start: now, end: now + secs * 1000, cost: { metal: 0, crystal: 0, deuterium: 0 }, down: true, refund: scaleRes(price, DEMOLISH.refundShare) };
  job.refund = { metal: Math.floor(job.refund!.metal), crystal: Math.floor(job.refund!.crystal), deuterium: Math.floor(job.refund!.deuterium) };
  planet.buildQueue = job;
  return job;
}

export function cancelBuilding(w: World, planet: Planet, now: number) {
  updatePlanet(w, planet, now);
  const j = planet.buildQueue;
  if (!j) throw new GameError('Nothing to cancel');
  planet.resources = addRes(planet.resources, j.cost);
  planet.buildQueue = null;
  startNextBuilding(w, planet, now);
}

export function startResearch(w: World, player: Player, planet: Planet, id: TechId, now: number) {
  assertActive(player, 'research');
  updatePlanet(w, planet, now);
  beginResearch(w, player, planet, id, now);
}

/** Start now if idle, otherwise line up behind the active research (paid when queued). */
export function queueResearch(w: World, player: Player, planet: Planet, id: TechId, now: number) {
  assertActive(player, 'research');
  updatePlanet(w, planet, now);
  if (!Object.hasOwn(TECHS, id)) throw new GameError('Unknown technology');
  if (!player.research) return beginResearch(w, player, planet, id, now);
  const backlog = (player.researchBacklog ||= []);
  if (backlog.length >= MAX_BACKLOG) throw new GameError(`Queue is full (${MAX_BACKLOG})`);
  const lv = lvl(player.techs, id) + 1 + (player.research?.id === id ? 1 : 0) + backlog.filter((b) => b.id === id).length;
  const cost = techCost(id, lv);
  pay(planet, cost, `${TECHS[id].name} level ${lv}`);
  backlog.push({ id, planetId: planet.id, paid: cost });
}

export function unqueueResearch(w: World, player: Player, index: number) {
  const entry = player.researchBacklog?.[index];
  if (!entry) throw new GameError('No such queue entry');
  player.researchBacklog.splice(index, 1);
  const p = w.planets[entry.planetId];
  if (entry.paid && p) { p.resources = addRes(p.resources, entry.paid); }
}

function beginResearch(w: World, player: Player, planet: Planet, id: TechId, now: number, prepaid?: Res) {
  const def = TECHS[id];
  if (!Object.hasOwn(TECHS, id)) throw new GameError('Unknown technology');
  if (player.research) throw new GameError('Research already in progress');
  if (planet.buildQueue?.id === 'researchLab') throw new GameError('The research lab is being upgraded');
  if (!requirementsMet(planet, player, def.requires)) throw new GameError('Requirements not met');
  const level = lvl(player.techs, id) + 1;
  if (def.energyReq) {
    const need = def.energyReq * Math.pow(3, level - 1);
    if (planetProduction(w, planet).energyProduced < need) throw new GameError(`Needs ${Math.round(need).toLocaleString('en-US')} energy production on this planet`);
  }
  const cost = prepaid ?? techCost(id, level);
  if (!prepaid) pay(planet, cost, `${def.name} level ${level}`);
  const secs = researchTime(cost, lvl(planet.buildings, 'researchLab'), w.config.economySpeed * w.config.researchBoost, allianceBonuses(w, player).research, timeFactor(player) * researchFactor(player));
  player.research = { id, level, start: now, end: now + secs * 1000, cost, planetId: planet.id };
  player.researchIdleSince = undefined; player.researchIdleAlerted = false;
}

export function cancelResearch(w: World, player: Player, now: number) {
  const j = player.research;
  if (!j) throw new GameError('Nothing to cancel');
  const p = w.planets[j.planetId] ?? w.planets[player.planetIds[0]];
  updatePlanet(w, p, now);
  p.resources = addRes(p.resources, j.cost);
  player.research = null;
  startNextResearch(w, player, now);
}

export function queueUnits(w: World, player: Player, planet: Planet, id: UnitId, count: number, now: number) {
  assertActive(player, 'build ships or defenses');
  updatePlanet(w, planet, now);
  const def = UNITS[id];
  if (!Object.hasOwn(UNITS, id)) throw new GameError('Unknown unit');
  count = Math.floor(count);
  if (!(count >= 1) || count > 1_000_000) throw new GameError('Invalid amount');
  if (lvl(planet.buildings, 'shipyard') < 1) throw new GameError('A shipyard is required');
  if (planet.buildQueue && (planet.buildQueue.id === 'shipyard' || planet.buildQueue.id === 'naniteFactory')) throw new GameError('The shipyard is being upgraded');
  if (!requirementsMet(planet, player, def.requires)) throw new GameError('Requirements not met');
  if (id === 'crawler' && planet.isMoon) throw new GameError('Crawlers only work on planets');
  if (def.max) {
    const have = (planet.defenses as Record<string, number>)[id] || 0;
    const queued = planet.shipyardQueue.filter((j) => j.id === id).reduce((s, j) => s + j.remaining, 0);
    if (have + queued + count > def.max) throw new GameError(`Only ${def.max} allowed per planet`);
  }
  if (def.missile) {
    const slots = (u: string) => (u === 'interplanetaryMissile' ? 2 : 1);
    const cap = 10 * lvl(planet.buildings, 'missileSilo');
    const stored = Object.entries(planet.defenses).reduce((s, [k, n]) => s + (UNITS[k as UnitId].missile ? slots(k) * (n || 0) : 0), 0);
    const queued = planet.shipyardQueue.reduce((s, j) => s + (UNITS[j.id].missile ? slots(j.id) * j.remaining : 0), 0);
    if (stored + queued + slots(id) * count > cap) throw new GameError(`The silo can hold ${cap} missile slots (an interplanetary missile uses 2)`);
  }
  const total = scaleRes(def.cost, count);
  pay(planet, total);
  const unitMs = unitTime(id, lvl(planet.buildings, 'shipyard'), lvl(planet.buildings, 'naniteFactory'), w.config.economySpeed * w.config.shipyardBoost, timeFactor(player)) * 1000;
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

export function abandonPlanet(w: World, player: Player, planet: Planet, name: string, now: number) {
  if (planet.ownerId !== player.id) throw new GameError('Not your planet', 403);
  if (planet.isMoon) throw new GameError('Moons cannot be abandoned');
  if (planet.isHome || player.planetIds.filter((id) => !w.planets[id]?.isMoon).length < 2) throw new GameError('You cannot abandon your homeworld');
  if (name.trim() !== planet.name) throw new GameError('Type the planet name to confirm');
  if (player.research?.planetId === planet.id) throw new GameError('Research is running from this planet');
  for (const m of Object.values(w.movements)) {
    const moonId = Object.values(w.planets).find((x) => x.parentId === planet.id)?.id;
    if ((m.fromPlanetId === planet.id || (moonId && m.fromPlanetId === moonId)) && m.ownerId === player.id) throw new GameError('Fleets from this planet are still in flight');
    const here = m.to.g === planet.coords.g && m.to.s === planet.coords.s && m.to.p === planet.coords.p;
    if (m.mission === 'hold' && m.phase === 'holding' && here) throw new GameError('Allied fleets are stationed here - ask them to leave first');
  }
  updatePlanet(w, planet, now);
  delete w.wrecks[planet.id];
  for (const moon of Object.values(w.planets)) if (moon.parentId === planet.id) { player.planetIds = player.planetIds.filter((id) => id !== moon.id); delete w.planets[moon.id]; }
  player.planetIds = player.planetIds.filter((id) => id !== planet.id);
  delete w.planets[planet.id];
}

/** Travelling merchant: swaps resources at a fixed 3:2:1 rate, keeping a 12% cut. */
const DAY_MS = 86_400_000;
/** Today's cheap trade and what is left of this commander's allowance (500k per speed point, e.g. 10M at x20). */
export function merchantDeal(w: World, p: Player, now: number) {
  const day = Math.floor(now / DAY_MS);
  const cap = 500_000 * Math.max(1, w.config.economySpeed);
  const used = p.dealUsed?.day === day ? p.dealUsed.amount : 0;
  return { ...dailyDeal(day), fee: DEAL_FEE, cap, used, left: Math.max(0, cap - used), day, resetsAt: (day + 1) * DAY_MS };
}

export function tradeResources(w: World, planet: Planet, give: string, get: string, amount: number, now: number): number {
  const keys = ['metal', 'crystal', 'deuterium'] as const;
  if (!keys.includes(give as never) || !keys.includes(get as never)) throw new GameError('Unknown resource');
  if (give === get) throw new GameError('Pick two different resources');
  assertActive(w.players[planet.ownerId], 'trade');
  amount = Math.floor(amount);
  if (!(amount > 0)) throw new GameError('Enter an amount to trade');
  updatePlanet(w, planet, now);
  const g = give as (typeof keys)[number], t = get as (typeof keys)[number];
  if (planet.resources[g] < amount) throw new GameError(`Not enough ${resName(g)} on ${planet.name}`);
  const owner = w.players[planet.ownerId];
  const deal = merchantDeal(w, owner, now);
  const cheap = deal.give === g && deal.get === t ? Math.min(amount, deal.left) : 0;
  const out = (cheap ? tradeQuote(g, t, cheap, DEAL_FEE) : 0) + (amount - cheap > 0 ? tradeQuote(g, t, amount - cheap, tradeFee(owner)) : 0);
  if (out <= 0) throw new GameError('That is too small a load for the merchant to bother with');
  if (cheap) owner.dealUsed = { day: deal.day, amount: deal.used + cheap };
  planet.resources[g] -= amount;
  planet.resources[t] += out;
  return out;
}
