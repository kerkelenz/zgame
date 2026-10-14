import { ALIEN_KINDS, buildWave, type AlienKindId } from '../shared/aliens';
import { makeRng, type CombatResult, type Rng } from '../shared/combat';
import { UNITS, isStationary } from '../shared/data';
import type { Fleet, Res, ShipId } from '../shared/types';
import { updatePlanet } from './economy';
import { createPlanet } from './galaxy';
import { notifyPlayer } from './messages';
import { NPC_DEF_MIX, NPC_FLEET_MIX, buyUnits } from './npcunits';
import { blankPlayer, planetAt, uid, type Planet, type Player, type World } from './world';

const HOUR = 3_600_000, DAY = 86_400_000;

/**
 * Pirate and alien outposts: fixed targets in the galaxy that never move and never grow, a fight for a commander who wants one. They are
 * ordinary frozen computer empires (so spying, attacking and looting work with no special cases) whose garrison is set from a tier and the
 * strength of the server's fleets, and which are rebuilt some hours after being cleared. The first fleet to break one gets a bounty of Command
 * Credits (shared by the commanders who took part); the loot is what the outpost holds.
 */
export type OutpostKind = 'pirate' | 'alien';
export interface Outpost {
  id: string;
  /** the computer player that owns it, and its one planet */
  npcId: string; planetId: string;
  kind: OutpostKind; tier: number; name: string;
  state: 'guarded' | 'cleared';
  /** when a cleared outpost is rebuilt */
  respawnAt?: number;
  clearedAt?: number; clearedBy?: string[];
  /** how often it has been cleared since the server started */
  cleared: number;
}

export const OUTPOST = {
  /** the garrison, as a share of the average combat fleet of the active commanders, per tier; never below the floor (resource value) */
  share: [0.12, 0.35, 0.8, 1.6],
  floor: [120_000, 500_000, 2_000_000, 8_000_000],
  cap: 600_000_000,
  /** Command Credits for clearing it, per tier, shared by the commanders in the winning fleets */
  bounty: [20, 45, 100, 220],
  /** what it holds when it is (re)built, as a share of its garrison value */
  treasure: 0.3,
  /** how many of each tier out of ten (tier 1 is common, tier 4 rare) */
  mix: [4, 3, 2, 1],
  activeWithinMs: 7 * DAY,
};

const PIRATE_NAMES = ['Black Anchor', 'Rusty Maw', 'Cutlass Reach', 'Ghostlight Dock', 'Skull Rock', 'Dread Harbor', 'Corsair Roost', 'Scrap Haven', 'Red Tide', 'Smuggler Rest', 'Salt Gallows', 'Jolly Rift'];
const ALIEN_NAMES = ['Void Nest', 'Rift Hive', 'Silent Spire', 'Hollow Brood', 'Gloom Spawn', 'Shard Hive', 'Pale Roost', 'Drift Mother'];
const KEYS = ['metal', 'crystal', 'deuterium'] as const;

export const outpostKindLabel = (k: OutpostKind) => (k === 'pirate' ? 'Pirate outpost' : 'Alien outpost');
const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
const clampTier = (t: number) => Math.max(1, Math.min(4, Math.round(t)));
const shipValue = (id: ShipId) => UNITS[id].cost.metal + UNITS[id].cost.crystal;

/** the average combat fleet (resource value) of the commanders who played this week: what a garrison is measured against */
export function averageCombatFleet(w: World, now: number): number {
  const active = Object.values(w.players).filter((p) => !p.npc && p.planetIds.length && !p.vacation && now - p.lastSeen < OUTPOST.activeWithinMs);
  if (!active.length) return 0;
  let total = 0;
  for (const p of active) for (const id of p.planetIds) {
    const pl = w.planets[id];
    if (!pl) continue;
    for (const [sid, n] of Object.entries(pl.fleet)) if (n && UNITS[sid as ShipId].attack > 1 && !isStationary(sid)) total += n * shipValue(sid as ShipId);
  }
  return total / active.length;
}

export const garrisonValue = (w: World, tier: number, now: number) =>
  Math.min(OUTPOST.cap, Math.max(OUTPOST.floor[clampTier(tier) - 1], averageCombatFleet(w, now) * OUTPOST.share[clampTier(tier) - 1]));

const ALIEN_BY_TIER: AlienKindId[] = ['swarm', 'breaker', 'bio', 'carrier'];

/** put the garrison and the treasure on an outpost's planet (a new one, or after it was cleared) */
function stock(w: World, o: Outpost, now: number): void {
  const planet = w.planets[o.planetId], npc = w.players[o.npcId];
  if (!planet || !npc) return;
  const value = garrisonValue(w, o.tier, now);
  const t = clampTier(o.tier), split = (v: number): Res => ({ metal: v * 0.55, crystal: v * 0.33, deuterium: v * 0.12 });
  planet.fleet = {}; planet.defenses = {};
  if (o.kind === 'pirate') {
    for (const [id, n] of Object.entries(buyUnits(split(value * 0.55), NPC_FLEET_MIX[t - 1]))) planet.fleet[id as ShipId] = n;
    for (const [id, n] of Object.entries(buyUnits(split(value * 0.45), NPC_DEF_MIX[t - 1]))) planet.defenses[id as keyof typeof planet.defenses] = n;
  } else {
    const kind = ALIEN_BY_TIER[t - 1];
    planet.fleet = buildWave(kind, value) as Fleet;
  }
  const actual = Object.entries({ ...planet.fleet, ...planet.defenses }).reduce((t, [id, n]) => t + (n as number) * shipValue(id as ShipId), 0);   // what was really bought, not the budget
  const hold = actual * OUTPOST.treasure;
  planet.resources = { metal: hold * 0.5, crystal: (hold * 0.3) / 1.5, deuterium: (hold * 0.2) / 3 };      // worth `hold` in all, at the merchant's rates
  planet.updatedAt = now;
  const lv = 2 + 2 * t;
  const bonus = o.kind === 'alien' ? ALIEN_KINDS[ALIEN_BY_TIER[t - 1]].tech : { weapons: 0, shielding: 0, armour: 0 };
  npc.techs = { ...npc.techs, weapons: Math.max(0, lv + bonus.weapons), shielding: Math.max(0, lv + bonus.shielding), armour: Math.max(0, lv + bonus.armour) };
  o.state = 'guarded'; o.respawnAt = undefined;
}

const pickFrom = <T>(rng: Rng, list: T[]) => list[Math.floor(rng() * list.length)];

/** Settle `outpostsPerGalaxy` outposts in every galaxy on free positions. Returns how many were made. */
export function generateOutposts(w: World, now = Date.now(), seed = w.rngSeed ^ 0x0a77): number {
  w.outposts ??= [];
  const per = w.config.outpostsPerGalaxy;
  if (!(per > 0)) return 0;
  const rng = makeRng(seed >>> 0);
  const { galaxies, systems, positions } = w.config;
  const tiers = OUTPOST.mix.flatMap((n, i) => Array<number>(n).fill(i + 1));
  const used = new Set(Object.values(w.players).filter((p) => p.npc?.outpost).map((p) => p.username));
  let made = 0;
  for (let g = 1; g <= galaxies; g++) for (let i = 0; i < per; i++) {
    let coords = null as null | { g: number; s: number; p: number };
    for (let tries = 0; tries < 60 && !coords; tries++) {
      const c = { g, s: 1 + Math.floor(rng() * systems), p: 1 + Math.floor(rng() * positions) };
      if (!planetAt(w, c)) coords = c;
    }
    if (!coords) continue;
    const kind: OutpostKind = rng() < 0.6 ? 'pirate' : 'alien';
    const tier = pickFrom(rng, tiers);
    let name = pickFrom(rng, kind === 'pirate' ? PIRATE_NAMES : ALIEN_NAMES);
    for (let n = 2; used.has(`${kind === 'pirate' ? 'Pirates of' : 'Void brood of'} ${name}`); n++) name = `${name.replace(/ \d+$/, '')} ${n}`;
    const username = `${kind === 'pirate' ? 'Pirates of' : 'Void brood of'} ${name}`;
    used.add(username);
    const npc = blankPlayer(uid(), username, now, { npc: { status: 'inactive', seedPoints: 100, faction: null, outpost: { kind, tier } } });
    w.players[npc.id] = npc;
    const planet = createPlanet(w, npc, coords, { name, now });
    const o: Outpost = { id: uid(), npcId: npc.id, planetId: planet.id, kind, tier, name, state: 'guarded', cleared: 0 };
    w.outposts.push(o);
    stock(w, o, now);
    made++;
  }
  return made;
}

export const outpostOf = (w: World, planet: Planet): Outpost | undefined => w.outposts?.find((o) => o.planetId === planet.id);

/** Called after a battle at a planet: if it is an outpost and the attackers won, it is cleared and the bounty is paid */
export function outpostBattle(w: World, target: Planet, res: CombatResult, attackers: Player[], now: number): void {
  const o = outpostOf(w, target);
  if (!o || o.state !== 'guarded' || res.winner !== 'attacker') return;
  const winners = [...new Map(attackers.filter((p) => !p.npc).map((p) => [p.id, p])).values()];
  o.state = 'cleared'; o.clearedAt = now; o.cleared++;
  o.clearedBy = winners.map((p) => p.id);
  o.respawnAt = now + Math.max(1, w.config.outpostRespawnHours) * HOUR;
  const bounty = OUTPOST.bounty[clampTier(o.tier) - 1];
  const share = winners.length ? Math.max(1, Math.round(bounty / winners.length)) : 0;
  for (const p of winners) {
    p.credits += share;
    p.stats.outpostsCleared = (p.stats.outpostsCleared ?? 0) + 1;
    notifyPlayer(w, p.id, 'combat', `${outpostKindLabel(o.kind)} cleared: ${o.name}`, `The garrison of ${o.name} [${target.coords.g}:${target.coords.s}:${target.coords.p}] is broken. Bounty: ${share} Command Credits${winners.length > 1 ? ` (shared by ${winners.length} commanders)` : ''}. Take what is left of its treasure; it is rebuilt in about ${Math.round(w.config.outpostRespawnHours)} hours.`);
  }
}

/** Runs about once a minute: cleared outposts whose time is up are rebuilt, with a garrison measured against today's fleets */
export function processOutposts(w: World, now: number): void {
  for (const o of w.outposts ?? []) {
    if (o.state !== 'cleared' || !o.respawnAt || o.respawnAt > now) continue;
    const planet = w.planets[o.planetId];
    if (planet) updatePlanet(w, planet, now);
    stock(w, o, now);
  }
}

/** what the Galaxy page and spy reports show of an outpost */
export function outpostTag(w: World, planet: Planet) {
  const o = outpostOf(w, planet);
  return o ? { kind: o.kind, tier: o.tier, state: o.state, respawnAt: o.respawnAt ?? null, name: outpostKindLabel(o.kind) } : null;
}

/** every outpost with where it is and what is known publicly: for the Galaxy filter and the admin */
export function outpostList(w: World) {
  return (w.outposts ?? []).map((o) => {
    const pl = w.planets[o.planetId];
    return { id: o.id, name: o.name, kind: o.kind, tier: o.tier, state: o.state, respawnAt: o.respawnAt ?? null, coords: pl?.coords ?? null, cleared: o.cleared };
  });
}

export const outpostBounty = (tier: number) => OUTPOST.bounty[clampTier(tier) - 1];
