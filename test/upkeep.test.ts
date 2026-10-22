import { describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { fleetUpkeep, planetProduction, updatePlanet } from '../server/economy';
import { createWorld } from '../server/world';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

function setup(cfg = {}) {
  const w = createWorld({ raidIntervalMin: 0, npcDensity: 0, economySpeed: 20, productionBoost: 1, ...cfg }, T0);
  const p = register(w, 'alice', 'secret1', T0).player;
  const planet = w.planets[p.planetIds[0]];
  planet.buildings = { metalMine: 10, crystalMine: 8, deuteriumSynthesizer: 6, solarPlant: 20 };
  planet.maxTemp = 40;
  return { w, planet };
}

describe('fleet upkeep', () => {
  it('an empty planet pays nothing, and satellites and crawlers are free', () => {
    const { w, planet } = setup();
    expect(fleetUpkeep(w, planet)).toBe(0);
    planet.fleet = { solarSatellite: 50, crawler: 10 };
    expect(fleetUpkeep(w, planet)).toBe(0);
  });

  it('is a share of the ships\' value in Deuterium per hour and comes off the net production', () => {
    const { w, planet } = setup();
    const before = planetProduction(w, planet).deuterium;
    planet.fleet = { lightFighter: 100 }; // 4,000 value each
    const upkeep = fleetUpkeep(w, planet);
    expect(upkeep).toBeCloseTo(400_000 * 0.0003 * (1 + 400_000 / 20_000_000));
    expect(planetProduction(w, planet).deuterium).toBeCloseTo(before - upkeep);
  });

  it('grows faster than the fleet does', () => {
    const { w, planet } = setup();
    planet.fleet = { battleship: 100 };
    const small = fleetUpkeep(w, planet);
    planet.fleet = { battleship: 1000 };
    expect(fleetUpkeep(w, planet) / small).toBeGreaterThan(10);
  });

  it('drains the stored Deuterium over time and never below zero', () => {
    const { w, planet } = setup();
    planet.buildings = { solarPlant: 5 };
    planet.fleet = { deathstar: 5 };
    planet.resources = { metal: 0, crystal: 0, deuterium: 10_000 };
    planet.updatedAt = T0;
    updatePlanet(w, planet, T0 + HOUR);
    expect(planet.resources.deuterium).toBe(0);
  });

  it('is switched off by a rate of 0, and computer empires pay nothing', () => {
    const { w, planet } = setup({ fleetUpkeep: 0 });
    planet.fleet = { deathstar: 5 };
    expect(fleetUpkeep(w, planet)).toBe(0);
    const on = setup();
    on.planet.fleet = { deathstar: 5 };
    expect(fleetUpkeep(on.w, on.planet)).toBeGreaterThan(0);
    on.w.players[on.planet.ownerId].npc = {} as never;
    expect(fleetUpkeep(on.w, on.planet)).toBe(0);
  });
});
