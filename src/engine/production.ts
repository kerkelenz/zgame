/**
 * Turning building levels into resources.
 *
 * Two concepts live here and it is worth keeping them clearly apart:
 *
 * 1. **Rates** (`computeEnergy`, `computeProduction`) - "how much per hour,
 *    right now, at these building levels?" Pure derivations from a planet's
 *    state. The UI calls these on every render.
 * 2. **Accrual** (`applyProduction`) - "given a rate and a stretch of elapsed
 *    time, how many resources did we actually bank?" This is the only function
 *    that changes a planet's resource totals.
 */

import { BASE_PRODUCTION_PER_HOUR } from './constants';
import {
  crystalProductionPerHour,
  deuteriumProductionPerHour,
  energyConsumption,
  metalProductionPerHour,
  solarPlantEnergy,
  storageCapacities,
} from './formulas';
import type { Planet, Resources } from './types';

/** The planet's power balance. */
export type EnergyReport = {
  /** Total energy generated (solar plants, and later fusion/satellites). */
  produced: number;
  /** Total energy demanded by the mines at their current levels. */
  consumed: number;
  /**
   * How much of the demand is actually met, in [0, 1].
   *
   * 1 means fully powered. 0.85 means every mine runs at 85% output, and the UI
   * shows "-15% energy". This soft brown-out is far kinder than a hard cutoff:
   * over-building your mines slows you down, it does not brick your economy.
   */
  factor: number;
};

/**
 * A full production breakdown. We return the intermediate numbers, not just the
 * final answer, because the UI genuinely needs them: the resource bar wants to
 * show the *net* rate, while the buildings screen wants to explain *why* it is
 * lower than the gross rate.
 */
export type ProductionReport = {
  energy: EnergyReport;
  /** The free trickle every planet gets, unaffected by energy. */
  base: Resources;
  /** Mine output at full power, before the energy penalty. */
  mines: Resources;
  /** base + mines at full power. What you would earn with enough energy. */
  gross: Resources;
  /** base + (mines * energy factor). What you actually earn. */
  net: Resources;
};

/**
 * Compute the planet's power balance.
 *
 * `factor = min(1, produced / consumed)`, with the special case that a planet
 * consuming nothing is by definition fully powered (factor 1) rather than
 * dividing by zero. Surplus energy is *not* banked - it is a standing capacity,
 * not a stockpile - hence the `min(1, ...)`.
 */
export function computeEnergy(planet: Planet): EnergyReport {
  const produced = solarPlantEnergy(planet.buildings.solarPlant);

  const consumed =
    energyConsumption('metalMine', planet.buildings.metalMine) +
    energyConsumption('crystalMine', planet.buildings.crystalMine) +
    energyConsumption('deuteriumSynthesizer', planet.buildings.deuteriumSynthesizer);

  // A planet with no powered buildings is trivially "fully powered".
  const factor = consumed <= 0 ? 1 : Math.min(1, produced / consumed);

  return { produced, consumed, factor };
}

/** Average surface temperature, which is what the deuterium formula wants. */
export function averageTemperature(planet: Planet): number {
  return (planet.temperature.min + planet.temperature.max) / 2;
}

/**
 * Per-hour production rates for a planet.
 *
 * The energy factor multiplies **mine output only**. The base trickle is
 * explicitly exempt: it represents ambient scavenging rather than powered
 * industry, and exempting it means a player who over-builds their mines into a
 * brown-out can still always crawl back out of it.
 */
export function computeProduction(planet: Planet, speed: number): ProductionReport {
  const energy = computeEnergy(planet);
  const avgTemp = averageTemperature(planet);

  const mines: Resources = {
    metal: metalProductionPerHour(planet.buildings.metalMine, speed),
    crystal: crystalProductionPerHour(planet.buildings.crystalMine, speed),
    deuterium: deuteriumProductionPerHour(planet.buildings.deuteriumSynthesizer, avgTemp, speed),
  };

  // The trickle scales with universe speed too, matching OGame: in a x5
  // universe *everything* about the economy is five times faster, including the
  // safety net. Leaving it unscaled would make the trickle feel useless in fast
  // universes and dominant in slow ones.
  const base: Resources = {
    metal: BASE_PRODUCTION_PER_HOUR.metal * speed,
    crystal: BASE_PRODUCTION_PER_HOUR.crystal * speed,
    deuterium: BASE_PRODUCTION_PER_HOUR.deuterium * speed,
  };

  const gross: Resources = {
    metal: base.metal + mines.metal,
    crystal: base.crystal + mines.crystal,
    deuterium: base.deuterium + mines.deuterium,
  };

  const net: Resources = {
    metal: base.metal + mines.metal * energy.factor,
    crystal: base.crystal + mines.crystal * energy.factor,
    deuterium: base.deuterium + mines.deuterium * energy.factor,
  };

  return { energy, base, mines, gross, net };
}

/**
 * Credit `elapsedMs` worth of production to a planet.
 *
 * Returns a **brand new planet object**; the input is never touched. Why
 * immutability matters here specifically:
 *
 * - zustand (and React generally) decides "did this change?" by reference
 *   equality. If we mutated `planet.resources` in place, the object identity
 *   would be unchanged, `useStore` would see no change, and the resource bar
 *   would silently stop updating. Immutability is not a style preference in a
 *   React app; it is how re-renders get triggered at all.
 * - `tick` splits one elapsed window into several segments and feeds the output
 *   of one into the next. With mutation, an exception midway would leave the
 *   planet half-updated. With new objects, either the whole tick succeeds or
 *   the old state survives intact.
 * - Tests can hold on to a "before" planet and compare it to the "after" one.
 *
 * Resources are capped at storage capacity. The cap uses
 * `min(gained, max(0, capacity - current))` rather than a blunt
 * `min(current + gained, capacity)`, so that a planet already *over* capacity
 * (which can happen after a refund, or if we ever allow storage downgrades)
 * simply stops gaining instead of having resources destroyed.
 */
export function applyProduction(planet: Planet, elapsedMs: number, speed: number): Planet {
  // A non-positive window is a no-op. This is not just defensive: device clocks
  // can jump backwards (timezone changes, NTP corrections, the user fiddling
  // with the date), and we would rather stall for a moment than hand out
  // negative resources.
  if (elapsedMs <= 0) return planet;

  const { net } = computeProduction(planet, speed);
  const capacity = storageCapacities(planet.buildings);
  const hours = elapsedMs / 3_600_000;

  const grow = (current: number, ratePerHour: number, max: number): number => {
    const headroom = Math.max(0, max - current);
    return current + Math.min(ratePerHour * hours, headroom);
  };

  return {
    ...planet,
    resources: {
      metal: grow(planet.resources.metal, net.metal, capacity.metal),
      crystal: grow(planet.resources.crystal, net.crystal, capacity.crystal),
      deuterium: grow(planet.resources.deuterium, net.deuterium, capacity.deuterium),
    },
  };
}
