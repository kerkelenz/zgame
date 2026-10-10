import { describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { planetCapacity, planetProduction, queueUnits, startBuilding, startResearch } from '../server/economy';
import { flightPlan } from '../server/fleet';
import { createWorld, type World } from '../server/world';
import { DEFAULT_CONFIG } from '../shared/config';

const T0 = 1_700_000_000_000;

function setup(cfg: Partial<typeof DEFAULT_CONFIG>) {
  const w: World = createWorld({ raidIntervalMin: 0, npcDensity: 0, ...cfg }, T0);
  const p = register(w, 'alice', 'secret1', T0).player;
  const planet = w.planets[p.planetIds[0]];
  planet.buildings = { metalMine: 10, crystalMine: 8, deuteriumSynthesizer: 6, solarPlant: 20, researchLab: 8, roboticsFactory: 3 };
  planet.resources = { metal: 1e8, crystal: 1e8, deuterium: 1e8 };
  planet.coords = { g: 1, s: 5, p: 6 }; // same distances in every test world
  planet.maxTemp = 40; // deuterium output depends on temperature, so keep both worlds identical
  p.techs = { energy: 6, combustionDrive: 4 };
  return { w, p, planet };
}

describe('default speeds', () => {
  it('ship with 5x production, research and storage boosts on top of the economy speed', () => {
    expect(DEFAULT_CONFIG.productionBoost).toBe(5);
    expect(DEFAULT_CONFIG.researchBoost).toBe(5);
    expect(DEFAULT_CONFIG.storageBoost).toBe(5);
  });

  it('a brand-new planet stores one million of each resource at level 0 (was 200,000)', () => {
    const { w, planet } = setup({});
    planet.buildings = {};
    const cap = planetCapacity(w, planet);
    expect(cap).toEqual({ metal: 1_000_000, crystal: 1_000_000, deuterium: 1_000_000 });
  });
});

describe('what the boosts change', () => {
  it('production (including basic income and mines) is 5x', () => {
    const base = setup({ productionBoost: 1 }), boosted = setup({ productionBoost: 5 });
    const a = planetProduction(base.w, base.planet), b = planetProduction(boosted.w, boosted.planet);
    expect(b.metal / a.metal).toBeCloseTo(5, 5);
    expect(b.crystal / a.crystal).toBeCloseTo(5, 5);
    expect(b.deuterium / a.deuterium).toBeCloseTo(5, 5);
    base.planet.buildings = {}; boosted.planet.buildings = {};
    expect(planetProduction(boosted.w, boosted.planet).metal / planetProduction(base.w, base.planet).metal).toBeCloseTo(5, 5); // basic income too
    // energy balance is unchanged, so the efficiency of mines is too
    expect(planetProduction(boosted.w, boosted.planet).efficiency).toBe(planetProduction(base.w, base.planet).efficiency);
  });

  it('research takes one fifth of the time', () => {
    const base = setup({ researchBoost: 1 }), boosted = setup({ researchBoost: 5 });
    startResearch(base.w, base.p, base.planet, 'energy', T0);
    startResearch(boosted.w, boosted.p, boosted.planet, 'energy', T0);
    const t1 = base.p.research!.end - base.p.research!.start, t5 = boosted.p.research!.end - boosted.p.research!.start;
    expect(t1 / t5).toBeCloseTo(5, 1);
  });

  it('storage capacity is 5x', () => {
    const a = setup({ storageBoost: 1 }), b = setup({ storageBoost: 5 });
    expect(planetCapacity(b.w, b.planet).metal / planetCapacity(a.w, a.planet).metal).toBe(5);
  });
});

describe('construction and shipyard speed', () => {
  it('default to 5x', () => {
    expect(DEFAULT_CONFIG.constructionBoost).toBe(5);
    expect(DEFAULT_CONFIG.shipyardBoost).toBe(5);
  });

  it('buildings take one fifth of the time', () => {
    const base = setup({ constructionBoost: 1 }), boosted = setup({ constructionBoost: 5 });
    startBuilding(base.w, base.p, base.planet, 'metalMine', T0);
    startBuilding(boosted.w, boosted.p, boosted.planet, 'metalMine', T0);
    const t1 = base.planet.buildQueue!.end - base.planet.buildQueue!.start, t5 = boosted.planet.buildQueue!.end - boosted.planet.buildQueue!.start;
    expect(t1).toBeGreaterThan(20_000); // far from the 1-second floor, so the ratio is meaningful
    expect(t1 / t5).toBeCloseTo(5, 0);
  });

  it('ships and defenses take one fifth of the time', () => {
    const make = (shipyardBoost: number) => {
      const x = setup({ shipyardBoost });
      x.planet.buildings.shipyard = 6;
      x.p.techs.combustionDrive = 4;
      queueUnits(x.w, x.p, x.planet, 'lightFighter', 10, T0);
      return x.planet.shipyardQueue[0].unitMs;
    };
    const t1 = make(1), t5 = make(5);
    expect(t1).toBeGreaterThan(5_000);
    expect(t1 / t5).toBeCloseTo(5, 0);
  });

  it('the two speeds are independent of each other', () => {
    const a = setup({ constructionBoost: 5, shipyardBoost: 1 }), b = setup({ constructionBoost: 1, shipyardBoost: 5 });
    for (const x of [a, b]) { x.planet.buildings.shipyard = 6; x.p.techs.combustionDrive = 4; startBuilding(x.w, x.p, x.planet, 'metalMine', T0); queueUnits(x.w, x.p, x.planet, 'lightFighter', 5, T0); }
    const build = (x: typeof a) => x.planet.buildQueue!.end - x.planet.buildQueue!.start;
    expect(build(b) / build(a)).toBeCloseTo(5, 0); // b builds 5x slower than a
    expect(a.planet.shipyardQueue[0].unitMs / b.planet.shipyardQueue[0].unitMs).toBeCloseTo(5, 0); // a ships 5x slower than b
  });
});

describe('what the boosts leave alone', () => {
  it('fleet flight times and fuel are unaffected', () => {
    const a = setup({ productionBoost: 1, researchBoost: 1, storageBoost: 1 }), b = setup({ productionBoost: 5, researchBoost: 5, storageBoost: 5 });
    const ships = { cruiser: 5 };
    const to = { g: 1, s: 20, p: 5 };
    const fa = flightPlan(a.w, a.p, ships, a.planet.coords, to, 100), fb = flightPlan(b.w, b.p, ships, b.planet.coords, to, 100);
    expect(fb.secs).toBe(fa.secs);
    expect(fb.fuel).toBe(fa.fuel);
    expect(b.w.config.fleetSpeed).toBe(DEFAULT_CONFIG.fleetSpeed);
  });

  it('production, research and storage boosts do not change construction or shipyard time', () => {
    const a = setup({ productionBoost: 1, researchBoost: 1, storageBoost: 1 }), b = setup({ productionBoost: 5, researchBoost: 5, storageBoost: 5 });
    startBuilding(a.w, a.p, a.planet, 'metalMine', T0);
    startBuilding(b.w, b.p, b.planet, 'metalMine', T0);
    expect(b.planet.buildQueue!.end - b.planet.buildQueue!.start).toBe(a.planet.buildQueue!.end - a.planet.buildQueue!.start);
  });
});

describe('existing saves', () => {
  it('a save written before the boosts existed picks them up from the defaults', async () => {
    const { loadWorld, saveWorld } = await import('../server/store');
    const { mkdtempSync, readFileSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'boost-'));
    try {
      const file = join(dir, 'world.json');
      saveWorld(file, createWorld({ npcDensity: 0 }, T0), { everyMs: Infinity, keep: 0 });
      const raw = JSON.parse(readFileSync(file, 'utf8'));
      delete raw.config.productionBoost; delete raw.config.researchBoost; delete raw.config.storageBoost; // as an old save would be
      writeFileSync(file, JSON.stringify(raw));
      const w = loadWorld(file);
      expect([w.config.productionBoost, w.config.researchBoost, w.config.storageBoost]).toEqual([5, 5, 5]);
      expect(w.config.economySpeed).toBe(raw.config.economySpeed); // their own speed is kept
      expect(loadWorld(file, { productionBoost: 2 }).config.productionBoost).toBe(2); // env overrides still win
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
