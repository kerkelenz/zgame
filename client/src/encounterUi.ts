import { useSyncExternalStore } from 'react';

/** whether the encounter card is open: the notice strip opens it, the card closes it */
let open = false;
const subs = new Set<() => void>();
export const setEncounterOpen = (v: boolean) => { open = v; subs.forEach((f) => f()); };
export const useEncounterOpen = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => open);
