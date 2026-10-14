import { describe, expect, it } from 'vitest';
import { decodeRoute, encodeRoute, sameRoute } from '../client/src/route';

describe('routes', () => {
  it('round-trips every kind of place', () => {
    for (const r of [{ page: 'buildings' }, { page: 'detail', item: 'metalMine' }, { page: 'profile', player: 'abc-123' }, { page: 'galaxy', galaxy: { g: 1, s: 34 } }, { page: 'galaxy' }]) {
      expect(decodeRoute(encodeRoute(r))).toEqual(r);
    }
  });
  it('falls back to the overview for an empty or half-written address', () => {
    expect(decodeRoute('')).toEqual({ page: 'overview' });
    expect(decodeRoute('#/')).toEqual({ page: 'overview' });
    expect(decodeRoute('#/item')).toEqual({ page: 'overview' });
    expect(decodeRoute('#/player/')).toEqual({ page: 'overview' });
  });
  it('treats a galaxy address without numbers as the plain galaxy page and survives bad escapes', () => {
    expect(decodeRoute('#/galaxy/x/y')).toEqual({ page: 'galaxy' });
    expect(decodeRoute('#/item/%E0%A4%A')).toEqual({ page: 'detail', item: '%E0%A4%A' });
  });
  it('compares routes by address', () => {
    expect(sameRoute({ page: 'fleet' }, decodeRoute('#/fleet'))).toBe(true);
    expect(sameRoute({ page: 'fleet' }, { page: 'galaxy' })).toBe(false);
  });
});
