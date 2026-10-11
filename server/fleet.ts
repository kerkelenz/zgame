import { EXPEDITION_HOURS, TECHS, UNITS, resName, SHIP_IDS, DEFENSE_IDS, BUILDING_IDS, TECH_IDS, isShip, isStationary } from '../shared/data';
import {
  addRes, cargoCapacity, canAfford, distance, flightSeconds, fleetSpeed, fuelUse, lvl, sameCoords, subRes, totalRes, zeroRes,
} from '../shared/formulas';
import { recordBattle } from './wars';
import { MOON, moonChance } from '../shared/formulas';
import { computeLoot, fleetCount, makeRng, simulateCombat, type Combatant, type CombatResult } from '../shared/combat';
import type { Coords, DefenseId, Defenses, Fleet, Mission, Res, ShipId } from '../shared/types';
import { bus } from './bus';
import { allianceBonuses, planetCapacity, processPlayer, updatePlanet } from './economy';
import { colonyCount, createMoon, createPlanet, inBounds, isProtected, maxExpeditions, maxPlanets } from './galaxy';
import { notifyPlayer } from './messages';
import { adjustRep } from './progress';
import { externalNotify } from './external';
import { assertActive, onVacation } from './vacation';
import { addWreck } from './wrecks';
import { archiveSpy, rememberTarget } from './social';
import { cargoFor, classSpeedFor, colonyFieldsMul, debrisShare, dodgesBadLuck, expeditionYield, extraFleetSlots, fuelFactor, lootShare, shieldMul, spyBonus, spyEvasion, weaponMul } from './perks';
import { buildNpcFleet, fleetValue } from './npc';
import { GameError, ck, friendly, planetAt, sameAlliance, uid, type Movement, type Planet, type Player, type World } from './world';

export interface SendRequest {
  fromPlanetId: string;
  to: Coords;
  ships: Fleet;
  mission: Mission;
  speedPct?: number;
  cargo?: Partial<Res>;
  holdHours?: number;
  /** target the moon at the destination coordinates */
  toMoon?: boolean;
  /** join an allied outbound attack (same target) instead of attacking separately */
  joinFleetId?: string;
}

const fmt = (c: Coords) => `[${c.g}:${c.s}:${c.p}]`;
const num = (n: number) => Math.round(n).toLocaleString('en-US');

export function activeSlots(w: World, player: Player) {
  const mine = Object.values(w.movements).filter((m) => m.ownerId === player.id);
  return {
    used: mine.filter((m) => m.mission !== 'expedition' && m.mission !== 'missile').length,
    max: 1 + lvl(player.techs, 'computer') + extraFleetSlots(player) + Math.floor(allianceBonuses(w, player).command),
    expUsed: mine.filter((m) => m.mission === 'expedition').length,
    expMax: maxExpeditions(player),
  };
}

export function flightPlan(w: World, player: Player, ships: Fleet, from: Coords, to: Coords, speedPct: number) {
  const lg = allianceBonuses(w, player).logistics;
  const dist = distance(from, to);
  const speed = fleetSpeed(ships, player.techs, lg, (id) => classSpeedFor(player, id));
  const secs = flightSeconds(dist, speed, speedPct, w.config.fleetSpeed);
  return { dist, speed, secs, fuel: Math.max(1, Math.round(fuelUse(ships, dist, speedPct) * fuelFactor(player))) };
}

export function sendFleet(w: World, player: Player, req: SendRequest, now: number): Movement {
  const planet = w.planets[req.fromPlanetId];
  if (!planet || planet.ownerId !== player.id) throw new GameError('Not your planet', 403);
  assertActive(player, 'send fleets');
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
  for (const id of Object.keys(ships)) if (isStationary(id)) throw new GameError(`${UNITS[id as ShipId].name}s cannot leave their planet`);
  const speedPct = Math.min(100, Math.max(10, Math.round((req.speedPct ?? 100) / 10) * 10));
  const mission = req.mission;
  const to = req.to;
  const toMoon = !!req.toMoon;
  const expedition = mission === 'expedition';
  const invade = mission === 'invade';
  if (!inBounds(w, to, expedition || invade)) throw new GameError('Invalid destination');
  if (invade) {
    const inv = w.invasion;
    if (!inv || inv.phase !== 'active') throw new GameError('There is no invasion to fight right now');
    if (!sameCoords(to, inv.rift)) throw new GameError(`The Void rift is at ${fmt(inv.rift)}`);
  } else if (expedition !== (to.p === w.config.positions + 1)) throw new GameError(expedition ? 'Expeditions must target deep space (position ' + (w.config.positions + 1) + ')' : 'Invalid destination');
  // recycling is the one mission that may target the sender's own position: the debris field floats above it
  if (mission !== 'recycle' && sameCoords(to, planet.coords) && toMoon === !!planet.isMoon) throw new GameError('You are already there');

  const slots = activeSlots(w, player);
  if (expedition) {
    if (lvl(player.techs, 'astrophysics') < 1) throw new GameError('Astrophysics research is required for expeditions');
    if (slots.expUsed >= slots.expMax) throw new GameError('No free expedition slots');
  } else if (slots.used >= slots.max) throw new GameError('No free fleet slots (research Computer Technology)');

  if (toMoon && !['attack', 'destroy', 'transport', 'deploy', 'hold', 'espionage'].includes(mission)) throw new GameError('That mission cannot target a moon');
  const target = planetAt(w, to, toMoon);
  const targetOwner = target ? w.players[target.ownerId] : null;
  const has = (id: ShipId) => (ships[id] || 0) > 0;
  let joinLead: Movement | undefined;

  switch (mission) {
    case 'invade':
      if (!SHIP_IDS.some((id) => has(id) && UNITS[id].attack > 1)) throw new GameError('Your fleet has no combat ships');
      break;
    case 'attack': {
      if (!target || !targetOwner) throw new GameError('There is no planet there');
      if (targetOwner.id === player.id) throw new GameError('Cannot attack yourself');
      if (friendly(w, player.id, targetOwner.id)) throw new GameError('Cannot attack an alliance member or a pact partner');
      if (!SHIP_IDS.some((id) => has(id) && UNITS[id].attack > 1)) throw new GameError('Your fleet has no combat ships');
      if (onVacation(targetOwner)) throw new GameError('That player is on vacation');
      if (isProtected(w, player, targetOwner)) throw new GameError('That player is under newbie protection');
      if (req.joinFleetId) {
        joinLead = w.movements[req.joinFleetId];
        if (!joinLead || joinLead.mission !== 'attack' || joinLead.phase !== 'outbound' || !joinLead.ownerId || joinLead.acsId) throw new GameError('That attack cannot be joined');
        if (joinLead.ownerId !== player.id && !sameAlliance(w, player.id, joinLead.ownerId)) throw new GameError('You can only join attacks of your alliance');
        if (!sameCoords(joinLead.to, to)) throw new GameError('The joined attack targets a different planet');
        if (Object.values(w.movements).filter((x) => x.acsId === joinLead!.id).length >= 4) throw new GameError('The attack group is full');
      }
      break;
    }
    case 'destroy': {
      if (!toMoon) throw new GameError('Choose a moon as the target');
      if (!target || !targetOwner) throw new GameError('There is no moon there');
      if (!has('deathstar')) throw new GameError('Only Deathstars can destroy a moon');
      if (targetOwner.id === player.id) throw new GameError('Cannot attack yourself');
      if (friendly(w, player.id, targetOwner.id)) throw new GameError('Cannot attack an alliance member or a pact partner');
      if (onVacation(targetOwner)) throw new GameError('That player is on vacation');
      if (isProtected(w, player, targetOwner)) throw new GameError('That player is under newbie protection');
      if (req.joinFleetId) throw new GameError('A moon strike cannot join a joint attack');
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
      if (onVacation(targetOwner)) throw new GameError('That player is on vacation');
      break;
    case 'espionage':
      if (!target || !targetOwner || targetOwner.id === player.id) throw new GameError('Choose another player\'s planet');
      if (!has('espionageProbe')) throw new GameError('Espionage needs probes');
      if (onVacation(targetOwner)) throw new GameError('That player is on vacation');
      if (isProtected(w, player, targetOwner)) throw new GameError('That player is under newbie protection');
      break;
    case 'colonize':
      if (target) throw new GameError('That position is already colonized');
      if (!has('colonyShip')) throw new GameError('A colony ship is required');
      if (colonyCount(w, player) >= maxPlanets(player)) throw new GameError(`Colony limit reached (${maxPlanets(player)} - research Astrophysics)`);
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
  if (mission === 'attack' || mission === 'espionage' || mission === 'invade' || mission === 'destroy') { cargo.metal = cargo.crystal = cargo.deuterium = 0; }
  const cap = cargoFor(player, ships);
  if (totalRes(cargo) > cap) throw new GameError(`Cargo exceeds capacity (${num(cap)})`);
  const need = addRes(cargo, { metal: 0, crystal: 0, deuterium: plan.fuel });
  if (!canAfford(planet.resources, need)) throw new GameError(`Not enough resources (fuel: ${num(plan.fuel)} vespene gas)`);

  if (joinLead && now + plan.secs * 1000 > joinLead.arriveAt) throw new GameError('Your fleet is too slow to arrive together with that attack');
  planet.resources = subRes(planet.resources, need);
  for (const [id, n] of Object.entries(ships)) planet.fleet[id as ShipId] = (planet.fleet[id as ShipId] || 0) - (n || 0);
  for (const id of SHIP_IDS) if (!planet.fleet[id]) delete planet.fleet[id];

  const m: Movement = {
    id: uid(), ownerId: player.id, ownerName: player.username, mission, phase: 'outbound',
    from: { ...planet.coords }, fromPlanetId: planet.id, to: { ...to }, ships, cargo, toMoon: toMoon || undefined,
    speedPct, departAt: now, arriveAt: now + plan.secs * 1000, flightMs: plan.secs * 1000,
    holdHours: mission === 'hold' ? Math.min(48, Math.max(0.1, Number(req.holdHours) || 1)) : mission === 'expedition' ? Math.min(EXPEDITION_HOURS.max, Math.max(EXPEDITION_HOURS.min, Math.round(Number(req.holdHours) || 1))) : undefined,
  };
  if (joinLead) {
    // arrive together with the leader; the return trip still takes the natural flight time
    m.arriveAt = joinLead.arriveAt;
    m.acsId = joinLead.id;
    if (joinLead.ownerId && joinLead.ownerId !== player.id) notifyPlayer(w, joinLead.ownerId, 'alliance', 'Ally joined your attack', `${player.username} joined your attack on ${fmt(to)} with ${fleetCount(ships)} ships.`);
  }
  w.movements[m.id] = m;
  if (mission !== 'expedition' && mission !== 'deploy') rememberTarget(player, to);

  if ((mission === 'attack' || mission === 'destroy') && targetOwner) {
    notifyPlayer(w, targetOwner.id, 'system', 'Hostile fleet detected', `${player.username} is attacking ${target!.name} ${fmt(to)} with a fleet from ${w.planets[m.fromPlanetId ?? '']?.name ?? 'unknown'} ${fmt(m.from)}. ETA ${new Date(m.arriveAt).toLocaleTimeString()}.`);
    bus.push({ to: targetOwner.id, type: 'alert', data: `Hostile fleet inbound to ${target!.name} from ${player.username} (${fmt(m.from)})` });
    for (const mem of targetOwner.allianceId ? w.alliances[targetOwner.allianceId]?.members ?? [] : []) {
      if (mem.playerId !== targetOwner.id) {
        bus.push({ to: mem.playerId, type: 'alert', data: `${targetOwner.username} is being attacked - consider sending help` });
        externalNotify(w, mem.playerId, 'allies', 'Ally under attack', `${targetOwner.username} is being attacked by ${player.username}. Send a hold fleet to help defend!`);
      }
    }
  }
  bus.push({ to: player.id, type: 'refresh' });
  return m;
}

export function recallFleet(w: World, player: Player, id: string, now: number) {
  const m = w.movements[id];
  if (!m || m.ownerId !== player.id) throw new GameError('Unknown fleet', 404);
  if (m.mission === 'missile') throw new GameError('Missiles cannot be recalled');
  if (m.phase === 'returning') throw new GameError('Fleet is already returning');
  if (m.phase === 'outbound' && m.mission === 'attack') {
    // recalling a leader recalls its whole joint-attack group; a joiner just leaves the group
    for (const j of Object.values(w.movements)) {
      if (j.acsId === m.id && j.phase === 'outbound') {
        j.acsId = undefined;
        j.returnAt = now + Math.max(0, now - j.departAt);
        j.flightMs = Math.max(0, now - j.departAt);
        j.phase = 'returning';
        if (j.ownerId) bus.push({ to: j.ownerId, type: 'refresh' });
      }
    }
    m.acsId = undefined;
  }
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
  const target = planetAt(w, m.to, !!m.toMoon);
  switch (m.mission) {
    case 'attack':
    case 'destroy': {
      if (m.acsId) {
        const lead = w.movements[m.acsId];
        if (lead && lead.phase === 'outbound') return resolveAttack(w, lead, at);
        m.acsId = undefined;
      }
      return resolveAttack(w, m, at);
    }
    case 'espionage': return resolveEspionage(w, m, at);
    case 'transport': {
      if (!target) { sendHome(m, at); return; }
      updatePlanet(w, target, at);
      const delivered = m.cargo;
      if (target.ownerId !== m.ownerId && m.ownerId && sameAlliance(w, m.ownerId, target.ownerId)) w.players[m.ownerId].stats.delivered += totalRes(delivered);
      target.resources = addRes(target.resources, delivered);
      m.cargo = zeroRes();
      const owner = w.players[m.ownerId!];
      const body = `${num(delivered.metal)} metal, ${num(delivered.crystal)} crystal, ${num(delivered.deuterium)} vespene gas delivered to ${target.name} ${fmt(m.to)}.`;
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
    case 'invade': {
      const inv = w.invasion;
      if (!inv || inv.phase !== 'active') {
        notifyPlayer(w, m.ownerId!, 'combat', 'The Void is gone', 'The invasion ended before your fleet arrived. It is returning.');
        sendHome(m, at);
        return;
      }
      m.phase = 'holding';
      m.holdUntil = inv.endsAt;
      notifyPlayer(w, m.ownerId!, 'combat', 'Fleet at the front', `${fleetCount(m.ships)} ships joined the fight at the Void rift ${fmt(m.to)}. They engage the Armada together with every other fleet there, every ${w.config.invasionEngageMinutes} minutes, until you recall them.`);
      bus.push({ to: m.ownerId!, type: 'refresh' });
      return;
    }
    case 'missile': return resolveMissiles(w, m, at);
    case 'colonize': return resolveColonize(w, m, at);
    case 'recycle': return resolveRecycle(w, m, at);
    case 'expedition': return resolveExpedition(w, m, at);
  }
}

// ---------------------------------------------------------------- colonize / recycle

function resolveColonize(w: World, m: Movement, at: number) {
  const owner = w.players[m.ownerId!];
  if (planetAt(w, m.to) || colonyCount(w, owner) >= maxPlanets(owner) || !(m.ships.colonyShip || 0)) {
    notifyPlayer(w, owner.id, 'system', 'Colonization failed', `Could not settle ${fmt(m.to)} - the position is taken or you reached your colony limit. The fleet is returning.`);
    sendHome(m, at);
    return;
  }
  const colony = createPlanet(w, owner, { ...m.to }, { name: 'Colony', now: at });
  colony.fields = Math.floor(colony.fields * colonyFieldsMul(owner));
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
  // recyclers take metal and crystal together, in the proportion they lie in the field, so a full load is never all of one kind
  const total = d.metal + d.crystal;
  const take = Math.min(total, Math.max(0, free));
  const takeM = total > 0 ? Math.min(d.metal, Math.round((take * d.metal) / total)) : 0;
  const takeC = Math.min(d.crystal, take - takeM);
  d.metal -= takeM; d.crystal -= takeC;
  if (d.metal <= 0 && d.crystal <= 0) delete w.debris[key];
  m.cargo.metal += takeM; m.cargo.crystal += takeC;
  owner.stats.harvested += takeM + takeC;
  notifyPlayer(w, owner.id, 'system', 'Debris collected', `Recyclers harvested ${num(takeM)} metal and ${num(takeC)} crystal at ${fmt(m.to)}.`);
  sendHome(m, at);
}

// ---------------------------------------------------------------- espionage

function resolveEspionage(w: World, m: Movement, at: number) {
  const target = planetAt(w, m.to, !!m.toMoon);
  const spy = w.players[m.ownerId!];
  if (!target) { sendHome(m, at); return; }
  const def = w.players[target.ownerId];
  if (onVacation(def)) { notifyPlayer(w, spy.id, 'espionage', `Spy mission aborted ${fmt(m.to)}`, 'That player is on vacation.'); sendHome(m, at); return; }
  processPlayer(w, def, at);
  const probes = m.ships.espionageProbe || 0;
  const diff = lvl(spy.techs, 'espionage') - lvl(def.techs, 'espionage');
  const level = probes + (diff >= 0 ? diff * diff : -(diff * diff)) + spyBonus(spy);

  let defShips = 0;
  for (const [id, n] of Object.entries(target.fleet)) if (!isStationary(id)) defShips += n || 0;
  const chance = Math.min(0.9, ((defShips + 1) * Math.pow(2, -diff)) / (probes * 20 + 1) * 0.25) * spyEvasion(spy);
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
    coords: m.to, moon: !!target.isMoon, planet: target.name, owner: def.username, level, ...lines,
  };
  const r = target.resources;
  notifyPlayer(w, spy.id, 'espionage', `Spy report ${target.name} ${fmt(m.to)}`,
    `${def.username}: metal ${num(r.metal)}, crystal ${num(r.crystal)}, vespene gas ${num(r.deuterium)}.`, report);
  spy.stats.spyReports++;
  archiveSpy(spy, target.id, { ...report, moon: !!target.isMoon }, at);
  sendHome(m, at);
}

// ---------------------------------------------------------------- combat

export function combatant(w: World, player: Player | null, name: string, fleet: Fleet, defenses?: Defenses): Combatant {
  return {
    owner: player?.id ?? null, name,
    weapons: lvl(player?.techs, 'weapons'), shielding: lvl(player?.techs, 'shielding'), armour: lvl(player?.techs, 'armour'),
    weaponMul: weaponMul(player), shieldMul: shieldMul(player),
    fleet: { ...fleet }, defenses: defenses ? { ...defenses } : undefined,
  };
}

export const onlyShips = (a: Record<string, number | undefined>): Fleet => {
  const f: Fleet = {};
  for (const id of SHIP_IDS) if (a[id]) f[id] = a[id];
  return f;
};
export const onlyDefs = (a: Record<string, number | undefined>): Defenses => {
  const d: Defenses = {};
  for (const id of DEFENSE_IDS) if (a[id]) d[id] = a[id];
  return d;
};

export function addDebris(w: World, c: Coords, metal: number, crystal: number) {
  if (metal <= 0 && crystal <= 0) return;
  const k = ck(c);
  const d = (w.debris[k] ||= { metal: 0, crystal: 0 });
  d.metal += metal; d.crystal += crystal;
}

function summarize(units: Record<string, number | undefined>): string {
  const parts = Object.entries(units).filter(([, n]) => n).map(([id, n]) => `${n}× ${UNITS[id as ShipId].name}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

function resolveAttack(w: World, lead: Movement, at: number) {
  // joint attack: every ally fleet that joined this one fights in the same battle
  const group = [lead, ...Object.values(w.movements).filter((x) => x.acsId === lead.id && x.phase === 'outbound' && x.mission === 'attack')];
  const target = planetAt(w, lead.to, !!lead.toMoon);
  const attackerOf = (m: Movement) => (m.ownerId ? w.players[m.ownerId] : null);
  const abort = (msg: string) => {
    for (const m of group) {
      if (m.ownerId) { notifyPlayer(w, m.ownerId, 'combat', 'Attack aborted', msg); sendHome(m, at); m.acsId = undefined; }
      else delete w.movements[m.id];
    }
  };
  if (!target) return abort(`Nothing at ${fmt(lead.to)}.`);
  const defOwner = w.players[target.ownerId];
  // diplomacy may have changed while the fleets were in flight
  if (onVacation(defOwner)) return abort(`The target at ${fmt(lead.to)} is on vacation - attack called off.`);
  if (group.some((m) => m.ownerId && (m.ownerId === defOwner.id || friendly(w, m.ownerId, defOwner.id)))) return abort(`The target at ${fmt(lead.to)} is now an ally - attack called off.`);
  processPlayer(w, defOwner, at);
  for (const m of group) { const a = attackerOf(m); if (a) processPlayer(w, a, at); }

  const holders = Object.values(w.movements).filter((h) => h.phase === 'holding' && h.mission === 'hold' && sameCoords(h.to, lead.to) && !!h.toMoon === !!lead.toMoon);
  const defenders: Combatant[] = [combatant(w, defOwner, defOwner.username, target.fleet, target.defenses)];
  for (const h of holders) defenders.push(combatant(w, w.players[h.ownerId!], h.ownerName, h.ships));

  const rng = makeRng(Math.floor(Math.random() * 2 ** 31));
  const res: CombatResult = simulateCombat(group.map((m) => combatant(w, attackerOf(m), m.ownerName, m.ships)), defenders, rng, { debrisRatio: debrisShare(attackerOf(lead)) });

  const planetAfter = res.defenders[0].after;
  target.fleet = onlyShips(planetAfter);
  const missilesBefore: Defenses = {};
  for (const id of DEFENSE_IDS) if (UNITS[id].missile && target.defenses[id]) missilesBefore[id] = target.defenses[id];
  target.defenses = { ...onlyDefs(planetAfter), ...missilesBefore };
  holders.forEach((h, i) => {
    const after = onlyShips(res.defenders[i + 1].after);
    if (fleetCount(after)) h.ships = after;
    else delete w.movements[h.id];
  });
  group.forEach((m, i) => { m.ships = onlyShips(res.attackers[i].after); });
  addDebris(w, lead.to, res.debris.metal, res.debris.crystal);
  // the moon roll counts the whole field above the planet; the report says what the odds were and whether it happened
  const field = w.debris[ck(lead.to)] ?? res.debris;
  const moonPossible = !target.isMoon && !Object.values(w.planets).some((p) => p.parentId === target.id);
  const moonOdds = moonPossible ? moonChance(field) : null;
  const newMoon = maybeCreateMoon(w, target, field, at);
  const leadPlayer = attackerOf(lead);

  // wreck field: a share of the defender's destroyed ships can be rebuilt by a Space Dock
  let wreckFormed = 0;
  if (!target.isMoon && !defOwner.npc) {
    const shipsLost: Fleet = {};
    for (const id of SHIP_IDS) {
      if (isStationary(id)) continue;
      const n = (res.defenders[0].before[id] || 0) - (res.defenders[0].after[id] || 0);
      if (n > 0) shipsLost[id] = n;
    }
    wreckFormed = addWreck(w, target, shipsLost, at);
  }

  // moon destruction: after the battle the surviving Deathstars fire together (retail odds)
  let moonVerdict = '';
  let moonGone = false;
  const destroyers = group.filter((m) => m.mission === 'destroy');
  if (target.isMoon && destroyers.length) {
    const ds = destroyers.reduce((s, m) => s + (m.ships.deathstar || 0), 0);
    if (ds > 0) {
      const d = target.diameter ?? 3000;
      const clamp = (v: number) => Math.max(0, Math.min(100, v));
      const pDestroy = clamp((100 - Math.sqrt(d)) * Math.sqrt(ds)), pRip = clamp(Math.sqrt(d) / 2);
      moonGone = Math.random() * 100 < pDestroy;
      const rip = Math.random() * 100 < pRip;
      moonVerdict = `The Deathstars fired their gravity pulse: ${moonGone ? 'the moon broke apart!' : 'the moon held.'} (${Math.round(pDestroy)}% chance)\n` +
        (rip ? `The shock wave tore ${ds} Deathstar(s) apart. (${Math.round(pRip)}% risk)` : `The Deathstars survived the shock wave. (${Math.round(pRip)}% risk)`);
      if (rip) for (const m of destroyers) delete m.ships.deathstar;
    } else moonVerdict = 'No Deathstar survived the battle, so the moon was spared.';
  }

  // loot: bounded by the survivors' combined free cargo, split by each fleet's share of it
  let loot: Res = zeroRes();
  const lootBy: Record<string, Res> = {};
  const free = group.map((m) => (fleetCount(m.ships) ? Math.max(0, cargoFor(attackerOf(m), m.ships) - totalRes(m.cargo)) : 0));
  const freeTotal = free.reduce((a, b) => a + b, 0);
  if (res.winner === 'attacker' && freeTotal > 0) {
    loot = computeLoot(target.resources, freeTotal, lootShare(leadPlayer));
    target.resources = subRes(target.resources, loot);
    group.forEach((m, i) => {
      const share = free[i] / freeTotal;
      const part: Res = { metal: Math.floor(loot.metal * share), crystal: Math.floor(loot.crystal * share), deuterium: Math.floor(loot.deuterium * share) };
      lootBy[m.id] = part;
      if (m.ownerId) m.cargo = addRes(m.cargo, part);
    });
  }

  // NPC bounty: defenders share a reward when raiders are crushed
  let bounty = 0;
  const npc = !lead.ownerId || !!attackerOf(lead)?.npc;
  if (npc && res.winner === 'defender') {
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

  const lost = (before: Record<string, number | undefined>, after: Record<string, number | undefined>, rebuilt: Record<string, number | undefined> = {}) =>
    summarize(Object.fromEntries(Object.entries(before).map(([k, v]) => [k, (v || 0) - (after[k] || 0) + (rebuilt[k] || 0)])));
  const names = group.map((m) => m.ownerName).join(' + ');
  const roundSide = (s: { shots: number; damage: number; absorbed: number; hullDamage: number; destroyed: number }) => ({ shots: s.shots, damage: Math.round(s.damage), absorbed: Math.round(s.absorbed), hullDamage: Math.round(s.hullDamage), destroyed: s.destroyed });
  const report = {
    coords: lead.to, planet: target.name, rounds: res.rounds, winner: res.winner, debris: res.debris, loot, bounty, roundLog: res.roundLog, roundStats: res.roundStats.map((r) => ({ attackers: roundSide(r.attackers), defenders: roundSide(r.defenders) })),
    moon: moonOdds === null ? null : { chance: moonOdds, formed: !!newMoon, field: Math.round(field.metal + field.crystal) },
    attackers: res.attackers.map((a) => ({ name: a.name, before: a.before, after: a.after, lost: a.lost })),
    defenders: res.defenders.map((d) => ({ name: d.name, before: d.before, after: d.after, lost: d.lost, rebuilt: d.rebuilt })),
  };
  const headline = res.winner === 'attacker' ? 'Attacker victory' : res.winner === 'defender' ? 'Defender victory' : 'Draw';
  const body =
    `${names} vs ${defOwner.username} at ${target.name} ${fmt(lead.to)} - ${headline} after ${res.rounds} round(s).\n` +
    res.attackers.map((a) => `${a.name} lost: ${lost(a.before, a.after)}.\n`).join('') +
    `Defender lost: ${lost(res.defenders[0].before, res.defenders[0].after, res.defenders[0].rebuilt)}.\n` +
    (totalRes(loot) ? `Loot: ${num(loot.metal)} metal, ${num(loot.crystal)} crystal, ${num(loot.deuterium)} vespene gas.\n` : '') +
    (res.debris.metal || res.debris.crystal ? `Debris field: ${num(res.debris.metal)} metal, ${num(res.debris.crystal)} crystal.\n` : '') +
    (bounty ? `Raider bounty: ${num(bounty)} resources shared among defenders.\n` : '') +
    (moonOdds === null ? '' : newMoon ? `The debris condensed into a moon! (chance ${Math.round(moonOdds * 100)}%)\n` : `No moon formed (chance ${Math.round(moonOdds * 100)}% from a debris field of ${num(field.metal + field.crystal)}).\n`) +
    (wreckFormed ? `A wreck field formed (${num(wreckFormed)} resources of ships) - a Space Dock can rebuild part of it.\n` : '') +
    moonVerdict;

  const involved = new Set<string>();
  for (const m of group) if (m.ownerId) involved.add(m.ownerId);
  involved.add(defOwner.id);
  for (const h of holders) involved.add(h.ownerId!);
  for (const pid of involved) notifyPlayer(w, pid, npc ? 'raid' : 'combat', `Battle at ${fmt(lead.to)}: ${headline}`, body, report);

  const attackersLost = res.attackers.reduce((s, a) => s + totalRes(a.lost), 0);
  const defendersLost = res.defenders.reduce((s, d) => s + totalRes(d.lost), 0);
  const humans = group.map(attackerOf).filter((a): a is Player => !!a && !a.npc);
  for (const m of group) {
    const a = attackerOf(m);
    if (!a) continue;
    if (res.winner === 'attacker') { a.stats.battlesWon++; defOwner.stats.battlesLost++; }
    else if (res.winner === 'defender') { a.stats.battlesLost++; defOwner.stats.battlesWon++; }
    a.stats.destroyed += defendersLost / Math.max(1, humans.length);
    a.stats.plundered += totalRes(lootBy[m.id] ?? zeroRes());
    // raiding an empire makes it hold a grudge, and costs standing with its faction
    if (!a.npc && defOwner.npc) {
      const heat = defendersLost / Math.max(1, humans.length) + totalRes(lootBy[m.id] ?? zeroRes());
      a.heat[defOwner.id] = (a.heat[defOwner.id] || 0) + heat;
      adjustRep(w, a, defOwner.npc.faction, -heat / 20000);
    }
  }
  if (res.winner === 'defender') defOwner.stats.destroyed += attackersLost;
  if (w.wars?.length) {
    const side = (list: typeof res.attackers) => list.filter((x) => x.owner && !w.players[x.owner]?.npc).map((x) => ({ playerId: x.owner!, lost: totalRes(x.lost) }));
    recordBattle(w, side(res.attackers), side(res.defenders), at);
  }
  bus.push({ to: '*', type: 'refresh' });

  for (const m of group) {
    if (!m.ownerId || !fleetCount(m.ships)) delete w.movements[m.id];
    else { sendHome(m, at); m.acsId = undefined; }
  }

  if (moonGone) {
    for (const m of destroyers) { const a = attackerOf(m); if (a) a.stats.moonsDestroyed++; }
    const where = `${target.name} ${fmt(lead.to)}`;
    destroyMoon(w, target, at);
    notifyPlayer(w, defOwner.id, 'combat', 'Your moon was destroyed', `${names} destroyed ${where}. Everything on it is lost.`);
    for (const m of destroyers) if (m.ownerId) notifyPlayer(w, m.ownerId, 'combat', 'Moon destroyed', `Your Deathstars destroyed ${where}.`);
  }
}

/** A moon breaks apart: everything on it is lost and stationed fleets head home. */
export function destroyMoon(w: World, moon: Planet, at: number) {
  for (const m of Object.values(w.movements)) {
    if (m.toMoon && m.phase === 'holding' && sameCoords(m.to, moon.coords)) { m.phase = 'returning'; m.returnAt = at + m.flightMs; }
  }
  delete w.wrecks[moon.id];
  const owner = w.players[moon.ownerId];
  if (owner) owner.planetIds = owner.planetIds.filter((id) => id !== moon.id);
  delete w.planets[moon.id];
  bus.push({ to: '*', type: 'refresh' });
}

// ---------------------------------------------------------------- expeditions

function resolveExpedition(w: World, m: Movement, at: number) {
  const owner = w.players[m.ownerId!];
  owner.stats.expeditions++;
  const value = fleetValue(m.ships); // what the fleet is worth: sets the size of pirates
  // staying out longer finds more but risks more; recyclers salvage, probes scout ahead of the pirates
  const hours = m.holdHours ?? 1;
  const salvagers = (m.ships.recycler || 0) > 0;
  const scouts = (m.ships.espionageProbe || 0) > 0;
  const pathfinders = m.ships.pathfinder || 0;
  const yieldMul = expeditionYield(owner) * (1 + 0.3 * (hours - 1)) * (1 + 0.1 * Math.min(5, pathfinders)); // Geologist / Discoverer / Pathfinders: scales everything you find
  let r = Math.random();
  // pathfinders steer clear of black holes (20% per ship, at most 60%)
  if (pathfinders && r >= 0.9 && r < 0.95 + 0.01 * (hours - 1) && Math.random() < Math.min(0.6, 0.2 * pathfinders)) r = 0.1;
  // Discoverers dodge half of the nasty surprises (pirates, black holes)
  if (dodgesBadLuck(owner) && ((r >= 0.68 && r < 0.77) || (r >= 0.9 && r < 0.95)) && Math.random() < 0.5) r = 0.1;
  const free = Math.max(0, cargoFor(owner, m.ships) - totalRes(m.cargo));
  let title = 'Expedition: nothing found';
  let text = 'Your fleet drifted through empty space and found nothing of interest.';
  let hold = (hours * 3_600_000) / w.config.fleetSpeed;

  if (Math.random() < 0.15) {
    // deep space sometimes pays in Command Credits instead of cargo
    const cc = Math.round((20 + Math.random() * 40 + Math.sqrt(value / 1000) * 4) * yieldMul);
    owner.credits += cc;
    title = 'Expedition: command gear salvaged';
    text = `The crew stripped intact command gear from a derelict and sold it on the way home: ${num(cc)} Command Credits.`;
  } else if (r < 0.3) {
    const s = Math.random();
    if (s < 0.2) {
      // an ancient data cache: speeds up the research in progress, or sells for credits
      if (owner.research) {
        const left = Math.max(0, owner.research.end - at);
        owner.research.end -= Math.floor(left * 0.15);
        title = 'Expedition: technology fragment';
        text = `Your crew recovered a fragment of ancient research. ${TECHS[owner.research.id].name} will finish ${Math.round(left * 0.15 / 60000)} minutes sooner.`;
      } else {
        const cc = Math.round(30 * yieldMul);
        owner.credits += cc;
        title = 'Expedition: ancient data cache';
        text = `A sealed data cache was worth ${num(cc)} Command Credits to collectors.`;
      }
    } else if (s < 0.4 && salvagers) {
      const amount = Math.min(free, Math.floor((2000 + value * 0.03) * yieldMul * (0.5 + Math.random()) * Math.sqrt(w.config.economySpeed)));
      const kind = Math.random() < 0.5 ? 'metal' : 'crystal';
      m.cargo[kind] += amount;
      title = 'Expedition: wreckage salvaged';
      text = `Your recyclers stripped an ancient hulk and loaded ${num(amount)} ${resName(kind)}.`;
    }
  } else if (r < 0.58) {
    const kind = (['metal', 'crystal', 'deuterium'] as const)[Math.floor(Math.random() * 3)];
    const amount = Math.min(free, Math.floor((3000 + value * 0.04) * yieldMul * (salvagers ? 1.25 : 1) * (0.5 + Math.random()) * Math.sqrt(w.config.economySpeed)));
    m.cargo[kind] += amount;
    title = 'Expedition: resources found';
    text = `Your fleet discovered a rich asteroid cluster and loaded ${num(amount)} ${resName(kind)}.`;
  } else if (r < 0.68) {
    const budget = Math.max(3000, value * yieldMul * (0.05 + Math.random() * 0.1));
    const found = buildNpcFleet(budget, Math.random);
    const added: Fleet = {};
    for (const [id, n] of Object.entries(found)) { if (UNITS[id as ShipId].attack > 1 && id !== 'battleship') { m.ships[id as ShipId] = (m.ships[id as ShipId] || 0) + (n || 0); added[id as ShipId] = n; } }
    title = 'Expedition: derelict ships';
    text = fleetCount(added) ? `A drifting fleet agreed to join you: ${summarize(added)}.` : 'You found only scrap.';
  } else if (r < 0.77) {
    const budget = Math.max(4000, value * (0.3 + Math.random() * 0.4)) * (scouts ? 0.75 : 1);
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
  } else if (r < 0.95 + 0.01 * (hours - 1)) {
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


// ---------------------------------------------------------------- missiles

const MISSILE_TARGET_ORDER: DefenseId[] = ['rocketLauncher', 'lightLaser', 'ionCannon', 'heavyLaser', 'gaussCannon', 'plasmaTurret', 'smallShield', 'largeShield'];

export function missileRangeSystems(silo: number) { return Math.max(0, 5 * silo - 1); }

export function launchMissiles(w: World, player: Player, fromPlanetId: string, to: Coords, count: number, now: number): Movement {
  const planet = w.planets[fromPlanetId];
  if (!planet || planet.ownerId !== player.id) throw new GameError('Not your planet', 403);
  assertActive(player, 'fire missiles');
  updatePlanet(w, planet, now);
  count = Math.floor(count);
  if (!(count >= 1)) throw new GameError('Choose how many missiles to fire');
  if ((planet.defenses.interplanetaryMissile || 0) < count) throw new GameError('Not enough interplanetary missiles');
  if (!inBounds(w, to)) throw new GameError('Invalid destination');
  const target = planetAt(w, to);
  const owner = target ? w.players[target.ownerId] : null;
  if (!target || !owner) throw new GameError('There is no planet there');
  if (owner.id === player.id) throw new GameError('You cannot fire at yourself');
  if (friendly(w, player.id, owner.id)) throw new GameError('Cannot attack an alliance member or a pact partner');
  if (onVacation(owner)) throw new GameError('That player is on vacation');
  if (isProtected(w, player, owner)) throw new GameError('That player is under newbie protection');
  if (to.g !== planet.coords.g) throw new GameError('Missiles cannot leave the galaxy');
  const ds = Math.abs(to.s - planet.coords.s);
  const range = missileRangeSystems(lvl(planet.buildings, 'missileSilo'));
  if (ds > range) throw new GameError(`Out of range (your silo reaches ${range} systems)`);
  planet.defenses.interplanetaryMissile = (planet.defenses.interplanetaryMissile || 0) - count;
  if (!planet.defenses.interplanetaryMissile) delete planet.defenses.interplanetaryMissile;
  const secs = Math.max(10, Math.round((30 + 60 * ds) / w.config.fleetSpeed));
  const m: Movement = {
    id: uid(), ownerId: player.id, ownerName: player.username, mission: 'missile', phase: 'outbound',
    from: { ...planet.coords }, fromPlanetId: planet.id, to: { ...to }, ships: {}, cargo: zeroRes(), speedPct: 100,
    departAt: now, arriveAt: now + secs * 1000, flightMs: secs * 1000, missiles: count,
  };
  w.movements[m.id] = m;
  notifyPlayer(w, owner.id, 'system', 'Missile launch detected', `${count} interplanetary missile(s) from ${player.username} are heading for ${target.name} ${fmt(to)}.`);
  bus.push({ to: owner.id, type: 'alert', data: `Missiles inbound to ${target.name}!` });
  bus.push({ to: player.id, type: 'refresh' });
  return m;
}

function resolveMissiles(w: World, m: Movement, at: number) {
  delete w.movements[m.id];
  const target = planetAt(w, m.to);
  const attacker = w.players[m.ownerId!];
  if (!target) return;
  const owner = w.players[target.ownerId];
  if (onVacation(owner)) { notifyPlayer(w, m.ownerId!, 'combat', 'Missile strike fizzled', `${target.name} is on vacation - the warheads were defused.`); return; }
  processPlayer(w, owner, at);
  const launched = m.missiles || 0;
  const abm = target.defenses.antiBallisticMissile || 0;
  const intercepted = Math.min(abm, launched);
  const striking = launched - intercepted;
  if (intercepted) {
    target.defenses.antiBallisticMissile = abm - intercepted;
    if (!target.defenses.antiBallisticMissile) delete target.defenses.antiBallisticMissile;
  }
  let damage = striking * UNITS.interplanetaryMissile.attack * (1 + 0.1 * lvl(attacker.techs, 'weapons'));
  const destroyed: Defenses = {};
  for (const id of MISSILE_TARGET_ORDER) {
    const have = target.defenses[id] || 0;
    if (!have || damage <= 0) continue;
    const hull = UNITS[id].hull * (1 + 0.1 * lvl(owner.techs, 'armour'));
    const kill = Math.min(have, Math.floor(damage / hull));
    if (kill > 0) {
      destroyed[id] = kill;
      damage -= kill * hull;
      target.defenses[id] = have - kill;
      if (!target.defenses[id]) delete target.defenses[id];
    }
  }
  if (Object.keys(destroyed).length) {
    attacker.stats.ipmKills++;
    attacker.stats.destroyed += Object.entries(destroyed).reduce((s, [k, n]) => s + totalRes(UNITS[k as DefenseId].cost) * (n || 0), 0);
  }
  const list = (d: Defenses) => Object.entries(d).filter(([, n]) => n).map(([k, n]) => `${n}× ${UNITS[k as DefenseId].name}`).join(', ') || 'nothing';
  const body = `${launched} missile(s) from ${attacker.username} hit ${target.name} ${fmt(m.to)}. ${intercepted} intercepted by ABMs. Defenses destroyed: ${list(destroyed)}.`;
  const report = { coords: m.to, launched, intercepted, destroyed };
  notifyPlayer(w, attacker.id, 'combat', 'Missile strike report', body, report);
  notifyPlayer(w, owner.id, 'combat', 'Missile strike report', body, report);
  bus.push({ to: '*', type: 'refresh' });
}

// ---------------------------------------------------------------- moons

export { MOON, moonChance };

/** Only planets that have no moon yet. `field` is the whole debris field above the planet after the battle, old debris included. */
export function maybeCreateMoon(w: World, target: Planet, field: { metal: number; crystal: number }, at: number): Planet | null {
  if (target.isMoon) return null;
  if (Object.values(w.planets).some((p) => p.parentId === target.id)) return null;
  const chance = moonChance(field);
  if (chance <= 0 || Math.random() >= chance) return null;
  const moon = createMoon(w, target, at, chance);
  notifyPlayer(w, target.ownerId, 'system', 'A moon formed!', `The wreckage above ${target.name} ${fmt(target.coords)} condensed into a moon. Build a Lunar Base to make it usable.`);
  return moon;
}

export function phalanxRange(level: number) { return Math.max(0, level * level - 1); }
export const PHALANX_COST = 5000;

export function phalanxScan(w: World, player: Player, moonId: string, to: Coords, now: number) {
  const moon = w.planets[moonId];
  assertActive(player, 'scan with the phalanx');
  if (!moon || moon.ownerId !== player.id || !moon.isMoon) throw new GameError('Use one of your moons', 403);
  updatePlanet(w, moon, now);
  const level = lvl(moon.buildings, 'sensorPhalanx');
  if (level < 1) throw new GameError('This moon has no Sensor Phalanx');
  if (!inBounds(w, to)) throw new GameError('Invalid coordinates');
  if (to.g !== moon.coords.g || Math.abs(to.s - moon.coords.s) > phalanxRange(level)) throw new GameError(`Out of range (this phalanx reaches ${phalanxRange(level)} systems)`);
  const target = planetAt(w, to);
  if (!target) throw new GameError('There is no planet there');
  if (moon.resources.deuterium < PHALANX_COST) throw new GameError(`The moon needs ${PHALANX_COST} vespene gas per scan - transport some there`);
  moon.resources.deuterium -= PHALANX_COST;
  const moves = Object.values(w.movements).filter((m) => m.mission !== 'missile' && m.ownerId !== player.id && (sameCoords(m.from, to) || sameCoords(m.to, to)));
  return {
    planet: target.name, owner: w.players[target.ownerId].username, coords: to,
    movements: moves.map((m) => ({
      mission: m.mission, phase: m.phase, ownerName: m.ownerName, from: m.from, to: m.to, ships: fleetCount(m.ships),
      at: m.phase === 'outbound' ? m.arriveAt : m.phase === 'holding' ? m.holdUntil ?? m.arriveAt : m.returnAt ?? m.arriveAt,
    })).sort((a, b) => a.at - b.at),
  };
}

export function jumpCooldownMs(w: World, gateLevel: number) { return Math.max(30_000, 3_600_000 / (Math.max(1, gateLevel) * w.config.fleetSpeed)); }

export function jumpGate(w: World, player: Player, fromId: string, toId: string, ships: Fleet, now: number) {
  const a = w.planets[fromId], b = w.planets[toId];
  assertActive(player, 'use the jump gate');
  if (!a || !b || a.ownerId !== player.id || b.ownerId !== player.id || !a.isMoon || !b.isMoon) throw new GameError('Jump gates connect two of your moons', 403);
  if (a.id === b.id) throw new GameError('Choose another moon');
  updatePlanet(w, a, now); updatePlanet(w, b, now);
  const la = lvl(a.buildings, 'jumpGate'), lb = lvl(b.buildings, 'jumpGate');
  if (la < 1 || lb < 1) throw new GameError('Both moons need a Jump Gate');
  if ((a.jumpReadyAt ?? 0) > now) throw new GameError('The gate is still recharging');
  if ((b.jumpReadyAt ?? 0) > now) throw new GameError('The destination gate is still recharging');
  const moved: Fleet = {};
  for (const [id, n] of Object.entries(ships || {})) {
    const c = Math.floor(Number(n));
    if (!c || c < 0) continue;
    if (!isShip(id) || isStationary(id)) throw new GameError('Invalid ship ' + id);
    if (c > (a.fleet[id] || 0)) throw new GameError(`Not enough ${UNITS[id].name}`);
    moved[id] = c;
  }
  if (!fleetCount(moved)) throw new GameError('Select at least one ship');
  for (const [id, n] of Object.entries(moved)) {
    a.fleet[id as ShipId] = (a.fleet[id as ShipId] || 0) - (n || 0);
    if (!a.fleet[id as ShipId]) delete a.fleet[id as ShipId];
    b.fleet[id as ShipId] = (b.fleet[id as ShipId] || 0) + (n || 0);
  }
  a.jumpReadyAt = b.jumpReadyAt = now + jumpCooldownMs(w, Math.min(la, lb));
  bus.push({ to: player.id, type: 'refresh' });
  return { moved, readyAt: a.jumpReadyAt };
}
