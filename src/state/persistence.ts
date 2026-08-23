/**
 * Saving and loading the empire.
 *
 * One key, one JSON blob, AsyncStorage. That is genuinely enough for a
 * singleplayer game whose entire state is a handful of numbers per planet, and
 * "enough" is the right amount of machinery to build at this stage.
 *
 * AsyncStorage is used rather than a platform-specific API because it is the
 * one storage interface that works identically on iOS, Android and web (where
 * it is a thin shim over `localStorage`). Same code, three platforms - which is
 * the whole reason we are on Expo.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { SAVE_VERSION, type GameState } from '@/engine';

/**
 * The storage key. Namespaced so that if we ever store other things (settings,
 * a replay log) they cannot collide, and versioned separately from the *save*
 * version - this key changes only if we deliberately want to abandon old saves.
 */
const SAVE_KEY = 'stellar-dominion/save/v1';

/**
 * Upgrade an older save to the current shape.
 *
 * Right now every save is already current, so this is a pass-through. It exists
 * as a named seam because the alternative - discovering you need migrations
 * *after* players have saves - means either breaking their games or retrofitting
 * this plumbing under pressure.
 *
 * When the time comes, the pattern is a chain of small, individually testable
 * steps, each moving the save forward exactly one version:
 *
 *     if (save.version === 1) { save = { ...save, research: {} , version: 2 }; }
 *     if (save.version === 2) { ... }
 *
 * Never a single "convert anything to current" function: those are impossible
 * to test and impossible to reason about once there are more than two versions.
 *
 * Returns `null` when the save cannot be salvaged, which the caller treats the
 * same as "no save" - a fresh game beats a crash on launch.
 */
export function migrate(raw: unknown): GameState | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const candidate = raw as Partial<GameState>;

  // Minimal structural sanity check. A corrupted or hand-edited save should
  // start a new game rather than take down the app on first render.
  if (
    typeof candidate.version !== 'number' ||
    typeof candidate.lastTick !== 'number' ||
    !Array.isArray(candidate.planets) ||
    candidate.planets.length === 0
  ) {
    return null;
  }

  // A save from the *future* (the player downgraded the app) is not something
  // we can safely interpret, so refuse it rather than guess.
  if (candidate.version > SAVE_VERSION) return null;

  // --- version 1 -> 2 -> ... would go here ---

  return candidate as GameState;
}

/**
 * Write the current state to storage.
 *
 * Note this is deliberately *not* debounced here. Rate limiting is a policy
 * decision that belongs to the caller (see `gameStore.ts`, which saves at most
 * every five seconds but always immediately after a player action). Keeping the
 * policy out of this module means tests and future callers can save whenever
 * they like.
 */
export async function saveGame(state: GameState): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (error) {
    // A failed save must never crash the game. The player loses at most a few
    // seconds of progress, and the next save will very likely succeed.
    console.warn('[persistence] Failed to save game:', error);
  }
}

/**
 * Read the saved state, or `null` if there is none (or it is unusable).
 *
 * Returns a promise because AsyncStorage is asynchronous on every platform -
 * even the web shim, which keeps the API identical across targets.
 */
export async function loadGame(): Promise<GameState | null> {
  try {
    const json = await AsyncStorage.getItem(SAVE_KEY);
    if (!json) return null;
    return migrate(JSON.parse(json));
  } catch (error) {
    console.warn('[persistence] Failed to load game, starting fresh:', error);
    return null;
  }
}

/** Delete the save. Used by "Reset game". */
export async function clearGame(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SAVE_KEY);
  } catch (error) {
    console.warn('[persistence] Failed to clear save:', error);
  }
}
