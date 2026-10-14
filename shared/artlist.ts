import { BUILDINGS, DEFENSE_IDS, SHIP_IDS, TECHS, UNITS } from './data';

/** Everything that wants a picture, with the prompt to paste into an image generator. The file name to save it under is `<id>.png`. */
export type ArtKind = 'building' | 'tech' | 'ship' | 'defense' | 'resource' | 'planet' | 'moon';
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
  planet: (n, d) => `${n}: ${d}, a whole planet floating in space, seen from orbit`,
  moon: (n, d) => `${n}: ${d}, a whole moon floating in space`,
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
    ...Object.entries(PLANET_LOOKS).map(([k, d]) => make('planet', planetArtId(k), `${k[0].toUpperCase()}${k.slice(1)} planet`, d)),
    ...Object.entries(MOON_LOOKS).map(([k, d]) => make('moon', moonArtId(k), `${k[0].toUpperCase()}${k.slice(1)} moon`, d)),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// planet and moon pictures: several of each, and every world keeps the one it was given

/** the names that appear in the file names: planet-<name>.webp and moon-<name>.webp */
export const PLANET_LOOKS: Record<string, string> = {
  barren: 'a barren grey rock planet with canyons', crystal: 'a planet covered in glowing crystal formations', desert: 'a dry orange desert planet with dunes',
  gasgiant: 'a banded gas giant', ice: 'a frozen white and blue ice planet', jungle: 'a lush green jungle planet under thick cloud',
  lava: 'a molten lava planet with glowing cracks', obsidian: 'a black obsidian planet with faint red veins', ocean: 'a deep blue ocean planet with a few islands',
  ringed: 'a planet with a wide ring system', terran: 'an earth-like planet with continents and oceans', toxic: 'a planet with a sickly green toxic atmosphere',
};
export const MOON_LOOKS: Record<string, string> = {
  asteroid: 'an irregular asteroid-like moon', azure: 'a pale blue moon with smooth plains', cratered: 'a grey moon covered in impact craters',
  ice: 'an icy moon with bright fractures', rift: 'a moon split by a glowing rift', volcanic: 'a dark volcanic moon with lava vents',
};
export const planetArtId = (look: string) => `planet-${look}`;
export const moonArtId = (look: string) => `moon-${look}`;

/** which looks suit a planet's temperature, so an ice world is never a hot one: the hotter positions get lava and desert, the colder ones ice and rock */
export function planetPool(maxTemp: number): string[] {
  if (maxTemp >= 70) return ['lava', 'desert', 'obsidian', 'toxic', 'crystal'];
  if (maxTemp >= 20) return ['desert', 'jungle', 'terran', 'ocean', 'toxic'];
  if (maxTemp > -20) return ['terran', 'ocean', 'jungle', 'barren', 'ringed'];
  return ['ice', 'barren', 'ringed', 'gasgiant', 'crystal'];
}

const fnv = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** the same world id always gives the same look: nothing is stored, the id decides */
export function pickLook(worldId: string, pool: string[]): string { return pool[fnv(worldId) % pool.length]; }
export const planetLook = (planetId: string, maxTemp: number) => pickLook(planetId, planetPool(maxTemp));
export const moonLook = (moonId: string) => pickLook(moonId, Object.keys(MOON_LOOKS));

/** the picture a downloaded file is for: its name without the generator's prefix and number, matched to an item ignoring case, in the folder it came from */
export function artIdFromFile(file: string, folder: string, ids: string[]): string | null {
  const base = file.replace(/\.[a-z0-9]+$/i, '').replace(/^media-generation-/, '').replace(/-\d+-[0-9a-f-]{20,}$/i, '').toLowerCase();
  if (folder === 'planets') { const look = Object.keys(PLANET_LOOKS).find((k) => base === k || base === `${k}planet`); return look ? planetArtId(look) : null; }
  if (folder === 'moons') { const look = Object.keys(MOON_LOOKS).find((k) => base === k || base === `${k}moon`); return look ? moonArtId(look) : null; }
  return ids.find((id) => id.toLowerCase() === base) ?? null;
}
