import { useSyncExternalStore } from 'react';

/**
 * The hands-on tutorial: a spotlight that points at the real buttons and waits for you to press them. Steps are plain data; a step with
 * `done` moves on by itself the moment the game shows you did it, and a step without one waits for Next. Progress is kept per commander in
 * this browser. Pure apart from the small store at the bottom, so the rules can be tested.
 */
export interface TutCtx {
  page: string;
  /** the selected planet and the player, as the game holds them */
  planet: { buildings?: Record<string, number | undefined>; buildQueue?: { id: string } | null; buildBacklog?: string[] } | null;
  me: { player?: { techs?: Record<string, number | undefined>; research?: { id: string } | null; researchBacklog?: { id: string }[] } } | null;
}
export interface TutStep {
  id: string;
  title: string;
  text: string;
  /** what to point at: the value of a data-tour attribute; nothing = a centred note */
  target?: string;
  /** moves on by itself when this is true */
  done?: (c: TutCtx) => boolean;
}

const building = (c: TutCtx, id: string) => (c.planet?.buildings?.[id] ?? 0) > 0 || c.planet?.buildQueue?.id === id || !!c.planet?.buildBacklog?.includes(id);
const onPage = (page: string) => (c: TutCtx) => c.page === page;

export const STEPS: TutStep[] = [
  { id: 'stock', title: 'Your resources', target: 'resources',
    text: 'The bar at the top always shows what you have, next to the most each store can hold, and the energy balance. Metal, crystal and vespene gas build everything. Point at one to see when its store is full.' },
  { id: 'go-buildings', title: 'Open Buildings', target: 'nav-buildings', done: onPage('buildings'),
    text: 'Everything starts with buildings. Click Buildings.' },
  { id: 'metal-mine', title: 'Build a Metal Mine', target: 'build-metalMine', done: (c) => building(c, 'metalMine'),
    text: 'Mines make your resources. Press the highlighted button to start a Metal Mine. It is paid for when you press it, and it keeps building while you are away.' },
  { id: 'queue', title: 'The construction queue', target: 'queue',
    text: 'Here is the job with its time left. Only one building runs at a time on a planet, and up to four more can wait behind it. Cancelling gives your resources back.' },
  { id: 'solar', title: 'Energy for the mines', target: 'build-solarPlant', done: (c) => building(c, 'solarPlant'),
    text: 'Mines need power: with too little, every mine slows down. Queue a Solar Plant next. The queue holds it and starts it when the mine is done.' },
  { id: 'details', title: 'Look inside any item', target: 'link-metalMine', done: onPage('detail'),
    text: 'Every name in the game is a link. Click the Metal Mine to see what each level gives, what it costs, and what it unlocks.' },
  { id: 'back', title: 'Go back', target: 'back', done: (c) => c.page !== 'detail',
    text: 'Press Back. The browser Back button works too, and Ctrl+K opens a box that jumps to any page, item or commander.' },
  { id: 'go-research', title: 'Research', target: 'nav-research', done: onPage('research'),
    text: 'Click Research. Technologies unlock ships, speed up fleets and strengthen your economy.' },
  { id: 'lab', title: 'The Research Lab',
    text: 'Research needs a Research Lab, which you build on the Buildings page. One project runs at a time across your whole empire, with a queue behind it.' },
  { id: 'go-tree', title: 'The tech tree', target: 'nav-techtree', done: onPage('techtree'),
    text: 'Click Tech tree. It is one map of everything you can build, research or train, with arrows showing what needs what. Click any card to light its whole chain.' },
  { id: 'go-galaxy', title: 'The galaxy', target: 'nav-galaxy', done: onPage('galaxy'),
    text: 'Click Galaxy. Other commanders and computer empires live here. From a planet you can spy, attack, transport or recycle debris. Beginners are protected until they grow.' },
  { id: 'go-overview', title: 'Back home', target: 'nav-overview', done: onPage('overview'),
    text: 'Click Overview. Its What to do next card tells you what is idle, what is about to be wasted and what is worth doing, so you always have a next step.' },
  { id: 'finish', title: 'You know the basics',
    text: 'Queue work, check back now and then, and join an alliance when you want company. The Guide in the menu explains every system, and Settings can replay this tutorial.' },
];

/** the first step that is not already done, starting from `from` (steps with no condition always wait for the player) */
export function settle(from: number, ctx: TutCtx): number {
  let i = from;
  while (i < STEPS.length && STEPS[i].done?.(ctx)) i++;
  return i;
}

// ------------------------------------------------------------------ the store

interface Saved { i: number; done: boolean }
const key = (playerId: string) => `zg.tutorial.${playerId}`;
let state: { playerId: string; i: number; active: boolean } | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function read(playerId: string): Saved | null {
  try { const v = JSON.parse(localStorage.getItem(key(playerId)) || 'null') as Saved | null; return v && typeof v.i === 'number' ? v : null; } catch { return null; }
}
function write(playerId: string, s: Saved) { try { localStorage.setItem(key(playerId), JSON.stringify(s)); } catch { /* ignore */ } }

/** pick up where this commander left off (nothing is shown for a commander who finished or never began) */
export function loadTutorial(playerId: string) {
  if (state?.playerId === playerId) return;
  const s = read(playerId);
  state = { playerId, i: s?.i ?? 0, active: !!s && !s.done };
  emit();
}
export function startTutorial(playerId: string) { state = { playerId, i: 0, active: true }; write(playerId, { i: 0, done: false }); emit(); }
export function stopTutorial() { if (!state) return; write(state.playerId, { i: state.i, done: true }); state = { ...state, active: false }; emit(); }
export function setTutorialStep(i: number) {
  if (!state || !state.active) return;
  if (i >= STEPS.length) { stopTutorial(); return; }
  if (i === state.i) return;
  state = { ...state, i }; write(state.playerId, { i, done: false }); emit();
}
export const hasFinishedTutorial = (playerId: string) => !!read(playerId)?.done;

const snapshot = () => state;
export const useTutorial = () => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, snapshot);
/** tests start clean */
export function resetTutorialStore() { state = null; emit(); }
