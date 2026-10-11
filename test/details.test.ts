import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { planetCapacity, planetProduction, queueUnits, startBuilding, startResearch } from '../server/economy';
import { jumpCooldownMs } from '../server/fleet';
import { maxPlanets } from '../server/galaxy';
import { planetView } from '../server/views';
import { createWorld, type Planet, type Player, type World } from '../server/world';
import { ECONOMY_BUILDINGS, bestUpgrade, empireTotals, planetEconomy, projectStock, resValue, upgradeOptions } from '../shared/analysis';
import { BUILDINGS, TECHS, UNITS } from '../shared/data';
import {
  buildingTable, detailCtxFrom, hasEffects, jumpCooldownSeconds, kindOf, nameOf, prodInput, requirementStatus, requirementsOf, techTable, unitDetails, unlocksOf, type DetailCtx,
} from '../shared/effects';
import { production, shipSpeed } from '../shared/formulas';

const T0 = 1_700_000_000_000;
let w: World;
let alice: Player;
let ap: Planet;

const ctx = (): DetailCtx => detailCtxFrom(planetView(w, ap, T0) as never, alice.techs);

beforeEach(() => {
  w = createWorld({ raidIntervalMin: 0, npcDensity: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  ap = w.planets[alice.planetIds[0]];
  ap.coords = { g: 1, s: 5, p: 6 };
  ap.maxTemp = 30;
  ap.buildings = { metalMine: 12, crystalMine: 10, deuteriumSynthesizer: 8, solarPlant: 14, fusionReactor: 4, roboticsFactory: 4, shipyard: 6, researchLab: 9, naniteFactory: 1, metalStorage: 2, missileSilo: 3 };
  ap.fleet = { solarSatellite: 12 };
  ap.settings = { crystalMine: 0.8 };
  ap.resources = { metal: 5e9, crystal: 5e9, deuterium: 5e9 };
  alice.techs = { energy: 8, plasma: 3, weapons: 4, shielding: 2, armour: 3, combustionDrive: 5, impulseDrive: 4, hyperspaceDrive: 2, computer: 3, astrophysics: 4, laser: 10, ion: 5, hyperspace: 5, espionage: 4 };
  // every multiplier at once: officers, a faction, an alliance upgrade
  alice.officers = { quartermaster: 2, engineer: 2 };
  alice.faction = 'solar';
  const a = AL.createAlliance(w, alice, 'DET', 'Detail Co');
  a.upgrades = { production: 2, research: 3, logistics: 0 };
});

describe('the context mirrors the server', () => {
  it('reproduces planet production exactly, with every bonus active', () => {
    const v = planetView(w, ap, T0);
    const p = production(prodInput(ctx()));
    expect(p.metal).toBeCloseTo(v.production.metal, 6);
    expect(p.crystal).toBeCloseTo(v.production.crystal, 6);
    expect(p.deuterium).toBeCloseTo(v.production.deuterium, 6);
    expect(p.energyProduced).toBe(v.production.energyProduced);
    expect(p.efficiency).toBeCloseTo(v.production.efficiency, 9);
  });

  it('the breakdown adds up: basic + mines, raw + plasma + boosts - shortage, and the energy sources', () => {
    const p = production(prodInput(ctx()));
    const d = p.detail;
    expect(d.basic.metal + d.mine.metal.total).toBeCloseTo(p.metal, 6);
    expect(d.basic.crystal + d.mine.crystal.total).toBeCloseTo(p.crystal, 6);
    expect(d.mine.deuterium.total - p.fusionDeutUse).toBeCloseTo(p.deuterium, 6);
    for (const m of [d.mine.metal, d.mine.crystal, d.mine.deuterium]) {
      expect(m.raw + m.plasma + m.boosts).toBeCloseTo(m.potential, 6);
      expect(m.potential - m.lostToEnergy).toBeCloseTo(m.total, 6);
      expect(m.plasma).toBeGreaterThan(0); // plasma 3
      expect(m.boosts).toBeGreaterThan(0); // officer + faction + alliance
    }
    expect(d.energy.solar + d.energy.fusion + d.energy.satellites + d.energy.boosts).toBeCloseTo(p.energyProduced, 6);
    expect(d.energy.usedMetal + d.energy.usedCrystal + d.energy.usedDeuterium).toBeCloseTo(p.energyUsed, 6);
  });
});

describe('building tables match what the engine charges and builds', () => {
  for (const id of ['metalMine', 'fusionReactor', 'roboticsFactory', 'shipyard', 'missileSilo', 'metalStorage'] as const) {
    it(`${id}: next-level cost and duration equal the real queue entry`, () => {
      const level = (ap.buildings[id] || 0) + 1;
      const row = buildingTable(id, ctx(), level, level).rows[0];
      startBuilding(w, alice, ap, id, T0);
      expect(ap.buildQueue!.cost).toEqual(row.cost);
      expect((ap.buildQueue!.end - ap.buildQueue!.start) / 1000).toBe(row.seconds);
    });
  }

  it('mine rows predict the planet\'s production after the upgrade is built', () => {
    for (const id of ['metalMine', 'crystalMine', 'deuteriumSynthesizer'] as const) {
      const before = ap.buildings[id]!;
      const row = buildingTable(id, ctx(), before + 3, before + 3).rows[0];
      ap.buildings[id] = before + 3;
      const real = planetProduction(w, ap);
      const res = id === 'metalMine' ? 'metal' : id === 'crystalMine' ? 'crystal' : 'deuterium';
      expect(row.v.net).toBeCloseTo(real[res], 6);
      expect(row.v.eff).toBeCloseTo(real.efficiency, 9);
      ap.buildings[id] = before;
    }
  });

  it('energy buildings predict planet energy; storage predicts real capacity; fields and cooldowns follow the rules', () => {
    ap.buildings.solarPlant = 20;
    const solar = buildingTable('solarPlant', { ...ctx(), buildings: { ...ap.buildings, solarPlant: 14 } }, 20, 20).rows[0];
    expect(solar.v.total).toBe(planetProduction(w, ap).energyProduced);
    ap.buildings.solarPlant = 14;
    ap.buildings.metalStorage = 6;
    expect(buildingTable('metalStorage', ctx(), 6, 6).rows[0].v.cap).toBe(planetCapacity(w, ap).metal);
    expect(buildingTable('terraformer', ctx(), 3, 3).rows[0].v.fields).toBe(15);
    expect(buildingTable('missileSilo', ctx(), 4, 4).rows[0].v).toEqual({ slots: 40, range: 19 });
    expect(buildingTable('sensorPhalanx', ctx(), 3, 3).rows[0].v.range).toBe(8);
    expect(buildingTable('jumpGate', ctx(), 2, 2).rows[0].v.cooldown * 1000).toBe(jumpCooldownMs(w, 2));
    expect(jumpCooldownSeconds(1, 1)).toBe(3600);
  });

  it('every building gets cost and time rows that grow with level; most have effect columns', () => {
    for (const id of Object.keys(BUILDINGS) as (keyof typeof BUILDINGS)[]) {
      const t = buildingTable(id, ctx(), 1, 6);
      expect(t.rows).toHaveLength(6);
      expect(t.rows[5].cost.metal + t.rows[5].cost.crystal + t.rows[5].cost.deuterium).toBeGreaterThan(t.rows[0].cost.metal + t.rows[0].cost.crystal + t.rows[0].cost.deuterium);
      expect(hasEffects(id), id + ' should describe its effect').toBe(true);
      for (const row of t.rows) for (const c of t.columns) expect(row.v[c.key], `${id}.${c.key}`).toBeDefined();
    }
  });
});

describe('research tables', () => {
  for (const id of ['energy', 'weapons', 'plasma', 'astrophysics'] as const) {
    it(`${id}: next-level cost and duration equal the real research job`, () => {
      const level = (alice.techs[id] || 0) + 1;
      const row = techTable(id, ctx(), level, level).rows[0];
      startResearch(w, alice, ap, id, T0);
      expect(alice.research!.cost).toEqual(row.cost);
      expect((alice.research!.end - alice.research!.start) / 1000).toBe(row.seconds);
      alice.research = null;
    });
  }

  it('drive rows give the same ship speeds the fleet code uses', () => {
    const t = techTable('impulseDrive', ctx(), 7, 7).rows[0];
    expect(t.v.cruiser).toBe(shipSpeed('cruiser', { ...alice.techs, impulseDrive: 7 }));
    expect(t.v.bonus).toBeCloseTo(1.4, 9);
  });

  it('astrophysics and computer rows match the real limits', () => {
    alice.techs.astrophysics = 7;
    expect(techTable('astrophysics', ctx(), 7, 7).rows[0].v.colonies).toBe(maxPlanets(alice));
    expect(techTable('computer', ctx(), 5, 5).rows[0].v.slots).toBe(6);
  });

  it('plasma rows reproduce this planet\'s production with that level researched', () => {
    const row = techTable('plasma', ctx(), 8, 8).rows[0];
    alice.techs.plasma = 8;
    expect(row.v.metal).toBeCloseTo(planetProduction(w, ap).metal, 6);
    expect(row.v.m).toBeCloseTo(0.08, 9);
  });

  it('graviton needs triple the energy each level and every tech has rows', () => {
    const g = techTable('graviton', ctx(), 1, 3).rows.map((r) => r.v.energy);
    expect(g).toEqual([300_000, 900_000, 2_700_000]);
    for (const id of Object.keys(TECHS) as (keyof typeof TECHS)[]) {
      expect(techTable(id, ctx(), 1, 4).rows).toHaveLength(4);
      expect(hasEffects(id) || ['laser', 'ion', 'hyperspace'].includes(id), id + ' should describe its effect').toBe(true);
    }
  });
});

describe('requirements and unlocks', () => {
  it('finds what a building or tech unlocks, sorted by level', () => {
    const y = unlocksOf('shipyard');
    expect(y.find((u) => u.id === 'smallCargo')?.level).toBe(2);
    expect(y.find((u) => u.id === 'deathstar')?.level).toBe(12);
    expect(y.map((u) => u.level)).toEqual([...y.map((u) => u.level)].sort((a, b) => a - b));
    expect(unlocksOf('graviton').map((u) => u.id)).toContain('deathstar');
    expect(unlocksOf('researchLab').some((u) => u.kind === 'tech')).toBe(true);
    expect(unlocksOf('plasma').find((u) => u.id === 'bomber')?.also.length).toBeGreaterThan(0);
  });

  it('reports which requirements you meet', () => {
    const st = requirementStatus(requirementsOf('bomber'), ctx());
    expect(st.map((s) => s.id).sort()).toEqual(['impulseDrive', 'plasma', 'shipyard']);
    expect(st.find((s) => s.id === 'shipyard')).toMatchObject({ have: 6, level: 8, met: false });
    expect(st.find((s) => s.id === 'impulseDrive')?.met).toBe(false); // 4 < 6
    expect(requirementStatus(requirementsOf('metalMine'), ctx())).toEqual([]);
  });

  it('names and kinds resolve for every id', () => {
    expect(kindOf('metalMine')).toBe('building');
    expect(kindOf('energy')).toBe('tech');
    expect(kindOf('cruiser')).toBe('ship');
    expect(kindOf('plasmaTurret')).toBe('defense');
    expect(nameOf('cruiser')).toBe('Cruiser');
    expect(kindOf('nonsense')).toBeNull();
  });
});

describe('unit details', () => {
  it('applies the owner\'s tech to attack, shield, hull and speed', () => {
    const d = unitDetails('cruiser', ctx());
    expect(d.effective.attack).toBeCloseTo(UNITS.cruiser.attack * 1.4, 9); // weapons 4
    expect(d.effective.shield).toBeCloseTo(UNITS.cruiser.shield * 1.2, 9); // shielding 2
    expect(d.effective.hull).toBeCloseTo(UNITS.cruiser.hull * 1.3, 9); // armour 3
    expect(d.effective.speed).toBe(shipSpeed('cruiser', alice.techs));
    expect(d.base.attack).toBe(UNITS.cruiser.attack);
  });

  it('lists rapid fire both ways', () => {
    const d = unitDetails('lightFighter', ctx());
    expect(d.rapidFireFrom.find((r) => r.id === 'cruiser')?.value).toBe(6);
    expect(unitDetails('cruiser', ctx()).rapidFireAgainst.find((r) => r.id === 'rocketLauncher')?.value).toBe(10);
    expect(unitDetails('espionageProbe', ctx()).rapidFireFrom.length).toBeGreaterThan(5);
  });

  it('tech rows grow 10% per level and speed follows the drive', () => {
    const d = unitDetails('battleship', ctx());
    expect(d.techRows[5].attack).toBeCloseTo(UNITS.battleship.attack * 1.5, 9);
    expect(d.techRows[10].hull).toBeCloseTo(UNITS.battleship.hull * 2, 9);
    expect(d.techRows[4].speed).toBe(shipSpeed('battleship', { ...alice.techs, hyperspaceDrive: 4 }));
    expect(d.drive).toBe('hyperspaceDrive');
    expect(unitDetails('rocketLauncher', ctx()).drive).toBeNull();
  });

  it('build time equals the real shipyard queue entry', () => {
    ap.buildings.shipyard = 8;
    const d = unitDetails('lightFighter', ctx());
    queueUnits(w, alice, ap, 'lightFighter', 5, T0);
    expect(ap.shipyardQueue[0].unitMs / 1000).toBeCloseTo(d.seconds, 9);
  });
});

describe('economy analysis', () => {
  const stockOf = (r = ap.resources) => ({ ...r });
  const capOf = () => planetCapacity(w, ap);

  it('computes hourly and daily income, and the energy picture', () => {
    const eco = planetEconomy(ctx(), stockOf(), capOf());
    const real = planetProduction(w, ap);
    expect(eco.rates.metal).toBeCloseTo(real.metal, 6);
    expect(eco.perDay.crystal).toBeCloseTo(real.crystal * 24, 4);
    expect(eco.energy.balance).toBe(real.energyProduced - real.energyUsed);
    expect(eco.energy.efficiency).toBeCloseTo(real.efficiency, 9);
  });

  it('shows how much output an energy shortage costs, and none when powered', () => {
    expect(planetEconomy(ctx(), stockOf(), capOf()).lostToEnergy.value).toBeCloseTo(0, 6);
    ap.buildings.solarPlant = 3; ap.buildings.fusionReactor = 0; ap.fleet = {};
    const short = planetEconomy(ctx(), stockOf(), capOf());
    expect(short.energy.efficiency).toBeLessThan(1);
    expect(short.lostToEnergy.metal).toBeGreaterThan(0);
    const real = production(prodInput({ ...ctx(), buildings: { ...ap.buildings, solarPlant: 60 } }));
    expect(real.efficiency).toBe(1);
    // what the shortage cost equals the gain from fixing it
    expect(real.metal - short.rates.metal).toBeCloseTo(short.lostToEnergy.metal, 4);
  });

  it('estimates when each store fills, and when a draining one runs dry', () => {
    ap.resources = { metal: 0, crystal: 0, deuterium: 1000 };
    const eco = planetEconomy(ctx(), ap.resources, capOf());
    expect(eco.fullIn.metal).toBeCloseTo((capOf().metal / eco.rates.metal) * 3600, 3);
    expect(planetEconomy(ctx(), { ...capOf() }, capOf()).fullIn.metal).toBe(0);
    ap.buildings.deuteriumSynthesizer = 0; ap.buildings.fusionReactor = 8; // burns deuterium, makes none
    const drain = planetEconomy(ctx(), { metal: 0, crystal: 0, deuterium: 5000 }, capOf());
    expect(drain.rates.deuterium).toBeLessThan(0);
    expect(drain.emptyIn.deuterium).toBeCloseTo((5000 / -drain.rates.deuterium) * 3600, 3);
    expect(drain.fullIn.deuterium).toBeNull();
  });

  it('projects stock with storage and zero floors', () => {
    const cap = { metal: 1000, crystal: 1000, deuterium: 1000 };
    const out = projectStock({ metal: 900, crystal: 100, deuterium: 50 }, { metal: 100, crystal: 10, deuterium: -20 }, cap, 5);
    expect(out).toEqual({ metal: 1000, crystal: 150, deuterium: 0 });
    expect(projectStock({ metal: 2000, crystal: 0, deuterium: 0 }, { metal: 50, crystal: 0, deuterium: 0 }, cap, 3).metal).toBe(2000); // over-full stays
  });

  it('upgrade options predict the real production change and rank by payback', () => {
    const opts = upgradeOptions(ctx(), stockOf());
    expect(opts.map((o) => o.id).sort()).toEqual([...ECONOMY_BUILDINGS].sort());
    for (const o of opts) {
      const before = planetProduction(w, ap);
      const lvl = ap.buildings[o.id] || 0;
      ap.buildings[o.id] = lvl + 1;
      const after = planetProduction(w, ap);
      ap.buildings[o.id] = lvl;
      expect(o.delta.metal).toBeCloseTo(after.metal - before.metal, 6);
      expect(o.delta.deuterium).toBeCloseTo(after.deuterium - before.deuterium, 6);
      expect(o.delta.energy).toBeCloseTo(after.energyProduced - before.energyProduced, 6);
      expect(o.costValue).toBeCloseTo(resValue(o.cost), 6);
      if (o.paybackHours != null) expect(o.paybackHours).toBeCloseTo(o.costValue / o.deltaValue, 6);
    }
    const best = bestUpgrade(opts)!;
    const paybacks = opts.filter((o) => o.available && o.paybackHours != null).map((o) => o.paybackHours!);
    expect(best.paybackHours).toBe(Math.min(...paybacks));
  });

  it('when energy is short, power beats more mines', () => {
    ap.buildings = { metalMine: 20, crystalMine: 18, deuteriumSynthesizer: 14, solarPlant: 4, roboticsFactory: 3 };
    ap.fleet = {};
    const opts = upgradeOptions(ctx(), stockOf());
    expect(planetEconomy(ctx(), stockOf(), capOf()).energy.efficiency).toBeLessThan(0.3);
    expect(bestUpgrade(opts)!.id).toBe('solarPlant');
    expect(opts.find((o) => o.id === 'metalMine')!.efficiencyAfter).toBeLessThan(planetEconomy(ctx(), stockOf(), capOf()).energy.efficiency);
  });

  it('flags upgrades whose requirements are missing and how long you must save', () => {
    ap.buildings.fusionReactor = 0; ap.buildings.deuteriumSynthesizer = 2;
    expect(upgradeOptions(ctx(), stockOf()).find((o) => o.id === 'fusionReactor')!.available).toBe(false);
    ap.buildings = { ...ap.buildings, deuteriumSynthesizer: 8 };
    const poor = upgradeOptions(ctx(), { metal: 0, crystal: 0, deuterium: 0 });
    expect(poor.find((o) => o.id === 'metalMine')!.waitSeconds).toBeGreaterThan(0);
    expect(upgradeOptions(ctx(), { metal: 1e12, crystal: 1e12, deuterium: 1e12 }).every((o) => o.waitSeconds === 0)).toBe(true);
  });

  it('empire totals add planets together', () => {
    const e1 = planetEconomy(ctx(), stockOf(), capOf());
    const t = empireTotals([{ economy: e1, stock: { metal: 10, crystal: 20, deuterium: 30 }, capacity: { metal: 100, crystal: 100, deuterium: 100 } }, { economy: e1, stock: { metal: 1, crystal: 2, deuterium: 3 }, capacity: { metal: 100, crystal: 100, deuterium: 100 } }]);
    expect(t.perHour.metal).toBeCloseTo(e1.rates.metal * 2, 6);
    expect(t.stock).toEqual({ metal: 11, crystal: 22, deuterium: 33 });
    expect(t.value.perDay).toBeCloseTo(t.value.perHour * 24, 4);
  });
});
