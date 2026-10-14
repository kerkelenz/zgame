/** The planet bar: planets as chips with their moon as a child, a list when there are many. Pure helpers, so they can be tested. */
export interface World { id: string; name: string; isMoon?: boolean; parentId?: string | null; coords: { g: number; s: number; p: number } }
export interface Group<W extends World = World> { planet: W; moon: W | null }

/** at most this many planets show as chips; with more, one switcher button opens a list */
export const MAX_CHIPS = 5;

/** every planet with its moon (if it has one), in the order the server lists the planets; a moon whose planet is missing is left out */
export function worldGroups<W extends World>(worlds: W[]): Group<W>[] {
  return worlds.filter((w) => !w.isMoon).map((planet) => ({ planet, moon: worlds.find((m) => m.isMoon && m.parentId === planet.id) ?? null }));
}

export const useList = (groups: Group[]) => groups.length > MAX_CHIPS;

/** the planets whose name, coordinates or moon name contain what was typed */
export function filterGroups<W extends World>(groups: Group<W>[], q: string): Group<W>[] {
  const needle = q.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!needle) return groups;
  const text = (w: World | null) => (w ? `${w.name} ${w.coords.g}:${w.coords.s}:${w.coords.p}`.toLowerCase() : '');
  return groups.filter((g) => text(g.planet).includes(needle) || text(g.moon).includes(needle));
}

/** the number keys 1 to 9 pick the first nine planets; null for any other key or a number with no planet */
export function planetForKey<W extends World>(groups: Group<W>[], key: string): W | null {
  if (!/^[1-9]$/.test(key)) return null;
  return groups[Number(key) - 1]?.planet ?? null;
}

/** "3 of 7": where the selected planet is in the list (a moon counts as its planet) */
export function positionOf<W extends World>(groups: Group<W>[], selectedId: string): { index: number; total: number } {
  const i = groups.findIndex((g) => g.planet.id === selectedId || g.moon?.id === selectedId);
  return { index: Math.max(0, i), total: groups.length };
}
