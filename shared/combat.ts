import { UNITS } from './data';
import type { Defenses, Fleet, Res, UnitId } from './types';

export type Rng = () => number;

/** small, seedable PRNG (mulberry32) */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Combatant {
  /** player id, or null for NPC */
  owner: string | null;
  name: string;
  weapons: number;
  shielding: number;
  armour: number;
  /** faction perks etc. (default 1) */
  weaponMul?: number;
  shieldMul?: number;
  fleet: Fleet;
  defenses?: Defenses;
}

export interface CombatantResult {
  owner: string | null;
  name: string;
  before: Partial<Record<UnitId, number>>;
  after: Partial<Record<UnitId, number>>;
  /** metal+crystal+deut value of ships/defenses destroyed (before defense rebuild) */
  lost: Res;
  /** defense units restored after battle */
  rebuilt: Defenses;
}

/** one side's output in one round: it is the side that fires, so `absorbed` is what the other side's shields took */
export interface SideRound { shots: number; damage: number; absorbed: number; hullDamage: number; destroyed: number }

export interface CombatResult {
  rounds: number;
  winner: 'attacker' | 'defender' | 'draw';
  attackers: CombatantResult[];
  defenders: CombatantResult[];
  debris: { metal: number; crystal: number };
  /** what each side did in every round (index 0 is round 1): shots fired, damage dealt, how much of it the enemy shields absorbed, how much reached hulls, units destroyed */
  roundStats: { attackers: SideRound; defenders: SideRound }[];
  /** unit counts alive on each side at the start and after every round, for round-by-round replays */
  roundLog: { a: Partial<Record<UnitId, number>>; d: Partial<Record<UnitId, number>> }[];
}

interface Unit {
  side: 0 | 1;
  who: number;
  id: UnitId;
  att: number;
  shieldMax: number;
  shield: number;
  hullMax: number;
  hull: number;
  dead: boolean;
}

const DEBRIS_RATIO = 0.3;
const DEFENSE_REBUILD = 0.7;
export const MAX_ROUNDS = 6;

/** what a commander can choose for one round of a battle they fly themselves */
export type Stance = 'balanced' | 'assault' | 'evasive' | 'brace';
export type TargetMode = 'spread' | 'big' | 'weak';
export type Ability = 'repair' | 'emp' | 'decoy' | 'overcharge';
export interface Orders { stance?: Stance; target?: TargetMode; ability?: Ability | null }

/** the stances: what they do to the damage you deal, the damage you take and your shields for the round */
export const STANCES: Record<Stance, { dealt: number; taken: number; shield: number }> = {
  balanced: { dealt: 1, taken: 1, shield: 1 },
  assault: { dealt: 1.3, taken: 1.2, shield: 1 },
  evasive: { dealt: 0.85, taken: 0.65, shield: 1 },
  brace: { dealt: 0.9, taken: 1, shield: 1.8 },
};
/** turns an ability stays unavailable after use */
export const ABILITIES: Record<Ability, { cooldown: number }> = { repair: { cooldown: 2 }, emp: { cooldown: 3 }, decoy: { cooldown: 2 }, overcharge: { cooldown: 3 } };

export interface RoundGroup { id: UnitId; n: number; hullPct: number }
/** one round as the screen draws it: who is left, the volleys (shooter type to target type, with a count) and what was destroyed */
export interface RoundView {
  round: number;
  a: RoundGroup[]; d: RoundGroup[];
  volleys: { side: 0 | 1; from: UnitId; to: UnitId; n: number }[];
  destroyed: { side: 0 | 1; id: UnitId; n: number }[];
  stats: { attackers: SideRound; defenders: SideRound };
}

const blankRound = (): SideRound => ({ shots: 0, damage: 0, absorbed: 0, hullDamage: 0, destroyed: 0 });
const NEUTRAL: Required<Orders> = { stance: 'balanced', target: 'spread', ability: null };

/**
 * A battle that can be played one round at a time. With no orders it is the plain automatic fight (simulateCombat); a commander can give each
 * side a stance, a targeting rule and an ability per round, or pull out.
 */
export class Battle {
  private units: Unit[] = [];
  private before: Partial<Record<UnitId, number>>[][] = [[], []];
  private sides: Combatant[][];
  private roundLog: CombatResult['roundLog'];
  private roundStats: CombatResult['roundStats'] = [];
  rounds = 0;
  done = false;
  retreated = false;

  constructor(attackers: Combatant[], defenders: Combatant[], private rng: Rng, private opts: { debrisRatio?: number } = {}) {
    this.sides = [attackers, defenders];
    this.sides.forEach((list, side) => {
      list.forEach((c, who) => {
        const bag: Partial<Record<UnitId, number>> = {};
        const add = (id: UnitId, n: number) => {
          if (!n || n <= 0 || UNITS[id].missile) return;
          bag[id] = (bag[id] || 0) + n;
          const u = UNITS[id];
          const sh = u.shield * (1 + 0.1 * c.shielding) * (c.shieldMul ?? 1);
          const hull = u.hull * (1 + 0.1 * c.armour);
          for (let i = 0; i < n; i++) {
            this.units.push({ side: side as 0 | 1, who, id, att: u.attack * (1 + 0.1 * c.weapons) * (c.weaponMul ?? 1), shieldMax: sh, shield: sh, hullMax: hull, hull, dead: false });
          }
        };
        for (const [id, n] of Object.entries(c.fleet)) add(id as UnitId, n || 0);
        for (const [id, n] of Object.entries(c.defenses || {})) add(id as UnitId, n || 0);
        this.before[side][who] = bag;
      });
    });
    this.roundLog = [this.census()];
    if (!this.alive(0).length || !this.alive(1).length) this.done = true;
  }

  private alive(side: number) { return this.units.filter((u) => u.side === side && !u.dead); }
  private census() {
    const a: Partial<Record<UnitId, number>> = {}, d: Partial<Record<UnitId, number>> = {};
    for (const u of this.units) { const bag = u.side === 0 ? a : d; bag[u.id] = (bag[u.id] || 0) + 1; }
    return { a, d };
  }
  /** what is left of one side, dearest ships first, with the average hull they have left */
  groups(side: 0 | 1): RoundGroup[] {
    const m = new Map<UnitId, { n: number; hull: number; max: number }>();
    for (const u of this.units) if (u.side === side) { const g = m.get(u.id) ?? { n: 0, hull: 0, max: 0 }; g.n++; g.hull += Math.max(0, u.hull); g.max += u.hullMax; m.set(u.id, g); }
    const worth = (id: UnitId) => UNITS[id].cost.metal + UNITS[id].cost.crystal;
    return [...m.entries()].map(([id, g]) => ({ id, n: g.n, hullPct: Math.round((g.hull / g.max) * 100) })).sort((x, y) => worth(y.id) - worth(x.id));
  }

  /** play one round. Orders of `undefined` mean the plain automatic round. */
  step(orders: [Orders | undefined, Orders | undefined] = [undefined, undefined]): RoundView | null {
    if (this.done) return null;
    const { rng } = this;
    const a = this.alive(0), d = this.alive(1);
    if (!a.length || !d.length || this.rounds >= MAX_ROUNDS) { this.done = true; return null; }
    this.rounds++;
    const o = [{ ...NEUTRAL, ...orders[0] }, { ...NEUTRAL, ...orders[1] }] as [Required<Orders>, Required<Orders>];
    const st = [STANCES[o[0].stance], STANCES[o[1].stance]];
    // repair acts before the shooting: it mends every damaged hull of that side by 40%
    for (let s = 0; s < 2; s++) if (o[s].ability === 'repair') for (const u of this.units) if (u.side === s && u.hull < u.hullMax) u.hull = Math.min(u.hullMax, u.hull + u.hullMax * 0.4);
    for (const u of this.units) u.shield = u.shieldMax * st[u.side].shield;
    const stat = [blankRound(), blankRound()];
    const targets: Unit[][] = [d, a];
    const value = (u: Unit) => UNITS[u.id].cost.metal + UNITS[u.id].cost.crystal;
    // focus orders aim at the front of a sorted list: the dearest ships, or the most fragile ones
    const sorted: (Unit[] | null)[] = [null, null];
    for (let s = 0; s < 2; s++) {
      const mode = o[s].target;
      if (mode === 'big') sorted[s] = [...targets[s]].sort((x, y) => value(y) - value(x));
      else if (mode === 'weak') sorted[s] = [...targets[s]].sort((x, y) => x.hull + x.shield - (y.hull + y.shield));
    }
    const volleys = new Map<string, number>();
    const destroyed = new Map<string, number>();
    for (const shooter of this.units) {
      const pool = targets[shooter.side];
      if (!pool.length) continue;
      const me = shooter.side, foe = 1 - me;
      const list = sorted[me];
      const front = list ? Math.max(1, Math.ceil(list.length * 0.25)) : 0;
      const pick = () => (list ? list[Math.floor(rng() * front)] : pool[Math.floor(rng() * pool.length)]);
      const emped = o[foe].ability === 'emp';                                        // an EMP from the other side: weaker shots, no rapid fire
      let again = true;
      let guard = 0;
      while (again && guard++ < 200) {
        again = false;
        // pick a target not already destroyed this round (a few retries)
        let t = pick();
        for (let k = 0; k < 4 && t.dead; k++) t = pick();
        if (t.dead && list) { t = pool[Math.floor(rng() * pool.length)]; for (let k = 0; k < 4 && t.dead; k++) t = pool[Math.floor(rng() * pool.length)]; }
        if (t.dead) break;
        const dmg = shooter.att * st[me].dealt * st[foe].taken * (emped ? 0.6 : 1);
        const s = stat[me];
        s.shots++; s.damage += dmg;
        const vk = `${me}:${shooter.id}:${t.id}`;
        volleys.set(vk, (volleys.get(vk) || 0) + 1);
        if (o[foe].ability === 'decoy' && rng() < 0.3) { s.absorbed += dmg; continue; }          // fired at a decoy
        if (dmg >= t.shieldMax * 0.01) {
          if (t.shield >= dmg) { t.shield -= dmg; s.absorbed += dmg; }
          else {
            const rem = dmg - t.shield;
            s.absorbed += t.shield;
            t.shield = 0;
            t.hull -= rem;
            s.hullDamage += rem;
          }
        } else s.absorbed += dmg;                                                // too weak to scratch the shield: bounces off
        if (t.hull <= 0) t.dead = true;
        else if (t.hull < t.hullMax * 0.7 && rng() < 1 - t.hull / t.hullMax) t.dead = true;
        if (t.dead) { s.destroyed++; const dk = `${t.side}:${t.id}`; destroyed.set(dk, (destroyed.get(dk) || 0) + 1); }
        let rf = UNITS[shooter.id].rapidFire[t.id];
        if (rf && o[me].ability === 'overcharge') rf = rf * 1.5;
        if (emped) rf = 0;
        if (rf && rf > 1 && rng() < 1 - 1 / rf) again = true;
      }
    }
    this.units = this.units.filter((u) => !u.dead);
    for (const u of this.units) u.shield = u.shieldMax;
    this.roundLog.push(this.census());
    this.roundStats.push({ attackers: stat[0], defenders: stat[1] });
    if (!this.alive(0).length || !this.alive(1).length || this.rounds >= MAX_ROUNDS) this.done = true;
    return {
      round: this.rounds, a: this.groups(0), d: this.groups(1),
      volleys: [...volleys.entries()].map(([k, n]) => { const [side, from, to] = k.split(':'); return { side: Number(side) as 0 | 1, from: from as UnitId, to: to as UnitId, n }; }).sort((x, y) => y.n - x.n).slice(0, 14),
      destroyed: [...destroyed.entries()].map(([k, n]) => { const [side, id] = k.split(':'); return { side: Number(side) as 0 | 1, id: id as UnitId, n }; }),
      stats: { attackers: stat[0], defenders: stat[1] },
    };
  }

  /** the attacking commander pulls out: the fight ends where it stands and the defense holds */
  retreat() { this.done = true; this.retreated = true; }

  result(): CombatResult {
    const { units, sides, before, rng } = this;
    const debrisRatio = this.opts.debrisRatio ?? DEBRIS_RATIO;
    const remA = units.filter((u) => u.side === 0).length;
    const remD = units.filter((u) => u.side === 1).length;
    const winner: CombatResult['winner'] = this.retreated ? 'defender' : remA && !remD ? 'attacker' : remD && !remA ? 'defender' : 'draw';

    let debrisM = 0, debrisC = 0;
    const build = (side: 0 | 1): CombatantResult[] =>
      sides[side].map((c, who) => {
        const after: Partial<Record<UnitId, number>> = {};
        for (const u of units) if (u.side === side && u.who === who) after[u.id] = (after[u.id] || 0) + 1;
        const lost: Res = { metal: 0, crystal: 0, deuterium: 0 };
        const rebuilt: Defenses = {};
        for (const [id, n] of Object.entries(before[side][who])) {
          const uid = id as UnitId;
          const destroyed = (n || 0) - (after[uid] || 0);
          if (destroyed <= 0) continue;
          const def = UNITS[uid];
          lost.metal += def.cost.metal * destroyed;
          lost.crystal += def.cost.crystal * destroyed;
          lost.deuterium += def.cost.deuterium * destroyed;
          if (def.kind === 'defense') {
            let back = 0;
            for (let i = 0; i < destroyed; i++) if (rng() < DEFENSE_REBUILD) back++;
            if (back) {
              rebuilt[uid as keyof Defenses] = back;
              after[uid] = (after[uid] || 0) + back;
            }
          } else {
            debrisM += def.cost.metal * destroyed * debrisRatio;
            debrisC += def.cost.crystal * destroyed * debrisRatio;
          }
        }
        return { owner: c.owner, name: c.name, before: before[side][who], after, lost, rebuilt };
      });

    const attackers = build(0), defenders = build(1);
    return { rounds: this.rounds, winner, attackers, defenders, debris: { metal: Math.floor(debrisM), crystal: Math.floor(debrisC) }, roundStats: this.roundStats, roundLog: this.roundLog };
  }
}

export function simulateCombat(attackers: Combatant[], defenders: Combatant[], rng: Rng, opts: { debrisRatio?: number } = {}): CombatResult {
  const b = new Battle(attackers, defenders, rng, opts);
  while (!b.done) b.step();
  return b.result();
}

/** OGame-style loot: up to half the planet's stock, bounded by free cargo. */
export function computeLoot(stock: Res, capacity: number, share = 0.5): Res {
  const half = { metal: stock.metal * share, crystal: stock.crystal * share, deuterium: stock.deuterium * share };
  let cap = capacity;
  const metal = Math.min(half.metal, cap / 3);
  cap -= metal;
  const crystal = Math.min(half.crystal, cap / 2);
  cap -= crystal;
  const deuterium = Math.min(half.deuterium, cap);
  cap -= deuterium;
  // second pass: leftover capacity goes to metal, then crystal
  const extraM = Math.min(half.metal - metal, cap / 2);
  cap -= extraM;
  const extraC = Math.min(half.crystal - crystal, cap);
  return {
    metal: Math.floor(metal + extraM),
    crystal: Math.floor(crystal + extraC),
    deuterium: Math.floor(deuterium),
  };
}

export function fleetCount(f: Record<string, number | undefined>): number {
  let t = 0;
  for (const n of Object.values(f)) t += n || 0;
  return t;
}
