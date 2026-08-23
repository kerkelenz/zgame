import { describe, expect, it } from 'vitest';

import { canAfford, canQueue, cancelBuild, startBuild } from '../buildings';
import { buildTimeSeconds, buildingCost } from '../formulas';
import { buildProgress, completeFinishedBuilds } from '../queue';
import { HOUR, T0, makePlanet, withBuildings } from './helpers';

describe('canAfford', () => {
  it('requires every component, not just the total', () => {
    const cost = buildingCost('metalMine', 1); // 60 / 15 / 0
    expect(canAfford({ metal: 60, crystal: 15, deuterium: 0 }, cost)).toBe(true);
    expect(canAfford({ metal: 1000, crystal: 14, deuterium: 0 }, cost)).toBe(false);
    expect(canAfford({ metal: 59, crystal: 1000, deuterium: 0 }, cost)).toBe(false);
  });
});

describe('canQueue', () => {
  it('allows an affordable build on an idle planet', () => {
    const planet = makePlanet({ resources: { metal: 500, crystal: 500, deuterium: 0 } });
    expect(canQueue(planet, 'metalMine')).toEqual({ ok: true });
  });

  it('explains which resources are missing', () => {
    const planet = makePlanet({ resources: { metal: 10, crystal: 0, deuterium: 0 } });
    const check = canQueue(planet, 'metalMine');

    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toContain('50 metal');
      expect(check.reason).toContain('15 crystal');
    }
  });

  it('refuses while another building is under construction', () => {
    const busy = startBuild(
      makePlanet({ resources: { metal: 5000, crystal: 5000, deuterium: 0 } }),
      'metalMine',
      T0,
      1,
    );
    const check = canQueue(busy, 'crystalMine');

    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toContain('Metal Mine');
      expect(check.reason).toContain('under construction');
    }
  });
});

describe('startBuild', () => {
  const rich = makePlanet({ resources: { metal: 500, crystal: 500, deuterium: 0 } });

  it('deducts the exact cost of the next level', () => {
    const after = startBuild(rich, 'metalMine', T0, 1);
    expect(after.resources).toEqual({ metal: 500 - 60, crystal: 500 - 15, deuterium: 0 });
  });

  it('queues one item with the right target level and timestamps', () => {
    const after = startBuild(rich, 'metalMine', T0, 1);
    const seconds = buildTimeSeconds(buildingCost('metalMine', 1), 0, 1);

    expect(after.queue).toHaveLength(1);
    expect(after.queue[0]).toEqual({
      buildingId: 'metalMine',
      targetLevel: 1,
      startedAt: T0,
      finishesAt: T0 + seconds * 1000,
    });
  });

  it('does not change the building level yet - only the queue', () => {
    const after = startBuild(rich, 'metalMine', T0, 1);
    expect(after.buildings.metalMine).toBe(0);
  });

  it('builds faster with a robotics factory', () => {
    const base = withBuildings({}, { resources: { metal: 5000, crystal: 5000, deuterium: 0 } });
    const roboticised = withBuildings(
      { roboticsFactory: 3 },
      { resources: { metal: 5000, crystal: 5000, deuterium: 0 } },
    );

    const slow = startBuild(base, 'metalMine', T0, 1).queue[0];
    const fast = startBuild(roboticised, 'metalMine', T0, 1).queue[0];

    expect(fast.finishesAt - T0).toBeLessThan(slow.finishesAt - T0);
  });

  it('does not mutate the input planet', () => {
    const before = JSON.stringify(rich);
    startBuild(rich, 'metalMine', T0, 1);
    expect(JSON.stringify(rich)).toBe(before);
  });

  it('throws rather than silently failing when the queue is busy', () => {
    const busy = startBuild(rich, 'metalMine', T0, 1);
    expect(() => startBuild(busy, 'crystalMine', T0, 1)).toThrow(/already under construction/);
  });

  it('throws when the player cannot pay', () => {
    const broke = makePlanet({ resources: { metal: 0, crystal: 0, deuterium: 0 } });
    expect(() => startBuild(broke, 'metalMine', T0, 1)).toThrow(/Need/);
  });
});

describe('cancelBuild', () => {
  it('refunds the full cost and empties the queue', () => {
    const rich = makePlanet({ resources: { metal: 500, crystal: 500, deuterium: 0 } });
    const building = startBuild(rich, 'metalMine', T0, 1);
    const cancelled = cancelBuild(building, T0 + 1000);

    expect(cancelled.resources).toEqual(rich.resources);
    expect(cancelled.queue).toHaveLength(0);
    expect(cancelled.buildings.metalMine).toBe(0);
  });

  it('is a no-op on an idle planet', () => {
    const idle = makePlanet();
    expect(cancelBuild(idle, T0)).toBe(idle);
  });

  it('refuses to cancel a build that has already completed (that would be a double payout)', () => {
    const rich = makePlanet({ resources: { metal: 5000, crystal: 5000, deuterium: 5000 } });
    const building = startBuild(rich, 'roboticsFactory', T0, 1);
    const afterFinish = building.queue[0].finishesAt + 1;

    expect(() => cancelBuild(building, afterFinish)).toThrow(/already completed/);
  });
});

describe('completeFinishedBuilds', () => {
  it('does nothing while the build is still running', () => {
    const rich = makePlanet({ resources: { metal: 5000, crystal: 5000, deuterium: 5000 } });
    const building = startBuild(rich, 'roboticsFactory', T0, 1);
    const result = completeFinishedBuilds(building, T0 + 1000);

    // Same object reference: no re-render, no allocation.
    expect(result.planet).toBe(building);
    expect(result.completed).toEqual([]);
  });

  it('raises the level and clears the item once the time has passed', () => {
    const rich = makePlanet({ resources: { metal: 5000, crystal: 5000, deuterium: 0 } });
    const building = startBuild(rich, 'metalMine', T0, 1);
    const result = completeFinishedBuilds(building, building.queue[0].finishesAt);

    expect(result.planet.buildings.metalMine).toBe(1);
    expect(result.planet.queue).toHaveLength(0);
    expect(result.completed).toHaveLength(1);
    expect(result.completed[0].buildingId).toBe('metalMine');
  });

  it('resolves several overdue items in finish order', () => {
    // Hand-built queue: a real planet cannot have two items yet, but the queue
    // resolver is written for the day it can.
    const planet = withBuildings(
      { metalMine: 3 },
      {
        queue: [
          {
            buildingId: 'metalMine',
            targetLevel: 5,
            startedAt: T0 + HOUR,
            finishesAt: T0 + 2 * HOUR,
          },
          { buildingId: 'metalMine', targetLevel: 4, startedAt: T0, finishesAt: T0 + HOUR },
        ],
      },
    );

    const result = completeFinishedBuilds(planet, T0 + 3 * HOUR);

    expect(result.completed.map((i) => i.targetLevel)).toEqual([4, 5]);
    expect(result.planet.buildings.metalMine).toBe(5);
  });
});

describe('buildProgress', () => {
  const item = {
    buildingId: 'metalMine' as const,
    targetLevel: 4,
    startedAt: T0,
    finishesAt: T0 + HOUR,
  };

  it('runs from 0 to 1 across the build window', () => {
    expect(buildProgress(item, T0)).toBe(0);
    expect(buildProgress(item, T0 + HOUR / 4)).toBeCloseTo(0.25, 6);
    expect(buildProgress(item, T0 + HOUR / 2)).toBeCloseTo(0.5, 6);
    expect(buildProgress(item, T0 + HOUR)).toBe(1);
  });

  it('clamps outside the window instead of over- or under-shooting', () => {
    expect(buildProgress(item, T0 - HOUR)).toBe(0);
    expect(buildProgress(item, T0 + 10 * HOUR)).toBe(1);
  });

  it('reports a zero-length item as finished rather than dividing by zero', () => {
    expect(buildProgress({ ...item, finishesAt: T0 }, T0)).toBe(1);
  });
});
