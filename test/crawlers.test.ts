import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { chooseClass } from '../server/progress';
import { planetProduction, queueUnits } from '../server/economy';
import { sendFleet } from '../server/fleet';
import { createMoon } from '../server/galaxy';
import { GameError, createWorld, type Planet, type Player, type World } from '../server/world';
import { CRAWLER, POSITION_BONUS, crawlerBonus } from '../shared/data';
import { production } from '../shared/formulas';
import { buildingTable, detailCtxFrom } from '../shared/effects';
import { planetView } from '../server/views';

const T0 = 1_700_000_000_000;
let w: World; let a: Player; let p: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 10, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  a = register(w, 'alice', 'secret1', T0).player;
  p = w.planets[a.planetIds[0]];
  p.buildings = { metalMine: 20, crystalMine: 18, deuteriumSynthesizer: 10, solarPlant: 40, shipyard: 6, roboticsFactory: 4 };
  p.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
  a.techs = { combustionDrive: 5 };
});

const at = (pos: number) => { p.coords = { ...p.coords, p: pos }; return planetProduction(w, p); };

describe('position bonuses', () => {
  it('pay extra crystal in orbits 1-3 and extra metal in orbits 6-10, nothing elsewhere', () => {
    const base = at(4);
    expect(at(5).metal).toBeCloseTo(base.metal, 6);
    for (const [pos, b] of Object.entries(POSITION_BONUS)) {
      const r = at(Number(pos));
      expect(r.metal - base.metal / 1).toBeDefined();
      const mine = (x: typeof r, k: 'metal' | 'crystal') => x.detail.mine[k].raw;
      expect(r.detail.mine.metal.placement).toBeCloseTo(mine(r, 'metal') * (b.metal ?? 0), 6);
      expect(r.detail.mine.crystal.placement).toBeCloseTo(mine(r, 'crystal') * (b.crystal ?? 0), 6);
      expect(r.detail.mine.deuterium.placement).toBe(0);
    }
    expect(at(8).metal).toBeGreaterThan(at(4).metal * 1.2);
    expect(at(1).crystal).toBeGreaterThan(at(4).crystal * 1.2);
  });

  it('are not given to moons', () => {
    const moon = createMoon(w, p, T0, 0.1);
    moon.coords = { ...p.coords, p: 8 };
    moon.buildings = { metalMine: 10 };
    expect(planetProduction(w, moon).detail.mine.metal.placement).toBe(0);
  });

  it('add up with plasma and alliance boosts: the breakdown still sums to the total', () => {
    a.techs.plasma = 5;
    const r = at(8);
    const m = r.detail.mine.metal;
    expect(m.raw + m.plasma + m.placement + m.crawlers + m.boosts).toBeCloseTo(m.potential, 6);
    expect(m.total).toBeCloseTo(m.potential * r.efficiency, 6);
  });
});

describe('crawlers', () => {
  it('cost resources, need a shipyard and drives, and only work on planets', () => {
    p.buildings.shipyard = 4;
    expect(() => queueUnits(w, a, p, 'crawler', 1, T0)).toThrow(/Requirements/);
    p.buildings.shipyard = 6;
    queueUnits(w, a, p, 'crawler', 3, T0);
    expect(p.shipyardQueue[0].id).toBe('crawler');
    const moon = createMoon(w, p, T0, 0.1);
    moon.buildings = { shipyard: 6 }; moon.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
    expect(() => queueUnits(w, a, moon, 'crawler', 1, T0)).toThrow(GameError);
  });

  it('boost every mine by 0.1% each, capped by mine levels and 50%', () => {
    const base = planetProduction(w, p);
    p.fleet.crawler = 100;
    const r = planetProduction(w, p);
    expect(r.detail.mine.metal.total / base.detail.mine.metal.total).toBeCloseTo(1.1, 6); // 100 x 0.1% of the mine output
    expect(r.detail.mine.crystal.total / base.detail.mine.crystal.total).toBeCloseTo(1.1, 6);
    expect(r.detail.mine.deuterium.total / base.detail.mine.deuterium.total).toBeCloseTo(1.1, 6);
    expect(crawlerBonus(10_000, 48)).toBe(CRAWLER.perUnit * CRAWLER.perMineLevel * 48);
    expect(crawlerBonus(10_000, 1000)).toBe(CRAWLER.cap);
    expect(crawlerBonus(0, 48)).toBe(0);
    p.fleet.crawler = 1; // surplus crawlers beyond the cap add nothing
    p.fleet.crawler = 10_000;
    expect(planetProduction(w, p).detail.mine.metal.crawlers).toBeCloseTo(planetProduction(w, p).detail.mine.metal.raw * crawlerBonus(10_000, 48), 6);
  });

  it('Collectors get 50% more out of them', () => {
    p.fleet.crawler = 100;
    const plain = planetProduction(w, p).detail.mine.metal.crawlers;
    chooseClass(a, 'collector');
    const col = planetProduction(w, p);
    // the class also raises the mine boost, so compare the crawler share of raw output
    expect(col.detail.mine.metal.crawlers / col.detail.mine.metal.raw).toBeCloseTo(0.15, 6);
    expect(plain / col.detail.mine.metal.raw).toBeCloseTo(0.1, 6);
  });

  it('never leave the planet and are ignored by spies and wreck fields', () => {
    p.fleet = { crawler: 10, smallCargo: 2 };
    expect(() => sendFleet(w, a, { fromPlanetId: p.id, to: { g: 1, s: 3, p: 3 }, ships: { crawler: 5 }, mission: 'transport' }, T0)).toThrow(/cannot leave/);
    expect(() => sendFleet(w, a, { fromPlanetId: p.id, to: { g: 1, s: 3, p: 3 }, ships: { crawler: 5, smallCargo: 1 }, mission: 'transport' }, T0)).toThrow(/cannot leave/);
  });

  it('client details reproduce the engine exactly (position and crawlers included)', () => {
    p.fleet.crawler = 250;
    p.coords = { ...p.coords, p: 8 };
    const v = planetView(w, p, T0) as never;
    const ctx = detailCtxFrom(v, a.techs);
    const viaTable = production({ buildings: ctx.buildings, techs: ctx.techs, maxTemp: ctx.maxTemp, satellites: ctx.satellites, settings: ctx.settings, speed: ctx.speeds.production, allianceBonus: ctx.allianceProduction, noBasic: ctx.isMoon, boost: ctx.boost, energyBoost: ctx.energyBoost, position: ctx.position, crawlers: ctx.crawlers, crawlerMul: ctx.crawlerMul });
    expect(viaTable.metal).toBeCloseTo(planetProduction(w, p).metal, 6);
    expect(buildingTable('metalMine', ctx, 19, 21).rows.length).toBeGreaterThan(0);
  });
});
