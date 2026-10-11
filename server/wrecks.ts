import { UNITS, wreckRepairShare } from '../shared/data';
import { lvl } from '../shared/formulas';
import type { Fleet, ShipId } from '../shared/types';
import { updatePlanet } from './economy';
import { assertActive } from './vacation';
import { GameError, type Planet, type Player, type World, type Wreck } from './world';

const HOUR = 3_600_000;

const shipValue = (f: Fleet) => Object.entries(f).reduce((s, [id, n]) => s + (UNITS[id as ShipId].cost.metal + UNITS[id as ShipId].cost.crystal) * (n || 0), 0);

/**
 * When a battle destroys enough of a defender's ships, the wreckage can be salvaged by the owner's Space Dock.
 * Returns the value of the wreck field that formed (0 = none).
 */
export function addWreck(w: World, planet: Planet, lost: Fleet, at: number): number {
  const value = shipValue(lost);
  if (value < w.config.wreckMinValue) return 0;
  const cur = w.wrecks[planet.id];
  if (cur?.repair) return 0; // a repair is already running; the new wreckage drifts away
  const ships: Fleet = { ...(cur?.ships ?? {}) };
  for (const [id, n] of Object.entries(lost)) ships[id as ShipId] = (ships[id as ShipId] || 0) + (n || 0);
  w.wrecks[planet.id] = { planetId: planet.id, ownerId: planet.ownerId, ships, value: shipValue(ships), createdAt: cur?.createdAt ?? at, expiresAt: at + w.config.wreckHours * HOUR };
  return value;
}

/** how long a repair takes: 30 minutes at the classic speed, shorter on faster shipyards */
export const repairSeconds = (w: World) => Math.max(30, Math.round(1800 / ((w.config.economySpeed * w.config.shipyardBoost) / 20)));

export function startRepair(w: World, player: Player, planet: Planet, now: number) {
  assertActive(player, 'repair ships');
  if (planet.ownerId !== player.id) throw new GameError('Not your planet', 403);
  updatePlanet(w, planet, now);
  const wreck = w.wrecks[planet.id];
  if (!wreck) throw new GameError('There is no wreck field here');
  if (wreck.repair) throw new GameError('A repair is already under way');
  const dock = lvl(planet.buildings, 'spaceDock');
  if (dock < 1) throw new GameError('You need a Space Dock on this planet to repair ships');
  const share = wreckRepairShare(dock);
  const ships: Fleet = {};
  for (const [id, n] of Object.entries(wreck.ships)) {
    const back = Math.floor((n || 0) * share);
    if (back > 0) ships[id as ShipId] = back;
  }
  if (!Object.keys(ships).length) throw new GameError('The wreck is too small for this Space Dock to rebuild anything');
  wreck.repair = { endsAt: now + repairSeconds(w) * 1000, ships };
}

export function wreckView(w: World, planet: Planet) {
  const wreck = w.wrecks[planet.id];
  if (!wreck) return null;
  const dock = lvl(planet.buildings, 'spaceDock');
  return {
    ships: wreck.ships, value: wreck.value, expiresAt: wreck.expiresAt, repair: wreck.repair ?? null,
    dock, share: dock ? wreckRepairShare(dock) : 0, repairSeconds: repairSeconds(w),
  };
}
