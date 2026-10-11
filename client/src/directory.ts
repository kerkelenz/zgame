import { useEffect, useSyncExternalStore } from 'react';
import { get } from './api';

/** Every commander and computer empire by name, so names in messages and logs can become links. Loaded once and refreshed every few minutes. */
export interface PlayerEntry { id: string; name: string }
let players: PlayerEntry[] = [];
let loadedAt = 0;
let loading = false;
const subs = new Set<() => void>();
const STALE = 5 * 60_000;

export async function loadDirectory(force = false) {
  if (loading || (!force && Date.now() - loadedAt < STALE)) return;
  loading = true;
  try {
    players = await get('/players/names');
    loadedAt = Date.now();
    subs.forEach((f) => f());
  } catch { /* the links just stay plain text */ } finally { loading = false; }
}

/** the current list, re-rendering the caller when a fresh one arrives (and starting a load if it is old) */
export function usePlayerDirectory(): PlayerEntry[] {
  useEffect(() => { void loadDirectory(); }, []);
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => players);
}
