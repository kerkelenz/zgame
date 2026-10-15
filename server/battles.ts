import { ABILITIES, Battle, STANCES, makeRng, type Ability, type CombatResult, type Combatant, type Orders, type Rng, type RoundGroup, type RoundView, type Stance, type TargetMode } from '../shared/combat';
import { UNITS } from '../shared/data';
import { bus } from './bus';
import { finishCommandedAttack } from './fleet';
import { notifyPlayer } from './messages';
import { outpostTag } from './outposts';
import { GameError, planetAt, type Movement, type World } from './world';

/**
 * Battles a commander flies in person: a fleet sent to a pirate or alien outpost with "Command the battle" waits at the target when it
 * arrives, and the commander gives orders round by round (a stance, how to aim, an ability) while the garrison answers with its own. The
 * orders run the same combat engine as an automatic fight, so the report and the loot work exactly as always. A battle left alone is
 * played to the end automatically once its deadline passes, and a server restart settles open battles the same way.
 */
export const BATTLE = {
  /** how long a battle waits for the next order before it plays itself out */
  idleMs: 5 * 60_000,
  /** how long the screen gives for one choice before the default orders go in (the client counts it; the server only needs the deadline) */
  pickSeconds: 15,
};

interface Session {
  id: string;
  ownerId: string;
  battle: Battle;
  enemyRng: Rng;
  /** rounds left before each ability can be used again */
  cooldowns: Record<Ability, number>;
  last: RoundView | null;
  history: { round: number; dealt: number; taken: number; lostMine: number; lostFoe: number; stance: Stance; target: TargetMode; ability: Ability | null; foeStance: Stance }[];
  start: { a: RoundGroup[]; d: RoundGroup[] };
}
const sessions = new Map<string, Session>();

const STANCE_IDS = Object.keys(STANCES) as Stance[];
const ABILITY_IDS = Object.keys(ABILITIES) as Ability[];

/** what the garrison does: a mix of stances, some focus fire, and now and then a repair once it is hurt */
function enemyOrders(s: Session): Orders {
  const r = s.enemyRng();
  const stance: Stance = r < 0.45 ? 'balanced' : r < 0.7 ? 'assault' : r < 0.88 ? 'brace' : 'evasive';
  const t = s.enemyRng();
  const target: TargetMode = t < 0.55 ? 'spread' : t < 0.8 ? 'big' : 'weak';
  const hurt = s.last ? s.last.d.some((g) => g.hullPct < 70) : false;
  return { stance, target, ability: hurt && s.enemyRng() < 0.3 ? 'repair' : null };
}

export const isEngaged = (m: Movement) => !!m.engaged;

/** a fleet with orders to command its battle has arrived: set the fight up and wait for the commander */
export function openBattle(w: World, lead: Movement, attackers: Combatant[], defenders: Combatant[], at: number) {
  const battle = new Battle(attackers, defenders, makeRng(Math.floor(Math.random() * 2 ** 31)));
  const s: Session = {
    id: lead.id, ownerId: lead.ownerId!, battle, enemyRng: makeRng(Math.floor(Math.random() * 2 ** 31)),
    cooldowns: { repair: 0, emp: 0, decoy: 0, overcharge: 0 }, last: null, history: [], start: { a: battle.groups(0), d: battle.groups(1) },
  };
  sessions.set(s.id, s);
  lead.engaged = true;
  lead.arriveAt = at + BATTLE.idleMs;                       // the movement waits; if the commander never comes it plays itself
  const target = planetAt(w, lead.to, !!lead.toMoon);
  const where = target ? `${outpostTag(w, target)?.name ?? target.name} [${lead.to.g}:${lead.to.s}:${lead.to.p}]` : `[${lead.to.g}:${lead.to.s}:${lead.to.p}]`;
  notifyPlayer(w, lead.ownerId!, 'combat', 'Your fleet is engaged', `Your fleet reached ${where} and is waiting for your orders. Open the Battle screen to command it; if you do nothing it fights on its own in ${Math.round(BATTLE.idleMs / 60000)} minutes.`);
  bus.push({ to: lead.ownerId!, type: 'alert', data: `Your fleet is engaged at ${where}: command the battle` });
  bus.push({ to: lead.ownerId!, type: 'refresh' });
}

/** plays an engaged battle to the end with plain orders (the deadline passed, or the server forgot it) and returns the result */
export function autoFinish(id: string): CombatResult | null {
  const s = sessions.get(id);
  if (!s) return null;
  while (!s.battle.done) s.battle.step();
  sessions.delete(id);
  return s.battle.result();
}

function mine(w: World, id: string, playerId: string): { m: Movement; s: Session } {
  const m = w.movements[id];
  const s = sessions.get(id);
  if (!m || m.ownerId !== playerId || !m.engaged) throw new GameError('No such battle', 404);
  if (!s) { finishCommandedAttack(w, m, Date.now()); throw new GameError('That battle was settled automatically: see your messages', 410); }
  return { m, s };
}

const unitName = (id: string) => UNITS[id as keyof typeof UNITS]?.name ?? id;

export function battleView(w: World, id: string, playerId: string, now: number) {
  const { m, s } = mine(w, id, playerId);
  const target = planetAt(w, m.to, !!m.toMoon);
  const tag = target ? outpostTag(w, target) : null;
  const b = s.battle;
  return {
    id, coords: m.to, planet: target?.name ?? '', outpost: tag, owner: target ? w.players[target.ownerId]?.username ?? '' : '',
    round: b.rounds, maxRounds: 6, done: b.done,
    a: b.groups(0), d: b.groups(1), start: s.start, last: s.last, history: s.history,
    cooldowns: s.cooldowns, deadline: m.arriveAt, pickSeconds: BATTLE.pickSeconds, now,
    names: Object.fromEntries([...s.start.a, ...s.start.d].map((g) => [g.id, unitName(g.id)])),
  };
}

/** play one round with the commander's orders; the battle ends after the last round, when one side is gone, or on retreat */
export function playRound(w: World, id: string, playerId: string, orders: Orders, now: number) {
  const { m, s } = mine(w, id, playerId);
  const b = s.battle;
  if (b.done) throw new GameError('The battle is over');
  const stance = orders.stance && STANCES[orders.stance] ? orders.stance : 'balanced';
  const target: TargetMode = orders.target === 'big' || orders.target === 'weak' ? orders.target : 'spread';
  const ability = orders.ability && ABILITY_IDS.includes(orders.ability) ? orders.ability : null;
  if (ability && s.cooldowns[ability] > 0) throw new GameError(`${ability} is not ready for ${s.cooldowns[ability]} more round(s)`);
  const foe = enemyOrders(s);
  const before = { a: b.groups(0), d: b.groups(1) };
  const view = b.step([{ stance, target, ability }, foe]);
  if (!view) throw new GameError('The battle is over');
  for (const k of ABILITY_IDS) s.cooldowns[k] = Math.max(0, s.cooldowns[k] - 1);
  if (ability) s.cooldowns[ability] = ABILITIES[ability].cooldown;
  const count = (g: RoundGroup[]) => g.reduce((n, x) => n + x.n, 0);
  s.last = view;
  s.history.push({
    round: view.round, dealt: Math.round(view.stats.attackers.damage), taken: Math.round(view.stats.defenders.damage),
    lostMine: count(before.a) - count(view.a), lostFoe: count(before.d) - count(view.d), stance, target, ability, foeStance: foe.stance ?? 'balanced',
  });
  m.arriveAt = now + BATTLE.idleMs;
  if (b.done) return settle(w, m, s, now, view);
  return battleView(w, id, playerId, now);
}

export function retreatBattle(w: World, id: string, playerId: string, now: number) {
  const { m, s } = mine(w, id, playerId);
  s.battle.retreat();
  return settle(w, m, s, now);
}

/** the battle is over: hand the result to the normal attack resolution, which writes the report, shares the loot and sends the fleet home */
function settle(w: World, m: Movement, s: Session, now: number, last: RoundView | null = null) {
  const result = s.battle.result();
  sessions.delete(s.id);
  finishCommandedAttack(w, m, now, result);
  const sum = (r: { metal: number; crystal: number; deuterium: number }) => Math.round(r.metal + r.crystal + r.deuterium);
  return {
    finished: true as const, winner: result.winner, retreated: s.battle.retreated, rounds: s.battle.rounds, last,
    lostMine: sum(result.attackers[0].lost), lostFoe: sum(result.defenders[0].lost), history: s.history,
    names: Object.fromEntries([...s.start.a, ...s.start.d].map((g) => [g.id, unitName(g.id)])),
  };
}

/** engaged battles of a player, for the Fleet page and the notice strip */
export function engagedBattles(w: World, playerId: string) {
  return Object.values(w.movements).filter((m) => m.ownerId === playerId && m.engaged).map((m) => {
    const t = planetAt(w, m.to, !!m.toMoon);
    return { id: m.id, coords: m.to, planet: t?.name ?? '', outpost: t ? outpostTag(w, t) : null, deadline: m.arriveAt, started: sessions.has(m.id) && (sessions.get(m.id)!.battle.rounds > 0) };
  });
}

export const activeSessionCount = () => sessions.size;
export const _resetBattles = () => sessions.clear();
