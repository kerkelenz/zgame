/**
 * The maths behind the animated battle replay: how many pictures stand for a fleet, who dies in which round, and where in the show a given
 * moment is. Pure, so it can be tested; the drawing is in BattleReplay.tsx.
 */
export type Census = Record<string, number | undefined>;
export interface SideRound { shots: number; damage: number; absorbed: number; hullDamage: number; destroyed: number }
export interface ReplayData {
  roundLog: { a: Census; d: Census }[];
  roundStats?: { attackers: SideRound; defenders: SideRound }[];
}

export type Side = 'a' | 'd';

/** one picture per `per` units of a type, at most `cap` pictures for the whole side, and at least one per type that exists */
export interface IconPlan { per: number; icons: Record<string, number> }

export function iconPlan(counts: Census, cap = 36): IconPlan {
  const types = Object.entries(counts).filter(([, n]) => (n ?? 0) > 0) as [string, number][];
  let per = 1;
  const total = (p: number) => types.reduce((s, [, n]) => s + Math.ceil(n / p), 0);
  while (total(per) > cap && per < 1e9) per = per < 10 ? per + 1 : Math.ceil(per * 1.25);
  return { per, icons: Object.fromEntries(types.map(([id, n]) => [id, Math.ceil(n / per)])) };
}

/** how many pictures of each type are still standing when `counts` are alive, under a plan made from the start */
export function iconsAlive(plan: IconPlan, counts: Census): Record<string, number> {
  return Object.fromEntries(Object.keys(plan.icons).map((id) => [id, Math.min(plan.icons[id], Math.ceil((counts[id] ?? 0) / plan.per))]));
}

export interface RoundFrame {
  round: number;
  /** alive before and after this round */
  before: { a: Census; d: Census };
  after: { a: Census; d: Census };
  /** units lost this round, by type */
  lost: { a: Census; d: Census };
  stats: { a: SideRound; d: SideRound } | null;
}
const EMPTY: SideRound = { shots: 0, damage: 0, absorbed: 0, hullDamage: 0, destroyed: 0 };

export function framesOf(d: ReplayData): RoundFrame[] {
  const out: RoundFrame[] = [];
  for (let i = 1; i < d.roundLog.length; i++) {
    const before = d.roundLog[i - 1], after = d.roundLog[i];
    const lost = (b: Census, a: Census): Census => Object.fromEntries(Object.keys(b).map((id) => [id, Math.max(0, (b[id] ?? 0) - (a[id] ?? 0))]).filter(([, n]) => (n as number) > 0));
    const s = d.roundStats?.[i - 1];
    out.push({ round: i, before: { a: before.a, d: before.d }, after: { a: after.a, d: after.d }, lost: { a: lost(before.a, after.a), d: lost(before.d, after.d) }, stats: s ? { a: s.attackers ?? EMPTY, d: s.defenders ?? EMPTY } : null });
  }
  return out;
}

/** how long each part of the show lasts at normal speed (milliseconds) */
export const TIMING = { intro: 900, fire: 1000, hit: 650, rest: 450, outro: 1400 };
export const roundMs = () => TIMING.fire + TIMING.hit + TIMING.rest;
export const totalMs = (rounds: number) => TIMING.intro + rounds * roundMs() + TIMING.outro;

export type Phase = 'intro' | 'fire' | 'hit' | 'rest' | 'outro';
export interface Moment { phase: Phase; /** 0-based index of the round being shown (the last one during the outro) */ round: number; /** 0 to 1 through the phase */ p: number; done: boolean }

export function momentAt(t: number, rounds: number): Moment {
  if (t < 0) return { phase: 'intro', round: 0, p: 0, done: false };
  if (t < TIMING.intro) return { phase: 'intro', round: 0, p: t / TIMING.intro, done: false };
  const into = t - TIMING.intro;
  const r = Math.floor(into / roundMs());
  if (rounds === 0 || r >= rounds) {
    const o = rounds === 0 ? into : into - rounds * roundMs();
    return { phase: 'outro', round: Math.max(0, rounds - 1), p: Math.min(1, o / TIMING.outro), done: o >= TIMING.outro };
  }
  const w = into - r * roundMs();
  if (w < TIMING.fire) return { phase: 'fire', round: r, p: w / TIMING.fire, done: false };
  if (w < TIMING.fire + TIMING.hit) return { phase: 'hit', round: r, p: (w - TIMING.fire) / TIMING.hit, done: false };
  return { phase: 'rest', round: r, p: (w - TIMING.fire - TIMING.hit) / TIMING.rest, done: false };
}

/** the time at which round `r` (0-based) starts, for the step buttons and the slider */
export const roundStart = (r: number) => TIMING.intro + r * roundMs();

/** how many beams to draw for a side in a round: more shots, more beams, but never a wall of them */
export function beamCount(shots: number, max = 28): number {
  if (shots <= 0) return 0;
  return Math.max(2, Math.min(max, Math.round(Math.log2(shots + 1) * 3)));
}

/** a small repeatable random sequence, so the same replay always looks the same */
export function seeded(seed: number): () => number {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** a replay needs the unit census of every round */
export const canReplay = (d: unknown): d is ReplayData => !!d && Array.isArray((d as ReplayData).roundLog) && (d as ReplayData).roundLog.length >= 2;

/** one sentence for a round, for the text under the picture (and for screen readers) */
export function roundText(f: RoundFrame, fmt: (n: number) => string): string {
  const side = (label: string, s: SideRound | undefined, lost: Census) => {
    const n = Object.values(lost).reduce((a: number, b) => a + (b ?? 0), 0);
    return `${label} fired ${fmt(s?.shots ?? 0)} shots (${fmt(s?.damage ?? 0)} damage, ${fmt(s?.absorbed ?? 0)} absorbed by shields)` + (n ? ` and the other side lost ${fmt(n)} units` : '');
  };
  return `Round ${f.round}: ${side('attackers', f.stats?.a, f.lost.d)}; ${side('defenders', f.stats?.d, f.lost.a)}.`;
}
