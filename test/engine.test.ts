import { describe, expect, it } from 'vitest';
import { computeLoot, makeRng, simulateCombat } from '../shared/combat';
import { UNITS } from '../shared/data';
import {
  buildingCost, buildingTime, distance, flightSeconds, fuelUse, production, researchTime, shipSpeed, storageCapacity, techCost,
} from '../shared/formulas';

describe('formulas', () => {
  it('building costs scale by factor', () => {
    expect(buildingCost('metalMine', 1)).toEqual({ metal: 60, crystal: 15, deuterium: 0 });
    expect(buildingCost('metalMine', 3)).toEqual({ metal: 135, crystal: 33, deuterium: 0 });
    expect(techCost('energy', 2)).toEqual({ metal: 0, crystal: 1600, deuterium: 800 });
  });

  it('build time shrinks with robotics and nanites', () => {
    const c = buildingCost('metalMine', 10);
    const t0 = buildingTime(c, 0, 0, 1);
    expect(buildingTime(c, 4, 0, 1)).toBeLessThan(t0);
    expect(buildingTime(c, 0, 2, 1)).toBeLessThan(t0 / 3);
    expect(buildingTime(c, 0, 0, 10)).toBeLessThan(t0 / 9);
    expect(researchTime({ metal: 0, crystal: 1000, deuterium: 0 }, 1, 1)).toBe(1800);
  });

  it('storage capacity grows with level', () => {
    expect(storageCapacity(0)).toBe(10000);
    expect(storageCapacity(5)).toBeGreaterThan(storageCapacity(1));
  });

  it('production includes basic income and energy shortage throttles mines', () => {
    const base = production({ buildings: {}, techs: {}, maxTemp: 50, satellites: 0, speed: 1 });
    expect(base.metal).toBe(30);
    expect(base.crystal).toBe(15);
    const noEnergy = production({ buildings: { metalMine: 10 }, techs: {}, maxTemp: 50, satellites: 0, speed: 1 });
    expect(noEnergy.efficiency).toBe(0);
    expect(noEnergy.metal).toBe(30);
    const powered = production({ buildings: { metalMine: 10, solarPlant: 12 }, techs: {}, maxTemp: 50, satellites: 0, speed: 1 });
    expect(powered.efficiency).toBe(1);
    expect(powered.metal).toBeGreaterThan(800);
  });

  it('fusion burns deuterium; colder planets give more deuterium', () => {
    const cold = production({ buildings: { deuteriumSynthesizer: 10, solarPlant: 15 }, techs: {}, maxTemp: -50, satellites: 0, speed: 1 });
    const hot = production({ buildings: { deuteriumSynthesizer: 10, solarPlant: 15 }, techs: {}, maxTemp: 100, satellites: 0, speed: 1 });
    expect(cold.deuterium).toBeGreaterThan(hot.deuterium);
    const fus = production({ buildings: { fusionReactor: 5 }, techs: { energy: 5 }, maxTemp: 0, satellites: 0, speed: 1 });
    expect(fus.energyProduced).toBeGreaterThan(0);
    expect(fus.deuterium).toBeLessThan(0);
  });

  it('distance and flight time', () => {
    expect(distance({ g: 1, s: 1, p: 1 }, { g: 1, s: 1, p: 5 })).toBe(1020);
    expect(distance({ g: 1, s: 1, p: 1 }, { g: 1, s: 11, p: 1 })).toBe(3650);
    expect(distance({ g: 1, s: 1, p: 1 }, { g: 2, s: 1, p: 1 })).toBe(20000);
    const slow = flightSeconds(5000, 5000, 100, 1);
    expect(flightSeconds(5000, 5000, 100, 10)).toBeLessThan(slow);
    expect(flightSeconds(5000, 5000, 50, 1)).toBeGreaterThan(slow);
  });

  it('drive tech speeds up ships', () => {
    expect(shipSpeed('smallCargo', {})).toBe(5000);
    expect(shipSpeed('smallCargo', { combustionDrive: 5 })).toBe(7500);
    expect(shipSpeed('cruiser', { impulseDrive: 5 })).toBe(30000);
    expect(shipSpeed('solarSatellite', {})).toBe(0);
  });

  it('fuel grows with distance and speed', () => {
    const f = { largeCargo: 10 };
    expect(fuelUse(f, 3000, 100)).toBeGreaterThan(fuelUse(f, 1000, 100));
    expect(fuelUse(f, 3000, 100)).toBeGreaterThan(fuelUse(f, 3000, 10));
  });
});

describe('combat', () => {
  const side = (fleet: Record<string, number>, defenses: Record<string, number> = {}, techs = { weapons: 0, shielding: 0, armour: 0 }) => ({
    owner: 'x', name: 'x', ...techs, fleet, defenses,
  });

  it('is deterministic for a given seed', () => {
    const run = () => simulateCombat([side({ cruiser: 20 })], [side({ lightFighter: 50 }, { rocketLauncher: 30 })], makeRng(42));
    expect(run()).toEqual(run());
  });

  it('a much stronger fleet wins and leaves debris', () => {
    const r = simulateCombat([side({ battleship: 30 })], [side({ lightFighter: 10 }, { rocketLauncher: 10 })], makeRng(1));
    expect(r.winner).toBe('attacker');
    expect(r.debris.metal).toBeGreaterThan(0);
    expect(r.attackers[0].after.battleship).toBeGreaterThan(20);
  });

  it('defenders win against a handful of weak ships and rebuild some defenses', () => {
    const r = simulateCombat([side({ lightFighter: 3 })], [side({}, { heavyLaser: 20, rocketLauncher: 50 })], makeRng(7));
    expect(r.winner).toBe('defender');
    expect(r.attackers[0].after.lightFighter ?? 0).toBe(0);
  });

  it('defense losses can be rebuilt (~70%)', () => {
    const r = simulateCombat([side({ cruiser: 200 })], [side({}, { rocketLauncher: 500 })], makeRng(3));
    const lost = 500 - 0;
    const rebuilt = r.defenders[0].rebuilt.rocketLauncher ?? 0;
    expect(rebuilt).toBeGreaterThan(lost * 0.55);
    expect(rebuilt).toBeLessThan(lost * 0.85);
    expect(r.defenders[0].after.rocketLauncher).toBe(rebuilt);
  });

  it('weapons tech increases damage', () => {
    const base = simulateCombat([side({ lightFighter: 40 })], [side({ lightFighter: 40 })], makeRng(5));
    const boosted = simulateCombat([side({ lightFighter: 40 }, {}, { weapons: 10, shielding: 0, armour: 0 })], [side({ lightFighter: 40 })], makeRng(5));
    expect(boosted.defenders[0].after.lightFighter ?? 0).toBeLessThan(base.defenders[0].after.lightFighter ?? 99);
  });

  it('shots weaker than 1% of the shield do nothing (shield domes)', () => {
    const r = simulateCombat([side({ smallCargo: 100 })], [side({}, { largeShield: 1 })], makeRng(2));
    expect(r.defenders[0].after.largeShield).toBe(1);
    expect(r.winner).toBe('draw');
  });

  it('rapid fire makes cruisers shred rocket launchers', () => {
    const rf = simulateCombat([side({ cruiser: 10 })], [side({}, { rocketLauncher: 100 })], makeRng(9));
    const noRf = simulateCombat([side({ battleship: 4 })], [side({}, { rocketLauncher: 100 })], makeRng(9));
    expect(rf.rounds).toBeLessThanOrEqual(noRf.rounds + 3);
    expect(UNITS.cruiser.rapidFire.rocketLauncher).toBe(10);
  });

  it('never exceeds 6 rounds', () => {
    const r = simulateCombat([side({ smallCargo: 5 })], [side({ smallCargo: 5 })], makeRng(11));
    expect(r.rounds).toBeLessThanOrEqual(6);
  });

  it('multiple defenders (alliance help) fight together', () => {
    const a = side({ cruiser: 40 });
    const r1 = simulateCombat([a], [side({ cruiser: 10 })], makeRng(4));
    const r2 = simulateCombat([a], [side({ cruiser: 10 }), { ...side({ cruiser: 40 }), owner: 'ally', name: 'ally' }], makeRng(4));
    expect(r1.winner).toBe('attacker');
    expect(r2.winner).not.toBe('attacker');
    expect(r2.defenders).toHaveLength(2);
  });
});

describe('loot', () => {
  it('takes at most half and respects capacity', () => {
    const l = computeLoot({ metal: 100_000, crystal: 50_000, deuterium: 20_000 }, 1_000_000);
    expect(l).toEqual({ metal: 50_000, crystal: 25_000, deuterium: 10_000 });
    const small = computeLoot({ metal: 100_000, crystal: 50_000, deuterium: 20_000 }, 30_000);
    expect(small.metal + small.crystal + small.deuterium).toBeLessThanOrEqual(30_000);
    expect(small.metal + small.crystal + small.deuterium).toBeGreaterThan(29_000);
  });
  it('zero capacity yields nothing', () => {
    expect(computeLoot({ metal: 10, crystal: 10, deuterium: 10 }, 0)).toEqual({ metal: 0, crystal: 0, deuterium: 0 });
  });
});
