import { BUILDINGS, DEFENSE_IDS, SHIP_IDS, TECHS, UNITS } from '../../shared/data';
import { NAV_GROUPS } from './nav';

/** What the Ctrl+K palette can jump to, and the keyboard chords. Pure, so it can be tested. */
export type PaletteKind = 'page' | 'item' | 'coord';
export interface PaletteEntry { kind: PaletteKind; id: string; label: string; hint: string }

/** `g` then a letter opens a page; the letters are listed in the shortcut help. */
export const CHORDS: Record<string, { page: string; label: string }> = {
  o: { page: 'overview', label: 'Overview' }, r: { page: 'resources', label: 'Resources' }, b: { page: 'buildings', label: 'Buildings' },
  t: { page: 'research', label: 'Research' }, s: { page: 'shipyard', label: 'Shipyard' }, d: { page: 'defense', label: 'Defense' },
  f: { page: 'fleet', label: 'Fleet' }, y: { page: 'galaxy', label: 'Galaxy' }, m: { page: 'messages', label: 'Messages' },
  e: { page: 'empire', label: 'Empire' }, a: { page: 'alliance', label: 'Alliance' }, h: { page: 'highscore', label: 'Standing' },
};

export const SHORTCUT_HELP: { keys: string; does: string }[] = [
  { keys: 'Ctrl+K', does: 'Open the palette: type a page, building, research, ship, player name or coordinates' },
  { keys: '/', does: 'Search players' },
  { keys: '[  and  ]', does: 'Previous and next planet or moon' },
  { keys: '1 to 9', does: 'Jump to the first nine planets' },
  { keys: 'g then a letter', does: Object.entries(CHORDS).map(([k, v]) => `${k} ${v.label}`).join(' · ') },
  { keys: '?', does: 'This list' },
];

export function pageEntries(isAdmin = false): PaletteEntry[] {
  return NAV_GROUPS.flatMap((g) => g.items.filter((i) => !i.admin || isAdmin).map((i) => ({ kind: 'page' as const, id: i.id, label: i.label, hint: g.label })));
}

export function itemEntries(): PaletteEntry[] {
  return [
    ...Object.values(BUILDINGS).map((b) => ({ kind: 'item' as const, id: b.id, label: b.name, hint: 'Building' })),
    ...Object.values(TECHS).map((t) => ({ kind: 'item' as const, id: t.id, label: t.name, hint: 'Research' })),
    ...SHIP_IDS.map((id) => ({ kind: 'item' as const, id, label: UNITS[id].name, hint: 'Ship' })),
    ...DEFENSE_IDS.map((id) => ({ kind: 'item' as const, id, label: UNITS[id].name, hint: 'Defense' })),
  ];
}

/** `1:34:7` or `[1:34:7]` (or just `1:34`) as a place to open in the Galaxy */
export function parseCoord(q: string): { g: number; s: number; p?: number } | null {
  const m = /^\[?\s*(\d{1,2})\s*[: ]\s*(\d{1,3})(?:\s*[: ]\s*(\d{1,2}))?\s*\]?$/.exec(q.trim());
  return m ? { g: Number(m[1]), s: Number(m[2]), p: m[3] ? Number(m[3]) : undefined } : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '');

/** best matches first: a name that starts with the text, then a word that does, then one that contains it */
export function rankEntries(entries: PaletteEntry[], q: string, limit = 8): PaletteEntry[] {
  const needle = norm(q).trim();
  if (!needle) return [];
  const scored: { e: PaletteEntry; rank: number }[] = [];
  for (const e of entries) {
    const name = norm(e.label);
    const rank = name === needle ? 0 : name.startsWith(needle) ? 1 : name.split(' ').some((w) => w.startsWith(needle)) ? 2 : name.includes(needle) ? 3 : -1;
    if (rank >= 0) scored.push({ e, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.e.label.localeCompare(b.e.label));
  return scored.slice(0, limit).map((s) => s.e);
}

/** the next planet in a ring, `dir` +1 or -1 */
export function cycleId(ids: string[], current: string, dir: 1 | -1): string {
  if (!ids.length) return current;
  const i = ids.indexOf(current);
  return ids[(i < 0 ? 0 : i + dir + ids.length) % ids.length];
}

/** keystrokes that belong to a text field are never shortcuts */
export function isTypingTarget(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null;
  if (!e || !e.tagName) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) || e.isContentEditable === true;
}
