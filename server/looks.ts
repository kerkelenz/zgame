import { MOON_LOOKS, PLANET_LOOKS, legacyMoonLook, legacyPlanetLook, moonLook, pickLook, planetLook, planetPool } from '../shared/artlist';
import type { Planet, World } from './world';

/**
 * The picture a planet or moon shows (and its banner) is a "look", stored on the world the first time it is needed so it never changes again,
 * even when more looks are added later. Commanders' worlds each get a look nobody else's world has, as far as the looks last: a planet takes
 * a look that suits its temperature and that no other commander's planet shows yet; once the suitable ones are all taken, any look still unused
 * goes before a repeat. Moons draw from all of theirs. Computer empires do not use up looks (they take a look by their id).
 */
const humanOwned = (w: World, q: Planet) => !w.players[q.ownerId]?.npc;

export function assignLook(p: Planet, w?: World): string {
  if (p.look) return p.look;
  const own = w ? humanOwned(w, p) : false;
  if (!w || !own) return (p.look = p.isMoon ? moonLook(p.id) : planetLook(p.id, p.maxTemp));
  const all = Object.keys(p.isMoon ? MOON_LOOKS : PLANET_LOOKS);
  const pool = p.isMoon ? all : planetPool(p.maxTemp);
  const used = new Map<string, number>();
  for (const q of Object.values(w.planets)) if (q !== p && q.look && !!q.isMoon === !!p.isMoon && humanOwned(w, q)) used.set(q.look, (used.get(q.look) ?? 0) + 1);
  const count = (l: string) => used.get(l) ?? 0;
  const lowest = (list: string[]) => Math.min(...list.map(count));
  const from = lowest(all) < lowest(pool) ? all : pool;
  const least = lowest(from);
  return (p.look = pickLook(p.id, from.filter((l) => count(l) === least)));
}

/** once, for a save from before looks were stored: pin what every existing world was showing */
export function migrateLooks(w: World): void {
  if (w.looksAssigned) return;
  for (const p of Object.values(w.planets)) if (!p.look) p.look = p.isMoon ? legacyMoonLook(p.id) : legacyPlanetLook(p.id, p.maxTemp);
  w.looksAssigned = true;
}

/**
 * once: commanders' worlds that share a look with an older world of another commander (or their own) are given one still unused, so every
 * world looks different as far as the looks last. The oldest world keeps its picture.
 */
export function dedupeLooks(w: World): void {
  if (w.looksDeduped) return;
  const seen = new Set<string>();
  const again: Planet[] = [];
  for (const p of Object.values(w.planets)) {
    if (!p.look || !humanOwned(w, p)) continue;
    const key = `${p.isMoon ? 'm' : 'p'}:${p.look}`;
    if (seen.has(key)) again.push(p); else seen.add(key);
  }
  for (const p of again) p.look = undefined;
  for (const p of again) assignLook(p, w);
  w.looksDeduped = true;
}
