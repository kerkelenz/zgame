/** A dry run of the Void invasion with simulated commanders, shared by the balance script and its test. */
import { ALIEN_KINDS, buildWave, planWaves } from '../shared/aliens';
import { makeRng, simulateCombat } from '../shared/combat';
import { DEFAULT_CONFIG } from '../shared/config';
import { UNITS } from '../shared/data';
import type { Fleet, ShipId } from '../shared/types';

const cfg = DEFAULT_CONFIG;
const value = (id: ShipId) => UNITS[id].cost.metal + UNITS[id].cost.crystal;
const fleetValue = (f: Fleet) => Object.entries(f).reduce((s, [id, n]) => s + (n || 0) * value(id as ShipId), 0);

export const MIXES: Record<string, [ShipId, number][]> = {
  balanced: [['lightFighter', 0.1], ['heavyFighter', 0.1], ['cruiser', 0.3], ['battleship', 0.25], ['battlecruiser', 0.15], ['destroyer', 0.1]],
  cruisers: [['cruiser', 0.7], ['heavyFighter', 0.1], ['battleship', 0.2]],
  heavy: [['battleship', 0.4], ['battlecruiser', 0.3], ['destroyer', 0.3]],
  light: [['lightFighter', 0.6], ['heavyFighter', 0.4]],
};
const make = (mix: [ShipId, number][], budget: number): Fleet => {
  const f: Fleet = {};
  for (const [id, share] of mix) { const n = Math.floor((budget * share) / value(id)); if (n > 0) f[id] = n; }
  return f;
};

/** `players` own the server's fleets (that sets the aliens' size); `joining` of them send `sent` of their fleet to the rift */
export interface Setup { players: number; joining: number; fleet: number; sent: number; tech: number; mix: string }

export function runInvasion(s: Setup, seed: number, number = 1) {
  const rng = makeRng(seed);
  const level = Math.min(15, 3 + 2 * (number - 1));
  // the budget is a share of every commander's whole combat fleet, as the server computes it
  const budget = Math.min(2_000_000_000, Math.max(1_000_000, s.players * s.fleet * cfg.invasionStrength));
  const plan = planWaves(cfg.invasionWaves, number);
  const waves = plan.map((p) => buildWave(p.kind, budget * p.share));
  const mine: Fleet[] = Array.from({ length: s.joining }, () => make(MIXES[s.mix], s.fleet * s.sent));
  const startValue = mine.reduce((t, f) => t + fleetValue(f), 0);
  const spacing = (cfg.invasionDurationHours * 3_600_000 * 0.8) / plan.length, engage = cfg.invasionEngageMinutes * 60_000, breather = cfg.invasionBreatherMinutes * 60_000;
  const end = cfg.invasionDurationHours * 3_600_000;
  let t = 0, idx = 0, cleared = 0, rounds = 0, field: Fleet = { ...waves[0] }, start: Fleet = { ...waves[0] };
  let nextWave = plan.length > 1 ? spacing : Infinity;
  while (t <= end && idx < plan.length) {
    if (nextWave <= t && idx < plan.length - 1) {
      idx++; start = mergeInto(start, waves[idx]); field = mergeInto(field, waves[idx]);
      nextWave = idx + 1 < plan.length ? (idx + 1) * spacing : Infinity;
    }
    const kind = ALIEN_KINDS[plan[idx].kind];
    for (const id of Object.keys(start) as ShipId[]) {
      const want = start[id] || 0, have = field[id] || 0;
      if (have < want) field[id] = Math.min(want, have + Math.max(1, Math.ceil(want * kind.regen)));
    }
    const alive = mine.filter((f) => Object.values(f).some((n) => (n || 0) > 0));
    if (!alive.length) break;
    const attackers = alive.map((f, i) => ({ owner: `p${i}`, name: `p${i}`, weapons: s.tech, shielding: s.tech, armour: s.tech, fleet: { ...f } }));
    const defender = { owner: null, name: 'Void', weapons: Math.max(0, level + kind.tech.weapons), shielding: Math.max(0, level + kind.tech.shielding), armour: Math.max(0, level + kind.tech.armour), fleet: { ...field } };
    const res = simulateCombat(attackers, [defender], rng);
    rounds++;
    alive.forEach((f, i) => { for (const id of Object.keys(f) as ShipId[]) f[id] = res.attackers[i].after[id] || 0; });
    field = Object.fromEntries(Object.entries(res.defenders[0].after).filter(([id, n]) => (n || 0) > 0 && !UNITS[id as ShipId].missile)) as Fleet;
    if (!Object.keys(field).length) {
      cleared = idx + 1;
      if (idx >= plan.length - 1) break;
      start = {}; nextWave = Math.min(nextWave, t + breather);
      // the next wave arrives at once when its time comes; jump there
      t = Math.max(t, nextWave); continue;
    }
    t += engage;
  }
  const left = mine.reduce((t2, f) => t2 + fleetValue(f), 0);
  return { cleared, rounds, lostShare: startValue ? 1 - left / startValue : 0, won: cleared >= plan.length, budget };
}
function mergeInto(a: Fleet, b: Fleet): Fleet { const r: Fleet = { ...a }; for (const [id, n] of Object.entries(b)) r[id as ShipId] = (r[id as ShipId] || 0) + (n || 0); return r; }

