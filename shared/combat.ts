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

export interface CombatResult {
  rounds: number;
  winner: 'attacker' | 'defender' | 'draw';
  attackers: CombatantResult[];
  defenders: CombatantResult[];
  debris: { metal: number; crystal: number };
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

export function simulateCombat(attackers: Combatant[], defenders: Combatant[], rng: Rng, opts: { debrisRatio?: number } = {}): CombatResult {
  const debrisRatio = opts.debrisRatio ?? DEBRIS_RATIO;
  const sides: Combatant[][] = [attackers, defenders];
  let units: Unit[] = [];
  const before: Partial<Record<UnitId, number>>[][] = [[], []];

  sides.forEach((list, side) => {
    list.forEach((c, who) => {
      const bag: Partial<Record<UnitId, number>> = {};
      const add = (id: UnitId, n: number) => {
        if (!n || n <= 0 || UNITS[id].missile) return;
        bag[id] = (bag[id] || 0) + n;
        const u = UNITS[id];
        const sh = u.shield * (1 + 0.1 * c.shielding) * (c.shieldMul ?? 1);
        const hull = u.hull * (1 + 0.1 * c.armour);
        for (let i = 0; i < n; i++) {
          units.push({ side: side as 0 | 1, who, id, att: u.attack * (1 + 0.1 * c.weapons) * (c.weaponMul ?? 1), shieldMax: sh, shield: sh, hullMax: hull, hull, dead: false });
        }
      };
      for (const [id, n] of Object.entries(c.fleet)) add(id as UnitId, n || 0);
      for (const [id, n] of Object.entries(c.defenses || {})) add(id as UnitId, n || 0);
      before[side][who] = bag;
    });
  });

  const alive = (side: number) => units.filter((u) => u.side === side && !u.dead);
  let rounds = 0;
  for (let round = 0; round < 6; round++) {
    const a = alive(0), d = alive(1);
    if (!a.length || !d.length) break;
    rounds++;
    const targets: Unit[][] = [d, a];
    for (const shooter of units) {
      const pool = targets[shooter.side];
      if (!pool.length) continue;
      let again = true;
      let guard = 0;
      while (again && guard++ < 200) {
        again = false;
        // pick a target not already destroyed this round (a few retries)
        let t = pool[Math.floor(rng() * pool.length)];
        for (let k = 0; k < 4 && t.dead; k++) t = pool[Math.floor(rng() * pool.length)];
        if (t.dead) break;
        const dmg = shooter.att;
        if (dmg >= t.shieldMax * 0.01) {
          if (t.shield >= dmg) t.shield -= dmg;
          else {
            const rem = dmg - t.shield;
            t.shield = 0;
            t.hull -= rem;
          }
        }
        if (t.hull <= 0) t.dead = true;
        else if (t.hull < t.hullMax * 0.7 && rng() < 1 - t.hull / t.hullMax) t.dead = true;
        const rf = UNITS[shooter.id].rapidFire[t.id];
        if (rf && rf > 1 && rng() < 1 - 1 / rf) again = true;
      }
    }
    units = units.filter((u) => !u.dead);
    for (const u of units) u.shield = u.shieldMax;
  }

  const remA = units.filter((u) => u.side === 0).length;
  const remD = units.filter((u) => u.side === 1).length;
  const winner: CombatResult['winner'] = remA && !remD ? 'attacker' : remD && !remA ? 'defender' : 'draw';

  let debrisM = 0, debrisC = 0;
  const build = (side: 0 | 1): CombatantResult[] =>
    sides[side].map((c, who) => {
      const after: Partial<Record<UnitId, number>> = {};
      for (const u of units) if (u.side === side && u.who === who) after[u.id] = (after[u.id] || 0) + 1;
      const lost: Res = { metal: 0, crystal: 0, deuterium: 0 };
      const rebuilt: Defenses = {};
      for (const [id, n] of Object.entries(before[side][who])) {
        const uid = id as UnitId;
        let destroyed = (n || 0) - (after[uid] || 0);
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

  return {
    rounds,
    winner,
    attackers: build(0),
    defenders: build(1),
    debris: { metal: Math.floor(debrisM), crystal: Math.floor(debrisC) },
  };
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
