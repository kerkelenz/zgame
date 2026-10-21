import { describe, expect, it } from 'vitest';
import { CHORDS, cycleId, isTypingTarget, itemEntries, pageEntries, parseCoord, rankEntries } from '../client/src/palette';
import { NAV_GROUPS } from '../client/src/nav';

describe('palette', () => {
  it('ranks names that start with the text first and finds items by any word', () => {
    const all = [...pageEntries(), ...itemEntries()];
    expect(rankEntries(all, 'metal')[0].label).toBe('Metal Mine');
    expect(rankEntries(all, 'metal').map((e) => e.label)).toContain('Metal Storage');
    expect(rankEntries(all, 'mine').map((e) => e.label)).toEqual(expect.arrayContaining(['Metal Mine', 'Crystal Mine']));
    expect(rankEntries(all, 'deuterium').length).toBeGreaterThan(0);
    expect(rankEntries(all, '')).toEqual([]);
    expect(rankEntries(all, 'zzzzqq')).toEqual([]);
  });
  it('lists every menu page and hides the admin page from others', () => {
    expect(pageEntries().map((e) => e.id)).not.toContain('admin');
    expect(pageEntries(true).map((e) => e.id)).toContain('admin');
    for (const g of NAV_GROUPS) for (const i of g.items.filter((x) => !x.admin)) expect(pageEntries().map((e) => e.id)).toContain(i.id);
  });
  it('reads coordinates in the usual spellings', () => {
    expect(parseCoord('1:34:7')).toEqual({ g: 1, s: 34, p: 7 });
    expect(parseCoord('[2:5:15]')).toEqual({ g: 2, s: 5, p: 15 });
    expect(parseCoord('1:34')).toEqual({ g: 1, s: 34, p: undefined });
    expect(parseCoord('cruiser')).toBeNull();
    expect(parseCoord('1:2:3:4')).toBeNull();
  });
  it('every chord opens a real page', () => {
    const ids = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    for (const c of Object.values(CHORDS)) expect(ids).toContain(c.page);
  });
  it('cycles through planets in a ring in both directions', () => {
    expect(cycleId(['a', 'b', 'c'], 'a', 1)).toBe('b');
    expect(cycleId(['a', 'b', 'c'], 'c', 1)).toBe('a');
    expect(cycleId(['a', 'b', 'c'], 'a', -1)).toBe('c');
    expect(cycleId([], 'x', 1)).toBe('x');
  });
  it('does not treat typing in a field as a shortcut', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as any)).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as any)).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV' } as any)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
