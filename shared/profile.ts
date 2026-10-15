import { MOON_LOOKS, PLANET_LOOKS } from './artlist';
import { DEFENSE_IDS, SHIP_IDS, UNITS } from './data';

/** the most achievements a commander can pin to the top of their profile */
export const PIN_MAX = 6;

export type AvatarKind = 'ship' | 'defense' | 'planet' | 'moon';
export interface AvatarChoice { id: string; kind: AvatarKind; key: string; name: string }

const word = (k: string) => `${k[0].toUpperCase()}${k.slice(1)}`;

/** the gallery a commander picks a profile picture from: ships, defenses, planet looks and moon looks (the id is `kind:key`) */
export function avatarGallery(): AvatarChoice[] {
  const out: AvatarChoice[] = [];
  for (const k of SHIP_IDS) out.push({ id: `ship:${k}`, kind: 'ship', key: k, name: UNITS[k].name });
  for (const k of DEFENSE_IDS) if (!UNITS[k].missile) out.push({ id: `defense:${k}`, kind: 'defense', key: k, name: UNITS[k].name });
  for (const k of Object.keys(PLANET_LOOKS)) out.push({ id: `planet:${k}`, kind: 'planet', key: k, name: `${word(k)} planet` });
  for (const k of Object.keys(MOON_LOOKS)) out.push({ id: `moon:${k}`, kind: 'moon', key: k, name: `${word(k)} moon` });
  return out;
}

export const isAvatar = (id: unknown): id is string => typeof id === 'string' && avatarGallery().some((a) => a.id === id);
