import { describe, expect, it } from 'vitest';

import {
  buildTimeSeconds,
  buildingCost,
  crystalProductionPerHour,
  deuteriumProductionPerHour,
  energyConsumption,
  metalProductionPerHour,
  solarPlantEnergy,
  storageCapacity,
} from '../formulas';

describe('buildingCost', () => {
  // These are the numbers a returning OGame player expects to see on the
  // building screen. If a refactor changes them, the game stops "feeling
  // right", so we pin the exact values rather than just the shape.
  it('charges the base cost for level 1', () => {
    expect(buildingCost('metalMine', 1)).toEqual({ metal: 60, crystal: 15, deuterium: 0 });
    expect(buildingCost('crystalMine', 1)).toEqual({ metal: 48, crystal: 24, deuterium: 0 });
    expect(buildingCost('deuteriumSynthesizer', 1)).toEqual({
      metal: 225,
      crystal: 75,
      deuterium: 0,
    });
    expect(buildingCost('solarPlant', 1)).toEqual({ metal: 75, crystal: 30, deuterium: 0 });
    expect(buildingCost('roboticsFactory', 1)).toEqual({
      metal: 400,
      crystal: 120,
      deuterium: 200,
    });
  });

  it('floors each component independently at level 2', () => {
    // 15 * 1.5 = 22.5 -> 22, not 23 and not 22.5.
    expect(buildingCost('metalMine', 2)).toEqual({ metal: 90, crystal: 22, deuterium: 0 });
  });

  it('matches base * factor^(level-1) at level 10', () => {
    const level = 10;
    const multiplier = Math.pow(1.5, level - 1); // 38.443...
    expect(buildingCost('metalMine', level)).toEqual({
      metal: Math.floor(60 * multiplier),
      crystal: Math.floor(15 * multiplier),
      deuterium: 0,
    });
    // Spelled out, so a change to the formula cannot silently "agree" with a
    // change to the expectation above.
    expect(buildingCost('metalMine', 10).metal).toBe(2306);
    expect(buildingCost('metalMine', 10).crystal).toBe(576);
  });

  it('treats level 0 and below as the base cost rather than a fraction', () => {
    expect(buildingCost('metalMine', 0)).toEqual(buildingCost('metalMine', 1));
  });

  it('applies the steeper 1.6 factor to the crystal mine', () => {
    expect(buildingCost('crystalMine', 3)).toEqual({
      metal: Math.floor(48 * 1.6 * 1.6),
      crystal: Math.floor(24 * 1.6 * 1.6),
      deuterium: 0,
    });
  });
});

describe('buildTimeSeconds', () => {
  it('ignores deuterium and uses (metal + crystal)', () => {
    const withDeuterium = buildTimeSeconds({ metal: 100, crystal: 100, deuterium: 9999 }, 0, 1);
    const without = buildTimeSeconds({ metal: 100, crystal: 100, deuterium: 0 }, 0, 1);
    expect(withDeuterium).toBe(without);
  });

  it('follows (m + c) / (2500 * (1 + robotics) * speed) * 3600', () => {
    // 2500 + 2500 = 5000 structural cost, no robotics, speed 1
    // -> 5000 / 2500 = 2 hours = 7200 s
    expect(buildTimeSeconds({ metal: 2500, crystal: 2500, deuterium: 0 }, 0, 1)).toBeCloseTo(7200);
  });

  it('halves with robotics level 1 and halves again with speed 2', () => {
    const cost = { metal: 2500, crystal: 2500, deuterium: 0 };
    expect(buildTimeSeconds(cost, 1, 1)).toBeCloseTo(3600);
    expect(buildTimeSeconds(cost, 1, 2)).toBeCloseTo(1800);
  });

  it('never returns less than one second', () => {
    expect(buildTimeSeconds({ metal: 0, crystal: 0, deuterium: 0 }, 0, 1)).toBe(1);
    expect(buildTimeSeconds({ metal: 1, crystal: 0, deuterium: 0 }, 50, 1000)).toBe(1);
  });
});

describe('production rates', () => {
  it('produces ~241.6 metal/h from a level 5 metal mine at speed 1', () => {
    // 30 * 5 * 1.1^5 = 150 * 1.61051 = 241.5765
    expect(metalProductionPerHour(5, 1)).toBeCloseTo(241.58, 2);
  });

  it('produces nothing at level 0', () => {
    expect(metalProductionPerHour(0, 1)).toBe(0);
    expect(crystalProductionPerHour(0, 1)).toBe(0);
    expect(deuteriumProductionPerHour(0, 0, 1)).toBe(0);
  });

  it('scales linearly with universe speed', () => {
    expect(metalProductionPerHour(5, 3)).toBeCloseTo(metalProductionPerHour(5, 1) * 3);
    expect(crystalProductionPerHour(7, 5)).toBeCloseTo(crystalProductionPerHour(7, 1) * 5);
  });

  it('gives crystal two thirds of metal output at the same level', () => {
    expect(crystalProductionPerHour(5, 1)).toBeCloseTo(metalProductionPerHour(5, 1) * (20 / 30), 6);
  });

  it('rewards cold planets with more deuterium', () => {
    const cold = deuteriumProductionPerHour(10, -40, 1);
    const mild = deuteriumProductionPerHour(10, 10, 1);
    const hot = deuteriumProductionPerHour(10, 110, 1);

    expect(cold).toBeGreaterThan(mild);
    expect(mild).toBeGreaterThan(hot);

    // 10 * 10 * 1.1^10 * (1.44 - 0.004 * 10) = 100 * 2.5937 * 1.40
    expect(mild).toBeCloseTo(10 * 10 * Math.pow(1.1, 10) * 1.4, 6);
  });

  it('never returns negative deuterium on an absurdly hot world', () => {
    expect(deuteriumProductionPerHour(10, 1000, 1)).toBe(0);
  });
});

describe('energy', () => {
  it('produces 20 * level * 1.1^level from a solar plant', () => {
    expect(solarPlantEnergy(1)).toBeCloseTo(22, 6);
    expect(solarPlantEnergy(5)).toBeCloseTo(20 * 5 * Math.pow(1.1, 5), 6);
  });

  it('draws double energy for the deuterium synthesizer', () => {
    expect(energyConsumption('deuteriumSynthesizer', 4)).toBeCloseTo(
      energyConsumption('metalMine', 4) * 2,
      6,
    );
  });

  it('draws nothing from storages, facilities, or level 0 buildings', () => {
    expect(energyConsumption('metalStorage', 10)).toBe(0);
    expect(energyConsumption('roboticsFactory', 10)).toBe(0);
    expect(energyConsumption('metalMine', 0)).toBe(0);
  });
});

describe('storageCapacity', () => {
  it('gives every planet a free 10,000 silo at level 0', () => {
    expect(storageCapacity(0)).toBe(10_000);
  });

  it('follows 5000 * floor(2.5 * e^(20 * level / 33))', () => {
    for (const level of [0, 1, 2, 5, 10]) {
      expect(storageCapacity(level)).toBe(5000 * Math.floor(2.5 * Math.exp((20 * level) / 33)));
    }
  });

  it('increases strictly with level', () => {
    for (let level = 0; level < 20; level++) {
      expect(storageCapacity(level + 1)).toBeGreaterThan(storageCapacity(level));
    }
  });
});
