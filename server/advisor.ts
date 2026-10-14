import { makeRng, simulateCombat, type Combatant } from '../shared/combat';
import { DEFENSE_IDS, UNITS } from '../shared/data';
import { lvl, totalRes } from '../shared/formulas';
import type { Defenses, DefenseId, Fleet, Res, UnitId } from '../shared/types';
import { playerPoints } from './galaxy';
import { RAID, raidRamp } from './npc';
import { buyUnits, RAID_MIX, tierOf } from './npcunits';
import { requirementsMet } from './economy';
import { type Planet, type Player, type World } from './world';

/**
 * The defense advisor: how the planet would fare against the raids the game can send at it (the small and the large end of the range
 * `RAID` describes), by actually fighting them in the battle simulator, and what to add to hold the large one. An estimate: a real raid is
 * randomised, and an empire's weapons may be better or worse than your own techs, which are used for both sides here.
 */
export type Verdict = 'holds' | 'close' | 'falls';
export interface Forecast {
  size: 'small' | 'large';
  /** resource value of the raiding fleet */
  value: number;
  ships: Fleet;
  verdict: Verdict;
  /** share of the planet's defending value (ships and defenses) lost on average, before defenses are rebuilt */
  lossShare: number;
}
export interface Recommendation { unit: DefenseId; count: number; cost: Res }
export interface DefenseReport { defenseValue: number; forecasts: Forecast[]; recommendation: Recommendation | null }

const RUNS = 5;
const MAX_UNITS = 200_000;
const valueOf = (bag: Record<string, number | undefined>) => Object.entries(bag).reduce((s, [id, n]) => s + (UNITS[id as UnitId].missile ? 0 : totalRes(UNITS[id as UnitId].cost) * (n || 0)), 0);

function raidFleet(w: World, p: Player, planet: Planet, size: 'small' | 'large', now: number): Fleet {
  const pts = playerPoints(w, p).total;
  const k = size === 'small' ? 0 : 1;
  const budget = Math.max(pts * 1000 * RAID.floorEmpire[k], (valueOf(planet.fleet) + valueOf(planet.defenses)) * RAID.vsDefense[k]) * w.config.raidStrength * raidRamp(now - p.createdAt);
  return buyUnits({ metal: budget * 0.6, crystal: budget * 0.3, deuterium: budget * 0.1 }, RAID_MIX[Math.min(3, tierOf(pts * 2))]) as Fleet;
}

/** fight `raid` against the planet with `extra` defenses added, several times; the share of the defenders' value that was lost and who usually wins */
function fight(p: Player, planet: Planet, raid: Fleet, extra: Defenses, w: World): { verdict: Verdict; lossShare: number } {
  const tech = { weapons: lvl(p.techs, 'weapons'), shielding: lvl(p.techs, 'shielding'), armour: lvl(p.techs, 'armour') };
  const defenses: Defenses = { ...planet.defenses };
  for (const [id, n] of Object.entries(extra)) defenses[id as DefenseId] = (defenses[id as DefenseId] || 0) + (n || 0);
  let wins = 0, losses = 0, lost = 0;
  const before = valueOf(planet.fleet) + valueOf(defenses);
  for (let i = 0; i < RUNS; i++) {
    const att: Combatant = { owner: null, name: 'Raiders', ...tech, fleet: { ...raid } };
    const def: Combatant = { owner: p.id, name: p.username, ...tech, fleet: { ...planet.fleet }, defenses };
    const r = simulateCombat([att], [def], makeRng(7 + i * 101));
    if (r.winner === 'defender') wins++; else if (r.winner === 'attacker') losses++;
    lost += totalRes(r.defenders[0].lost);
  }
  void w;
  return { verdict: wins >= RUNS - 1 ? 'holds' : losses >= RUNS - 1 ? 'falls' : 'close', lossShare: before > 0 ? Math.min(1, lost / RUNS / before) : 1 };
}

const count = (f: Record<string, number | undefined>) => Object.values(f).reduce((a: number, n) => a + (n || 0), 0);

export function defenseReport(w: World, p: Player, planet: Planet, now: number): DefenseReport {
  const forecasts: Forecast[] = (['small', 'large'] as const).map((size) => {
    const ships = raidFleet(w, p, planet, size, now);
    const r = count(ships) > MAX_UNITS ? { verdict: 'falls' as Verdict, lossShare: 1 } : fight(p, planet, ships, {}, w);
    return { size, value: Math.round(valueOf(ships)), ships, ...r };
  });
  const large = forecasts[1];
  let recommendation: Recommendation | null = null;
  if (large.verdict !== 'holds' && count(large.ships) <= MAX_UNITS && (planet.buildings.shipyard ?? 0) > 0) {
    const candidates = DEFENSE_IDS.filter((id) => !UNITS[id].missile && !UNITS[id].max && requirementsMet(planet, p, UNITS[id].requires));
    for (const id of candidates) {
      // the fewest of this one that makes the large raid fail: double until it holds, then narrow down
      let lo = 0, hi = 1;
      while (hi <= 100_000 && fight(p, planet, large.ships, { [id]: hi }, w).verdict !== 'holds') { lo = hi; hi *= 2; }
      if (hi > 100_000) continue;
      while (hi - lo > Math.max(1, Math.floor(hi / 20))) {
        const mid = Math.floor((lo + hi) / 2);
        if (fight(p, planet, large.ships, { [id]: mid }, w).verdict === 'holds') hi = mid; else lo = mid;
      }
      const cost = { metal: UNITS[id].cost.metal * hi, crystal: UNITS[id].cost.crystal * hi, deuterium: UNITS[id].cost.deuterium * hi };
      if (!recommendation || totalRes(cost) < totalRes(recommendation.cost)) recommendation = { unit: id, count: hi, cost };
    }
  }
  return { defenseValue: Math.round(valueOf(planet.fleet) + valueOf(planet.defenses)), forecasts, recommendation };
}
