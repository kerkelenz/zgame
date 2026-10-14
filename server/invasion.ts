import { ALIEN_KINDS, buildWave, planWaves, type AlienKindId } from '../shared/aliens';
import { makeRng, simulateCombat } from '../shared/combat';
import { UNITS, isStationary } from '../shared/data';
import type { Fleet, Res, ShipId } from '../shared/types';
import { SUPPLY, currentWave, mergeFleets, repairFront, spawnStrikes, techOf } from './alien';
import { bus } from './bus';
import { combatant, onlyShips } from './fleet';
import { movementsByOwner } from './galaxy';
import { notifyPlayer } from './messages';
import { fleetValue } from './npc';
import { GameError, type Contribution, type Invasion, type InvasionWave, type Movement, type World } from './world';

const HOUR = 3_600_000, MIN = 60_000;
/** what the classic Armada is made of, by share of its value (the mothership wave uses the same mix) */
const MIX: [ShipId, number][] = [['lightFighter', 0.15], ['heavyFighter', 0.10], ['cruiser', 0.25], ['battleship', 0.20], ['battlecruiser', 0.15], ['destroyer', 0.15]];
const MIN_BUDGET = 1_000_000, MAX_BUDGET = 2_000_000_000;
/** a commander's fleet counts for at most this many times the median combat fleet when the Armada is sized */
export const CAP_MEDIANS = 3;

/**
 * Rewards: a pool of Command Credits split by contribution in four jobs, weighted: damage at the front, aliens destroyed at home, supplies
 * delivered, waves scouted. A job nobody did does not count, its weight goes to the others; fight alone and the old damage-only split results.
 * `relief` is the share of the ships lost at the front that comes back as resources (half of it when the Armada withdrew).
 */
export const REWARD = { base: 600, perParticipant: 100, cap: 3000, floor: 25, lossDivisor: 3, minShare: 0.005, weights: { damage: 0.35, home: 0.25, supply: 0.25, scout: 0.15 }, relief: 0.15 };

const shipValue = (id: ShipId) => UNITS[id].cost.metal + UNITS[id].cost.crystal;

/** the combat ships a commander owns right now, at home or in the air */
function combatFleetValue(w: World, playerId: string, flights: Map<string, Movement[]>): number {
  const p = w.players[playerId];
  let v = 0;
  const count = (f: Fleet) => { for (const [id, n] of Object.entries(f)) if (n && UNITS[id as ShipId].attack > 1 && !isStationary(id)) v += n * (UNITS[id as ShipId].cost.metal + UNITS[id as ShipId].cost.crystal); };
  for (const pid of p.planetIds) { const pl = w.planets[pid]; if (pl) count(pl.fleet); }
  for (const m of flights.get(playerId) ?? []) count(m.ships);
  return v;
}

/**
 * The whole invasion is a share (invasionStrength) of the combat fleets the whole server owns when it is announced, split into waves, so it
 * can be beaten by a good part of the server working together but never by one fleet, at any scale. Fleets built after the announcement
 * are extra. Fleets, not points: most points sit in buildings and research, which cannot fight.
 */
export function bossBudget(w: World): number {
  const flights = movementsByOwner(w);
  const fleets: number[] = [];
  for (const p of Object.values(w.players)) if (!p.npc && p.planetIds.length) { const v = combatFleetValue(w, p.id, flights); if (v > 0) fleets.push(v); }
  // one huge fleet must not size the Armada for everyone: no commander counts for more than CAP_MEDIANS times the median of those who have a fleet
  const sorted = [...fleets].sort((a, b) => a - b);
  const median = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : 0;
  const cap = Math.max(MIN_BUDGET, median * CAP_MEDIANS);
  const ships = fleets.reduce((s, v) => s + Math.min(v, cap), 0);
  return Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, ships * w.config.invasionStrength));
}

export function buildBoss(budget: number): Fleet {
  const f: Fleet = {};
  for (const [id, share] of MIX) { const n = Math.floor((budget * share) / shipValue(id)); if (n > 0) f[id] = n; }
  return f;
}

const humans = (w: World) => Object.values(w.players).filter((p) => !p.npc && p.planetIds.length);
const tellAll = (w: World, subject: string, body: string, toast?: string) => {
  for (const p of humans(w)) notifyPlayer(w, p.id, 'news', subject, body);
  if (toast) bus.push({ to: '*', type: 'toast', data: toast });
  bus.push({ to: '*', type: 'refresh' });
};
const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');

/** an invasion saved before waves existed becomes one wave, the Armada that was there */
export function migrateInvasion(w: World): void {
  const inv = w.invasion;
  if (!inv || inv.waves) return;
  inv.waves = [{ index: 0, kind: 'mothership', name: 'The Armada', share: 1, fleet: { ...inv.startFleet }, value: inv.startValue, status: 'active', scheduledAt: inv.startsAt, appearedAt: inv.phase === 'active' ? inv.startsAt : undefined }];
  inv.waveIndex = 0; inv.totalValue = inv.startValue; inv.scouted ??= {}; inv.supply ??= { metal: 0, crystal: 0, deuterium: 0 };
}

/** Announce an invasion; it arrives after the warning period. */
export function announceInvasion(w: World, now: number, delayMs = w.config.invasionAnnounceHours * HOUR): Invasion {
  if (w.invasion) throw new GameError('An invasion is already under way');
  const number = (w.invasionCount ?? 0) + 1;
  w.invasionCount = number;
  const rng = makeRng((w.rngSeed ^ (number * 2654435761)) >>> 0);
  const rift = { g: 1 + Math.floor(rng() * w.config.galaxies), s: 1 + Math.floor(rng() * w.config.systems), p: w.config.positions + 1 };
  const budget = bossBudget(w);
  const plan = planWaves(w.config.invasionWaves ?? 4, number);
  const duration = w.config.invasionDurationHours * HOUR;
  const startsAt = now + delayMs;
  // later waves arrive on a schedule spread over the first four fifths of the event, or sooner if the one before is cleared
  const spacing = plan.length > 1 ? (duration * 0.8) / plan.length : 0;
  const waves: InvasionWave[] = plan.map((p) => {
    const fleet = buildWave(p.kind, budget * p.share);
    return { index: p.index, kind: p.kind, name: p.name, share: p.share, fleet, value: fleetValue(fleet), status: p.index === 0 ? 'active' : 'pending', scheduledAt: startsAt + p.index * spacing };
  });
  const level = Math.min(15, 3 + 2 * (number - 1));
  const first = waves[0];
  const inv: Invasion = {
    number, phase: 'announced', announcedAt: now, startsAt, endsAt: startsAt + duration,
    rift, level, startFleet: { ...first.fleet }, fleet: { ...first.fleet }, startValue: first.value, nextEngageAt: 0, round: 0, contrib: {},
    waves, waveIndex: 0, nextWaveAt: waves[1]?.scheduledAt, totalValue: waves.reduce((s, x) => s + x.value, 0), scouted: {}, supply: { metal: 0, crystal: 0, deuterium: 0 }, lastLoss: {}, repaired: 0, strikes: 0,
  };
  w.invasion = inv;
  const left = Math.round(delayMs / HOUR * 10) / 10;
  const n = waves.length;
  tellAll(w, `Void invasion incoming: wave ${number}`, `A Void invasion (${fmtN(inv.totalValue!)} resources of ships in ${n === 1 ? 'one fleet' : `${n} waves`}) is tearing a rift open at ${rift.g}:${rift.s}:${rift.p}. It arrives in ${left} hours and stays ${w.config.invasionDurationHours}. Scout it with probes, send combat fleets to the rift once it opens, defend your planets when strike teams come, and fly supply convoys to the front. Everyone's work counts toward the rewards.`, `Void invasion in ${left} hours - rift at ${rift.g}:${rift.s}:${rift.p}`);
  return inv;
}

function bossCombatant(inv: Invasion) {
  const t = techOf(inv, currentWave(inv)?.kind ?? 'mothership');
  return { owner: null, name: 'Void Armada', weapons: t.weapons, shielding: t.shielding, armour: t.armour, fleet: { ...inv.fleet } };
}

const power = (f: Fleet, weapons: number) => Object.entries(f).reduce((s, [id, n]) => s + UNITS[id as ShipId].attack * (n || 0), 0) * (1 + 0.1 * weapons);

/** the next wave arrives: it joins whatever is left of the one before, and strike teams head for the planets */
function spawnWave(w: World, inv: Invasion, now: number): void {
  const waves = inv.waves!;
  const idx = (inv.waveIndex ?? 0) + 1;
  const wave = waves[idx];
  if (!wave) return;
  inv.waveIndex = idx;
  wave.status = 'active'; wave.appearedAt = now;
  inv.fleet = mergeFleets(inv.fleet, wave.fleet);
  inv.startFleet = mergeFleets(inv.startFleet, wave.fleet);
  inv.startValue = fleetValue(inv.startFleet);
  inv.nextWaveAt = waves[idx + 1]?.scheduledAt;
  const kind = ALIEN_KINDS[wave.kind];
  tellAll(w, `Void wave ${idx + 1} of ${waves.length}: ${wave.name}`, `${kind.label} have arrived at the rift (${fmtN(wave.value)} resources of ships). ${kind.hint} Strike teams are heading for planets.`, `Void wave ${idx + 1} of ${waves.length}: ${wave.name}`);
  spawnStrikes(w, inv, wave, now);
}

/** every fleet at the rift is gone from the field: the next wave comes sooner, or the invasion is won */
function waveCleared(w: World, inv: Invasion, now: number): void {
  const waves = inv.waves!;
  const idx = inv.waveIndex ?? 0;
  const wave = waves[idx];
  wave.status = 'cleared'; wave.clearedAt = now;
  if (idx >= waves.length - 1) { finish(w, now, 'won'); return; }
  inv.startFleet = {}; inv.startValue = 0;
  inv.nextWaveAt = Math.min(inv.nextWaveAt ?? Infinity, now + w.config.invasionBreatherMinutes * MIN);
  tellAll(w, `Void wave ${idx + 1} destroyed: ${wave.name}`, `The ${ALIEN_KINDS[wave.kind].label.toLowerCase()} fell. The next wave arrives in about ${w.config.invasionBreatherMinutes} minutes at the latest: repair, resupply and regroup.`, `Wave ${idx + 1} destroyed`);
}

/** One engagement: every fleet at the rift fights what is on the field as one force. */
export function engage(w: World, now: number) {
  const inv = w.invasion;
  if (!inv || inv.phase !== 'active') return;
  if (!Object.keys(inv.fleet).length) return;                       // between waves the field is empty
  inv.round++;
  const wave = currentWave(inv);
  const kind = ALIEN_KINDS[wave?.kind ?? 'mothership'];
  // the aliens rebuild a little between rounds (bio-ships a lot), so a trickle of damage never wins
  for (const id of Object.keys(inv.startFleet) as ShipId[]) {
    const want = inv.startFleet[id] || 0, have = inv.fleet[id] || 0;
    if (have < want) inv.fleet[id] = Math.min(want, have + Math.max(1, Math.ceil(want * kind.regen)));
  }
  const front = Object.values(w.movements).filter((m) => m.mission === 'invade' && m.phase === 'holding' && m.ownerId && w.players[m.ownerId]);
  if (!front.length) return;
  repairFront(w, inv, front);                                       // supplies rebuild what the last engagement cost
  const attackers = front.map((m) => combatant(w, w.players[m.ownerId!], m.ownerName, m.ships));
  const rng = makeRng(Math.floor(Math.random() * 2 ** 31));
  const res = simulateCombat(attackers, [bossCombatant(inv)], rng);
  const bossLost = res.defenders[0].lost.metal + res.defenders[0].lost.crystal;
  const totalPower = front.reduce((s, m, i) => s + power(m.ships, attackers[i].weapons), 0) || 1;
  const rows: { name: string; before: Fleet; after: Fleet; lost: number }[] = [];
  const lostBy: Record<string, Fleet> = {};
  inv.lastLoss = lostBy;
  front.forEach((m, i) => {
    const owner = w.players[m.ownerId!];
    const c = (inv.contrib[owner.id] ||= { damage: 0, lost: 0, battles: 0 });
    c.damage += bossLost * (power(m.ships, attackers[i].weapons) / totalPower);
    c.lost += res.attackers[i].lost.metal + res.attackers[i].lost.crystal;
    c.battles++;
    rows.push({ name: m.ownerName, before: { ...m.ships }, after: onlyShips(res.attackers[i].after), lost: res.attackers[i].lost.metal + res.attackers[i].lost.crystal });
    const lostShips: Fleet = {};
    for (const [id, n] of Object.entries(res.attackers[i].before)) { const d = (n || 0) - (res.attackers[i].after[id as ShipId] || 0); if (d > 0 && !UNITS[id as ShipId].missile) lostShips[id as ShipId] = d; }
    if (Object.keys(lostShips).length) lostBy[owner.id] = mergeFleets(lostBy[owner.id] ?? {}, lostShips);
    m.ships = onlyShips(res.attackers[i].after);
    if (!Object.keys(m.ships).length) delete w.movements[m.id];
  });
  inv.fleet = onlyShips(res.defenders[0].after);
  inv.last = { at: now, wave: inv.waveIndex ?? 0, rounds: res.rounds, winner: res.winner, roundLog: res.roundLog, roundStats: res.roundStats };
  // one rolling report per commander instead of a message every engagement
  const report = {
    coords: inv.rift, planet: 'Void rift', rounds: res.rounds, winner: res.winner, debris: { metal: 0, crystal: 0 }, loot: { metal: 0, crystal: 0, deuterium: 0 }, bounty: 0, roundLog: res.roundLog, roundStats: res.roundStats,
    attackers: res.attackers.map((a, i) => ({ name: rows[i].name, before: a.before, after: a.after, lost: a.lost })),
    defenders: [{ name: 'Void Armada', before: res.defenders[0].before, after: res.defenders[0].after, lost: res.defenders[0].lost }],
  };
  const left = fleetValue(inv.fleet);
  for (const m of front) {
    const pid = m.ownerId!;
    w.messages = w.messages.filter((x) => !(x.to === pid && x.kind === 'combat' && x.subject.startsWith('Invasion front')));
    const mine = rows[front.indexOf(m)];
    notifyPlayer(w, pid, 'combat', `Invasion front: round ${inv.round}`, `The Armada lost ${Math.round(bossLost).toLocaleString('en-US')} resources of ships; ${Math.round(left / Math.max(1, inv.startValue) * 100)}% of this wave's strength is left. You lost ${Math.round(mine.lost).toLocaleString('en-US')} of ships. All fleets at the rift fight together; the next engagement is in ${w.config.invasionEngageMinutes} minutes.`, report);
  }
  if (!Object.keys(inv.fleet).length) waveCleared(w, inv, now);
}

interface Share { id: string; name: string; damage: number; home: number; supplied: number; scouts: number; share: number }

/** each commander's share of the reward: the weighted mean of their share in every job somebody did */
export function shares(w: World, inv: Invasion): Share[] {
  const entries = Object.entries(inv.contrib).filter(([id]) => w.players[id]);
  const sum = (f: (c: Contribution) => number) => entries.reduce((s, [, c]) => s + f(c), 0);
  const jobs = [
    { weight: REWARD.weights.damage, get: (c: Contribution) => c.damage },
    { weight: REWARD.weights.home, get: (c: Contribution) => c.home ?? 0 },
    { weight: REWARD.weights.supply, get: (c: Contribution) => c.supplied ?? 0 },
    { weight: REWARD.weights.scout, get: (c: Contribution) => c.scouts ?? 0 },
  ].map((j) => ({ ...j, total: sum(j.get) })).filter((j) => j.total > 0);
  const weight = jobs.reduce((s, j) => s + j.weight, 0);
  return entries.map(([id, c]) => ({
    id, name: w.players[id].username, damage: c.damage, home: c.home ?? 0, supplied: c.supplied ?? 0, scouts: c.scouts ?? 0,
    share: weight > 0 ? jobs.reduce((s, j) => s + (j.weight * j.get(c)) / j.total, 0) / weight : 0,
  })).sort((a, b) => b.share - a.share);
}

/** Close the invasion: pay out, send every fleet home, remember it, plan the next one. */
export function finish(w: World, now: number, result: 'won' | 'lost') {
  const inv = w.invasion;
  if (!inv) throw new GameError('There is no invasion');
  for (const m of Object.values(w.movements)) if (m.mission === 'invade' && m.phase === 'holding') m.holdUntil = now; // processMovements sends them home
  for (const [id, m] of Object.entries(w.movements)) if (m.alien) delete w.movements[id];                           // strike teams still on their way turn back with the rift
  const entries = shares(w, inv);
  const pool = Math.min(REWARD.cap, REWARD.base + REWARD.perParticipant * entries.length) / (result === 'won' ? 1 : REWARD.lossDivisor);
  const paid: { id: string; name: string; damage: number; credits: number }[] = [];
  for (const e of entries) {
    const p = w.players[e.id];
    const c = inv.contrib[e.id];
    const credits = e.share >= REWARD.minShare || result === 'won' ? Math.max(Math.round(REWARD.floor / (result === 'won' ? 1 : REWARD.lossDivisor)), Math.round(pool * e.share)) : 0;
    if (credits > 0) p.credits += credits;
    if (result === 'won' && e.share >= REWARD.minShare) p.stats.invasionsWon++;
    p.stats.voidDamage += Math.round(e.damage);
    p.stats.voidHome += Math.round(e.home);
    p.stats.voidSupplied += Math.round(e.supplied);
    p.stats.voidScouts += e.scouts;
    // the ships lost at the front come back in part as resources, on the commander's first world
    const relief = Math.round((c?.lost ?? 0) * REWARD.relief * (result === 'won' ? 1 : 0.5));
    const home = w.planets[p.planetIds[0]];
    if (relief > 0 && home) { home.resources.metal += Math.round(relief * 0.6); home.resources.crystal += Math.round(relief * 0.4); }
    paid.push({ id: e.id, name: p.username, damage: Math.round(e.damage), credits });
    const jobs = [e.damage > 0 && `${fmtN(e.damage)} damage at the front`, e.home > 0 && `${fmtN(e.home)} of aliens destroyed at home`, e.supplied > 0 && `${fmtN(e.supplied)} of supplies delivered`, e.scouts > 0 && `${e.scouts} scouting report${e.scouts === 1 ? '' : 's'}`].filter(Boolean).join(', ');
    notifyPlayer(w, e.id, 'news', result === 'won' ? `The Void invasion is destroyed!` : 'The Void invasion withdrew', `Your work: ${jobs || 'none'} (${Math.round(e.share * 1000) / 10}% of the whole effort). You earned ${credits} Command Credits${relief > 0 ? ` and ${fmtN(relief)} resources came back for ships lost at the front` : ''}.`);
  }
  const damageOf = (id: string) => inv.contrib[id]?.damage ?? 0;
  const alliances = new Map<string, number>();
  for (const e of paid) { const p = w.players[e.id]; if (p?.allianceId && w.alliances[p.allianceId]) alliances.set(p.allianceId, (alliances.get(p.allianceId) ?? 0) + e.damage); }
  const hist = (w.invasionHistory ||= []);
  const cleared = inv.waves?.filter((x) => x.status === 'cleared').length ?? (result === 'won' ? 1 : 0);
  hist.unshift({
    number: inv.number, result, startedAt: inv.startsAt, endedAt: now, startValue: inv.totalValue ?? inv.startValue, rounds: inv.round,
    top: [...paid].sort((a, b) => damageOf(b.id) - damageOf(a.id)).slice(0, 5).map((e) => ({ name: e.name, damage: e.damage })),
    topAlliance: [...alliances.entries()].sort((a, b) => b[1] - a[1]).map(([id, dmg]) => ({ tag: w.alliances[id].tag, damage: dmg }))[0] ?? null,
    waves: inv.waves?.length ?? 1, wavesCleared: cleared, strikes: inv.strikes ?? 0, supplied: Math.round(entries.reduce((s, e) => s + e.supplied, 0)),
  });
  if (hist.length > 20) hist.length = 20;
  w.invasion = undefined;
  w.nextInvasionAt = w.config.invasionIntervalHours > 0 ? now + w.config.invasionIntervalHours * HOUR : 0;
  const lead = [...entries].sort((a, b) => b.damage - a.damage)[0];
  const leadText = lead && lead.damage > 0 ? `Top damage: ${lead.name} (${fmtN(lead.damage)}).` : 'Nobody fought at the front.';
  tellAll(w, result === 'won' ? `Void wave ${inv.number} destroyed` : `Void wave ${inv.number} withdrew`, result === 'won' ? `The invasion fell after ${inv.round} rounds at the front. ${leadText}` : `The aliens left with ${cleared} of ${inv.waves?.length ?? 1} waves destroyed. ${leadText}`);
}

/** Runs every tick: schedules, opens, fights and ends invasions. */
export function processInvasion(w: World, now: number) {
  const inv = w.invasion;
  if (!inv) {
    if (w.config.invasionIntervalHours <= 0) return;
    if (w.nextInvasionAt === undefined) w.nextInvasionAt = now + w.config.invasionIntervalHours * HOUR;
    if (now >= w.nextInvasionAt) {
      if (humans(w).length >= w.config.invasionMinPlayers) announceInvasion(w, now);
      else w.nextInvasionAt = now + HOUR; // not enough commanders yet; look again in an hour
    }
    return;
  }
  migrateInvasion(w);
  if (inv.phase === 'announced' && now >= inv.startsAt) {
    inv.phase = 'active';
    inv.nextEngageAt = now + w.config.invasionEngageMinutes * MIN;
    const first = inv.waves![0];
    first.appearedAt = inv.startsAt;
    tellAll(w, 'The Void rift is open', `The aliens have arrived at ${inv.rift.g}:${inv.rift.s}:${inv.rift.p}: ${first.name}, ${ALIEN_KINDS[first.kind].label.toLowerCase()}. ${ALIEN_KINDS[first.kind].hint} Send combat fleets now (mission: Join the invasion front).`, 'The Void rift is open!');
    spawnStrikes(w, inv, first, now);
  }
  if (inv.phase !== 'active') return;
  for (let guard = 0; guard < 200 && w.invasion && w.invasion.nextEngageAt <= now && w.invasion.nextEngageAt <= w.invasion.endsAt; guard++) {
    const cur = w.invasion;
    const at = cur.nextEngageAt;
    cur.nextEngageAt += w.config.invasionEngageMinutes * MIN;
    if (cur.nextWaveAt !== undefined && cur.nextWaveAt <= at) spawnWave(w, cur, cur.nextWaveAt);
    engage(w, at);
  }
  // a wave whose time has come arrives even if no engagement is due yet
  const cur = w.invasion;
  if (cur && cur.phase === 'active' && cur.nextWaveAt !== undefined && cur.nextWaveAt <= now && now < cur.endsAt) spawnWave(w, cur, cur.nextWaveAt);
  if (w.invasion && now >= w.invasion.endsAt) finish(w, now, 'lost');
}

const cmp = (a: [string, { damage: number }], b: [string, { damage: number }]) => b[1].damage - a[1].damage;

const top = (w: World, viewerId: string, get: (c: Contribution) => number, n = 5) => {
  const rows = Object.entries(w.invasion!.contrib).filter(([id]) => w.players[id]).map(([id, c]) => ({ id, v: get(c) })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
  const total = rows.reduce((s, r) => s + r.v, 0);
  return { total: Math.round(total), rows: rows.slice(0, n).map((r, i) => ({ rank: i + 1, id: r.id, name: w.players[r.id].username, value: Math.round(r.v), share: total > 0 ? r.v / total : 0, you: r.id === viewerId })) };
};

/**
 * Can the fleets win? An estimate by fighting the Armada's present fleet a few times: with what is waiting at the rift now, and with that plus
 * every combat ship the viewer has at home. Cached for a while, since the fights are not free.
 */
const meterCache = new Map<string, { at: number; value: unknown }>();
export function strengthMeter(w: World, viewerId: string, now: number) {
  const inv = w.invasion;
  if (!inv || inv.phase !== 'active' || !Object.keys(inv.fleet).length) return null;
  const held = Object.values(w.movements).filter((m) => m.mission === 'invade' && m.phase === 'holding' && m.ownerId && w.players[m.ownerId]);
  const viewer = w.players[viewerId];
  const home: Fleet = {};
  if (viewer) for (const id of viewer.planetIds) { const pl = w.planets[id]; if (pl && !pl.isMoon) for (const [sid, n] of Object.entries(onlyShips(pl.fleet))) if (n && UNITS[sid as ShipId].attack > 1 && !isStationary(sid)) home[sid as ShipId] = (home[sid as ShipId] || 0) + n; }
  const sig = `${inv.number}:${inv.waveIndex}:${inv.round}:${fleetValue(inv.fleet)}:${held.map((m) => m.id + fleetValue(m.ships)).join(',')}:${viewerId}:${fleetValue(home)}`;
  const hit = meterCache.get(sig);
  if (hit && now - hit.at < 60_000) return hit.value as ReturnType<typeof compute>;
  const value = compute();
  meterCache.set(sig, { at: now, value });
  if (meterCache.size > 200) meterCache.delete(meterCache.keys().next().value as string);
  return value;

  function chance(sides: ReturnType<typeof combatant>[]): number {
    if (!sides.length) return 0;
    let wins = 0;
    const N = 6;
    for (let i = 0; i < N; i++) {
      const res = simulateCombat(sides.map((s) => ({ ...s, fleet: { ...s.fleet } })), [bossCombatant(inv!)], makeRng(7000 + i * 131 + inv!.round));
      if (res.winner === 'attacker') wins++;
    }
    return wins / N;
  }
  function compute() {
    const heldSides = held.map((m) => combatant(w, w.players[m.ownerId!], m.ownerName, m.ships));
    const mineSide = viewer && fleetValue(home) > 0 ? [combatant(w, viewer, viewer.username, home)] : [];
    return {
      field: Math.round(fleetValue(inv!.fleet)),
      held: { value: Math.round(held.reduce((t, m) => t + fleetValue(m.ships), 0)), commanders: new Set(held.map((m) => m.ownerId)).size },
      mineHome: Math.round(fleetValue(home)),
      chanceHeld: chance(heldSides),
      chanceWithMine: chance([...heldSides, ...mineSide]),
    };
  }
}

export function invasionView(w: World, viewerId: string, now: number) {
  const inv = w.invasion;
  const history = w.invasionHistory ?? [];
  const base = { history, next: w.nextInvasionAt ?? null, engageMinutes: w.config.invasionEngageMinutes, reward: REWARD, supply: SUPPLY };
  if (!inv) return { ...base, active: null };
  migrateInvasion(w);
  const players = Object.entries(inv.contrib).filter(([id]) => w.players[id]).sort(cmp);
  const total = players.reduce((s, [, c]) => s + c.damage, 0);
  const byAlliance = new Map<string, number>();
  for (const [id, c] of players) { const a = w.players[id].allianceId; if (a && w.alliances[a]) byAlliance.set(a, (byAlliance.get(a) ?? 0) + c.damage); }
  const mine = inv.contrib[viewerId];
  const waves = inv.waves!;
  const idx = inv.waveIndex ?? 0;
  const mineShare = shares(w, inv).find((s) => s.id === viewerId);
  // what a wave shows: its name and place always; its kind once it has arrived or been scouted; its fleet when it is on the field or was scouted exactly
  const waveView = waves.map((x) => {
    const seen = inv.scouted?.[x.index];
    const known = x.status !== 'pending' || !!seen;
    const kind = ALIEN_KINDS[x.kind];
    return {
      index: x.index, name: x.name, status: x.status, scheduledAt: x.scheduledAt, appearedAt: x.appearedAt ?? null, clearedAt: x.clearedAt ?? null,
      kind: known ? x.kind : null, label: known ? kind.label : 'Unknown', hint: known ? kind.hint : 'Scout the rift with probes to learn what is coming.',
      value: known ? (seen?.exact || x.status !== 'pending' ? Math.round(x.value) : Math.round(x.value / 100000) * 100000) : null,
      exact: x.status !== 'pending' || !!seen?.exact, fleet: x.status !== 'pending' ? x.fleet : seen?.exact ? seen.fleet ?? null : null,
      scoutedBy: seen ? { id: seen.by, name: w.players[seen.by]?.username ?? '?', at: seen.at } : null,
    };
  });
  const alienStrikes = Object.values(w.movements).filter((m) => m.alien).map((m) => ({ id: m.id, to: m.to, arriveAt: m.arriveAt, wave: m.alien!.wave, mine: Object.values(w.planets).some((p) => p.ownerId === viewerId && !p.isMoon && p.coords.g === m.to.g && p.coords.s === m.to.s && p.coords.p === m.to.p), value: Math.round(fleetValue(m.ships)) }));
  return {
    ...base,
    active: {
      number: inv.number, phase: inv.phase, announcedAt: inv.announcedAt, startsAt: inv.startsAt, endsAt: inv.endsAt, rift: inv.rift, level: inv.level, round: inv.round,
      nextEngageAt: inv.phase === 'active' ? inv.nextEngageAt : null,
      nextWaveAt: inv.nextWaveAt ?? null, waveIndex: idx, waveCount: waves.length, waves: waveView,
      boss: { fleet: inv.fleet, startFleet: inv.startFleet, value: fleetValue(inv.fleet), startValue: inv.startValue, onField: Object.keys(inv.fleet).length > 0 },
      kind: waves[idx] ? { id: waves[idx].kind, label: ALIEN_KINDS[waves[idx].kind].label, hint: ALIEN_KINDS[waves[idx].kind].hint } : null,
      supply: { ...(inv.supply ?? { metal: 0, crystal: 0, deuterium: 0 }), repaired: Math.round(inv.repaired ?? 0) },
      strikes: { sent: inv.strikes ?? 0, onTheWay: alienStrikes.filter((s) => s.mine) },
      last: inv.last ? { at: inv.last.at, wave: inv.last.wave, rounds: inv.last.rounds, winner: inv.last.winner, roundLog: inv.last.roundLog, roundStats: inv.last.roundStats } : null,
      mine: mine ? { damage: Math.round(mine.damage), lost: Math.round(mine.lost), share: total > 0 ? mine.damage / total : 0, battles: mine.battles, home: Math.round(mine.home ?? 0), supplied: Math.round(mine.supplied ?? 0), convoys: mine.convoys ?? 0, scouts: mine.scouts ?? 0, reward: mineShare ? mineShare.share : 0 } : null,
      players: players.slice(0, 10).map(([id, c], i) => ({ rank: i + 1, id, name: w.players[id].username, damage: Math.round(c.damage), lost: Math.round(c.lost), share: total > 0 ? c.damage / total : 0, you: id === viewerId })),
      boards: { damage: top(w, viewerId, (c) => c.damage), home: top(w, viewerId, (c) => c.home ?? 0), supply: top(w, viewerId, (c) => c.supplied ?? 0), scout: top(w, viewerId, (c) => c.scouts ?? 0) },
      alliances: [...byAlliance.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, d], i) => ({ rank: i + 1, tag: w.alliances[id].tag, damage: Math.round(d), share: total > 0 ? d / total : 0 })),
      front: Object.values(w.movements).filter((m) => m.mission === 'invade' && m.ownerId === viewerId).map((m) => ({ id: m.id, phase: m.phase, ships: m.ships, arriveAt: m.arriveAt, from: m.from })),
      participants: Object.keys(inv.contrib).filter((id) => w.players[id]).length,
      /** everyone's fleets waiting at the rift for the next engagement: coordination matters, a lone fleet is simply destroyed */
      combined: (() => {
        const at = Object.values(w.movements).filter((m) => m.mission === 'invade' && m.phase === 'holding');
        return { fleets: at.length, commanders: new Set(at.map((m) => m.ownerId)).size, value: at.reduce((s, m) => s + fleetValue(m.ships), 0) };
      })(),
      total: Math.round(total),
      meter: strengthMeter(w, viewerId, now),
    },
    now,
  };
}

export const invasionBanner = (w: World) => (w.invasion ? { phase: w.invasion.phase, startsAt: w.invasion.startsAt, endsAt: w.invasion.endsAt, rift: w.invasion.rift, number: w.invasion.number, wave: (w.invasion.waveIndex ?? 0) + 1, waves: w.invasion.waves?.length ?? 1 } : null);
export type { AlienKindId, Res };
