import { makeRng } from '../shared/combat';
import { lvl } from '../shared/formulas';
import { playerPoints } from './galaxy';
import { notifyPlayer } from './messages';
import { GameError, type Player, type PlayerStats, type World } from './world';

const DAY = 86_400_000;

export type ContractKind = 'build' | 'research' | 'ships' | 'spy' | 'win' | 'repel' | 'expedition' | 'recycle' | 'deliver' | 'plunder' | 'trade' | 'market' | 'event';
export interface Contract { id: string; kind: ContractKind; period: 'daily' | 'weekly'; target: number; /** stat value when the contract was issued */ base: number; credits: number; claimed?: number }
export interface ContractBook { dayKey: number; weekKey: number; daily: Contract[]; weekly: Contract[]; streak: number; lastClaimDay: number; allBonusDay: number }

interface KindDef {
  stat: keyof PlayerStats;
  /** [daily, weekly] targets; null = not offered in that period. Money-sized targets are multiplied by `speed` (economy speed / 20, at least 1) */
  targets: [number | null, number | null];
  scaled?: boolean;
  credits: [number, number];
  label: (n: number) => string;
  eligible: (w: World, p: Player) => boolean;
}
const n = (v: number) => v.toLocaleString('en-US');
const anyPlanet = (w: World, p: Player, f: (x: ReturnType<typeof planetsOf>[number]) => boolean) => planetsOf(w, p).some(f);
const planetsOf = (w: World, p: Player) => p.planetIds.map((id) => w.planets[id]).filter(Boolean);

export const KINDS: Record<ContractKind, KindDef> = {
  build: { stat: 'buildingsDone', targets: [3, 15], credits: [10, 60], label: (x) => `Finish ${x} building upgrade${x === 1 ? '' : 's'}`, eligible: () => true },
  research: { stat: 'researchDone', targets: [1, 5], credits: [12, 70], label: (x) => `Complete ${x} research project${x === 1 ? '' : 's'}`, eligible: (w, p) => anyPlanet(w, p, (pl) => lvl(pl.buildings, 'researchLab') >= 1) },
  ships: { stat: 'shipsBuilt', targets: [20, 150], credits: [10, 55], label: (x) => `Build ${n(x)} ships or defenses`, eligible: (w, p) => anyPlanet(w, p, (pl) => lvl(pl.buildings, 'shipyard') >= 1) },
  spy: { stat: 'spyReports', targets: [3, 15], credits: [10, 55], label: (x) => `Bring back ${x} spy report${x === 1 ? '' : 's'}`, eligible: (w, p) => anyPlanet(w, p, (pl) => lvl(pl.buildings, 'shipyard') >= 1) },
  win: { stat: 'battlesWon', targets: [1, 5], credits: [15, 90], label: (x) => `Win ${x} battle${x === 1 ? '' : 's'}`, eligible: (w, p) => anyPlanet(w, p, (pl) => lvl(pl.buildings, 'shipyard') >= 1) },
  repel: { stat: 'raidsRepelled', targets: [null, 2], credits: [0, 80], label: (x) => `Repel ${x} raider fleet${x === 1 ? '' : 's'}`, eligible: (w, p) => playerPoints(w, p).total >= w.config.protectionPoints },
  expedition: { stat: 'expeditions', targets: [1, 5], credits: [15, 90], label: (x) => `Complete ${x} expedition${x === 1 ? '' : 's'}`, eligible: (_w, p) => lvl(p.techs, 'astrophysics') >= 1 },
  recycle: { stat: 'harvested', targets: [40_000, 400_000], scaled: true, credits: [12, 70], label: (x) => `Collect ${n(x)} resources from debris`, eligible: (w, p) => p.stats.harvested > 0 || anyPlanet(w, p, (pl) => (pl.fleet.recycler || 0) > 0) },
  deliver: { stat: 'delivered', targets: [100_000, 1_000_000], scaled: true, credits: [12, 70], label: (x) => `Deliver ${n(x)} resources to alliance members`, eligible: (w, p) => !!p.allianceId && (w.alliances[p.allianceId]?.members.length ?? 0) >= 2 },
  trade: { stat: 'trades', targets: [1, 3], credits: [8, 30], label: (x) => `Make ${x} trade${x === 1 ? '' : 's'} with the travelling merchant`, eligible: () => true },
  market: { stat: 'marketDeals', targets: [1, 3], credits: [8, 30], label: (x) => `Make or take ${x} offer${x === 1 ? '' : 's'} on the Market`, eligible: (w) => w.config.marketHours > 0 },
  event: { stat: 'encountersDone', targets: [1, 4], credits: [10, 40], label: (x) => `Deal with ${x} event${x === 1 ? '' : 's'} at your planets`, eligible: (w) => w.config.encounterMinMinutes > 0 },
  plunder: { stat: 'plundered', targets: [200_000, 2_000_000], scaled: true, credits: [12, 70], label: (x) => `Plunder ${n(x)} resources`, eligible: (w, p) => p.stats.battlesWon > 0 || anyPlanet(w, p, (pl) => Object.values(pl.fleet).some((c) => (c || 0) > 0)) },
};

export const DAILY_COUNT = 3;
export const WEEKLY_COUNT = 2;
export const ALL_BONUS = 25;
export const STREAK_STEP = 2;      // extra credits per streak day on every daily claim
export const STREAK_CAP = 10;

export const dayKeyOf = (now: number) => Math.floor(now / DAY);
/** weeks start on Monday (1970-01-01 was a Thursday) */
export const weekKeyOf = (now: number) => Math.floor((dayKeyOf(now) + 3) / 7);

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function issue(w: World, p: Player, period: 'daily' | 'weekly', key: number): Contract[] {
  const idx = period === 'daily' ? 0 : 1;
  const pool = (Object.keys(KINDS) as ContractKind[]).filter((k) => KINDS[k].targets[idx] !== null && KINDS[k].eligible(w, p));
  const rng = makeRng(seedOf(`${p.id}:${period}:${key}`));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const want = period === 'daily' ? DAILY_COUNT : WEEKLY_COUNT;
  const picks = pool.slice(0, want);
  const sp = Math.max(1, w.config.economySpeed / 20);
  return picks.map((kind, i) => {
    const d = KINDS[kind];
    const target = Math.round((d.targets[idx] as number) * (d.scaled ? sp : 1));
    return { id: `${period[0]}${key}-${i}`, kind, period, target, base: p.stats[d.stat], credits: d.credits[idx] };
  });
}

/** Make sure the player holds today's and this week's contracts (issuing new ones when a period has rolled over). */
export function ensureContracts(w: World, p: Player, now: number): ContractBook {
  const day = dayKeyOf(now), week = weekKeyOf(now);
  const b = (p.contracts ||= { dayKey: -1, weekKey: -1, daily: [], weekly: [], streak: 0, lastClaimDay: -10, allBonusDay: -1 });
  if (b.dayKey !== day) { b.dayKey = day; b.daily = issue(w, p, 'daily', day); }
  if (b.weekKey !== week) { b.weekKey = week; b.weekly = issue(w, p, 'weekly', week); }
  return b;
}

const progressOf = (p: Player, c: Contract) => Math.max(0, Math.min(c.target, Math.floor(p.stats[KINDS[c.kind].stat] - c.base)));

/** The streak as shown: it lapses if yesterday had no claim. */
const liveStreak = (b: ContractBook, day: number) => (b.lastClaimDay >= day - 1 ? b.streak : 0);

export function claimContract(w: World, p: Player, id: string, now: number): { credits: number; bonus: number; streak: number } {
  const b = ensureContracts(w, p, now);
  const c = [...b.daily, ...b.weekly].find((x) => x.id === id);
  if (!c) throw new GameError('That contract is no longer available', 404);
  if (c.claimed) throw new GameError('Already claimed');
  if (progressOf(p, c) < c.target) throw new GameError('Not finished yet');
  const day = dayKeyOf(now);
  let credits = c.credits, bonus = 0;
  if (c.period === 'daily') {
    if (b.lastClaimDay !== day) { b.streak = b.lastClaimDay === day - 1 ? b.streak + 1 : 1; b.lastClaimDay = day; }
    credits += Math.min(b.streak, STREAK_CAP) * STREAK_STEP;
  }
  c.claimed = now;
  if (c.period === 'daily' && b.daily.length > 0 && b.daily.every((x) => x.claimed) && b.allBonusDay !== day) {
    b.allBonusDay = day;
    bonus = ALL_BONUS;
  }
  p.credits += credits + bonus;
  if (bonus) notifyPlayer(w, p.id, 'system', 'All daily contracts done', `Bonus: ${bonus} Command Credits.`);
  return { credits, bonus, streak: liveStreak(b, day) };
}

export function contractsView(w: World, p: Player, now: number) {
  const b = ensureContracts(w, p, now);
  const day = dayKeyOf(now);
  const show = (c: Contract) => {
    const progress = progressOf(p, c);
    const streakBonus = c.period === 'daily' ? Math.min(Math.max(1, liveStreak(b, day) + (b.lastClaimDay === day ? 0 : 1)), STREAK_CAP) * STREAK_STEP : 0;
    return { id: c.id, kind: c.kind, period: c.period, label: KINDS[c.kind].label(c.target), target: c.target, progress, done: progress >= c.target, claimed: !!c.claimed, credits: c.credits, streakBonus };
  };
  const daily = b.daily.map(show), weekly = b.weekly.map(show);
  return {
    daily, weekly,
    streak: liveStreak(b, day),
    streakCap: STREAK_CAP, streakStep: STREAK_STEP,
    allBonus: { credits: ALL_BONUS, got: b.allBonusDay === day },
    nextDailyAt: (day + 1) * DAY,
    nextWeeklyAt: (weekKeyOf(now) * 7 - 3 + 7) * DAY,
    claimable: [...daily, ...weekly].filter((c) => c.done && !c.claimed).length,
  };
}
