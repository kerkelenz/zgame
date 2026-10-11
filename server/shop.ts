import { addRes } from '../shared/formulas';
import type { Res } from '../shared/types';
import { planetCapacity, planetProduction, updatePlanet } from './economy';
import { assertActive } from './vacation';
import { GameError, type Planet, type Player, type World } from './world';

/** Command Credits buy shortcuts, never power: crates of production and rushes of the job in progress. */
export interface ShopItem { id: string; name: string; desc: string; price: number }

export const SHOP: ShopItem[] = [
  { id: 'crate_small', name: 'Supply crate', desc: '4 hours of this planet\'s production, delivered now (capped by free storage).', price: 150 },
  { id: 'crate_large', name: 'Cargo container', desc: '24 hours of this planet\'s production, delivered now (capped by free storage).', price: 700 },
  { id: 'build_rush', name: 'Construction rush', desc: 'Halves the remaining time of the building under construction on this planet.', price: 250 },
  { id: 'research_rush', name: 'Research rush', desc: 'Halves the remaining time of your current research.', price: 350 },
];
const BY_ID = Object.fromEntries(SHOP.map((i) => [i.id, i]));

const HOURS: Record<string, number> = { crate_small: 4, crate_large: 24 };

export function shopView(p: Player) {
  return { credits: Math.floor(p.credits), items: SHOP };
}

export function buyItem(w: World, p: Player, planet: Planet, id: string, now: number) {
  assertActive(p, 'shop');
  if (planet.ownerId !== p.id) throw new GameError('Not your planet', 403);
  const item = BY_ID[id];
  if (!item) throw new GameError('Unknown item', 404);
  if (p.credits < item.price) throw new GameError(`You need ${item.price} Command Credits`);
  updatePlanet(w, planet, now);
  let result: string;
  if (HOURS[id]) {
    if (planet.isMoon) throw new GameError('Moons produce nothing');
    const rate = planetProduction(w, planet), cap = planetCapacity(w, planet);
    const give: Res = { metal: 0, crystal: 0, deuterium: 0 };
    for (const k of ['metal', 'crystal', 'deuterium'] as const) give[k] = Math.max(0, Math.min(Math.floor(rate[k] * HOURS[id]), Math.floor(cap[k] - planet.resources[k])));
    if (give.metal + give.crystal + give.deuterium <= 0) throw new GameError('Your storage is full - nothing to deliver');
    planet.resources = addRes(planet.resources, give);
    result = `Delivered ${give.metal.toLocaleString('en-US')} metal, ${give.crystal.toLocaleString('en-US')} crystal, ${give.deuterium.toLocaleString('en-US')} deuterium.`;
  } else if (id === 'build_rush') {
    const j = planet.buildQueue;
    if (!j || j.end <= now) throw new GameError('Nothing is under construction here');
    j.end = now + Math.ceil((j.end - now) / 2);
    result = `${j.id} will finish in ${Math.ceil((j.end - now) / 60000)} minutes.`;
  } else {
    const j = p.research;
    if (!j || j.end <= now) throw new GameError('Nothing is being researched');
    j.end = now + Math.ceil((j.end - now) / 2);
    result = `${j.id} will finish in ${Math.ceil((j.end - now) / 60000)} minutes.`;
  }
  p.credits -= item.price;
  return result;
}
