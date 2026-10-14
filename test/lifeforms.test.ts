import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { maxFields, planetCapacity, planetProduction, queueBuilding, queueResearch, queueUnits } from '../server/economy';
import { buyStructure, chooseLifeform, lifeformView } from '../server/lifeforms';
import { createWorld, type Planet, type Player, type World } from '../server/world';
import { LF_MAX_LEVEL, LF_SWITCH_COST, LIFEFORMS, LIFEFORM_IDS, lifeformEffects, timeMul } from '../shared/lifeforms';
import { levelCost, scaledCost } from '../shared/upgrades';

const T0 = 1_700_000_000_000;
let w: World; let alice: Player; let ap: Planet;
const rich = () => { ap.resources = { metal: 1e12, crystal: 1e12, deuterium: 1e12 }; ap.updatedAt = T0; };

beforeEach(() => {
  w = createWorld({ economySpeed: 20, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  ap = w.planets[alice.planetIds[0]];
  ap.buildings = { metalMine: 12, crystalMine: 10, deuteriumSynthesizer: 8, solarPlant: 20, researchLab: 6, shipyard: 6, roboticsFactory: 4, metalStorage: 3 };
  rich();
});

describe('the catalog', () => {
  it('has four peoples with five structures each, every structure with an effect', () => {
    expect(LIFEFORM_IDS).toHaveLength(4);
    for (const id of LIFEFORM_IDS) {
      expect(LIFEFORMS[id].structures).toHaveLength(5);
      expect(new Set(LIFEFORMS[id].structures.map((s) => s.id)).size).toBe(5);
    }
  });
  it('adds up the effects of the levels, and a time effect is never below a tenth', () => {
    const e = lifeformEffects({ id: 'rocktal', levels: { deepBore: 4, smelter: 2, rockVaults: 3 } });
    expect(e.metal).toBeCloseTo(0.12, 9);
    expect(e.crystal).toBeCloseTo(0.06, 9);
    expect(e.storage).toBeCloseTo(0.15, 9);
    expect(e.energy).toBe(0);
    expect(lifeformEffects(undefined).metal).toBe(0);
    expect(timeMul(5)).toBe(0.1);
    expect(timeMul(0.2)).toBeCloseTo(0.8, 9);
  });
});

describe('choosing a people', () => {
  it('is free the first time and says so in a message; nothing without a choice can be raised', () => {
    expect(() => buyStructure(w, alice, ap, 'residential', T0)).toThrow(/Choose a people/);
    const before = ap.resources.metal;
    expect(chooseLifeform(w, alice, ap, 'humans', T0)).toBe('humans');
    expect(ap.resources.metal).toBe(before);
    expect(w.messages.some((m) => m.to === alice.id && /Humans settle/.test(m.subject))).toBe(true);
    expect(() => chooseLifeform(w, alice, ap, 'humans', T0)).toThrow(/already live here/);
  });
  it('starting over with another people costs a lot and loses the structures', () => {
    chooseLifeform(w, alice, ap, 'humans', T0);
    buyStructure(w, alice, ap, 'warehouses', T0);
    const before = ap.resources.metal;
    chooseLifeform(w, alice, ap, 'mechas', T0);
    expect(before - ap.resources.metal).toBe(scaledCost(LF_SWITCH_COST, 20).metal);
    expect(ap.lifeform).toEqual({ id: 'mechas', levels: {} });
    ap.resources = { metal: 10, crystal: 10, deuterium: 10 };
    expect(() => chooseLifeform(w, alice, ap, 'kaelesh', T0)).toThrow(/Not enough/);
    expect(ap.lifeform!.id).toBe('mechas');
  });
  it('is for planets, not moons, and each planet has its own', () => {
    const moon = { ...ap, id: 'm1', isMoon: true, lifeform: undefined } as Planet;
    expect(() => chooseLifeform(w, alice, moon, 'humans', T0)).toThrow(/not moons/);
    expect(() => chooseLifeform(w, alice, ap, 'elves', T0)).toThrow(/Unknown/);
  });
});

describe('what the structures do on that planet', () => {
  it('Rock\'tal miners raise mine output and storage, and only here', () => {
    chooseLifeform(w, alice, ap, 'rocktal', T0);
    const metal = planetProduction(w, ap).metal, crystal = planetProduction(w, ap).crystal, cap = planetCapacity(w, ap).metal;
    for (let i = 0; i < 5; i++) { buyStructure(w, alice, ap, 'deepBore', T0); buyStructure(w, alice, ap, 'rockVaults', T0); }
    expect(planetProduction(w, ap).metal).toBeCloseTo(metal * 1.15, 3);
    expect(planetProduction(w, ap).crystal).toBeCloseTo(crystal, 3);          // untouched
    expect(planetCapacity(w, ap).metal).toBeCloseTo(cap * 1.25, 3);
    const other = w.planets[register(w, 'bobby', 'secret2', T0).player.planetIds[0]];
    expect(planetProduction(w, other).metal).toBeLessThan(metal);            // an ordinary planet has none of it
  });
  it('Humans add fields and energy; Mechas add fields too', () => {
    const fields = maxFields(ap);
    chooseLifeform(w, alice, ap, 'humans', T0);
    for (let i = 0; i < 3; i++) buyStructure(w, alice, ap, 'residential', T0);
    expect(maxFields(ap)).toBe(fields + 9);
    const eBefore = planetProduction(w, ap).energyProduced;
    for (let i = 0; i < 4; i++) buyStructure(w, alice, ap, 'solarGardens', T0);
    expect(planetProduction(w, ap).energyProduced).toBeGreaterThan(eBefore * 1.1);
    chooseLifeform(w, alice, ap, 'mechas', T0);
    buyStructure(w, alice, ap, 'droneHangars', T0); buyStructure(w, alice, ap, 'droneHangars', T0);
    expect(maxFields(ap)).toBe(fields + 4);
  });
  it('shorter building, ship and research times show in the jobs started on that planet', () => {
    alice.techs = { energy: 3, combustionDrive: 3 };
    ap.buildings.shipyard = 6;
    const plain = (() => {
      ap.buildQueue = null; ap.buildBacklog = []; rich();
      queueBuilding(w, alice, ap, 'metalMine', T0);
      const b = ap.buildQueue!.end - T0;
      ap.buildQueue = null; ap.buildBacklog = [];
      queueUnits(w, alice, ap, 'smallCargo', 1, T0);
      const s = ap.shipyardQueue.at(-1)!.unitMs;
      ap.shipyardQueue = [];
      return { b, s };
    })();
    chooseLifeform(w, alice, ap, 'mechas', T0);
    for (let i = 0; i < 6; i++) { buyStructure(w, alice, ap, 'fabricationBay', T0); buyStructure(w, alice, ap, 'assemblyLines', T0); }
    ap.buildQueue = null; ap.buildBacklog = []; rich();
    queueBuilding(w, alice, ap, 'metalMine', T0);
    expect(ap.buildQueue!.end - T0).toBeLessThan(plain.b * 0.9);              // 6 levels x 2% off
    queueUnits(w, alice, ap, 'smallCargo', 1, T0);
    expect(ap.shipyardQueue.at(-1)!.unitMs).toBeLessThan(plain.s * 0.85);    // 6 levels x 3% off
    chooseLifeform(w, alice, ap, 'kaelesh', T0);
    rich();
    const slow = (() => { alice.research = null; alice.researchBacklog = []; queueResearch(w, alice, ap, 'weapons', T0); const t = alice.research!.end - T0; alice.research = null; return t; })();
    for (let i = 0; i < 6; i++) buyStructure(w, alice, ap, 'dreamArchive', T0);
    rich();
    queueResearch(w, alice, ap, 'weapons', T0);
    expect(alice.research!.end - T0).toBeLessThan(slow * 0.85);               // 6 levels x 3% off
  });
  it('costs grow by level, the top level is a stop, and the view lists what is on offer', () => {
    chooseLifeform(w, alice, ap, 'kaelesh', T0);
    const st = LIFEFORMS.kaelesh.structures[0];
    for (let i = 0; i < LF_MAX_LEVEL; i++) buyStructure(w, alice, ap, st.id, T0);
    expect(() => buyStructure(w, alice, ap, st.id, T0)).toThrow(/highest level/);
    const v = lifeformView(w, ap);
    expect(v.current).toBe('kaelesh');
    expect(v.structures).toHaveLength(5);
    expect(v.structures[0].next).toBeNull();
    expect(v.structures[1].next!.cost.metal).toBe(levelCost(LIFEFORMS.kaelesh.structures[1], 1, 20).metal);
    expect(v.peoples).toHaveLength(4);
  });
});
