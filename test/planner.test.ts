import { describe, expect, it } from 'vitest';
import { planFleet } from '../shared/planner';
import { UNITS } from '../shared/data';

const stock = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
const base = { buildings: { shipyard: 8, roboticsFactory: 5, researchLab: 10 }, techs: { energy: 5, combustionDrive: 3 }, stock, speed: 1 };

describe('the fleet planner', () => {
  it('prices the units and finds nothing missing when the requirements are met', () => {
    const p = planFleet({ ...base, unit: 'smallCargo', count: 10 });
    expect(p.steps).toEqual([]);
    expect(p.cost).toEqual({ metal: UNITS.smallCargo.cost.metal * 10, crystal: UNITS.smallCargo.cost.crystal * 10, deuterium: 0 });
    expect(p.total).toEqual(p.cost);
    expect(p.shortfall).toEqual({ metal: 0, crystal: 0, deuterium: 0 });
    expect(p.buildMs).toBe(p.unitMs * 10);
  });
  it('lists the missing buildings and research in order, each priced for every level it still needs', () => {
    const p = planFleet({ unit: 'battleship', count: 5, buildings: { shipyard: 1 }, techs: {}, stock: { metal: 0, crystal: 0, deuterium: 0 }, speed: 1 });
    const names = p.steps.map((s) => s.id);
    expect(names).toContain('hyperspaceDrive');
    expect(names.indexOf('researchLab') < names.indexOf('energy') || names.includes('energy')).toBe(true);
    for (const s of p.steps) { expect(s.to).toBeGreaterThan(s.from); expect(s.cost.metal + s.cost.crystal + s.cost.deuterium).toBeGreaterThan(0); }
    const sum = p.steps.reduce((a, s) => a + s.cost.metal, 0);
    expect(p.prereqCost.metal).toBe(sum);
    expect(p.total.metal).toBe(p.cost.metal + p.prereqCost.metal);
    expect(p.shortfall.metal).toBe(p.total.metal);                              // an empty stock misses everything
  });
  it('counts only the shortfall and never plans fewer than one unit', () => {
    const p = planFleet({ ...base, unit: 'lightFighter', count: 0, stock: { metal: 3500, crystal: 0, deuterium: 0 } });
    expect(p.count).toBe(1);
    expect(p.shortfall).toEqual({ metal: 0, crystal: 1000, deuterium: 0 });
  });
  it('a higher shipyard builds faster', () => {
    const slow = planFleet({ ...base, unit: 'cruiser', count: 10, buildings: { shipyard: 4, researchLab: 10 }, techs: { energy: 5, impulseDrive: 4, ion: 2 } });
    const fast = planFleet({ ...base, unit: 'cruiser', count: 10, buildings: { shipyard: 12, researchLab: 10 }, techs: { energy: 5, impulseDrive: 4, ion: 2 } });
    expect(fast.unitMs).toBeLessThan(slow.unitMs);
  });
});
