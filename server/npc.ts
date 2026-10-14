import { UNITS } from '../shared/data';
import { allianceEvent } from './allianceLog';
import { distance, flightSeconds, fleetSpeed, totalRes } from '../shared/formulas';
import type { Fleet, ShipId } from '../shared/types';
import type { Rng } from '../shared/combat';
import { bus } from './bus';
import { notifyPlayer } from './messages';
import { playerPoints } from './galaxy';
import { RAID_MIX, buyUnits, tierOf } from './npcunits';
import { uid, type Movement, type Planet, type Player, type World } from './world';

const ladder: ShipId[] = ['lightFighter', 'cruiser', 'battleship', 'lightFighter', 'cruiser'];

/** Build an NPC fleet worth roughly `budget` metal+crystal (used for expedition pirates and generic raiders). */
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

/**
 * How hard raids hit. A raid is sized from what stands on the attacked planet, not from how much a commander has invested overall (most of
 * which sits in mines and research and cannot fight): a good defense beats it, a neglected one does not. Points only set a small floor so a
 * defenseless planet still gets visitors. New accounts are raided gently and the strength rises to full over their first week.
 */
export const RAID = {
  /** the raid is this multiple of the value defending the planet (ships and defenses) */
  vsDefense: [0.6, 1.3] as const,
  /** the floor, as a share of everything invested (points x 1000), with computer empires and with generic raiders */
  floorEmpire: [0.03, 0.07] as const,
  floorGeneric: [0.02, 0.05] as const,
  /** account age: no more than this share of full strength on day one, rising linearly to full at `fullAfterDays` */
  youngShare: 0.3, fullAfterDays: 7,
};
export const raidRamp = (ageMs: number) => Math.min(1, RAID.youngShare + (1 - RAID.youngShare) * Math.max(0, ageMs / 86_400_000 - 1) / (RAID.fullAfterDays - 1));

export interface RaidOptions { targetPlayerId?: string; sourceNpcId?: string }

const worldsOf = (p: Player, w: World) => p.planetIds.filter((id) => !w.planets[id]?.isMoon);

/**
 * Spawn a raid against a commander. When computer empires exist the raid comes from one of them (aggressive,
 * not on truce, not in your faction, nearest and most aggrieved first); otherwise generic "Raiders" appear.
 */
export function spawnRaid(w: World, now: number, rng: Rng = Math.random, opts: RaidOptions = {}): Movement | null {
  const pool = opts.targetPlayerId
    ? [w.players[opts.targetPlayerId]].filter((p): p is Player => !!p && !p.npc && !p.vacation)
    : Object.values(w.players).filter((p) => !p.npc && !p.vacation && p.planetIds.length && playerPoints(w, p).total >= w.config.protectionPoints);
  if (!pool.length) return null;
  const target = pool[Math.floor(rng() * pool.length)];
  const homes = worldsOf(target, w);
  if (!homes.length) return null;
  const planet: Planet = w.planets[homes[Math.floor(rng() * homes.length)]];
  const pts = playerPoints(w, target).total;

  const baseOf = (n: Player) => w.planets[worldsOf(n, w)[0]];
  const empires = Object.values(w.players).filter((n) => n.npc && n.npc.status === 'aggressive' && worldsOf(n, w).length > 0
    && (target.truces[n.id] ?? 0) < now && !(target.faction && n.npc.faction === target.faction));
  const source = opts.sourceNpcId ? w.players[opts.sourceNpcId] : null;
  let npc: Player | null = null;
  let home: Planet | null = null;
  if ((source?.npc && worldsOf(source, w).length) || empires.length) {
    const choices = source?.npc ? [source] : empires
      .map((n) => ({ n, h: baseOf(n) }))
      .sort((a, b) => (distance(a.h.coords, planet.coords) - (target.heat[a.n.id] || 0) * 2) - (distance(b.h.coords, planet.coords) - (target.heat[b.n.id] || 0) * 2))
      .slice(0, 6).map((x) => x.n);
    npc = choices[Math.floor(rng() * choices.length)];
    home = baseOf(npc);
  }

  let ships: Fleet;
  if (npc && home) {
    // scaled to whatever actually defends the target, so raids stay a real threat as defenses grow
    const unit = (id: string) => UNITS[id as keyof typeof UNITS];
    const defVal = [planet.fleet, planet.defenses].reduce((s, bucket) => s + Object.entries(bucket).reduce((a, [id, n]) => a + (unit(id).missile ? 0 : totalRes(unit(id).cost) * (n || 0)), 0), 0);
    const budget = Math.max(pts * 1000 * (RAID.floorEmpire[0] + rng() * (RAID.floorEmpire[1] - RAID.floorEmpire[0])), defVal * (RAID.vsDefense[0] + rng() * (RAID.vsDefense[1] - RAID.vsDefense[0]))) * w.config.raidStrength * raidRamp(now - target.createdAt);
    ships = buyUnits({ metal: budget * 0.6, crystal: budget * 0.3, deuterium: budget * 0.1 }, RAID_MIX[Math.min(3, tierOf(pts * 2))]) as Fleet;
    const lootable = totalRes(planet.resources) / 2;
    ships.largeCargo = (ships.largeCargo || 0) + Math.ceil(lootable / 25000);
  } else {
    const budget = Math.max(6000, pts * 1000 * (RAID.floorGeneric[0] + rng() * (RAID.floorGeneric[1] - RAID.floorGeneric[0]))) * w.config.raidStrength * raidRamp(now - target.createdAt);
    ships = buildNpcFleet(budget, rng);
  }
  if (!Object.keys(ships).length) return null;

  const from = npc && home ? { ...home.coords } : { g: planet.coords.g, s: Math.max(1, Math.min(w.config.systems, planet.coords.s + Math.floor(rng() * 20) - 10)), p: w.config.positions + 1 };
  const dist = distance(from, planet.coords);
  const speed = fleetSpeed(ships, npc ? npc.techs : { combustionDrive: 6, impulseDrive: 4, hyperspaceDrive: 3 });
  const secs = Math.max(600, flightSeconds(dist, speed, 100, w.config.fleetSpeed)); // always at least 10 minutes of warning
  const m: Movement = {
    id: uid(), ownerId: npc?.id ?? null, ownerName: npc?.username ?? 'Raiders', mission: 'attack', phase: 'outbound',
    from, fromPlanetId: home?.id ?? null, to: { ...planet.coords }, ships, cargo: { metal: 0, crystal: 0, deuterium: 0 },
    speedPct: 100, departAt: now, arriveAt: now + secs * 1000, flightMs: secs * 1000,
  };
  w.movements[m.id] = m;
  const who = npc ? `${npc.username}'s fleet` : 'A raider fleet';
  notifyPlayer(w, target.id, 'raid', 'Raid incoming!', `${who} (${fleetValue(ships).toLocaleString()} resource value) is heading for ${planet.name} [${planet.coords.g}:${planet.coords.s}:${planet.coords.p}], coming from [${from.g}:${from.s}:${from.p}]${home ? ` (${home.name})` : ' (deep space)'}. Build defenses or ask your alliance to station ships there.`);
  allianceEvent(w, target.id, 'raid', `${target.username}'s ${planet.name} [${planet.coords.g}:${planet.coords.s}:${planet.coords.p}] is being raided by ${who}.`, now);
  if (target.allianceId) {
    for (const mem of w.alliances[target.allianceId]?.members ?? []) {
      if (mem.playerId !== target.id) notifyPlayer(w, mem.playerId, 'raid', 'Ally under raid!', `${target.username}'s planet ${planet.name} [${planet.coords.g}:${planet.coords.s}:${planet.coords.p}] is about to be attacked by ${npc ? npc.username : 'raiders'}. Send a "hold" fleet to help defend!`);
    }
  }
  bus.push({ to: '*', type: 'refresh' });
  return m;
}

export function processRaids(w: World, now: number) {
  if (!w.config.raidIntervalMin || !w.nextRaidAt || now < w.nextRaidAt) return;
  const humans = Object.values(w.players).filter((p) => !p.npc).length;
  const n = Math.max(1, Math.round(humans / 4));
  for (let i = 0; i < n; i++) spawnRaid(w, now);
  w.nextRaidAt = now + w.config.raidIntervalMin * 60_000 * (0.7 + Math.random() * 0.6);
}
