import { readFileSync, readdirSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILDINGS, TECHS } from '../shared/data';
import { NAV_GROUPS } from '../client/src/nav';
import { STEPS, hasFinishedTutorial, loadTutorial, resetTutorialStore, setTutorialStep, settle, startTutorial, stopTutorial, type TutCtx } from '../client/src/tutorialSteps';

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
      if (!m) { expect(sources.includes(`data-tour="${s.target}"`) || sources.includes(` tour="${s.target}"`), s.target).toBe(true); continue; }
      if (m[1] === 'nav') { expect(navIds.has(m[2]), s.target).toBe(true); expect(sources).toContain('data-tour={`nav-${'); }
      if (m[1] === 'build') { expect(m[2] in BUILDINGS, s.target).toBe(true); expect(sources).toContain('data-tour={`build-${id}`}'); }
      if (m[1] === 'link') { expect(m[2] in BUILDINGS || m[2] in TECHS, s.target).toBe(true); expect(sources).toContain('data-tour={`link-${id}`}'); }
    }
  });
  it('end with a note and cover the basics a newcomer needs', () => {
    expect(STEPS[STEPS.length - 1].done).toBeUndefined();
    const ids = STEPS.map((s) => s.id).join(' ');
    for (const part of ['stock', 'metal-mine', 'solar', 'details', 'research', 'tree', 'galaxy', 'overview']) expect(ids, part).toContain(part);
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
