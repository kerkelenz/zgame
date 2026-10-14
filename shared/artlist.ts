import { BUILDINGS, DEFENSE_IDS, SHIP_IDS, TECHS, UNITS } from './data';

/** Everything that wants a picture, with the prompt to paste into an image generator. The file name to save it under is `<id>.png`. */
export type ArtKind = 'building' | 'tech' | 'ship' | 'defense' | 'resource';
export interface ArtItem { id: string; kind: ArtKind; name: string; desc: string; prompt: string }

export const ART_STYLE =
  'Sci-fi space strategy game icon, painterly digital illustration, single subject centered, dark deep-space background with a faint teal rim light, ' +
  'soft glow, high detail, square 1:1, no text, no letters, no logo, no border, no watermark';

const SUBJECT: Record<ArtKind, (name: string, desc: string) => string> = {
  building: (n, d) => `${n}, a large industrial structure on an alien planet surface. ${d}`,
  tech: (n, d) => `Abstract glowing emblem symbolising ${n}: floating holographic energy and geometric forms. ${d}`,
  ship: (n, d) => `${n}, a spaceship seen from a three-quarter angle against deep space. ${d}`,
  defense: (n, d) => `${n}, a planetary defense installation firing into the sky. ${d}`,
  resource: (n, d) => `${n}, close-up of the raw material or its container. ${d}`,
};

const RESOURCES: { id: string; name: string; desc: string }[] = [
  { id: 'res-metal', name: 'Metal', desc: 'Stacked steel ingots and raw ore.' },
  { id: 'res-crystal', name: 'Crystal', desc: 'Cluster of cut blue crystals glowing from within.' },
  { id: 'res-deuterium', name: 'Vespene Gas', desc: 'A canister of glowing green gas.' },
  { id: 'res-energy', name: 'Energy', desc: 'A crackling yellow energy cell.' },
];

const make = (kind: ArtKind, id: string, name: string, desc: string): ArtItem => ({
  id, kind, name, desc, prompt: `${SUBJECT[kind](name, desc.replace(/\s+/g, ' ').trim())} ${ART_STYLE}`,
});

export function artItems(): ArtItem[] {
  return [
    ...RESOURCES.map((r) => make('resource', r.id, r.name, r.desc)),
    ...Object.values(BUILDINGS).map((b) => make('building', b.id, b.name, b.desc)),
    ...Object.values(TECHS).map((t) => make('tech', t.id, t.name, t.desc)),
    ...SHIP_IDS.map((id) => make('ship', id, UNITS[id].name, UNITS[id].desc)),
    ...DEFENSE_IDS.map((id) => make('defense', id, UNITS[id].name, UNITS[id].desc)),
  ];
}
