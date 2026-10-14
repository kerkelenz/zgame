import { useSyncExternalStore } from 'react';

const KEY = 'zg.planetsFolded';
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
let folded = read();
const subs = new Set<() => void>();
/** whether the player has folded the planet cards to one slim line (remembered on this device) */
export const setPlanetsFolded = (v: boolean) => { folded = v; try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* ignore */ } subs.forEach((f) => f()); };
export const usePlanetsFolded = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => folded);
