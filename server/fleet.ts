import { UNITS, SHIP_IDS, DEFENSE_IDS, BUILDING_IDS, TECH_IDS, isShip } from '../shared/data';
import {
  addRes, cargoCapacity, canAfford, distance, flightSeconds, fleetSpeed, fuelUse, lvl, sameCoords, subRes, totalRes, zeroRes,
} from '../shared/formulas';
import { computeLoot, fleetCount, makeRng, simulateCombat, type Combatant, type CombatResult } from '../shared/combat';
import type { Coords, Defenses, Fleet, Mission, Res, ShipId } from '../shared/types';
import { bus } from './bus';
import { allianceBonuses, planetCapacity, processPlayer, updatePlanet } from './economy';
import { createPlanet, inBounds, isProtected, maxExpeditions, maxPlanets } from './galaxy';
import { notifyPlayer } from './messages';
import { buildNpcFleet, fleetValue } from './npc';
import { GameError, ck, planetAt, sameAlliance, uid, type Movement, type Planet, type Player, type World } from './world';

export interface SendRequest {
  fromPlanetId: string;
  to: Coords;
  ships: Fleet;
  mission: Mission;
  speedPct?: number;
  cargo?: Partial<Res>;
  holdHours?: number;
}

const fmt = (c: Coords) => `[${c.g}:${c.s}:${c.p}]`;
const num = (n: number) => Math.round(n).toLocaleString('en-US');

export function activeSlots(w: World, player: Player) {
  const mine = Object.values(w.movements).filter((m) => m.ownerId === player.id);
  return {
    used: mine.filter((m) => m.mission !== 'expedition').length,
    max: 1 + lvl(player.techs, 'computer'),
    expUsed: mine.filter((m) => m.mission === 'expedition').length,
    expMax: maxExpeditions(player),
  };
}

export function flightPlan(w: World, player: Player, ships: Fleet, from: Coords, to: Coords, speedPct: number) {
  const lg = allianceBonuses(w, player).logistics;
  const dist = distance(from, to);
  const speed = fleetSpeed(ships, player.techs, lg);
  const secs = flightSeconds(dist, speed, speedPct, w.config.fleetSpeed);
  return { dist, speed, secs, fuel: fuelUse(ships, dist, speedPct) };
}

export function sendFleet(w: World, player: Player, req: SendRequest, now: number): Movement {
  const planet = w.planets[req.fromPlanetId];
  if (!planet || planet.ownerId !== player.id) throw new GameError('Not your planet', 403);
  updatePlanet(w, planet, now);

  const ships: Fleet = {};
  for (const [id, n] of Object.entries(req.ships || {})) {
    const c = Math.floor(Number(n));
    if (!c || c < 0) continue;
    if (!isShip(id)) throw new GameError(`Unknown ship ${id}`);
    if (c > (planet.fleet[id] || 0)) throw new GameError(`Not enough ${UNITS[id].name}`);
    ships[id] = c;
  }
  if (!fleetCount(ships)) throw new GameError('Select at least one ship');
  if (ships.solarSatellite) throw new GameError('Solar satellites cannot leave orbit');
  const speedPct = Math.min(100, Math.max(10, Math.round((req.speedPct ?? 100) / 10) * 10));
  const mission = req.mission;
  const to = req.to;
  const expedition = mission === 'expedition';
  if (!inBounds(w, to, expedition)) throw new GameError('Invalid destination');
  if (expedition !== (to.p === w.config.positions + 1)) throw new GameError(expedition ? 'Expeditions must target deep space (position ' + (w.config.positions + 1) + ')' : 'Invalid destination');
  if (sameCoords(to, planet.coords)) throw new GameError('You are already there');

  const slots = activeSlots(w, player);
  if (expedition) {
    if (lvl(player.techs, 'astrophysics') < 1) throw new GameError('Astrophysics research is required for expeditions');
    if (slots.expUsed >= slots.expMax) throw new GameError('No free expedition slots');
  } else if (slots.used >= slots.max) throw new GameError('No free fleet slots (research Computer Technology)');

  const target = planetAt(w, to);
  const targetOwner = target ? w.players[target.ownerId] : null;
  const has = (id: ShipId) => (ships[id] || 0) > 0;

  switch (mission) {
    case 'attack': {
      if (!target || !targetOwner) throw new GameError('There is no planet there');
      if (targetOwner.id === player.id) throw new GameError('Cannot attack yourself');
      if (sameAlliance(w, player.id, targetOwner.id)) throw new GameError('Cannot attack an alliance member');
      if (!SHIP_IDS.some((id) => has(id) && UNITS[id].attack > 1)) throw new GameError('Your fleet has no combat ships');
      if (isProtected(w, player, targetOwner)) throw new GameError('That player is under newbie protection');
      break;
    }
    case 'transport':
      if (!target) throw new GameError('There is no planet there');
      break;
    case 'deploy':
      if (!target || target.ownerId !== player.id) throw new GameError('You can only deploy to your own planets');
      break;
    case 'hold':
      if (!target || !targetOwner || targetOwner.id === player.id) throw new GameError('Choose an ally\'s planet');
      if (!sameAlliance(w, player.id, targetOwner.id)) throw new GameError('You can only station fleets at alliance members');
      break;
    case 'espionage':
      if (!target || !targetOwner || targetOwner.id === player.id) throw new GameError('Choose another player\'s planet');
      if (!has('espionageProbe')) throw new GameError('Espionage needs probes');
      if (isProtected(w, player, targetOwner)) throw new GameError('That player is under newbie protection');
      break;
    case 'colonize':
      if (target) throw new GameError('That position is already colonized');
      if (!has('colonyShip')) throw new GameError('A colony ship is required');
      if (player.planetIds.length >= maxPlanets(player)) throw new GameError(`Colony limit reached (${maxPlanets(player)} - research Astrophysics)`);
      break;
    case 'recycle':
      if (!has('recycler')) throw new GameError('Recyclers are required');
      if (!w.debris[ck(to)]) throw new GameError('There is no debris field there');
      break;
    case 'expedition':
      break;
    default:
      throw new GameError('Unknown mission');
  }

  const plan = flightPlan(w, player, ships, planet.coords, to, speedPct);
  if (!Number.isFinite(plan.secs)) throw new GameError('This fleet cannot move');
  const cargo: Res = {
    metal: Math.max(0, Math.floor(req.cargo?.metal || 0)),
    crystal: Math.max(0, Math.floor(req.cargo?.crystal || 0)),
    deuterium: Math.max(0, Math.floor(req.cargo?.deuterium || 0)),
  };
  if (mission === 'attack' || mission === 'espionage') { cargo.metal = cargo.crystal = cargo.deuterium = 0; }
  const cap = cargoCapacity(ships);
  if (totalRes(cargo) > cap) throw new GameError(`Cargo exceeds capacity (${num(cap)})`);
  const need = addRes(cargo, { metal: 0, crystal: 0, deuterium: plan.fuel });
  if (!canAfford(planet.resources, need)) throw new GameError(`Not enough resources (fuel: ${num(plan.fuel)} deuterium)`);

  planet.resources = subRes(planet.resources, need);
  for (const [id, n] of Object.entries(ships)) planet.fleet[id as ShipId] = (planet.fleet[id as ShipId] || 0) - (n || 0);
  for (const id of SHIP_IDS) if (!planet.fleet[id]) delete planet.fleet[id];

  const m: Movement = {
    id: uid(), ownerId: player.id, ownerName: player.username, mission, phase: 'outbound',
    from: { ...planet.coords }, fromPlanetId: planet.id, to: { ...to }, ships, cargo,
    speedPct, departAt: now, arriveAt: now + plan.secs * 1000, flightMs: plan.secs * 1000,
    holdHours: mission === 'hold' ? Math.min(48, Math.max(0.1, Number(req.holdHours) || 1)) : undefined,
  };
  w.movements[m.id] = m;

  if (mission === 'attack' && targetOwner) {
    notifyPlayer(w, targetOwner.id, 'system', 'Hostile fleet detected', `${player.username} is attacking ${target!.name} ${fmt(to)}. ETA ${new Date(m.arriveAt).toLocaleTimeString()}.`);
    bus.push({ to: targetOwner.id, type: 'alert', data: `Hostile fleet inbound to ${target!.name}` });
    for (const mem of targetOwner.allianceId ? w.alliances[targetOwner.allianceId]?.members ?? [] : []) {
      if (mem.playerId !== targetOwner.id) bus.push({ to: mem.playerId, type: 'alert', data: `${targetOwner.username} is being attacked - consider sending help` });
    }
  }
  bus.push({ to: player.id, type: 'refresh' });
  return m;
}

export function recallFleet(w: World, player: Player, id: string, now: number) {
  const m = w.movements[id];
  if (!m || m.ownerId !== player.id) throw new GameError('Unknown fleet', 404);
  if (m.phase === 'returning') throw new GameError('Fleet is already returning');
  if (m.phase === 'outbound') {
    const elapsed = now - m.departAt;
    m.returnAt = now + elapsed;
    m.flightMs = elapsed;
  } else {
    m.returnAt = now + m.flightMs;
  }
  m.phase = 'returning';
  bus.push({ to: player.id, type: 'refresh' });
}

function eventTime(m: Movement): number {
  return m.phase === 'outbound' ? m.arriveAt : m.phase === 'holding' ? m.holdUntil ?? m.arriveAt : m.returnAt ?? m.arriveAt;
}

export function processMovements(w: World, now: number) {
  for (let guard = 0; guard < 10_000; guard++) {
    let next: Movement | null = null;
    for (const m of Object.values(w.movements)) {
      const t = eventTime(m);
      if (t <= now && (!next || t < eventTime(next))) next = m;
    }
    if (!next) return;
    const t = eventTime(next);
    if (next.phase === 'outbound') arrive(w, next, t);
    else if (next.phase === 'holding') startReturn(w, next, t);
    else land(w, next, t);
  }
}

function startReturn(w: World, m: Movement, at: number) {
  m.phase = 'returning';
  m.returnAt = at + m.flightMs;
  if (m.ownerId) bus.push({ to: m.ownerId, type: 'refresh' });
}

function sendHome(m: Movement, at: number) {
  m.phase = 'returning';
  m.returnAt = at + m.flightMs;
}

/** Fleet reaches its home planet again (or deploy target). */
function land(w: World, m: Movement, at: number, dest?: Planet) {
  delete w.movements[m.id];
  if (!m.ownerId) return;
  const owner = w.players[m.ownerId];
  if (!owner) return;
  let planet = dest ?? (m.fromPlanetId ? w.planets[m.fromPlanetId] : undefined);
  if (!planet || planet.ownerId !== owner.id) planet = w.planets[owner.planetIds[0]];
  if (!planet) return;
  updatePlanet(w, planet, at);
  for (const [id, n] of Object.entries(m.ships)) planet.fleet[id as ShipId] = (planet.fleet[id as ShipId] || 0) + (n || 0);
  planet.resources = addRes(planet.resources, m.cargo);
  if (totalRes(m.cargo) > 0 || m.mission === 'deploy') {
    bus.push({ to: owner.id, type: 'toast', data: `Fleet arrived at ${planet.name}${totalRes(m.cargo) ? ` carrying ${num(totalRes(m.cargo))} resources` : ''}` });
  }
  bus.push({ to: owner.id, type: 'refresh' });
}

function arrive(w: World, m: Movement, at: number) {
  const target = planetAt(w, m.to);
  switch (m.mission) {
    case 'attack': return resolveAttack(w, m, at);
    case 'espionage': return resolveEspionage(w, m, at);
    case 'transport': {
      if (!target) { sendHome(m, at); return; }
      updatePlanet(w, target, at);
      const delivered = m.cargo;
      target.resources = addRes(target.resources, delivered);
      m.cargo = zeroRes();
      const owner = w.players[m.ownerId!];
      const body = `${num(delivered.metal)} metal, ${num(delivered.crystal)} crystal, ${num(delivered.deuterium)} deuterium delivered to ${target.name} ${fmt(m.to)}.`;
      notifyPlayer(w, owner.id, 'transport', 'Transport arrived', body);
      if (target.ownerId !== owner.id) notifyPlayer(w, target.ownerId, 'transport', `Delivery from ${owner.username}`, body);
      bus.push({ to: target.ownerId, type: 'refresh' });
      sendHome(m, at);
      return;
    }
    case 'deploy': {
      if (!target || target.ownerId !== m.ownerId) { sendHome(m, at); return; }
      land(w, m, at, target);
      return;
    }
    case 'hold': {
      if (!target) { sendHome(m, at); return; }
      m.phase = 'holding';
      m.holdUntil = at + (m.holdHours ?? 1) * 3_600_000;
      notifyPlayer(w, target.ownerId, 'alliance', 'Allied fleet arrived', `${m.ownerName} stationed ${fleetCount(m.ships)} ships at ${target.name} ${fmt(m.to)} to defend it.`);
      bus.push({ to: target.ownerId, type: 'refresh' });
      return;
    }
    case 'colonize': return resolveColonize(w, m, at);
    case 'recycle': return resolveRecycle(w, m, at);
    case 'expedition': return resolveExpedition(w, m, at);
  }
}

// ---------------------------------------------------------------- colonize / recycle

function resolveColonize(w: World, m: Movement, at: number) {
  const owner = w.players[m.ownerId!];
  if (planetAt(w, m.to) || owner.planetIds.length >= maxPlanets(owner) || !(m.ships.colonyShip || 0)) {
    notifyPlayer(w, owner.id, 'system', 'Colonization failed', `Could not settle ${fmt(m.to)} - the position is taken or you reached your colony limit. The fleet is returning.`);
    sendHome(m, at);
    return;
  }
  const colony = createPlanet(w, owner, { ...m.to }, { name: 'Colony', now: at });
  m.ships.colonyShip = (m.ships.colonyShip || 0) - 1;
  if (!m.ships.colonyShip) delete m.ships.colonyShip;
  notifyPlayer(w, owner.id, 'system', 'New colony founded', `You settled ${fmt(m.to)} (${colony.fields} fields, max ${colony.maxTemp}°C).`);
  land(w, m, at, colony);
}

function resolveRecycle(w: World, m: Movement, at: number) {
  const key = ck(m.to);
  const d = w.debris[key];
  const owner = w.players[m.ownerId!];
  if (!d) {
    notifyPlayer(w, owner.id, 'system', 'Recycling', `There was no debris left at ${fmt(m.to)}.`);
    sendHome(m, at);
    return;
  }
  const free = (m.ships.recycler || 0) * UNITS.recycler.cargo - totalRes(m.cargo);
  const takeM = Math.min(d.metal, Math.max(0, free));
  const takeC = Math.min(d.crystal, Math.max(0, free - takeM));
  d.metal -= takeM; d.crystal -= takeC;
  if (d.metal <= 0 && d.crystal <= 0) delete w.debris[key];
  m.cargo.metal += takeM; m.cargo.crystal += takeC;
  notifyPlayer(w, owner.id, 'system', 'Debris collected', `Recyclers harvested ${num(takeM)} metal and ${num(takeC)} crystal at ${fmt(m.to)}.`);
  sendHome(m, at);
}

// ---------------------------------------------------------------- espionage

function resolveEspionage(w: World, m: Movement, at: number) {
  const target = planetAt(w, m.to);
  const spy = w.players[m.ownerId!];
  if (!target) { sendHome(m, at); return; }
  const def = w.players[target.ownerId];
  processPlayer(w, def, at);
  const probes = m.ships.espionageProbe || 0;
  const diff = lvl(spy.techs, 'espionage') - lvl(def.techs, 'espionage');
  const level = probes + (diff >= 0 ? diff * diff : -(diff * diff));

  let defShips = 0;
  for (const [id, n] of Object.entries(target.fleet)) if (id !== 'solarSatellite') defShips += n || 0;
  const chance = Math.min(1, ((defShips + 1) * Math.pow(2, -diff)) / (probes * 8 + 1) * 0.25);
  const caught = Math.random() < chance;

  notifyPlayer(w, def.id, 'espionage', 'Espionage activity', `Foreign probes were detected near ${target.name} ${fmt(m.to)} (from ${spy.username}).${caught ? ' Your defenses shot them down.' : ''}`);
  if (caught) {
    delete w.movements[m.id];
    notifyPlayer(w, spy.id, 'espionage', `Probes lost at ${fmt(m.to)}`, 'Your probes were destroyed by counter-espionage.');
    return;
  }

  const lines: Record<string, unknown> = {};
  lines.resources = { ...target.resources };
  if (level >= 2) lines.fleet = { ...target.fleet };
  if (level >= 3) lines.defenses = { ...target.defenses };
  if (level >= 5) lines.buildings = { ...target.buildings };
  if (level >= 7) lines.techs = { ...def.techs };
  const report = {
    coords: m.to, planet: target.name, owner: def.username, level, ...lines,
  };
  const r = target.resources;
  notifyPlayer(w, spy.id, 'espionage', `Spy report ${target.name} ${fmt(m.to)}`,
    `${def.username}: metal ${num(r.metal)}, crystal ${num(r.crystal)}, deuterium ${num(r.deuterium)}.`, report);
  sendHome(m, at);
}

// ---------------------------------------------------------------- combat

function combatant(w: World, player: Player | null, name: string, fleet: Fleet, defenses?: Defenses): Combatant {
  return {
    owner: player?.id ?? null, name,
    weapons: lvl(player?.techs, 'weapons'), shielding: lvl(player?.techs, 'shielding'), armour: lvl(player?.techs, 'armour'),
    fleet: { ...fleet }, defenses: defenses ? { ...defenses } : undefined,
  };
}

const onlyShips = (a: Record<string, number | undefined>): Fleet => {
  const f: Fleet = {};
  for (const id of SHIP_IDS) if (a[id]) f[id] = a[id];
  return f;
};
const onlyDefs = (a: Record<string, number | undefined>): Defenses => {
  const d: Defenses = {};
  for (const id of DEFENSE_IDS) if (a[id]) d[id] = a[id];
  return d;
};

function addDebris(w: World, c: Coords, metal: number, crystal: number) {
  if (metal <= 0 && crystal <= 0) return;
  const k = ck(c);
  const d = (w.debris[k] ||= { metal: 0, crystal: 0 });
  d.metal += metal; d.crystal += crystal;
}

function summarize(units: Record<string, number | undefined>): string {
  const parts = Object.entries(units).filter(([, n]) => n).map(([id, n]) => `${n}× ${UNITS[id as ShipId].name}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

function resolveAttack(w: World, m: Movement, at: number) {
  const target = planetAt(w, m.to);
  const attacker = m.ownerId ? w.players[m.ownerId] : null;
  if (!target) {
    if (attacker) { notifyPlayer(w, attacker.id, 'combat', 'Attack aborted', `Nothing at ${fmt(m.to)}.`); sendHome(m, at); }
    else delete w.movements[m.id];
    return;
  }
  const defOwner = w.players[target.ownerId];
  processPlayer(w, defOwner, at);
  if (attacker) processPlayer(w, attacker, at);

  const holders = Object.values(w.movements).filter((h) => h.phase === 'holding' && h.mission === 'hold' && sameCoords(h.to, m.to));
  const defenders: Combatant[] = [combatant(w, defOwner, defOwner.username, target.fleet, target.defenses)];
  for (const h of holders) defenders.push(combatant(w, w.players[h.ownerId!], h.ownerName, h.ships));

  const rng = makeRng(Math.floor(Math.random() * 2 ** 31));
  const res: CombatResult = simulateCombat(
    [combatant(w, attacker, m.ownerName, m.ships)], defenders, rng,
  );

  // apply results
  const planetAfter = res.defenders[0].after;
  target.fleet = onlyShips(planetAfter);
  target.defenses = onlyDefs(planetAfter);
  holders.forEach((h, i) => {
    const after = onlyShips(res.defenders[i + 1].after);
    if (fleetCount(after)) h.ships = after;
    else delete w.movements[h.id];
  });
  m.ships = onlyShips(res.attackers[0].after);
  addDebris(w, m.to, res.debris.metal, res.debris.crystal);

  let loot: Res = zeroRes();
  const survivors = fleetCount(m.ships) > 0;
  if (res.winner === 'attacker' && survivors) {
    const free = cargoCapacity(m.ships) - totalRes(m.cargo);
    loot = computeLoot(target.resources, Math.max(0, free));
    target.resources = subRes(target.resources, loot);
    if (attacker) m.cargo = addRes(m.cargo, loot);
  }

  // NPC bounty: defenders share a reward when raiders are crushed
  let bounty = 0;
  if (!attacker && res.winner === 'defender') {
    bounty = Math.floor(fleetValue(onlyShips(res.attackers[0].before)) * 0.25);
    const owners = new Set<string>([defOwner.id, ...holders.map((h) => h.ownerId!)]);
    const share = Math.floor(bounty / owners.size);
    for (const oid of owners) {
      const o = w.players[oid];
      const home = oid === defOwner.id ? target : w.planets[o.planetIds[0]];
      updatePlanet(w, home, at);
      home.resources.metal += Math.floor(share * 0.6);
      home.resources.crystal += Math.floor(share * 0.4);
      o.stats.raidsRepelled++;
    }
  }

  const report = {
    coords: m.to, planet: target.name, rounds: res.rounds, winner: res.winner, debris: res.debris, loot, bounty,
    attackers: res.attackers.map((a) => ({ name: a.name, before: a.before, after: a.after, lost: a.lost })),
    defenders: res.defenders.map((d) => ({ name: d.name, before: d.before, after: d.after, lost: d.lost, rebuilt: d.rebuilt })),
  };
  const headline = res.winner === 'attacker' ? 'Attacker victory' : res.winner === 'defender' ? 'Defender victory' : 'Draw';
  const body =
    `${m.ownerName} vs ${defOwner.username} at ${target.name} ${fmt(m.to)} - ${headline} after ${res.rounds} round(s).\n` +
    `Attacker lost: ${summarize(Object.fromEntries(Object.entries(res.attackers[0].before).map(([k, v]) => [k, (v || 0) - (res.attackers[0].after[k as ShipId] || 0)])))}.\n` +
    `Defender lost: ${summarize(Object.fromEntries(Object.entries(res.defenders[0].before).map(([k, v]) => [k, (v || 0) - (res.defenders[0].after[k as ShipId] || 0) + (res.defenders[0].rebuilt[k as keyof Defenses] || 0)])))}.\n` +
    (totalRes(loot) ? `Loot: ${num(loot.metal)} metal, ${num(loot.crystal)} crystal, ${num(loot.deuterium)} deuterium.\n` : '') +
    (res.debris.metal || res.debris.crystal ? `Debris field: ${num(res.debris.metal)} metal, ${num(res.debris.crystal)} crystal.\n` : '') +
    (bounty ? `Raider bounty: ${num(bounty)} resources shared among defenders.` : '');

  const involved = new Set<string>();
  if (attacker) involved.add(attacker.id);
  involved.add(defOwner.id);
  for (const h of holders) involved.add(h.ownerId!);
  for (const pid of involved) notifyPlayer(w, pid, m.ownerId ? 'combat' : 'raid', `Battle at ${fmt(m.to)}: ${headline}`, body, report);

  if (attacker) {
    if (res.winner === 'attacker') { attacker.stats.battlesWon++; defOwner.stats.battlesLost++; }
    else if (res.winner === 'defender') { attacker.stats.battlesLost++; defOwner.stats.battlesWon++; }
  }
  bus.push({ to: '*', type: 'refresh' });

  if (!survivors || !attacker) delete w.movements[m.id];
  else sendHome(m, at);
}

// ---------------------------------------------------------------- expeditions

function resolveExpedition(w: World, m: Movement, at: number) {
  const owner = w.players[m.ownerId!];
  owner.stats.expeditions++;
  const value = fleetValue(m.ships);
  const r = Math.random();
  const free = Math.max(0, cargoCapacity(m.ships) - totalRes(m.cargo));
  let title = 'Expedition: nothing found';
  let text = 'Your fleet drifted through empty space and found nothing of interest.';
  let hold = 3_600_000 / w.config.fleetSpeed;

  if (r < 0.3) {
    // nothing
  } else if (r < 0.58) {
    const kind = (['metal', 'crystal', 'deuterium'] as const)[Math.floor(Math.random() * 3)];
    const amount = Math.min(free, Math.floor((3000 + value * 0.04) * (0.5 + Math.random()) * Math.sqrt(w.config.economySpeed)));
    m.cargo[kind] += amount;
    title = 'Expedition: resources found';
    text = `Your fleet discovered a rich asteroid cluster and loaded ${num(amount)} ${kind}.`;
  } else if (r < 0.68) {
    const budget = Math.max(3000, value * (0.05 + Math.random() * 0.1));
    const found = buildNpcFleet(budget, Math.random);
    const added: Fleet = {};
    for (const [id, n] of Object.entries(found)) { if (UNITS[id as ShipId].attack > 1 && id !== 'battleship') { m.ships[id as ShipId] = (m.ships[id as ShipId] || 0) + (n || 0); added[id as ShipId] = n; } }
    title = 'Expedition: derelict ships';
    text = fleetCount(added) ? `A drifting fleet agreed to join you: ${summarize(added)}.` : 'You found only scrap.';
  } else if (r < 0.77) {
    const budget = Math.max(4000, value * (0.3 + Math.random() * 0.4));
    const pirates = buildNpcFleet(budget, Math.random);
    const rng = makeRng(Math.floor(Math.random() * 2 ** 31));
    const res = simulateCombat([combatant(w, owner, m.ownerName, m.ships)], [combatant(w, null, 'Space pirates', pirates)], rng);
    m.ships = onlyShips(res.attackers[0].after);
    addDebris(w, m.to, 0, 0);
    title = res.winner === 'attacker' ? 'Expedition: pirates defeated' : 'Expedition: ambushed by pirates';
    text = `Pirates attacked your expedition. Your losses: ${summarize(Object.fromEntries(Object.entries(res.attackers[0].before).map(([k, v]) => [k, (v || 0) - (res.attackers[0].after[k as ShipId] || 0)])))}.`;
    if (!fleetCount(m.ships)) { delete w.movements[m.id]; notifyPlayer(w, owner.id, 'expedition', title, text + ' The entire fleet was lost.'); return; }
  } else if (r < 0.84) {
    m.flightMs = Math.floor(m.flightMs * (1.5 + Math.random() * 1.5));
    title = 'Expedition: delayed';
    text = 'A gravitational anomaly delayed your fleet. The return trip will take much longer.';
  } else if (r < 0.9) {
    m.flightMs = Math.floor(m.flightMs * 0.5);
    title = 'Expedition: tailwind';
    text = 'A solar wind accelerated your fleet - the return trip will be much faster.';
  } else if (r < 0.95) {
    delete w.movements[m.id];
    notifyPlayer(w, owner.id, 'expedition', 'Expedition: lost', 'Contact with your fleet was lost near a black hole. Nothing returned.');
    return;
  } else {
    hold = 0;
    title = 'Expedition: quick trip';
    text = 'The sector was empty; your fleet turned around immediately.';
  }
  notifyPlayer(w, owner.id, 'expedition', title, text);
  m.phase = 'holding';
  m.holdUntil = at + hold;
  m.resolved = true;
}

