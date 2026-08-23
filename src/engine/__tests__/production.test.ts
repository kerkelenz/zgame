import { describe, expect, it } from 'vitest';

import { BASE_PRODUCTION_PER_HOUR } from '../constants';
import { energyConsumption, metalProductionPerHour, solarPlantEnergy } from '../formulas';
import { applyProduction, computeEnergy, computeProduction } from '../production';
import { HOUR, makePlanet, withBuildings } from './helpers';

describe('computeEnergy', () => {
  it('reports a fully powered planet with nothing to power', () => {
    expect(computeEnergy(makePlanet())).toEqual({ produced: 0, consumed: 0, factor: 1 });
  });

  it('does not bank surplus energy - the factor caps at 1', () => {
    const planet = withBuildings({ solarPlant: 10, metalMine: 1 });
    const energy = computeEnergy(planet);
    expect(energy.produced).toBeGreaterThan(energy.consumed);
    expect(energy.factor).toBe(1);
  });

  it('reports a shortfall as a fraction of demand met', () => {
    const planet = withBuildings({ solarPlant: 1, metalMine: 3 });
    const energy = computeEnergy(planet);

    expect(energy.produced).toBeCloseTo(solarPlantEnergy(1), 6); // 22
    expect(energy.consumed).toBeCloseTo(energyConsumption('metalMine', 3), 6); // 39.93
    expect(energy.factor).toBeLessThan(1);
    expect(energy.factor).toBeCloseTo(22 / 39.93, 4);
  });

  it('sums demand across all three mines', () => {
    const planet = withBuildings({ metalMine: 2, crystalMine: 2, deuteriumSynthesizer: 2 });
    expect(computeEnergy(planet).consumed).toBeCloseTo(
      energyConsumption('metalMine', 2) +
        energyConsumption('crystalMine', 2) +
        energyConsumption('deuteriumSynthesizer', 2),
      6,
    );
  });
});

describe('computeProduction', () => {
  it('adds the free trickle to an empty planet', () => {
    const report = computeProduction(makePlanet(), 1);
    expect(report.net.metal).toBe(BASE_PRODUCTION_PER_HOUR.metal); // 30
    expect(report.net.crystal).toBe(BASE_PRODUCTION_PER_HOUR.crystal); // 15
    expect(report.net.deuterium).toBe(0);
  });

  it('adds mine output on top of the trickle at full power', () => {
    // Solar level 5 comfortably covers a level 5 metal mine.
    const planet = withBuildings({ metalMine: 5, solarPlant: 5 });
    const report = computeProduction(planet, 1);

    expect(report.energy.factor).toBe(1);
    expect(report.net.metal).toBeCloseTo(30 + 241.5765, 3);
  });

  it('applies the energy penalty to mines but never to the trickle', () => {
    const planet = withBuildings({ metalMine: 3, solarPlant: 1 });
    const report = computeProduction(planet, 1);
    const factor = report.energy.factor;

    expect(factor).toBeLessThan(1);

    // Gross = what we would earn fully powered.
    expect(report.gross.metal).toBeCloseTo(30 + metalProductionPerHour(3, 1), 6);

    // Net = trickle at full strength + mines scaled down.
    expect(report.net.metal).toBeCloseTo(30 + metalProductionPerHour(3, 1) * factor, 6);

    // The reduction is exactly the mine share, i.e. the trickle survived intact.
    expect(report.gross.metal - report.net.metal).toBeCloseTo(
      metalProductionPerHour(3, 1) * (1 - factor),
      6,
    );
    expect(report.net.metal).toBeGreaterThan(30);
  });

  it('scales the whole economy with universe speed', () => {
    const planet = withBuildings({ metalMine: 4, solarPlant: 4 });
    const x1 = computeProduction(planet, 1);
    const x5 = computeProduction(planet, 5);

    expect(x5.net.metal).toBeCloseTo(x1.net.metal * 5, 6);
    // ...but the power balance is deliberately speed-independent.
    expect(x5.energy).toEqual(x1.energy);
  });
});

describe('applyProduction', () => {
  it('credits exactly one hour of the net rate over one hour', () => {
    const planet = withBuildings({ metalMine: 5, solarPlant: 5 });
    const after = applyProduction(planet, HOUR, 1);
    expect(after.resources.metal).toBeCloseTo(30 + 241.5765, 3);
  });

  it('does not mutate the planet it was given', () => {
    const planet = withBuildings({ metalMine: 5, solarPlant: 5 });
    const before = JSON.stringify(planet);
    const after = applyProduction(planet, HOUR, 1);

    expect(JSON.stringify(planet)).toBe(before);
    expect(after).not.toBe(planet);
    expect(after.resources).not.toBe(planet.resources);
  });

  it('is a no-op for a zero or negative window (clock jumped backwards)', () => {
    const planet = withBuildings({ metalMine: 5, solarPlant: 5 });
    expect(applyProduction(planet, 0, 1)).toBe(planet);
    expect(applyProduction(planet, -HOUR, 1)).toBe(planet);
  });

  it('never exceeds storage capacity, no matter how long we run', () => {
    // Level 0 storage = 10,000 of each. A year of a big mine would blow past it.
    const planet = withBuildings({
      metalMine: 20,
      crystalMine: 20,
      deuteriumSynthesizer: 20,
      solarPlant: 30, // enough to run all three at full output
    });
    const after = applyProduction(planet, 365 * 24 * HOUR, 1);

    expect(after.resources.metal).toBe(10_000);
    expect(after.resources.crystal).toBe(10_000);
    expect(after.resources.deuterium).toBe(10_000);
  });

  it('raises the ceiling when storage buildings are present', () => {
    const planet = withBuildings({ metalMine: 20, metalStorage: 2, solarPlant: 30 });
    const after = applyProduction(planet, 365 * 24 * HOUR, 1);
    expect(after.resources.metal).toBe(5000 * Math.floor(2.5 * Math.exp((20 * 2) / 33)));
    expect(after.resources.metal).toBeGreaterThan(10_000);
  });

  it('stops gaining, rather than destroying resources, when already over cap', () => {
    // Can happen after a refund, or if storage ever becomes downgradable.
    const planet = withBuildings(
      { metalMine: 10, solarPlant: 20 },
      { resources: { metal: 50_000, crystal: 0, deuterium: 0 } },
    );
    const after = applyProduction(planet, 10 * HOUR, 1);
    expect(after.resources.metal).toBe(50_000);
  });
});
