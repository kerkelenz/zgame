import { UNITS } from '../shared/data';
import { distance, flightSeconds, fleetSpeed } from '../shared/formulas';
import type { Fleet, ShipId } from '../shared/types';
import type { Rng } from '../shared/combat';
import { bus } from './bus';
import { notifyPlayer } from './messages';
import { playerPoints } from './galaxy';
import { uid, type Movement, type Planet, type World } from './world';

const ladder: ShipId[] = ['lightFighter', 'cruiser', 'battleship', 'lightFighter', 'cruiser'];

/** Build an NPC fleet worth roughly `budget` metal+crystal. */
export function buildNpcFleet(budget: number, rng: Rng): Fleet {
  const fleet: Fleet = {};
  let left = budget;
  let guard = 0;
  while (left > 2000 && guard++ < 5000) {
    // heavier ships only once the budget justifies them
    const pool = ladder.filter((id) => (UNITS[id].cost.metal + UNITS[id].cost.crystal) * 3 <= left || id === 'lightFighter');
    const id = pool[Math.floor(rng() * pool.length)];
    const c = UNITS[id].cost.metal + UNITS[id].cost.crystal;
    const maxN = Math.max(1, Math.floor((left * (0.2 + rng() * 0.4)) / c));
    const n = Math.min(maxN, Math.floor(left / c));
    if (n < 1) break;
    fleet[id] = (fleet[id] || 0) + n;
    left -= n * c;
  }
  return fleet;
}

export function fleetValue(f: Fleet): number {
  let t = 0;
  for (const [id, n] of Object.entries(f)) t += (UNITS[id as ShipId].cost.metal + UNITS[id as ShipId].cost.crystal) * (n || 0);
  return t;
}

/** Spawn an NPC raid against a random eligible player planet. Returns the movement or null. */
export function spawnRaid(w: World, now: number, rng: Rng = Math.random): Movement | null {
  const candidates = Object.values(w.players).filter((p) => p.planetIds.length && playerPoints(w, p).total >= w.config.protectionPoints);
  if (!candidates.length) return null;
  const target = candidates[Math.floor(rng() * candidates.length)];
  // NPCs never attack someone the universe would consider protected from the average player
  const pts = playerPoints(w, target).total;
  const targets = target.planetIds.filter((id) => !w.planets[id]?.isMoon);
  const planetId = targets[Math.floor(rng() * targets.length)];
  const planet: Planet = w.planets[planetId];
  const budget = Math.max(6000, pts * 1000 * (0.06 + rng() * 0.1));
  const ships = buildNpcFleet(budget, rng);
  if (!Object.keys(ships).length) return null;
  const from = { g: planet.coords.g, s: Math.max(1, Math.min(w.config.systems, planet.coords.s + Math.floor(rng() * 20) - 10)), p: w.config.positions + 1 };
  const dist = distance(from, planet.coords);
  const speed = fleetSpeed(ships, { combustionDrive: 6, impulseDrive: 4, hyperspaceDrive: 3 });
  const secs = Math.max(600, flightSeconds(dist, speed, 100, w.config.fleetSpeed)); // always ≥10 min warning
  const m: Movement = {
    id: uid(), ownerId: null, ownerName: 'Raiders', mission: 'attack', phase: 'outbound',
    from, fromPlanetId: null, to: planet.coords, ships, cargo: { metal: 0, crystal: 0, deuterium: 0 },
    speedPct: 100, departAt: now, arriveAt: now + secs * 1000, flightMs: secs * 1000,
  };
  w.movements[m.id] = m;
  notifyPlayer(w, target.id, 'raid', 'Raid incoming!', `A raider fleet (${fleetValue(ships).toLocaleString()} resource value) is heading for ${planet.name} [${planet.coords.g}:${planet.coords.s}:${planet.coords.p}]. Build defenses or ask your alliance to station ships there.`);
  const owner = w.players[target.id];
  if (owner.allianceId) {
    for (const mem of w.alliances[owner.allianceId]?.members ?? []) {
      if (mem.playerId !== owner.id) notifyPlayer(w, mem.playerId, 'raid', 'Ally under raid!', `${owner.username}'s planet ${planet.name} [${planet.coords.g}:${planet.coords.s}:${planet.coords.p}] is about to be attacked by raiders. Send a "hold" fleet to help defend!`);
    }
  }
  bus.push({ to: '*', type: 'refresh' });
  return m;
}

export function processRaids(w: World, now: number) {
  if (!w.config.raidIntervalMin || !w.nextRaidAt || now < w.nextRaidAt) return;
  const n = Math.max(1, Math.round(Object.keys(w.players).length / 4));
  for (let i = 0; i < n; i++) spawnRaid(w, now);
  w.nextRaidAt = now + w.config.raidIntervalMin * 60_000 * (0.7 + Math.random() * 0.6);
}

