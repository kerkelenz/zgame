import { describe, expect, it } from 'vitest';
import { MAX_CHIPS, filterGroups, planetForKey, positionOf, useList, worldGroups, type World } from '../client/src/planetBar';

const w = (id: string, name: string, s: number, extra: Partial<World> = {}): World => ({ id, name, coords: { g: 1, s, p: 4 }, ...extra });
const worlds = [w('a', 'Homeworld', 5), w('am', 'Homeworld moon', 5, { isMoon: true, parentId: 'a' }), w('b', 'Mining colony', 11), w('c', 'Outpost', 40), w('orphan', 'Lost moon', 9, { isMoon: true, parentId: 'gone' })];

describe('the planet bar', () => {
  it('puts a moon inside its planet and drops a moon whose planet is missing', () => {
    const g = worldGroups(worlds);
    expect(g.map((x) => x.planet.id)).toEqual(['a', 'b', 'c']);
    expect(g[0].moon?.id).toBe('am');
    expect(g[1].moon).toBeNull();
  });
  it('shows chips for up to five planets and a list beyond that', () => {
    const many = Array.from({ length: MAX_CHIPS + 1 }, (_, i) => w(`p${i}`, `P${i}`, i + 1));
    expect(useList(worldGroups(many.slice(0, MAX_CHIPS)))).toBe(false);
    expect(useList(worldGroups(many))).toBe(true);
  });
  it('finds a planet by part of its name, its coordinates or its moon', () => {
    const g = worldGroups(worlds);
    expect(filterGroups(g, 'mining').map((x) => x.planet.id)).toEqual(['b']);
    expect(filterGroups(g, '[1:40:4]').map((x) => x.planet.id)).toEqual(['c']);
    expect(filterGroups(g, 'moon').map((x) => x.planet.id)).toEqual(['a']);
    expect(filterGroups(g, '  ')).toHaveLength(3);
    expect(filterGroups(g, 'zzz')).toEqual([]);
  });
  it('jumps to a planet with the number keys', () => {
    const g = worldGroups(worlds);
    expect(planetForKey(g, '1')?.id).toBe('a');
    expect(planetForKey(g, '3')?.id).toBe('c');
    expect(planetForKey(g, '4')).toBeNull();
    expect(planetForKey(g, '0')).toBeNull();
    expect(planetForKey(g, 'a')).toBeNull();
  });
  it('says where the selected planet is, counting a moon as its planet', () => {
    const g = worldGroups(worlds);
    expect(positionOf(g, 'b')).toEqual({ index: 1, total: 3 });
    expect(positionOf(g, 'am')).toEqual({ index: 0, total: 3 });
  });
});
