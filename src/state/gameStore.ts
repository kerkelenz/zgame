/**
 * The application store: where the game state lives while the app is running.
 *
 * ---------------------------------------------------------------------------
 * THE CENTRAL PATTERN: THE STORE OWNS TIME, THE ENGINE IS TIMELESS
 * ---------------------------------------------------------------------------
 * Nothing in `src/engine` ever calls `Date.now()`. Every engine function that
 * cares about the current moment takes `now` as a parameter. This module is the
 * *only* place in the codebase that reads the clock, and it passes what it
 * reads into the engine.
 *
 * That one rule buys a surprising amount:
 *
 * - **Offline progress is free.** Coming back after six hours is the same code
 *   path as ticking one second, because "advance the world from `lastTick` to
 *   `now`" does not care how big the gap is.
 * - **Tests are instant and exact.** A test can simulate a week by passing
 *   `T0 + 7 * DAY`. No fake timers, no waiting, no flakiness.
 * - **A server could run this later.** Move the engine to Node, have it read
 *   the clock there instead, and the simulation is identical.
 * - **No time can leak.** Every action ticks to `now` *before* it does anything
 *   else, so you can never spend resources you had not actually earned yet, nor
 *   lose production that accrued between the last tick and your tap.
 *
 * ---------------------------------------------------------------------------
 * WHY ZUSTAND
 * ---------------------------------------------------------------------------
 * The state is one plain object updated once a second. Zustand is a thin store
 * with selector-based subscriptions, so a component that only reads
 * `planet.name` does not re-render when resources change. Redux would be more
 * ceremony for the same result; Context would re-render the entire tree every
 * tick.
 */

import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import { create } from 'zustand';

import {
  cancelBuild as engineCancelBuild,
  createNewGame,
  startBuild as engineStartBuild,
  tick as engineTick,
  type BuildingId,
  type GameState,
  type Planet,
  type TickCompletion,
} from '@/engine';
import { clearGame, loadGame, saveGame } from './persistence';

/** How often the world advances while the app is in the foreground. */
const TICK_INTERVAL_MS = 1000;

/**
 * Minimum gap between background saves.
 *
 * Writing to AsyncStorage every second would be wasteful (it is a real disk
 * write on native, and a synchronous `localStorage` write on web that can jank
 * the main thread). Five seconds bounds the worst-case loss to five seconds of
 * production, which is imperceptible - and player *actions* are always saved
 * immediately, so nothing a player deliberately did can ever be lost.
 */
const SAVE_INTERVAL_MS = 5000;

type GameStore = {
  game: GameState | null;
  /** False until `init()` has finished. The layout shows a splash until then. */
  loaded: boolean;
  /** Buildings that finished during the most recent tick, for the UI to announce. */
  justCompleted: TickCompletion[];

  init: () => Promise<void>;
  tick: () => void;
  startBuild: (planetId: string, buildingId: BuildingId) => void;
  cancelBuild: (planetId: string) => void;
  resetGame: () => Promise<void>;
  /** Tear down the clock and the AppState listener. Called on unmount. */
  teardown: () => void;
};

// ---------------------------------------------------------------------------
// Save scheduling
// ---------------------------------------------------------------------------
// Module-level rather than store state: these are side-effect bookkeeping, not
// data any component should render, and putting them in the store would cause
// re-renders every time a timer moved.

let lastSaveAt = 0;
let pendingSave: ReturnType<typeof setTimeout> | null = null;

/**
 * Persist the state, at most once every `SAVE_INTERVAL_MS` - unless `immediate`
 * is set, which player actions use so a deliberate choice is never lost.
 */
function requestSave(state: GameState, immediate: boolean, now: number): void {
  if (immediate || now - lastSaveAt >= SAVE_INTERVAL_MS) {
    if (pendingSave) {
      clearTimeout(pendingSave);
      pendingSave = null;
    }
    lastSaveAt = now;
    void saveGame(state);
    return;
  }

  // Already waiting: the queued save will pick up whatever the latest state is
  // when it fires, so there is no point queuing a second one.
  if (pendingSave) return;

  pendingSave = setTimeout(() => {
    pendingSave = null;
    const latest = useGameStore.getState().game;
    if (latest) {
      lastSaveAt = Date.now();
      void saveGame(latest);
    }
  }, SAVE_INTERVAL_MS - (now - lastSaveAt));
}

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

let tickTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: NativeEventSubscription | null = null;

function startClock(): void {
  if (tickTimer !== null) return;
  tickTimer = setInterval(() => useGameStore.getState().tick(), TICK_INTERVAL_MS);
}

function stopClock(): void {
  if (tickTimer === null) return;
  clearInterval(tickTimer);
  tickTimer = null;
}

/**
 * Pause the clock while the app is backgrounded, and catch up on return.
 *
 * On iOS and Android, timers in a backgrounded app are throttled or suspended
 * outright, so an interval there is at best wasted battery. Stopping it costs
 * us nothing: because the engine derives everything from `lastTick`, the single
 * tick we run on resume credits the entire absence in one go.
 *
 * On web `AppState` reports 'active' continuously, so the clock simply keeps
 * running - which is fine, and matches how a browser tab behaves anyway (and
 * even if the browser throttles a hidden tab's timers, the next tick still
 * credits the full elapsed window).
 */
function handleAppStateChange(status: AppStateStatus): void {
  if (status === 'active') {
    // Catch up *first*, then resume ticking, so the resource bar is already
    // correct on the frame the app becomes visible.
    useGameStore.getState().tick();
    startClock();
  } else {
    stopClock();
    // Flush before we might be killed: a backgrounded app can be terminated by
    // the OS at any moment without further warning.
    const game = useGameStore.getState().game;
    if (game) {
      lastSaveAt = Date.now();
      void saveGame(game);
    }
  }
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  loaded: false,
  justCompleted: [],

  /**
   * Load a save (or start a new game), catch up on elapsed time, and start the
   * clock. Safe to call more than once - React 19's StrictMode double-invokes
   * effects in development, and we do not want two intervals running.
   */
  async init() {
    const existing = await loadGame();
    const now = Date.now();

    // The tick immediately after loading is what credits offline production.
    // For a brand-new game `lastTick === now`, so it credits exactly nothing.
    const base = existing ?? createNewGame(now);
    const { state, completed } = engineTick(base, now);

    set({ game: state, loaded: true, justCompleted: completed });

    // Persist right away: for a new game this writes the initial save, and for
    // a loaded one it banks the offline production we just credited.
    requestSave(state, true, now);

    if (appStateSubscription === null) {
      appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    }
    startClock();
  },

  /**
   * Advance the world to the present moment.
   *
   * Called once a second by the clock, and defensively at the start of every
   * action so that no action can ever operate on stale resources.
   */
  tick() {
    const game = get().game;
    if (!game) return;

    const now = Date.now();
    const { state, completed } = engineTick(game, now);

    // Only touch `justCompleted` when something actually completed. Assigning a
    // fresh `[]` every second would change its identity and re-render every
    // component subscribed to it, for no reason.
    set(completed.length > 0 ? { game: state, justCompleted: completed } : { game: state });

    requestSave(state, false, now);
  },

  startBuild(planetId, buildingId) {
    const game = get().game;
    if (!game) return;

    const now = Date.now();

    // Tick first. Without this, a player who has been staring at the screen for
    // 30 seconds would be told they cannot afford a building they *can* afford,
    // because the store's copy of their resources predates the last tick.
    const ticked = engineTick(game, now).state;

    const next = updatePlanet(ticked, planetId, (planet) =>
      engineStartBuild(planet, buildingId, now, ticked.speed),
    );
    if (!next) return;

    set({ game: next });
    // Immediate save: this was a deliberate player decision.
    requestSave(next, true, now);
  },

  cancelBuild(planetId) {
    const game = get().game;
    if (!game) return;

    const now = Date.now();
    // Ticking first also resolves a build that finished a moment ago, which is
    // exactly what stops "cancel" from refunding something already delivered.
    const ticked = engineTick(game, now).state;

    const next = updatePlanet(ticked, planetId, (planet) => engineCancelBuild(planet, now));
    if (!next) return;

    set({ game: next });
    requestSave(next, true, now);
  },

  async resetGame() {
    await clearGame();
    const now = Date.now();
    const fresh = createNewGame(now);
    set({ game: fresh, justCompleted: [] });
    requestSave(fresh, true, now);
  },

  teardown() {
    stopClock();
    appStateSubscription?.remove();
    appStateSubscription = null;
    if (pendingSave) {
      clearTimeout(pendingSave);
      pendingSave = null;
    }
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Apply a pure planet transform to one planet inside a game state.
 *
 * Returns `null` if the planet does not exist or the transform threw. The
 * engine throws on invalid commands by design (see `startBuild`), and the store
 * is the right layer to turn that into "nothing happened": a UI bug should not
 * white-screen the app, but it should be loud in the console.
 */
function updatePlanet(
  game: GameState,
  planetId: string,
  transform: (planet: Planet) => Planet,
): GameState | null {
  const index = game.planets.findIndex((planet) => planet.id === planetId);
  if (index === -1) {
    console.warn(`[gameStore] No such planet: ${planetId}`);
    return null;
  }

  let updated: Planet;
  try {
    updated = transform(game.planets[index]);
  } catch (error) {
    console.warn('[gameStore] Command rejected by the engine:', error);
    return null;
  }

  const planets = [...game.planets];
  planets[index] = updated;
  return { ...game, planets };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------
// Small named selectors keep components from reaching into the state shape
// directly, so a future change to `GameState` is a change here, not everywhere.

/** The planet the UI is currently showing. Only one planet exists so far. */
export function useActivePlanet(): Planet | null {
  return useGameStore((s) => {
    if (!s.game) return null;
    return s.game.planets.find((p) => p.id === s.game?.homePlanetId) ?? s.game.planets[0] ?? null;
  });
}

/** Universe speed, needed by nearly every rate calculation in the UI. */
export function useSpeed(): number {
  return useGameStore((s) => s.game?.speed ?? 1);
}
