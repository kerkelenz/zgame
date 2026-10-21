import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OBJECTIVES } from '../server/progress';
import { NAV_GROUPS } from '../client/src/nav';

/** the tour's steps are plain data in client/src/Tour.tsx; read them without loading React */
const src = readFileSync('client/src/Tour.tsx', 'utf8');
const steps = src.split(/\r?\n/).filter((l) => l.startsWith("  { page: '")).map((l) => ({
  page: l.slice(l.indexOf("page: '") + 7, l.indexOf("',")),
  title: l.slice(l.indexOf("title: '") + 8, l.indexOf("', text:")),
  text: l.slice(l.indexOf("text: '") + 7, l.lastIndexOf("' }")),
}));

describe('the welcome tour', () => {
  it('has steps and every step points at a page that exists', () => {
    expect(steps.length).toBeGreaterThanOrEqual(4);
    const pages = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id)));
    for (const s of steps) expect(pages.has(s.page), s.page).toBe(true);
  });

  it('covers the main pages a new commander needs', () => {
    const covered = steps.map((s) => s.page);
    for (const page of ['overview', 'buildings', 'quests', 'settings']) expect(covered, page).toContain(page);
    // the rest of the menu is opened one page at a time by the quests and explained by a tutorial of its own
    for (const page of ['research', 'techtree', 'shipyard', 'galaxy', 'fleet', 'alliance']) expect(covered, page).not.toContain(page);
  });

  it('is plain instruction: no dates and no release talk', () => {
    for (const s of steps) {
      expect(s.text).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
      expect(s.text.toLowerCase()).not.toContain('release notes');
      expect(s.text.length).toBeGreaterThan(40);
    }
  });
});

describe('the guided objectives', () => {
  it('have a hint and a reward, and use the current resource name', () => {
    for (const o of OBJECTIVES) {
      expect(o.hint.length, o.id).toBeGreaterThan(20);
      expect(Object.keys(o.reward).length, o.id).toBeGreaterThan(0);
      expect(o.hint, o.id).not.toMatch(/vespene/i);
    }
  });
});
