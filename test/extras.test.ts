import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { planetProduction, queueUnits, startBuilding, startResearch } from '../server/economy';
import { activeSlots, processMovements, sendFleet } from '../server/fleet';
import { buyItem, SHOP, shopView } from '../server/shop';
import * as SOC from '../server/social';
import { GameError, createWorld, type Planet, type Player, type World } from '../server/world';
import { ALLIANCE_UPGRADES } from '../shared/data';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
let w: World; let a: Player, b: Player; let home: Planet;
beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  a = register(w, 'alice', 'secret1', T0).player;
  b = register(w, 'bobby', 'secret2', T0).player;
  home = w.planets[a.planetIds[0]];
  home.buildings = { metalMine: 10, crystalMine: 8, deuteriumSynthesizer: 6, solarPlant: 20, metalStorage: 6, crystalStorage: 6, deuteriumTank: 6, roboticsFactory: 4, shipyard: 6, researchLab: 6 };
  home.resources = { metal: 1000, crystal: 1000, deuterium: 1000 };
});
afterEach(() => vi.restoreAllMocks());

describe('fleet presets on the server', () => {
  it('save, overwrite by name, validate and remove', () => {
    SOC.savePreset(a, 'Raid', { smallCargo: 5, bogus: 3, solarSatellite: 4, crawler: 2, cruiser: 0 });
    expect(a.presets).toHaveLength(1);
    expect(a.presets![0]).toMatchObject({ name: 'Raid', ships: { smallCargo: 5 } });
    SOC.savePreset(a, 'raid', { cruiser: 9 });
    expect(a.presets).toHaveLength(1);
    expect(a.presets![0].ships).toEqual({ cruiser: 9 });
    expect(() => SOC.savePreset(a, '', { cruiser: 1 })).toThrow(/name/);
    expect(() => SOC.savePreset(a, 'Empty', { cruiser: 0 })).toThrow(/at least one/);
    for (let i = 0; i < 11; i++) SOC.savePreset(a, 'p' + i, { cruiser: 1 });
    expect(() => SOC.savePreset(a, 'one more', { cruiser: 1 })).toThrow(/At most 12/);
    SOC.removePreset(a, a.presets![0].id);
    expect(a.presets).toHaveLength(11);
    expect(SOC.socialView(w, a, T0).presets).toHaveLength(11);
    expect(SOC.socialView(w, b, T0).presets).toEqual([]);
  });
});

describe('Joint Command (alliance fleet slots)', () => {
  it('adds a fleet slot per two levels for every member', () => {
    AL.createAlliance(w, a, 'TEAM', 'The Team');
    AL.joinAlliance(w, b, a.allianceId!);
    const base = activeSlots(w, b).max;
    const al = w.alliances[a.allianceId!];
    expect(ALLIANCE_UPGRADES.command.perLevel).toBe(0.5);
    al.upgrades.command = 1;
    expect(activeSlots(w, b).max).toBe(base);
    al.upgrades.command = 2;
    expect(activeSlots(w, b).max).toBe(base + 1);
    al.upgrades.command = 5;
    expect(activeSlots(w, a).max).toBe(base + 2);
    AL.leaveAlliance(w, b);
    expect(activeSlots(w, b).max).toBe(base);
  });
  it('can be bought from the bank', () => {
    AL.createAlliance(w, a, 'TEAM', 'The Team');
    const al = w.alliances[a.allianceId!];
    al.bank = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
    AL.buyUpgrade(w, a, 'command');
    expect(al.upgrades.command).toBe(1);
  });
});

describe('Command Credit shop', () => {
  it('delivers production crates, capped by free storage', () => {
    a.credits = 1000;
    const prod = planetProduction(w, home);
    const msg = buyItem(w, a, home, 'crate_small', T0);
    expect(a.credits).toBe(850);
    expect(msg).toMatch(/Delivered/);
    expect(home.resources.metal).toBeCloseTo(1000 + Math.floor(prod.metal * 4), -1);
    home.resources = { metal: 1e12, crystal: 1e12, deuterium: 1e12 };
    expect(() => buyItem(w, a, home, 'crate_large', T0)).toThrow(/storage is full/);
    expect(a.credits).toBe(850); // a failed purchase costs nothing
  });
  it('rushes construction and research by halving what is left', () => {
    a.credits = 1000;
    home.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
    startBuilding(w, a, home, 'metalMine', T0);
    const left = home.buildQueue!.end - T0;
    buyItem(w, a, home, 'build_rush', T0);
    expect(home.buildQueue!.end - T0).toBe(Math.ceil(left / 2));
    startResearch(w, a, home, 'energy', T0);
    const rl = a.research!.end - T0;
    buyItem(w, a, home, 'research_rush', T0);
    expect(a.research!.end - T0).toBe(Math.ceil(rl / 2));
    expect(a.credits).toBe(1000 - 250 - 350);
    expect(() => buyItem(w, a, home, 'build_rush', home.buildQueue!.end + 1)).toThrow(/Nothing is under construction/);
  });
  it('checks credits, item ids and ownership', () => {
    a.credits = 10;
    expect(() => buyItem(w, a, home, 'crate_small', T0)).toThrow(/Command Credits/);
    expect(() => buyItem(w, a, home, 'nope', T0)).toThrow(/Unknown item/);
    expect(() => buyItem(w, b, home, 'crate_small', T0)).toThrow(GameError);
    expect(shopView(a).items).toBe(SHOP);
    expect(shopView(a).credits).toBe(10);
  });
});

describe('Pathfinder', () => {
  const run = (ships: Record<string, number>, ...rolls: number[]) => {
    a.techs = { astrophysics: 4, combustionDrive: 6, impulseDrive: 5, energy: 3 };
    home.coords = { g: 1, s: 5, p: 6 };
    home.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
    home.fleet = { ...ships };
    w.movements = {};
    const m = sendFleet(w, a, { fromPlanetId: home.id, to: { g: 1, s: 5, p: w.config.positions + 1 }, ships, mission: 'expedition' }, T0);
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => rolls[Math.min(i++, rolls.length - 1)]);
    processMovements(w, m.arriveAt);
    vi.restoreAllMocks();
    return m;
  };
  it('is gated behind Astrophysics, Impulse Drive and a shipyard', () => {
    a.techs = { impulseDrive: 4 };
    home.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
    expect(() => queueUnits(w, a, home, 'pathfinder', 1, T0)).toThrow(/Requirements/);
    a.techs.astrophysics = 2;
    expect(() => queueUnits(w, a, home, 'pathfinder', 1, T0)).not.toThrow();
  });
  it('boosts finds by at least 10% per ship', () => {
    // rolls: outcome 0.4 = resources, 0.5 = not the credits find, 0.0 = metal
    const find = (n: number) => run({ largeCargo: 20, ...(n ? { pathfinder: n } : {}) }, 0.4, 0.5, 0.0, 0.5).cargo.metal;
    const base = find(0);
    expect(base).toBeGreaterThan(0);
    expect(find(1) / base).toBeGreaterThanOrEqual(1.09);
    expect(find(3) / base).toBeGreaterThanOrEqual(1.29);
    expect(find(5)).toBeGreaterThan(find(3));
  });
  it('steers the fleet around black holes with a chance of 20% per ship, at most 60%', () => {
    const gone = (ships: Record<string, number>, ...rolls: number[]) => { const m = run(ships, ...rolls); return !w.movements[m.id]; };
    expect(gone({ largeCargo: 5 }, 0.92, 0.5)).toBe(true); // no pathfinders: lost
    expect(gone({ largeCargo: 5, pathfinder: 1 }, 0.92, 0.1, 0.5, 0.5)).toBe(false); // 0.1 < 20%: steered clear
    expect(gone({ largeCargo: 5, pathfinder: 1 }, 0.92, 0.5, 0.5)).toBe(true); // 0.5 > 20%: not this time
    expect(gone({ largeCargo: 5, pathfinder: 9 }, 0.92, 0.59, 0.5, 0.5)).toBe(false); // the cap is 60%
    expect(gone({ largeCargo: 5, pathfinder: 9 }, 0.92, 0.61, 0.5)).toBe(true);
  });
});
