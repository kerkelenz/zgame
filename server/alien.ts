import { ALIEN_KINDS, STRIKE_KINDS, buildWave, type AlienKindId } from '../shared/aliens';
import { fleetCount, type CombatResult } from '../shared/combat';
import { TRADE_VALUE, UNITS } from '../shared/data';
import { distance, flightSeconds, fleetSpeed, totalRes } from '../shared/formulas';
import type { Fleet, Res, ShipId } from '../shared/types';
import { allianceEvent } from './allianceLog';
import { bus } from './bus';
import { playerPoints } from './galaxy';
import { notifyPlayer } from './messages';
import { fleetValue, raidRamp } from './npc';
import { uid, type Contribution, type Invasion, type InvasionWave, type Movement, type Planet, type Player, type World } from './world';

/** the rules of the three jobs besides the front: defending planets, scouting the rift, and supplying the front */
export const SUPPLY = {
  /** share of a lost ship's price that a repair costs */
  repairShare: 0.5,
  /** the chance an alien patrol catches a convoy at the rift: base and per wave already on the field, at most `max`; escorts of warships cut it by up to `escortRelief` */
  riskBase: 0.1, riskPerWave: 0.08, riskMax: 0.5, escortRelief: 0.8,
  /** the share of ships and cargo a caught convoy loses */
  lossShare: 0.3,
};
export const SCOUT = { exactProbes: 10 };
export const STRIKE = { minAgeMs: 0, activeWithinMs: 7 * 86_400_000, floor: 150_000, floorPerWave: 100_000, capShare: 0.08, minWarningMs: 15 * 60_000 };

const contrib = (inv: Invasion, id: string): Contribution => (inv.contrib[id] ||= { damage: 0, lost: 0, battles: 0 });
const zero = (): Res => ({ metal: 0, crystal: 0, deuterium: 0 });
const value = (r: Res) => r.metal * TRADE_VALUE.metal + r.crystal * TRADE_VALUE.crystal + r.deuterium * TRADE_VALUE.deuterium;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const merge = (a: Fleet, b: Fleet): Fleet => { const o: Fleet = { ...a }; for (const [id, n] of Object.entries(b)) o[id as ShipId] = (o[id as ShipId] || 0) + (n || 0); return o; };
export const mergeFleets = merge;

export const currentWave = (inv: Invasion): InvasionWave | undefined => inv.waves?.[inv.waveIndex ?? 0];
export const techOf = (inv: Invasion, kind: AlienKindId) => {
  const k = ALIEN_KINDS[kind].tech;
  return { weapons: Math.max(0, inv.level + k.weapons), shielding: Math.max(0, inv.level + k.shielding), armour: Math.max(0, inv.level + k.armour) };
};

// ------------------------------------------------------------------ strike teams at home

/** commanders who can be hit: playing, not frozen or banned, past newbie protection, seen this week */
export function strikeTargets(w: World, now: number): Player[] {
  return Object.values(w.players).filter((p) => !p.npc && p.planetIds.length && !p.vacation && !p.banned && now - p.lastSeen < STRIKE.activeWithinMs && playerPoints(w, p).total >= w.config.protectionPoints);
}

const defenceValue = (planet: Planet) => [planet.fleet, planet.defenses].reduce((s, bucket) => s + Object.entries(bucket).reduce((a, [id, n]) => a + (UNITS[id as ShipId].missile ? 0 : totalRes(UNITS[id as ShipId].cost) * (n || 0)), 0), 0);

/**
 * Send alien strike teams at planets when a wave arrives. Each eligible commander is hit with the chance `invasionHomeShare`, on one of their
 * worlds. The team is sized like a raid, from what defends that planet (and more the later the wave), never above a share of the wave.
 */
export function spawnStrikes(w: World, inv: Invasion, wave: InvasionWave, now: number, rng: () => number = Math.random): number {
  let sent = 0;
  const waves = inv.waves?.length ?? 1;
  const progress = waves > 1 ? wave.index / (waves - 1) : 1;
  for (const p of strikeTargets(w, now)) {
    if (rng() >= w.config.invasionHomeShare) continue;
    const homes = p.planetIds.map((id) => w.planets[id]).filter((x): x is Planet => !!x && !x.isMoon);
    if (!homes.length) continue;
    const planet = homes[Math.floor(rng() * homes.length)];
    const floor = STRIKE.floor + STRIKE.floorPerWave * wave.index;
    const budget = Math.min(Math.max(floor, wave.value * STRIKE.capShare), Math.max(floor, defenceValue(planet) * (0.5 + 0.5 * progress)))
      * w.config.invasionStrikeStrength * raidRamp(now - p.createdAt);
    const kind: AlienKindId = wave.kind === 'mothership' ? STRIKE_KINDS[Math.floor(rng() * STRIKE_KINDS.length)] : wave.kind;
    // a small budget cannot buy the heavy kinds: it buys a few light ships instead, so nobody is ever missed
    let ships = buildWave(kind, budget);
    if (!fleetCount(ships)) ships = buildWave('swarm', budget);
    if (!fleetCount(ships)) continue;
    const dist = distance(inv.rift, planet.coords);
    const speed = fleetSpeed(ships, { combustionDrive: 8, impulseDrive: 6, hyperspaceDrive: 4 });
    const secs = Math.max(STRIKE.minWarningMs / 1000, flightSeconds(dist, speed, 100, w.config.fleetSpeed));
    const tech = techOf(inv, kind);
    const m: Movement = {
      id: uid(), ownerId: null, ownerName: 'Void strike team', mission: 'attack', phase: 'outbound', from: { ...inv.rift }, fromPlanetId: null, to: { ...planet.coords },
      ships, cargo: zero(), speedPct: 100, departAt: now, arriveAt: now + secs * 1000, flightMs: secs * 1000, alien: { wave: wave.index, ...tech },
    };
    w.movements[m.id] = m;
    inv.strikes = (inv.strikes ?? 0) + 1;
    sent++;
    const where = `${planet.name} [${planet.coords.g}:${planet.coords.s}:${planet.coords.p}]`;
    const mins = Math.round(secs / 60);
    notifyPlayer(w, p.id, 'raid', 'Raid incoming!', `A Void strike team (${ALIEN_KINDS[kind].label.toLowerCase()}, ${fmt(fleetValue(ships))} resources of ships) from the rift is heading for ${where}. It arrives in about ${mins} minutes.`);
    allianceEvent(w, p.id, 'raid', `${p.username}'s ${where} is being hit by a Void strike team.`, now);
    for (const mem of p.allianceId ? w.alliances[p.allianceId]?.members ?? [] : []) {
      if (mem.playerId !== p.id) notifyPlayer(w, mem.playerId, 'raid', 'Ally under raid!', `${p.username}'s planet ${where} is about to be hit by a Void strike team (${mins} minutes). Send a hold fleet to defend it.`);
    }
  }
  if (sent) bus.push({ to: '*', type: 'refresh' });
  return sent;
}

/** after a strike team is fought: the value of aliens destroyed is credited to the defenders, 60% to the planet's owner and 40% shared by allies who stood with them */
export function creditStrike(w: World, m: Movement, res: CombatResult, ownerId: string, helpers: string[]): void {
  const inv = w.invasion;
  if (!inv || !m.alien) return;
  const killed = res.attackers.reduce((s, a) => s + a.lost.metal + a.lost.crystal, 0);
  const others = [...new Set(helpers)].filter((id) => id !== ownerId && w.players[id] && !w.players[id].npc);
  const ownShare = others.length ? 0.6 : 1;
  contrib(inv, ownerId).home = (contrib(inv, ownerId).home ?? 0) + killed * ownShare;
  for (const id of others) contrib(inv, id).home = (contrib(inv, id).home ?? 0) + (killed * (1 - ownShare)) / others.length;
}

// ------------------------------------------------------------------ scouting

/** probes reach the rift: they learn what the next wave is made of (or the one on the field when none is left) and tell everyone */
export function scoutRift(w: World, m: Movement, now: number): void {
  const owner = m.ownerId ? w.players[m.ownerId] : null;
  if (!owner) return;
  const inv = w.invasion;
  if (!inv?.waves) { notifyPlayer(w, owner.id, 'espionage', 'The rift is gone', 'Your probes found nothing: the invasion is over.'); return; }
  const next = (inv.waveIndex ?? 0) + 1;
  const idx = next < inv.waves.length ? next : inv.waveIndex ?? 0;
  const wave = inv.waves[idx];
  const probes = m.ships.espionageProbe || 0;
  const exact = probes >= SCOUT.exactProbes;
  const known = (inv.scouted ||= {})[idx];
  const gain = !known || (exact && !known.exact);
  if (gain) {
    inv.scouted[idx] = { by: owner.id, at: now, exact, fleet: exact ? { ...wave.fleet } : known?.fleet };
    contrib(inv, owner.id).scouts = (contrib(inv, owner.id).scouts ?? 0) + 1;
  }
  const kind = ALIEN_KINDS[wave.kind];
  const size = Math.round(wave.value / 10 ** (Math.floor(Math.log10(Math.max(10, wave.value))) - 1)) * 10 ** (Math.floor(Math.log10(Math.max(10, wave.value))) - 1);
  const fleet = exact ? ` Exactly: ${Object.entries(wave.fleet).map(([id, n]) => `${fmt(n || 0)} ${UNITS[id as ShipId].name}`).join(', ')}.` : ` Send ${SCOUT.exactProbes} or more probes for the exact fleet.`;
  notifyPlayer(w, owner.id, 'espionage', `Rift scouted: ${wave.name} (${kind.label})`, `${wave.name}, wave ${idx + 1} of ${inv.waves.length}: ${kind.label}, about ${fmt(size)} resources of ships.${fleet} ${kind.hint}${gain ? ' Everyone can now read this on the Invasion page.' : ' Someone had already looked this closely.'}`);
}

// ------------------------------------------------------------------ supply convoys

/** how likely a convoy is to be caught at the rift: more waves on the field, more risk; an escort of warships cuts it */
export function convoyRisk(inv: Invasion, ships: Fleet): number {
  if (inv.phase !== 'active') return 0;
  const total = fleetValue(ships) || 1;
  const escort = Object.entries(ships).reduce((s, [id, n]) => s + (UNITS[id as ShipId].attack >= 50 ? (UNITS[id as ShipId].cost.metal + UNITS[id as ShipId].cost.crystal) * (n || 0) : 0), 0) / total;
  const base = Math.min(SUPPLY.riskMax, SUPPLY.riskBase + SUPPLY.riskPerWave * (inv.waveIndex ?? 0));
  return base * (1 - SUPPLY.escortRelief * Math.min(1, escort));
}

/** a convoy reaches the rift: its cargo joins the supplies (minus what an alien patrol takes, sometimes), and the ships go home empty */
export function deliverSupply(w: World, m: Movement, now: number, rng: () => number = Math.random): { delivered: Res; caught: boolean } {
  const owner = m.ownerId ? w.players[m.ownerId] : null;
  const none = { delivered: zero(), caught: false };
  if (!owner) return none;
  const inv = w.invasion;
  if (!inv) { notifyPlayer(w, owner.id, 'transport', 'Supply convoy turned back', 'The invasion is over, so your convoy is flying home with its cargo.'); return none; }
  const risk = convoyRisk(inv, m.ships);
  const caught = rng() < risk;
  let cargo = m.cargo;
  let lostShips = 0;
  if (caught) {
    const keep = 1 - SUPPLY.lossShare;
    cargo = { metal: Math.floor(cargo.metal * keep), crystal: Math.floor(cargo.crystal * keep), deuterium: Math.floor(cargo.deuterium * keep) };
    for (const [id, n] of Object.entries(m.ships)) {
      const lost = Math.ceil((n || 0) * SUPPLY.lossShare);
      lostShips += lost;
      m.ships[id as ShipId] = Math.max(0, (n || 0) - lost);
      if (!m.ships[id as ShipId]) delete m.ships[id as ShipId];
    }
  }
  const pool = (inv.supply ||= zero());
  pool.metal += cargo.metal; pool.crystal += cargo.crystal; pool.deuterium += cargo.deuterium;
  const worth = value(cargo);
  const c = contrib(inv, owner.id);
  c.supplied = (c.supplied ?? 0) + worth;
  c.convoys = (c.convoys ?? 0) + 1;
  m.cargo = zero();
  notifyPlayer(w, owner.id, 'transport', caught ? 'Supply convoy hit, but got through' : 'Supply convoy delivered',
    `${fmt(cargo.metal)} metal, ${fmt(cargo.crystal)} crystal and ${fmt(cargo.deuterium)} vespene gas reached the front${caught ? `; an alien patrol caught the convoy and you lost ${fmt(lostShips)} ships and a share of the cargo` : ''}. Supplies repair ships lost at the front before each engagement.`);
  return { delivered: cargo, caught };
}

/**
 * Before an engagement, ships lost in the last one are rebuilt for as long as the supplies last: half their price, taken from the pool, and
 * only for commanders whose fleet is still at the front. Biggest losses first.
 */
export function repairFront(w: World, inv: Invasion, front: Movement[]): number {
  const pool = inv.supply;
  const loss = inv.lastLoss;
  if (!pool || !loss) return 0;
  let repairedValue = 0;
  const owners = Object.entries(loss).sort((a, b) => fleetValue(b[1]) - fleetValue(a[1]));
  for (const [ownerId, ships] of owners) {
    const mv = front.find((m) => m.ownerId === ownerId);
    if (!mv) continue;
    for (const [id, n] of Object.entries(ships)) {
      const u = UNITS[id as ShipId];
      const each = { metal: u.cost.metal * SUPPLY.repairShare, crystal: u.cost.crystal * SUPPLY.repairShare, deuterium: u.cost.deuterium * SUPPLY.repairShare };
      let can = n || 0;
      for (const k of ['metal', 'crystal', 'deuterium'] as const) if (each[k] > 0) can = Math.min(can, Math.floor(pool[k] / each[k]));
      if (can <= 0) continue;
      for (const k of ['metal', 'crystal', 'deuterium'] as const) pool[k] -= each[k] * can;
      mv.ships[id as ShipId] = (mv.ships[id as ShipId] || 0) + can;
      repairedValue += can * (u.cost.metal + u.cost.crystal);
    }
  }
  inv.lastLoss = {};
  inv.repaired = (inv.repaired ?? 0) + repairedValue;
  return repairedValue;
}
