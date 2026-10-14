import { BUILDINGS, DEFENSE_IDS, SHIP_IDS, TECHS, UNITS } from './data';

/** Everything that wants a picture, with the prompt to paste into an image generator. The file name to save it under is `<id>.png`. */
export type ArtKind = 'building' | 'tech' | 'ship' | 'defense' | 'resource' | 'planet' | 'moon' | 'banner';
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
  banner: (n, d) => `Widescreen banner of ${n}: ${d}, the world low in the frame, a panoramic landscape of space behind it with room for text on the left`,
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
    ...Object.entries(PLANET_LOOKS).map(([k, d]) => make('banner', planetBannerId(k), `${k[0].toUpperCase()}${k.slice(1)} planet`, d)),
    ...Object.entries(MOON_LOOKS).map(([k, d]) => make('banner', moonBannerId(k), `${k[0].toUpperCase()}${k.slice(1)} moon`, d)),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// planet and moon pictures: several of each, and every world keeps the one it was given

/** the names that appear in the file names: planet-<name>.webp and moon-<name>.webp, and planetbanner-<name>.webp and moonbanner-<name>.webp for the wide pictures */
export const PLANET_LOOKS: Record<string, string> = {
  barren: 'a barren grey rock planet with canyons', crystal: 'a planet covered in glowing crystal formations', desert: 'a dry orange desert planet with dunes',
  gasgiant: 'a banded gas giant', ice: 'a frozen white and blue ice planet', jungle: 'a lush green jungle planet under thick cloud',
  lava: 'a molten lava planet with glowing cracks', obsidian: 'a black obsidian planet with faint red veins', ocean: 'a deep blue ocean planet with a few islands',
  ringed: 'a planet with a wide ring system', terran: 'an earth-like planet with continents and oceans', toxic: 'a planet with a sickly green toxic atmosphere',
  aurora: 'a planet wrapped in shimmering aurora light', chrome: 'a planet with a polished metallic surface', fungal: 'a planet covered in glowing fungal forests',
  shattered: 'a cracked, shattered planet with drifting fragments', storm: 'a planet under planet-wide storms and lightning', swamp: 'a misty swamp planet with dark water',
  twilight: 'a planet half in permanent twilight',
  abyss: 'a dark planet cracked by glowing blue lightning', ash: 'a grey ash planet with smouldering vents', canyon: 'a planet carved by enormous canyons',
  copper: 'a planet with a polished copper crust', dawn: 'a planet with a bright dawn line across it', derelict: 'a ringed planet strewn with abandoned wrecks',
  ember: 'a charred planet with glowing ember cracks', glacier: 'a planet of blue glaciers and ice mountains', hive: 'a planet covered in dense hive-like city lights',
  iron: 'a rust-red iron planet with vein-like ridges', jade: 'a green jade planet with a thin ring', lotus: 'a planet shaped like a giant metal lotus',
  maelstrom: 'a planet-wide ocean maelstrom', mirage: 'a planet of frozen dunes under a hazy giant', night: 'a planet dark side only, lit by teal city lights',
  plasma: 'a planet crackling with violet plasma', prism: 'a planet of faceted crystal throwing rainbows', ruin: 'a planet of ancient stepped ruins',
  sanctuary: 'a calm blue and white planet with swirling clouds', savanna: 'a golden savanna planet with lone trees', tempest: 'a planet torn by spiralling tempests',
  thorn: 'a planet bristling with enormous spires', twin: 'a pair of planets orbiting each other', void: 'a nearly black planet with a faint rim of light',
};
export const MOON_LOOKS: Record<string, string> = {
  asteroid: 'an irregular asteroid-like moon', azure: 'a pale blue moon with smooth plains', cratered: 'a grey moon covered in impact craters',
  ice: 'an icy moon with bright fractures', rift: 'a moon split by a glowing rift', volcanic: 'a dark volcanic moon with lava vents',
  basalt: 'a dark basalt moon with columns', bone: 'a pale, bone-white moon', cinder: 'a charred cinder moon', dune: 'a sandy moon with dunes',
  eclipse: 'a moon half in shadow', ember: 'a moon with glowing ember cracks', frost: 'a frost-covered moon', geyser: 'a moon with erupting geysers',
  halo: 'a moon with a glowing halo', kelp: 'a moon with green kelp-like growth', lagoon: 'a moon with turquoise lagoons', mirror: 'a mirror-smooth reflective moon',
  mist: 'a moon wrapped in mist', moss: 'a moss-green moon', obsidian: 'a black glassy obsidian moon', opal: 'an opalescent moon', prism: 'a moon of prismatic crystal',
  quartz: 'a pale quartz moon', rust: 'a rusty red moon', storm: 'a moon with a storm-swirled atmosphere', tempest: 'a moon wracked by tempests',
  thorn: 'a moon bristling with thorn-like spires', tide: 'a moon with tidal seas',
  amber: 'a glowing amber moon', brine: 'a pale salt-crusted moon with cracks', cinnabar: 'a deep red cinnabar moon', citrine: 'a yellow citrine moon over a blue world',
  cobalt: 'a bright cobalt-blue moon', copper: 'a copper-brown moon over a blue world', coral: 'a moon grown over with pink coral', garnet: 'a dark garnet-red moon',
  granite: 'a grey granite moon', ivory: 'a smooth ivory moon over a blue world', jade: 'a green jade moon', lapis: 'a deep blue lapis moon with gold flecks',
  malachite: 'a banded green malachite moon', marble: 'a white marble moon with veins', onyx: 'a black onyx moon with white veins', pearl: 'a pearl-white moon',
  pumice: 'a porous pumice moon', ruby: 'a red ruby moon', sandstone: 'a layered sandstone moon', sapphire: 'a blue sapphire moon with lightning',
  slate: 'a dark slate moon', sulfur: 'a bright yellow sulfur moon', topaz: 'a golden topaz moon', verdigris: 'a teal verdigris moon',
};
export const planetArtId = (look: string) => `planet-${look}`;
export const moonArtId = (look: string) => `moon-${look}`;
export const planetBannerId = (look: string) => `planetbanner-${look}`;
export const moonBannerId = (look: string) => `moonbanner-${look}`;

/** which looks suit a planet's temperature, so an ice world is never a hot one: the hotter positions get lava and desert, the colder ones ice and rock */
export function planetPool(maxTemp: number): string[] {
  if (maxTemp >= 70) return ['lava', 'desert', 'obsidian', 'toxic', 'crystal', 'chrome', 'shattered', 'storm', 'ash', 'ember', 'copper', 'iron', 'canyon', 'plasma'];
  if (maxTemp >= 20) return ['desert', 'jungle', 'terran', 'ocean', 'toxic', 'swamp', 'fungal', 'storm', 'savanna', 'canyon', 'jade', 'lotus', 'hive', 'thorn', 'prism', 'iron', 'copper'];
  if (maxTemp > -20) return ['terran', 'ocean', 'jungle', 'barren', 'ringed', 'swamp', 'fungal', 'twilight', 'aurora', 'sanctuary', 'dawn', 'maelstrom', 'jade', 'lotus', 'ruin', 'mirage', 'twin', 'night', 'tempest', 'hive'];
  return ['ice', 'barren', 'ringed', 'gasgiant', 'crystal', 'aurora', 'twilight', 'shattered', 'chrome', 'glacier', 'abyss', 'void', 'night', 'derelict', 'mirage', 'tempest', 'maelstrom', 'ruin', 'prism', 'twin'];
}
/** the pools before more looks were added: worlds that already existed keep the look they were showing */
export function legacyPlanetPool(maxTemp: number): string[] {
  if (maxTemp >= 70) return ['lava', 'desert', 'obsidian', 'toxic', 'crystal'];
  if (maxTemp >= 20) return ['desert', 'jungle', 'terran', 'ocean', 'toxic'];
  if (maxTemp > -20) return ['terran', 'ocean', 'jungle', 'barren', 'ringed'];
  return ['ice', 'barren', 'ringed', 'gasgiant', 'crystal'];
}
export const LEGACY_MOON_LOOKS = ['asteroid', 'azure', 'cratered', 'ice', 'rift', 'volcanic'];

const fnv = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** the same world id always gives the same look from the same pool; the server stores the result so a later change of the pools never changes a world */
export function pickLook(worldId: string, pool: string[]): string { return pool[fnv(worldId) % pool.length]; }
export const planetLook = (planetId: string, maxTemp: number) => pickLook(planetId, planetPool(maxTemp));
export const moonLook = (moonId: string) => pickLook(moonId, Object.keys(MOON_LOOKS));
export const legacyPlanetLook = (planetId: string, maxTemp: number) => pickLook(planetId, legacyPlanetPool(maxTemp));
export const legacyMoonLook = (moonId: string) => pickLook(moonId, LEGACY_MOON_LOOKS);

/** the picture a downloaded file is for: its name without the generator's prefix and number, matched to an item ignoring case, in the folder it came from */
export function artIdFromFile(file: string, folder: string, ids: string[]): string | null {
  const base = file.replace(/\.[a-z0-9]+$/i, '').replace(/^media-generation-/, '').replace(/-\d+-[0-9a-f-]{20,}$/i, '').toLowerCase()
    // the generator sometimes writes a sentence instead of the name ("copper-moon-game-asset-copper", "jade-planet-banner-game-asse"): the first words say what it is
    .replace(/^([a-z]+)-(moon|planet)(-banner)?-game-.*$/, (_m, a: string, b: string, c?: string) => `${a}${b}${c ? 'banner' : ''}`);
  if (folder === 'planets') { const look = Object.keys(PLANET_LOOKS).find((k) => base === k || base === `${k}planet`); return look ? planetArtId(look) : null; }
  if (folder === 'moons') { const look = Object.keys(MOON_LOOKS).find((k) => base === k || base === `${k}moon`); return look ? moonArtId(look) : null; }
  if (folder === 'planetbanners' || folder === 'banners') {
    const planet = Object.keys(PLANET_LOOKS).find((k) => base === `${k}planetbanner` || base === `${k}banner`);
    if (planet) return planetBannerId(planet);
    const moon = Object.keys(MOON_LOOKS).find((k) => base === `${k}moonbanner`);
    return moon ? moonBannerId(moon) : null;
  }
  return ids.find((id) => id.toLowerCase() === base) ?? null;
}
