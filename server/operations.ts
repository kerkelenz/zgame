import { SHIP_IDS, UNITS, isStationary } from '../shared/data';
import { fleetCount } from '../shared/combat';
import type { Coords, Fleet, ShipId } from '../shared/types';
import { flightPlan } from './fleet';
import { notifyPlayer } from './messages';
import { GameError, uid, type Player, type World } from './world';

/**
 * Alliance operations: a shared target board. A member posts a target (an attack, or a hold fleet to defend someone) and optionally the time
 * it should land; members sign up with the ships they will send from one of their planets; the server works out when each has to leave to
 * arrive together and reminds them ten minutes before. Nothing is launched for anyone and no ship is reserved: it is a plan the members fly.
 */
export interface OpSignup { playerId: string; playerName: string; planetId: string; planetName: string; ships: Fleet; secs: number; departAt: number | null; reminded?: boolean }
export interface Operation {
  id: string; allianceId: string; createdBy: string; createdByName: string;
  kind: 'attack' | 'defend'; name: string; note: string;
  target: Coords; toMoon: boolean;
  /** when the fleets should land together; null = no fixed time */
  arriveAt: number | null;
  createdAt: number; closed: boolean;
  signups: OpSignup[];
}

export const OPS = { maxOpen: 6, minLeadMs: 5 * 60_000, maxLeadMs: 7 * 86_400_000, remindMs: 10 * 60_000, keepAfterMs: 30 * 60_000 };

const ops = (w: World) => (w.operations ??= []);
const inRange = (w: World, c: Coords) => Number.isInteger(c.g) && Number.isInteger(c.s) && Number.isInteger(c.p) && c.g >= 1 && c.g <= w.config.galaxies && c.s >= 1 && c.s <= w.config.systems && c.p >= 1 && c.p <= w.config.positions;

export function createOperation(w: World, p: Player, i: { kind: string; name: string; note?: string; target: Coords; toMoon?: boolean; arriveAt?: number | null }, now: number): Operation {
  const alliance = p.allianceId ? w.alliances[p.allianceId] : null;
  if (!alliance) throw new GameError('You are not in an alliance');
  if (i.kind !== 'attack' && i.kind !== 'defend') throw new GameError('An operation is an attack or a defense');
  const name = String(i.name ?? '').trim();
  if (name.length < 3 || name.length > 40) throw new GameError('Give the operation a name of 3 to 40 characters');
  if (!inRange(w, i.target)) throw new GameError('That target is outside the galaxy');
  if (i.arriveAt != null && (!Number.isFinite(i.arriveAt) || i.arriveAt < now + OPS.minLeadMs || i.arriveAt > now + OPS.maxLeadMs)) throw new GameError('The landing time must be between 5 minutes and 7 days from now');
  if (ops(w).filter((o) => o.allianceId === alliance.id && !o.closed).length >= OPS.maxOpen) throw new GameError(`At most ${OPS.maxOpen} operations can be open at once: close one first`);
  const op: Operation = {
    id: uid(), allianceId: alliance.id, createdBy: p.id, createdByName: p.username, kind: i.kind, name, note: String(i.note ?? '').slice(0, 300),
    target: { g: i.target.g, s: i.target.s, p: i.target.p }, toMoon: !!i.toMoon, arriveAt: i.arriveAt ?? null, createdAt: now, closed: false, signups: [],
  };
  ops(w).push(op);
  for (const m of alliance.members) if (m.playerId !== p.id) notifyPlayer(w, m.playerId, 'system', `Operation: ${name}`, `${p.username} planned ${i.kind === 'attack' ? 'an attack' : 'a defense'} on [${op.target.g}:${op.target.s}:${op.target.p}]${op.arriveAt ? ` landing ${new Date(op.arriveAt).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}. Sign up on the Alliance page.`);
  return op;
}

function findOpen(w: World, p: Player, id: string): Operation {
  const op = ops(w).find((o) => o.id === id && o.allianceId === p.allianceId);
  if (!op) throw new GameError('No such operation', 404);
  if (op.closed) throw new GameError('That operation is closed');
  return op;
}

/** `mode` picks the ships from the planet: every warship, or every ship that can fly */
export function shipsFor(planetFleet: Record<string, number | undefined>, mode: 'warships' | 'all'): Fleet {
  const f: Fleet = {};
  for (const id of SHIP_IDS) {
    const n = planetFleet[id] || 0;
    if (n > 0 && !isStationary(id) && (mode === 'all' || (UNITS[id].attack >= 50 && id !== 'colonyShip'))) f[id as ShipId] = n;
  }
  return f;
}

export function signUp(w: World, p: Player, opId: string, planetId: string, mode: string, now: number): OpSignup {
  const op = findOpen(w, p, opId);
  const planet = w.planets[planetId];
  if (!planet || planet.ownerId !== p.id) throw new GameError('Not your planet', 403);
  const ships = shipsFor(planet.fleet, mode === 'all' ? 'all' : 'warships');
  if (!fleetCount(ships)) throw new GameError(mode === 'all' ? 'There are no ships on that planet' : 'There are no warships on that planet');
  const plan = flightPlan(w, p, ships, planet.coords, op.target, 100);
  const departAt = op.arriveAt ? op.arriveAt - plan.secs * 1000 : null;
  if (departAt !== null && departAt < now) throw new GameError('Too late for this one: your fleet would have had to leave already');
  const s: OpSignup = { playerId: p.id, playerName: p.username, planetId, planetName: planet.name, ships, secs: plan.secs, departAt };
  op.signups = op.signups.filter((x) => !(x.playerId === p.id && x.planetId === planetId));
  op.signups.push(s);
  return s;
}

export function withdraw(w: World, p: Player, opId: string) {
  const op = findOpen(w, p, opId);
  op.signups = op.signups.filter((x) => x.playerId !== p.id);
}

export function closeOperation(w: World, p: Player, opId: string) {
  const op = findOpen(w, p, opId);
  const m = w.alliances[op.allianceId]?.members.find((x) => x.playerId === p.id);
  if (op.createdBy !== p.id && m?.role === 'member') throw new GameError('Only the one who planned it, or an officer, can close it', 403);
  op.closed = true;
}

/** every minute: ten-minute launch reminders, and operations that have landed are closed, then forgotten */
export function processOperations(w: World, now: number) {
  const list = ops(w);
  for (const op of list) {
    if (op.closed) continue;
    for (const s of op.signups) {
      if (s.departAt && !s.reminded && now >= s.departAt - OPS.remindMs) {
        s.reminded = true;
        const late = now > s.departAt;
        notifyPlayer(w, s.playerId, 'system', `Operation: ${late ? 'launch now' : 'time to launch'}`, `${op.name}: ${late ? 'your fleet should already be on its way' : `launch from ${s.planetName} in ${Math.max(0, Math.round((s.departAt - now) / 60_000))} minutes`} to land on [${op.target.g}:${op.target.s}:${op.target.p}] with the others.`);
      }
    }
    if (op.arriveAt && now > op.arriveAt + OPS.keepAfterMs) op.closed = true;
  }
  w.operations = list.filter((o) => !o.closed || now - (o.arriveAt ?? o.createdAt) < 24 * 3_600_000);
}

export function operationsView(w: World, p: Player) {
  return ops(w).filter((o) => o.allianceId === p.allianceId && !o.closed).map((o) => ({
    ...o, mine: o.signups.filter((s) => s.playerId === p.id).map((s) => s.planetId),
    totalShips: o.signups.reduce((n, s) => n + fleetCount(s.ships), 0),
  }));
}
