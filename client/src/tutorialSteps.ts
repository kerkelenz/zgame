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
    text: 'Everything starts with buildings. Click Build in the menu: it opens the Buildings page, with the other pages of that part (Resources, Research, Shipyard and more) as tabs along the top.' },
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
  { id: 'go-quests', title: 'Your quests', target: 'nav-quests', done: onPage('quests'),
    text: 'Click Quests (a tab under Home). Quests tell you what to do next, pay a reward, and some of them open more of the menu. A new page also brings a short tutorial of its own the first time you open it.' },
  { id: 'finish', title: 'You know the basics',
    text: 'Queue work, check back now and then and follow the quests. The Guide in the menu explains every system, and Settings can replay any tutorial.' },
];

/** a short tutorial for one page: shown the first time the page is open (for a commander following the quest line) and from the Tutorial button on the page */
const note = (id: string, title: string, text: string): TutStep => ({ id, title, text });
const intro = (id: string, title: string, text: string): TutStep => ({ id, title, text, target: 'page-title' });

export const FEATURE_TUTORIALS: Record<string, TutStep[]> = {
  research: [
    intro('research-what', 'Research', 'Technologies unlock ships, speed up fleets and strengthen your economy. One project runs at a time across your whole empire, with a queue behind it, and the Research Lab of the selected planet sets the speed.'),
    note('research-cards', 'Reading a card', 'Each card shows your level, the cost and time of the next level and what is still missing in red. Where something is missing, a button next to it starts that step for you.'),
    note('research-first', 'Where to begin', 'Energy Technology first: it opens more than any other early technology. Espionage and the drives come next, because probes, cargo ships and colony ships need them.'),
  ],
  techtree: [
    intro('tree-what', 'The tech tree', 'Every building, research, ship and defense on one map, with arrows showing what needs what. Drag to pan and scroll to zoom.'),
    note('tree-use', 'Following a path', 'Click a card to light its whole chain and open its levels in place. Cards that glow are ready to start. Choose Show only the path to an item to see exactly what leads to it.'),
  ],
  shipyard: [
    intro('shipyard-what', 'The Shipyard', 'Ships and defenses are built here, once you have a Shipyard building (it needs a Robotics Factory first). Better drives and a bigger Shipyard make ships come out faster.'),
    { id: 'shipyard-planner', title: 'The planner', target: 'planner', text: 'Say what you want, for example 20 Small Cargo, and the planner shows the price, the buildings and research still missing, how long the Shipyard needs and when you can pay. One button queues the missing steps.' },
    note('shipyard-queue', 'The production queue', 'Ships are built in rows, one unit at a time, and the rows wait their turn. You can move a waiting row up or down, and cancelling a row gives back what is left.'),
  ],
  defense: [
    intro('defense-what', 'Defense', 'Defenses guard a planet while you are away. They cannot fly, and after a battle most of what was destroyed is rebuilt for free.'),
    note('defense-start', 'What to build', 'Rocket Launchers are the cheap start. Shield domes protect everything on the planet, and missiles need a Missile Silo. Twenty cheap defenses make a raider think twice.'),
  ],
  fleet: [
    intro('fleet-what', 'Fleets', 'Ships move from here: transports carry resources, probes spy, colony ships found new planets, and expeditions explore deep space.'),
    { id: 'fleet-send', title: 'Sending a fleet', target: 'send-fleet', text: 'Pick ships, a target and a mission. The page shows the flight time and the fuel before you launch. Repeat last fills in your previous dispatch again.' },
    note('fleet-slots', 'Slots and recalls', 'Each fleet in flight uses a slot; Upgrades and Astrophysics add more. A fleet can be recalled while it flies and turns round at once. Always check the flight time first.'),
  ],
  galaxy: [
    intro('galaxy-what', 'The galaxy', 'Other commanders, computer empires and pirate outposts live here. Every position can show a planet, a moon and a debris field.'),
    note('galaxy-act', 'What you can do', 'From a planet you can spy, attack, transport, defend or recycle debris. Spy first: the report shows what is there to loot. Inactive neighbours are marked i and I.'),
    note('galaxy-safe', 'Staying safe', 'Beginners are protected until they grow, and a commander on vacation cannot be attacked. The Map tab draws the same galaxy from above.'),
  ],
  map: [
    intro('map-what', 'The map', 'The galaxy from above at four zoom levels: all galaxies, one galaxy, one system and one planet. Click to zoom in; Escape or the trail above the map takes you back out.'),
    note('map-layers', 'Layers', 'The switches under the map show fleets in flight, territory and alliance colours, the rift, outposts and debris, and attack alerts. Other commanders\' defenses show only if you have a spy report on them.'),
  ],
  contacts: [
    intro('contacts-what', 'Contacts', 'Your buddies, blocked commanders, bookmarks, private notes and the archive of your latest spy report on every planet.'),
  ],
  contracts: [
    intro('contracts-what', 'Contracts', 'Contracts pay Command Credits and resources for things you do anyway: build, research, fight. Claim a finished one here.'),
    note('contracts-credits', 'Command Credits', 'Credits buy officers and classes in Command. They also come from expeditions, quests and achievements.'),
  ],
  highscore: [
    intro('standing-what', 'Standing', 'The rankings: total points, economy, research, fleet, defense and activity. Click any name for that commander\'s public profile.'),
  ],
  alliance: [
    intro('alliance-what', 'Alliances', 'Open alliances let you in at once. Members share a bank and bonuses, defend each other with hold fleets and fight the Void invasions together.'),
    note('alliance-tip', 'Why join', 'An alliance holds systems together (Territory), buys upgrades from a shared bank and warns you when a member is attacked. You can leave at any time.'),
  ],
  chat: [
    intro('chat-what', 'Chat', 'Talk to everyone, your alliance or one commander. Names and coordinates in a line are links.'),
  ],
  empire: [
    intro('empire-what', 'Empire', 'All your planets and moons in one table: what they hold, what they make and what they are building. Click a name to switch to that planet.'),
  ],
  economy: [
    intro('economy-what', 'Economy', 'What your whole empire makes an hour, what the stores can hold and where energy is short. Use it to decide which mine to raise next.'),
  ],
  market: [
    intro('market-what', 'The Market', 'Trade resources. The travelling merchant swaps any resource for another at a fixed rate (with a cut), and the offer board lets commanders trade with each other.'),
    note('market-tip', 'A good start', 'The merchant keeps a daily cheap deal; its card says how much of it is left. Offers on the board can be for everyone or for your alliance only.'),
  ],
  command: [
    intro('command-what', 'Command', 'Your class, officers and achievements. The first class is free; officers are bought with Command Credits and help your whole empire.'),
    note('command-tip', 'Credits', 'Credits come from quests, achievements and expeditions. Saving up for one officer is better than spreading them thin.'),
  ],
  upgrades: [
    intro('upgrades-what', 'Upgrades', 'Things to spend resources on for good: empire upgrades (more queue slots, faster research), planet projects, short boosts and monuments.'),
    note('upgrades-tip', 'Where to start', 'The Construction Bureau and Research Council add queue slots, which pays off at once. Prices grow with every level, so spread them out.'),
  ],
  lifeform: [
    intro('lifeform-what', 'Lifeforms', 'Each planet can be settled by one of four peoples. Their structures give that planet bonuses such as more fields, faster building or a safer vault.'),
    note('lifeform-tip', 'One choice per planet', 'Pick the people that suit what the planet does. Their structures are bought with resources and each has levels.'),
  ],
};

/** every tutorial by id: `core` is the first one, then one per page */
export const TUTORIALS: Record<string, TutStep[]> = { core: STEPS, ...FEATURE_TUTORIALS };
export const hasTutorial = (id: string) => id in TUTORIALS;

/** the first step that is not already done, starting from `from` (steps with no condition always wait for the player) */
export function settle(from: number, ctx: TutCtx, steps: TutStep[] = STEPS): number {
  let i = from;
  while (i < steps.length && steps[i].done?.(ctx)) i++;
  return i;
}

// ------------------------------------------------------------------ the store

interface Saved { i: number; done: boolean }
const key = (playerId: string, id: string) => (id === 'core' ? `zg.tutorial.${playerId}` : `zg.tutorial.${playerId}.${id}`);
const OFF_KEY = 'zg.tutorialsOff';
let state: { playerId: string; id: string; i: number; active: boolean } | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function read(playerId: string, id: string): Saved | null {
  try { const v = JSON.parse(localStorage.getItem(key(playerId, id)) || 'null') as Saved | null; return v && typeof v.i === 'number' ? v : null; } catch { return null; }
}
function write(playerId: string, id: string, s: Saved) { try { localStorage.setItem(key(playerId, id), JSON.stringify(s)); } catch { /* ignore */ } }

/** pick up where this commander left off with the first tutorial (nothing is shown for one who finished or never began) */
export function loadTutorial(playerId: string) {
  if (state?.playerId === playerId) return;
  const s = read(playerId, 'core');
  state = { playerId, id: 'core', i: s?.i ?? 0, active: !!s && !s.done };
  emit();
}
export function startTutorial(playerId: string, id = 'core') {
  if (!hasTutorial(id)) return;
  state = { playerId, id, i: 0, active: true }; write(playerId, id, { i: 0, done: false }); emit();
}
export function stopTutorial() { if (!state) return; write(state.playerId, state.id, { i: state.i, done: true }); state = { ...state, active: false }; emit(); }
export function setTutorialStep(i: number) {
  if (!state || !state.active) return;
  if (i >= (TUTORIALS[state.id]?.length ?? 0)) { stopTutorial(); return; }
  if (i === state.i) return;
  state = { ...state, i }; write(state.playerId, state.id, { i, done: false }); emit();
}
export const hasFinishedTutorial = (playerId: string, id = 'core') => !!read(playerId, id)?.done;
/** has this commander seen (finished or skipped) the tutorial, or begun it? */
export const hasSeenTutorial = (playerId: string, id: string) => !!read(playerId, id);

/** a commander can switch the automatic page tutorials off for good (they stay available from the Tutorial button) */
export const tutorialsOff = () => { try { return localStorage.getItem(OFF_KEY) === '1'; } catch { return false; } };
export function setTutorialsOff(off: boolean) { try { if (off) localStorage.setItem(OFF_KEY, '1'); else localStorage.removeItem(OFF_KEY); } catch { /* ignore */ } }

/**
 * The tutorial that should start by itself when `page` is opened: only for a commander on the quest line, only once per page, never while
 * another tutorial is running and never when they switched the automatic ones off.
 */
export function autoTutorialFor(playerId: string, page: string, followsQuestLine: boolean): string | null {
  if (!followsQuestLine || tutorialsOff() || !hasTutorial(page) || page === 'core') return null;
  if (state?.active) return null;
  if (!hasSeenTutorial(playerId, 'core') || !hasFinishedTutorial(playerId, 'core')) return null;      // the first tutorial comes first
  return hasSeenTutorial(playerId, page) ? null : page;
}

const snapshot = () => state;
export const useTutorial = () => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, snapshot);
/** tests start clean */
export function resetTutorialStore() { state = null; emit(); }
