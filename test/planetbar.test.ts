import { describe, expect, it } from 'vitest';
import { planetForKey, worldGroups, type World } from '../client/src/planetBar';

const w = (id: string, name: string, s: number, extra: Partial<World> = {}): World => ({ id, name, coords: { g: 1, s, p: 4 }, ...extra });
const worlds = [w('a', 'Homeworld', 5), w('am', 'Homeworld moon', 5, { isMoon: true, parentId: 'a' }), w('b', 'Mining colony', 11), w('c', 'Outpost', 40), w('orphan', 'Lost moon', 9, { isMoon: true, parentId: 'gone' })];

describe('the planet bar', () => {
  it('puts a moon inside its planet and drops a moon whose planet is missing', () => {
    const g = worldGroups(worlds);
    expect(g.map((x) => x.planet.id)).toEqual(['a', 'b', 'c']);
    expect(g[0].moon?.id).toBe('am');
    expect(g[1].moon).toBeNull();
  });
  it('keeps every planet as a card however many there are', () => {
    const many = Array.from({ length: 12 }, (_, i) => w(`p${i}`, `P${i}`, i + 1));
    expect(worldGroups(many)).toHaveLength(12);
  });
  it('jumps to a planet with the number keys', () => {
    const g = worldGroups(worlds);
    expect(planetForKey(g, '1')?.id).toBe('a');
    expect(planetForKey(g, '3')?.id).toBe('c');
    expect(planetForKey(g, '4')).toBeNull();
    expect(planetForKey(g, '0')).toBeNull();
    expect(planetForKey(g, 'a')).toBeNull();
  });
});
