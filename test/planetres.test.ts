import { describe, expect, it } from 'vitest';
import { liveStock } from '../client/src/PlanetRes';

const w = (over: object = {}) => ({ updatedAt: 0, resources: { metal: 1000, crystal: 500, deuterium: 0 }, production: { metal: 3600, crystal: 0, deuterium: -3600 }, capacity: { metal: 5000, crystal: 800, deuterium: 800 }, ...over }) as never;

describe('a planet card shows live stock', () => {
  it('adds production for the time since the server counted, up to the storage', () => {
    expect(liveStock(w(), 3_600_000).metal).toBe(4600);
    expect(liveStock(w(), 7_200_000 * 5).metal).toBe(5000);
  });
  it('never goes below zero when a resource drains, and keeps an overfull store as it is', () => {
    expect(liveStock(w({ resources: { metal: 9000, crystal: 0, deuterium: 100 } }), 3_600_000)).toMatchObject({ metal: 9000, deuterium: 0 });
  });
});
