import { describe, expect, it } from 'vitest';

import { BASE_PRODUCTION_PER_HOUR } from '../constants';
import { metalProductionPerHour } from '../formulas';
import { createNewGame } from '../newGame';
import { tick } from '../tick';
import { HOUR, T0, withBuildings } from './helpers';
import type { GameState, Planet } from '../types';

/** Wrap a planet in a minimal one-planet game state starting at `T0`. */
function gameWith(planet: Planet, speed = 1): GameState {
  return {
    version: 1,
    createdAt: T0,
    lastTick: T0,
    speed,
    planets: [planet],
    homePlanetId: planet.id,
  };
}

describe('tick', () => {
  it('advances lastTick to now', () => {
    const state = gameWith(withBuildings({}));
    const result = tick(state, T0 + HOUR);
    expect(result.state.lastTick).toBe(T0 + HOUR);
  });

  it('does not mutate the state it was given', () => {
    const state = gameWith(withBuildings({ metalMine: 3, solarPlant: 10 }));
    const before = JSON.stringify(state);
    tick(state, T0 + 5 * HOUR);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('credits offline production for the whole absence', () => {
    // This is the entire mechanism behind offline progress: no background
    // process, just (now - lastTick) multiplied by the rate.
    const state = gameWith(withBuildings({}));
    const result = tick(state, T0 + 10 * HOUR);

    expect(result.state.planets[0].resources.metal).toBeCloseTo(
      BASE_PRODUCTION_PER_HOUR.metal * 10,
      6,
    );
  });

  it('refuses to pay twice if the device clock jumps backwards', () => {
    const state = gameWith(withBuildings({}));
    const forward = tick(state, T0 + 5 * HOUR).state;
    const backward = tick(forward, T0 + HOUR).state;

    // No extra resources handed out, and lastTick holds its high-water mark.
    expect(backward.planets[0].resources.metal).toBeCloseTo(forward.planets[0].resources.metal, 6);
    expect(backward.lastTick).toBe(T0 + 5 * HOUR);
  });

  // -------------------------------------------------------------------------
  // The important one: piecewise integration across a completion.
  // -------------------------------------------------------------------------
  describe('splitting the window at a build completion', () => {
    // A level 3 metal mine upgrading to level 4, finishing exactly halfway
    // through a two-hour window. Solar plant is deliberately oversized so the
    // energy factor is 1 and cannot muddy the arithmetic.
    const planet = withBuildings(
      { metalMine: 3, solarPlant: 20 },
      {
        queue: [
          {
            buildingId: 'metalMine',
            targetLevel: 4,
            startedAt: T0 - HOUR,
            finishesAt: T0 + HOUR,
          },
        ],
      },
    );

    const trickle = BASE_PRODUCTION_PER_HOUR.metal;
    const oldRate = trickle + metalProductionPerHour(3, 1); // ~149.8/h
    const newRate = trickle + metalProductionPerHour(4, 1); // ~205.7/h

    it('produces one hour at the old rate and one at the new rate', () => {
      const result = tick(gameWith(planet), T0 + 2 * HOUR);
      const metal = result.state.planets[0].resources.metal;

      expect(metal).toBeCloseTo(oldRate + newRate, 6);
    });

    it('is not the naive "complete first, then produce" answer', () => {
      const result = tick(gameWith(planet), T0 + 2 * HOUR);
      const metal = result.state.planets[0].resources.metal;

      // Would over-pay: two hours at the level 4 rate.
      expect(metal).not.toBeCloseTo(2 * newRate, 3);
      expect(metal).toBeLessThan(2 * newRate);
    });

    it('is not the naive "produce first, then complete" answer', () => {
      const result = tick(gameWith(planet), T0 + 2 * HOUR);
      const metal = result.state.planets[0].resources.metal;

      // Would under-pay: two hours at the level 3 rate.
      expect(metal).not.toBeCloseTo(2 * oldRate, 3);
      expect(metal).toBeGreaterThan(2 * oldRate);
    });

    it('applies the level increase and empties the queue', () => {
      const result = tick(gameWith(planet), T0 + 2 * HOUR);
      expect(result.state.planets[0].buildings.metalMine).toBe(4);
      expect(result.state.planets[0].queue).toHaveLength(0);
    });

    it('reports what completed, and where', () => {
      const result = tick(gameWith(planet), T0 + 2 * HOUR);
      expect(result.completed).toHaveLength(1);
      expect(result.completed[0].planetId).toBe(planet.id);
      expect(result.completed[0].item.targetLevel).toBe(4);
    });

    it('leaves the build alone when the window ends before it finishes', () => {
      const result = tick(gameWith(planet), T0 + 30 * 60_000); // +30 min
      expect(result.state.planets[0].buildings.metalMine).toBe(3);
      expect(result.state.planets[0].queue).toHaveLength(1);
      expect(result.state.planets[0].resources.metal).toBeCloseTo(oldRate * 0.5, 6);
    });

    it('handles a build that finishes exactly at `now`', () => {
      const result = tick(gameWith(planet), T0 + HOUR);
      expect(result.state.planets[0].buildings.metalMine).toBe(4);
      // The whole window was at the old rate; the new level starts earning now.
      expect(result.state.planets[0].resources.metal).toBeCloseTo(oldRate, 6);
    });
  });

  it('splits at every completion when several land in one window', () => {
    const planet = withBuildings(
      { metalMine: 3, solarPlant: 20 },
      {
        queue: [
          { buildingId: 'metalMine', targetLevel: 4, startedAt: T0, finishesAt: T0 + HOUR },
          {
            buildingId: 'metalMine',
            targetLevel: 5,
            startedAt: T0 + HOUR,
            finishesAt: T0 + 2 * HOUR,
          },
        ],
      },
    );

    const rate = (level: number) =>
      BASE_PRODUCTION_PER_HOUR.metal + metalProductionPerHour(level, 1);
    const result = tick(gameWith(planet), T0 + 3 * HOUR);

    expect(result.state.planets[0].buildings.metalMine).toBe(5);
    expect(result.state.planets[0].resources.metal).toBeCloseTo(rate(3) + rate(4) + rate(5), 6);
    expect(result.completed.map((c) => c.item.targetLevel)).toEqual([4, 5]);
  });
});

describe('createNewGame', () => {
  it('starts with 500 metal, 500 crystal, 0 deuterium and no buildings', () => {
    const state = createNewGame(T0);
    const home = state.planets[0];

    expect(home.resources).toEqual({ metal: 500, crystal: 500, deuterium: 0 });
    expect(Object.values(home.buildings).every((level) => level === 0)).toBe(true);
    expect(home.queue).toEqual([]);
    expect(state.speed).toBe(1);
  });

  it('places the Homeworld at 1:42:8', () => {
    const home = createNewGame(T0).planets[0];
    expect(home.name).toBe('Homeworld');
    expect(home.coords).toEqual({ galaxy: 1, system: 42, position: 8 });
    expect(home.diameter).toBe(12800);
    expect(home.temperature).toEqual({ min: -10, max: 30 });
  });

  it('points homePlanetId at a planet that exists', () => {
    const state = createNewGame(T0);
    expect(state.planets.find((p) => p.id === state.homePlanetId)).toBeDefined();
  });

  it('sets lastTick to now, so the first tick credits nothing', () => {
    const state = createNewGame(T0);
    expect(state.lastTick).toBe(T0);

    const immediate = tick(state, T0);
    expect(immediate.state.planets[0].resources).toEqual({
      metal: 500,
      crystal: 500,
      deuterium: 0,
    });
  });

  it('is deterministic for a given seed', () => {
    expect(createNewGame(T0, 12345)).toEqual(createNewGame(T0, 12345));
    expect(createNewGame(T0, 12345).planets[0].id).not.toBe(createNewGame(T0, 999).planets[0].id);
  });
});
