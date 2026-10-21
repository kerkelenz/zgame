import { readFileSync, readdirSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILDINGS, TECHS } from '../shared/data';
import { NAV_GROUPS } from '../client/src/nav';
import { FEATURE_TUTORIALS, STEPS, TUTORIALS, autoTutorialFor, hasFinishedTutorial, hasSeenTutorial, loadTutorial, setTutorialsOff, resetTutorialStore, setTutorialStep, settle, startTutorial, stopTutorial, type TutCtx } from '../client/src/tutorialSteps';

const sources = readdirSync('client/src', { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx$/.test(f)).map((f) => readFileSync(`client/src/${f}`, 'utf8')).join('\n');
const store: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
  resetTutorialStore();
});
const ctx = (over: Partial<TutCtx> = {}): TutCtx => ({ page: 'overview', planet: { buildings: {}, buildQueue: null, buildBacklog: [] }, me: { player: { techs: {}, research: null, researchBacklog: [] } }, ...over });

describe('the tutorial steps', () => {
  it('have unique ids and real text', () => {
    expect(new Set(STEPS.map((s) => s.id)).size).toBe(STEPS.length);
    for (const s of STEPS) { expect(s.title.length).toBeGreaterThan(2); expect(s.text.length).toBeGreaterThan(30); }
  });
  it('point only at things the pages really mark with data-tour', () => {
    const navIds = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id)));
    for (const s of STEPS) {
      if (!s.target) continue;
      const m = /^(nav|build|link)-(.+)$/.exec(s.target);
      if (!m) { expect(sources.includes(`data-tour="${s.target}"`) || sources.includes(` tour="${s.target}"`) || sources.includes(`data-tour={tour ? '${s.target}' : undefined}`), s.target).toBe(true); continue; }
      if (m[1] === 'nav') { expect(navIds.has(m[2]), s.target).toBe(true); expect(sources).toContain('data-tour={`nav-${'); }
      if (m[1] === 'build') { expect(m[2] in BUILDINGS, s.target).toBe(true); expect(sources).toContain('data-tour={`build-${id}`}'); }
      if (m[1] === 'link') { expect(m[2] in BUILDINGS || m[2] in TECHS, s.target).toBe(true); expect(sources).toContain('data-tour={`link-${id}`}'); }
    }
  });
  it('end with a note and cover the basics a newcomer needs', () => {
    expect(STEPS[STEPS.length - 1].done).toBeUndefined();
    const ids = STEPS.map((s) => s.id).join(' ');
    for (const part of ['stock', 'metal-mine', 'solar', 'details', 'back', 'quests']) expect(ids, part).toContain(part);
  });
});

describe('moving on by itself', () => {
  it('waits on a step whose thing is not done and carries on past one that is', () => {
    expect(settle(0, ctx())).toBe(0);                                                  // the first step is a note: it waits for Next
    const goBuildings = STEPS.findIndex((s) => s.id === 'go-buildings');
    expect(settle(goBuildings, ctx({ page: 'overview' }))).toBe(goBuildings);
    const atBuildings = ctx({ page: 'buildings' });
    const metal = STEPS.findIndex((s) => s.id === 'metal-mine');
    expect(settle(goBuildings, atBuildings)).toBe(metal);                              // on the page: next
    const mineQueued = ctx({ page: 'buildings', planet: { buildings: {}, buildQueue: { id: 'metalMine' }, buildBacklog: [] } });
    expect(STEPS[settle(goBuildings, mineQueued)].id).toBe('queue');                    // the mine is under way: on to the note about the queue
  });
  it('counts a queued, a waiting or an already built building as done', () => {
    const metal = STEPS.findIndex((s) => s.id === 'metal-mine');
    for (const planet of [{ buildings: { metalMine: 2 } }, { buildings: {}, buildQueue: { id: 'metalMine' } }, { buildings: {}, buildQueue: { id: 'solarPlant' }, buildBacklog: ['metalMine'] }]) {
      expect(settle(metal, ctx({ page: 'buildings', planet }))).toBeGreaterThan(metal);
    }
    expect(settle(metal, ctx({ page: 'buildings' }))).toBe(metal);
  });
  it('the Back step is done as soon as you leave the details page', () => {
    const back = STEPS.findIndex((s) => s.id === 'back');
    expect(settle(back, ctx({ page: 'detail' }))).toBe(back);
    expect(settle(back, ctx({ page: 'buildings' }))).toBeGreaterThan(back);
  });
});

describe('progress is kept per commander', () => {
  it('starts, saves the step, resumes and finishes', () => {
    loadTutorial('alice');
    expect(hasFinishedTutorial('alice')).toBe(false);
    startTutorial('alice');
    setTutorialStep(3);
    resetTutorialStore();
    loadTutorial('alice');                                                              // a reload picks up at step 3
    expect(JSON.parse(store['zg.tutorial.alice'])).toEqual({ i: 3, done: false });
    stopTutorial();
    expect(hasFinishedTutorial('alice')).toBe(true);
    resetTutorialStore();
    loadTutorial('alice');                                                              // finished: nothing comes back
    expect(hasFinishedTutorial('bob')).toBe(false);
  });
  it('finishing the last step ends it', () => {
    startTutorial('carol');
    setTutorialStep(STEPS.length);
    expect(hasFinishedTutorial('carol')).toBe(true);
  });
});

describe('the per-page tutorials', () => {
  const all = Object.entries(TUTORIALS).flatMap(([tut, steps]) => steps.map((s) => ({ tut, s })));
  it('belong to real pages, have unique step ids and real text', () => {
    const pages = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id)));
    for (const id of Object.keys(FEATURE_TUTORIALS)) expect(pages.has(id), id).toBe(true);
    expect(new Set(all.map((x) => x.s.id)).size).toBe(all.length);
    for (const { tut, s } of all) { expect(s.title.length, s.id).toBeGreaterThan(2); expect(s.text.length, `${tut}/${s.id}`).toBeGreaterThan(30); }
  });
  it('cover every page the quest line opens, apart from the ones that explain themselves', async () => {
    const { OBJECTIVES } = await import('../server/progress');
    const opened = new Set(OBJECTIVES.flatMap((o) => o.unlocks));
    for (const page of opened) expect(Object.keys(FEATURE_TUTORIALS), page).toContain(page);
  });
  it('point only at things that exist: a page title, a menu entry or a mark a page really carries', () => {
    expect(sources).toContain('data-tour="page-title"');
    for (const { tut, s } of all) {
      if (!s.target || tut === 'core') continue;
      if (/^nav-/.test(s.target)) continue;
      expect(sources.includes(`data-tour="${s.target}"`) || sources.includes(` tour="${s.target}"`), s.target).toBe(true);
    }
  });
  it('start by themselves once per page for a commander on the quest line, after the first tutorial, never over another one', () => {
    expect(autoTutorialFor('amy', 'research', true)).toBeNull();                       // the first tutorial has not even begun
    startTutorial('amy');
    expect(autoTutorialFor('amy', 'research', true)).toBeNull();                       // it is running
    stopTutorial();
    expect(autoTutorialFor('amy', 'research', true)).toBe('research');
    expect(autoTutorialFor('amy', 'research', false)).toBeNull();                      // a veteran gets none by themselves
    expect(autoTutorialFor('amy', 'overview', true)).toBeNull();                       // a page without a tutorial
    startTutorial('amy', 'research');
    expect(autoTutorialFor('amy', 'shipyard', true)).toBeNull();                       // another one is on screen
    stopTutorial();
    expect(hasSeenTutorial('amy', 'research')).toBe(true);
    expect(autoTutorialFor('amy', 'research', true)).toBeNull();                       // once only
    expect(autoTutorialFor('amy', 'shipyard', true)).toBe('shipyard');
    setTutorialsOff(true);
    expect(autoTutorialFor('amy', 'shipyard', true)).toBeNull();                       // switched off for good
  });
  it('keeps the progress of each tutorial apart', () => {
    startTutorial('bea', 'fleet');
    setTutorialStep(1);
    expect(JSON.parse(store['zg.tutorial.bea.fleet'])).toEqual({ i: 1, done: false });
    stopTutorial();
    expect(hasFinishedTutorial('bea', 'fleet')).toBe(true);
    expect(hasFinishedTutorial('bea')).toBe(false);
  });
});
