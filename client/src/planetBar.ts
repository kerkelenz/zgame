/** The planet bar: every planet is a card with its moon as a child. Pure helpers, so they can be tested. */
export interface World { id: string; name: string; isMoon?: boolean; parentId?: string | null; coords: { g: number; s: number; p: number } }
export interface Group<W extends World = World> { planet: W; moon: W | null }

/** every planet with its moon (if it has one), in the order the server lists the planets; a moon whose planet is missing is left out */
export function worldGroups<W extends World>(worlds: W[]): Group<W>[] {
  return worlds.filter((w) => !w.isMoon).map((planet) => ({ planet, moon: worlds.find((m) => m.isMoon && m.parentId === planet.id) ?? null }));
}

/** the number keys 1 to 9 pick the first nine planets; null for any other key or a number with no planet */
export function planetForKey<W extends World>(groups: Group<W>[], key: string): W | null {
  if (!/^[1-9]$/.test(key)) return null;
  return groups[Number(key) - 1]?.planet ?? null;
}

