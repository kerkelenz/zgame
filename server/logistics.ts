import type { Fleet, Res } from '../shared/types';
import { cargoFor } from './perks';
import { updatePlanet } from './economy';
import { flightPlan, sendFleet } from './fleet';
import { GameError, type Player, type World } from './world';

const HAULERS = ['largeCargo', 'smallCargo'] as const;
const KEYS = ['metal', 'crystal', 'deuterium'] as const;

export interface GatherResult {
  sent: { fromPlanetId: string; from: string; cargo: Res; ships: Fleet }[];
  skipped: { fromPlanetId: string; from: string; reason: string }[];
}

/**
 * One click to pull stock from the rest of the empire into one planet: every other planet loads its cargo ships with `percent`
 * of the chosen resources (keeping the deuterium it needs for fuel) and sends them to the target as an ordinary transport mission.
 */
export function gatherResources(w: World, player: Player, toPlanetId: string, percent: number, which: string[], now: number): GatherResult {
  const target = w.planets[toPlanetId];
  if (!target || target.ownerId !== player.id) throw new GameError('Not your planet', 403);
  const pct = Math.min(1, Math.max(0.05, (Number(percent) || 0) / 100));
  const picks = KEYS.filter((k) => which.includes(k));
  if (!picks.length) throw new GameError('Pick at least one resource');
  const out: GatherResult = { sent: [], skipped: [] };

  for (const id of player.planetIds) {
    const src = w.planets[id];
    if (!src || src.id === target.id) continue;
    const skip = (reason: string) => out.skipped.push({ fromPlanetId: src.id, from: src.name, reason });
    updatePlanet(w, src, now);
    const ships: Fleet = {};
    for (const h of HAULERS) if (src.fleet[h]) ships[h] = src.fleet[h];
    if (!Object.keys(ships).length) { skip('no cargo ships'); continue; }
    const want: Res = { metal: 0, crystal: 0, deuterium: 0 };
    for (const k of picks) want[k] = Math.floor(src.resources[k] * pct);
    const fuel = flightPlan(w, player, ships, src.coords, target.coords, 100).fuel;
    if (src.resources.deuterium < fuel) { skip('not enough deuterium for the trip'); continue; }
    want.deuterium = Math.max(0, Math.min(want.deuterium, src.resources.deuterium - fuel));
    // fill the holds, biggest stock first
    let room = cargoFor(player, ships);
    const cargo: Res = { metal: 0, crystal: 0, deuterium: 0 };
    for (const k of [...picks].sort((x, y) => want[y] - want[x])) { const take = Math.min(want[k], room); cargo[k] = take; room -= take; }
    if (cargo.metal + cargo.crystal + cargo.deuterium <= 0) { skip('nothing to move'); continue; }
    try {
      sendFleet(w, player, { fromPlanetId: src.id, to: target.coords, toMoon: !!target.isMoon, ships, mission: 'transport', cargo }, now);
      out.sent.push({ fromPlanetId: src.id, from: src.name, cargo, ships });
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      skip(e.message);
    }
  }
  return out;
}
