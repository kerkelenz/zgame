import { makeRng, simulateCombat } from '../shared/combat';
import { UNITS, isStationary } from '../shared/data';
import type { Fleet, ShipId } from '../shared/types';
import { bus } from './bus';
import { combatant, onlyShips } from './fleet';
import { movementsByOwner } from './galaxy';
import { notifyPlayer } from './messages';
import { fleetValue } from './npc';
import { GameError, type Invasion, type Movement, type World } from './world';

const HOUR = 3_600_000, MIN = 60_000;
/** what the Armada is made of, by share of its value */
const MIX: [ShipId, number][] = [['lightFighter', 0.15], ['heavyFighter', 0.10], ['cruiser', 0.25], ['battleship', 0.20], ['battlecruiser', 0.15], ['destroyer', 0.15]];
const REGEN = 0.05;             // share of its starting fleet the Armada rebuilds before every engagement
const MIN_BUDGET = 1_000_000, MAX_BUDGET = 2_000_000_000;

export const REWARD = { base: 600, perParticipant: 100, cap: 3000, floor: 25, lossDivisor: 3, minShare: 0.005 };

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
 * The Armada is a share (invasionStrength) of the combat fleets the whole server owns when it is announced, so it can be beaten
 * by a good part of the server working together but never by one fleet, at any scale. Fleets built after the announcement are extra.
 * Fleets, not points: most points sit in buildings and research, which cannot fight.
 */
export function bossBudget(w: World): number {
  const flights = movementsByOwner(w);
  let ships = 0;
  for (const p of Object.values(w.players)) if (!p.npc && p.planetIds.length) ships += combatFleetValue(w, p.id, flights);
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

/** Announce an invasion; it arrives after the warning period. */
export function announceInvasion(w: World, now: number, delayMs = w.config.invasionAnnounceHours * HOUR): Invasion {
  if (w.invasion) throw new GameError('An invasion is already under way');
  const number = (w.invasionCount ?? 0) + 1;
  w.invasionCount = number;
  const rng = makeRng((w.rngSeed ^ (number * 2654435761)) >>> 0);
  const rift = { g: 1 + Math.floor(rng() * w.config.galaxies), s: 1 + Math.floor(rng() * w.config.systems), p: w.config.positions + 1 };
  const startFleet = buildBoss(bossBudget(w));
  const level = Math.min(15, 3 + 2 * (number - 1));
  const inv: Invasion = {
    number, phase: 'announced', announcedAt: now, startsAt: now + delayMs, endsAt: now + delayMs + w.config.invasionDurationHours * HOUR,
    rift, level, startFleet, fleet: { ...startFleet }, startValue: fleetValue(startFleet), nextEngageAt: 0, round: 0, contrib: {},
  };
  w.invasion = inv;
  const left = Math.round(delayMs / HOUR * 10) / 10;
  tellAll(w, `Void invasion incoming: wave ${number}`, `A Void Armada (${fleetValue(startFleet).toLocaleString('en-US')} resources of ships) is tearing a rift open at ${rift.g}:${rift.s}:${rift.p}. It arrives in ${left} hours and stays ${w.config.invasionDurationHours}. Send combat fleets to the rift once it opens: every fleet there fights together, and rewards are split by the damage each commander does. Alliances that coordinate win.`, `Void invasion in ${left} hours - rift at ${rift.g}:${rift.s}:${rift.p}`);
  return inv;
}

function bossCombatant(inv: Invasion) {
  const lv = inv.level;
  return { owner: null, name: 'Void Armada', weapons: lv, shielding: lv, armour: lv, fleet: { ...inv.fleet } };
}

const power = (f: Fleet, weapons: number) => Object.entries(f).reduce((s, [id, n]) => s + UNITS[id as ShipId].attack * (n || 0), 0) * (1 + 0.1 * weapons);

/** One engagement: every fleet at the rift fights the Armada as one force. */
export function engage(w: World, now: number) {
  const inv = w.invasion;
  if (!inv || inv.phase !== 'active') return;
  inv.round++;
  // the Armada rebuilds a little between rounds, so a trickle of damage never wins
  for (const id of Object.keys(inv.startFleet) as ShipId[]) {
    const want = inv.startFleet[id] || 0, have = inv.fleet[id] || 0;
    if (have < want) inv.fleet[id] = Math.min(want, have + Math.max(1, Math.ceil(want * REGEN)));
  }
  const front = Object.values(w.movements).filter((m) => m.mission === 'invade' && m.phase === 'holding' && m.ownerId && w.players[m.ownerId]);
  if (!front.length) return;
  const attackers = front.map((m) => combatant(w, w.players[m.ownerId!], m.ownerName, m.ships));
  const rng = makeRng(Math.floor(Math.random() * 2 ** 31));
  const res = simulateCombat(attackers, [bossCombatant(inv)], rng);
  const bossLost = res.defenders[0].lost.metal + res.defenders[0].lost.crystal;
  const totalPower = front.reduce((s, m, i) => s + power(m.ships, attackers[i].weapons), 0) || 1;
  const rows: { name: string; before: Fleet; after: Fleet; lost: number }[] = [];
  front.forEach((m, i) => {
    const owner = w.players[m.ownerId!];
    const c = (inv.contrib[owner.id] ||= { damage: 0, lost: 0, battles: 0 });
    c.damage += bossLost * (power(m.ships, attackers[i].weapons) / totalPower);
    c.lost += res.attackers[i].lost.metal + res.attackers[i].lost.crystal;
    c.battles++;
    rows.push({ name: m.ownerName, before: { ...m.ships }, after: onlyShips(res.attackers[i].after), lost: res.attackers[i].lost.metal + res.attackers[i].lost.crystal });
    m.ships = onlyShips(res.attackers[i].after);
    if (!Object.keys(m.ships).length) delete w.movements[m.id];
  });
  inv.fleet = onlyShips(res.defenders[0].after);
  // one rolling report per commander instead of a message every engagement
  const report = {
    coords: inv.rift, planet: 'Void rift', rounds: res.rounds, winner: res.winner, debris: { metal: 0, crystal: 0 }, loot: { metal: 0, crystal: 0, deuterium: 0 }, bounty: 0, roundLog: res.roundLog,
    attackers: res.attackers.map((a, i) => ({ name: rows[i].name, before: a.before, after: a.after, lost: a.lost })),
    defenders: [{ name: 'Void Armada', before: res.defenders[0].before, after: res.defenders[0].after, lost: res.defenders[0].lost }],
  };
  const left = fleetValue(inv.fleet);
  for (const m of front) {
    const pid = m.ownerId!;
    w.messages = w.messages.filter((x) => !(x.to === pid && x.kind === 'combat' && x.subject.startsWith('Invasion front')));
    const mine = rows[front.indexOf(m)];
    notifyPlayer(w, pid, 'combat', `Invasion front: round ${inv.round}`, `The Armada lost ${Math.round(bossLost).toLocaleString('en-US')} resources of ships; ${Math.round(left / Math.max(1, inv.startValue) * 100)}% of its strength is left. Your fleet lost ${Math.round(mine.lost).toLocaleString('en-US')}.`, report);
  }
  if (!Object.keys(inv.fleet).length) finish(w, now, 'won');
}

/** Close the invasion: pay out, send every fleet home, remember it, plan the next one. */
export function finish(w: World, now: number, result: 'won' | 'lost') {
  const inv = w.invasion;
  if (!inv) throw new GameError('There is no invasion');
  for (const m of Object.values(w.movements)) if (m.mission === 'invade' && m.phase === 'holding') m.holdUntil = now; // processMovements sends them home
  const entries = Object.entries(inv.contrib).filter(([id]) => w.players[id]).sort((a, b) => b[1].damage - a[1].damage);
  const total = entries.reduce((s, [, c]) => s + c.damage, 0);
  const pool = Math.min(REWARD.cap, REWARD.base + REWARD.perParticipant * entries.length) / (result === 'won' ? 1 : REWARD.lossDivisor);
  const paid: { id: string; name: string; damage: number; credits: number }[] = [];
  for (const [id, c] of entries) {
    const share = total > 0 ? c.damage / total : 0;
    const p = w.players[id];
    const credits = share >= REWARD.minShare || result === 'won' ? Math.max(Math.round(REWARD.floor / (result === 'won' ? 1 : REWARD.lossDivisor)), Math.round(pool * share)) : 0;
    if (credits > 0) p.credits += credits;
    if (result === 'won' && share >= REWARD.minShare) p.stats.invasionsWon++;
    p.stats.voidDamage += Math.round(c.damage);
    paid.push({ id, name: p.username, damage: Math.round(c.damage), credits });
    notifyPlayer(w, id, 'news', result === 'won' ? `The Void Armada is destroyed!` : 'The Void Armada withdrew', `You dealt ${Math.round(c.damage).toLocaleString('en-US')} damage (${Math.round(share * 1000) / 10}% of the total) and earned ${credits} Command Credits.`);
  }
  const alliances = new Map<string, number>();
  for (const e of paid) { const p = w.players[e.id]; if (p?.allianceId && w.alliances[p.allianceId]) alliances.set(p.allianceId, (alliances.get(p.allianceId) ?? 0) + e.damage); }
  const hist = (w.invasionHistory ||= []);
  hist.unshift({
    number: inv.number, result, startedAt: inv.startsAt, endedAt: now, startValue: inv.startValue, rounds: inv.round,
    top: paid.slice(0, 5).map((e) => ({ name: e.name, damage: e.damage })),
    topAlliance: [...alliances.entries()].sort((a, b) => b[1] - a[1]).map(([id, dmg]) => ({ tag: w.alliances[id].tag, damage: dmg }))[0] ?? null,
  });
  if (hist.length > 20) hist.length = 20;
  w.invasion = undefined;
  w.nextInvasionAt = w.config.invasionIntervalHours > 0 ? now + w.config.invasionIntervalHours * HOUR : 0;
  const lead = paid[0] ? `Top damage: ${paid[0].name} (${paid[0].damage.toLocaleString('en-US')}).` : 'Nobody fought.';
  tellAll(w, result === 'won' ? `Void wave ${inv.number} destroyed` : `Void wave ${inv.number} withdrew`, result === 'won' ? `The Armada fell after ${inv.round} rounds at the front. ${lead}` : `The Armada left with ${Math.round(fleetValue(inv.fleet) / Math.max(1, inv.startValue) * 100)}% of its strength. ${lead} The next wave comes in about ${w.config.invasionIntervalHours} hours.`, result === 'won' ? `The Void Armada is destroyed!` : 'The Void Armada withdrew');
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
  if (inv.phase === 'announced' && now >= inv.startsAt) {
    inv.phase = 'active';
    inv.nextEngageAt = now + w.config.invasionEngageMinutes * MIN;
    tellAll(w, 'The Void rift is open', `The Armada has arrived at ${inv.rift.g}:${inv.rift.s}:${inv.rift.p}. Send combat fleets now (mission: Join the invasion front).`, 'The Void rift is open!');
  }
  if (inv.phase !== 'active') return;
  for (let guard = 0; guard < 100 && w.invasion && now >= w.invasion.nextEngageAt && w.invasion.nextEngageAt <= w.invasion.endsAt; guard++) {
    const at = w.invasion.nextEngageAt;
    w.invasion.nextEngageAt += w.config.invasionEngageMinutes * MIN;
    engage(w, at);
  }
  if (w.invasion && now >= w.invasion.endsAt) finish(w, now, 'lost');
}

const cmp = (a: [string, { damage: number }], b: [string, { damage: number }]) => b[1].damage - a[1].damage;

export function invasionView(w: World, viewerId: string, now: number) {
  const inv = w.invasion;
  const history = w.invasionHistory ?? [];
  const base = { history, next: w.nextInvasionAt ?? null, engageMinutes: w.config.invasionEngageMinutes, reward: REWARD };
  if (!inv) return { ...base, active: null };
  const players = Object.entries(inv.contrib).filter(([id]) => w.players[id]).sort(cmp);
  const total = players.reduce((s, [, c]) => s + c.damage, 0);
  const byAlliance = new Map<string, number>();
  for (const [id, c] of players) { const a = w.players[id].allianceId; if (a && w.alliances[a]) byAlliance.set(a, (byAlliance.get(a) ?? 0) + c.damage); }
  const mine = inv.contrib[viewerId];
  return {
    ...base,
    active: {
      number: inv.number, phase: inv.phase, announcedAt: inv.announcedAt, startsAt: inv.startsAt, endsAt: inv.endsAt, rift: inv.rift, level: inv.level, round: inv.round,
      nextEngageAt: inv.phase === 'active' ? inv.nextEngageAt : null,
      boss: { fleet: inv.fleet, startFleet: inv.startFleet, value: fleetValue(inv.fleet), startValue: inv.startValue },
      mine: mine ? { damage: Math.round(mine.damage), lost: Math.round(mine.lost), share: total > 0 ? mine.damage / total : 0, battles: mine.battles } : null,
      players: players.slice(0, 10).map(([id, c], i) => ({ rank: i + 1, id, name: w.players[id].username, damage: Math.round(c.damage), lost: Math.round(c.lost), share: total > 0 ? c.damage / total : 0, you: id === viewerId })),
      alliances: [...byAlliance.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, d], i) => ({ rank: i + 1, tag: w.alliances[id].tag, damage: Math.round(d), share: total > 0 ? d / total : 0 })),
      front: Object.values(w.movements).filter((m) => m.mission === 'invade' && m.ownerId === viewerId).map((m) => ({ id: m.id, phase: m.phase, ships: m.ships, arriveAt: m.arriveAt, from: m.from })),
      participants: players.length,
      /** everyone's fleets waiting at the rift for the next engagement: coordination matters, a lone fleet is simply destroyed */
      combined: (() => {
        const at = Object.values(w.movements).filter((m) => m.mission === 'invade' && m.phase === 'holding');
        return { fleets: at.length, commanders: new Set(at.map((m) => m.ownerId)).size, value: at.reduce((s, m) => s + fleetValue(m.ships), 0) };
      })(),
      total: Math.round(total),
    },
    now,
  };
}

export const invasionBanner = (w: World) => (w.invasion ? { phase: w.invasion.phase, startsAt: w.invasion.startsAt, endsAt: w.invasion.endsAt, rift: w.invasion.rift, number: w.invasion.number } : null);
