import { describe, expect, it } from 'vitest';
import { artItems, ART_STYLE } from '../shared/artlist';
import { BUILDING_IDS, DEFENSE_IDS, SHIP_IDS, TECH_IDS } from '../shared/data';

describe('art list', () => {
  const items = artItems();
  it('covers every building, tech, ship, defense and resource exactly once', () => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...BUILDING_IDS, ...TECH_IDS, ...SHIP_IDS, ...DEFENSE_IDS]) expect(ids).toContain(id);
    for (const r of ['metal', 'crystal', 'deuterium', 'energy']) expect(ids).toContain('res-' + r);
  });
  it('gives every item a prompt with the shared style and no internal key names', () => {
    for (const i of items) {
      expect(i.prompt).toContain(ART_STYLE);
      expect(i.prompt).toContain(i.name);
      expect(i.prompt).not.toMatch(/deuterium/i);
    }
  });
});
