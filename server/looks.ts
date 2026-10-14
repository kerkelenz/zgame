import { legacyMoonLook, legacyPlanetLook, moonLook, planetLook } from '../shared/artlist';
import type { Planet, World } from './world';

/**
 * The picture a planet or moon shows (and its banner) is a "look", stored on the world the first time it is needed so it never changes again,
 * even when more looks are added later. A new world picks from every look that suits its temperature (any, for a moon); worlds that already
 * existed before looks were stored keep the look they were showing, taken from the pools that were in use then.
 */
export function assignLook(p: Planet): string {
  if (!p.look) p.look = p.isMoon ? moonLook(p.id) : planetLook(p.id, p.maxTemp);
  return p.look;
}

/** once, for a save from before looks were stored: pin what every existing world was showing */
export function migrateLooks(w: World): void {
  if (w.looksAssigned) return;
  for (const p of Object.values(w.planets)) if (!p.look) p.look = p.isMoon ? legacyMoonLook(p.id) : legacyPlanetLook(p.id, p.maxTemp);
  w.looksAssigned = true;
}
