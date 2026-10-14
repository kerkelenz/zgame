import { BUILDINGS, TECHS } from '../shared/data';
import { lvl } from '../shared/formulas';
import type { OrderStep } from '../shared/orders';
import type { BuildingId, TechId } from '../shared/types';
import type { PlanetRole } from '../shared/roles';
import { uid, type Planet, type Player, type World } from './world';

/** Public link cards, kept with the shared battle reports in `w.shared`. A card is a snapshot: later changes do not show in it. */
export interface PlanetCard {
  kind: 'planet';
  name: string; owner: string; coords: { g: number; s: number; p: number }; isMoon: boolean; diameter: number | null; fields: number; maxTemp: number; role: PlanetRole | null;
  buildings: Record<string, number>; techs: Record<string, number>; fleet?: Record<string, number>; defenses?: Record<string, number>;
}
export type { OrderStep };
export interface OrderCard { kind: 'order'; owner: string; planet: string; steps: OrderStep[] }
export type ShareCard = PlanetCard | OrderCard;

const MAX_SHARED = 500;
const positive = (o: Record<string, number | undefined>): Record<string, number> => Object.fromEntries(Object.entries(o).filter(([, n]) => (n ?? 0) > 0)) as Record<string, number>;

export function planetCard(owner: Player, planet: Planet, withShips: boolean): PlanetCard {
  const card: PlanetCard = {
    kind: 'planet', name: planet.name, owner: owner.username, coords: { ...planet.coords }, isMoon: !!planet.isMoon, diameter: planet.diameter ?? null, fields: planet.fields, maxTemp: planet.maxTemp,
    role: planet.role ?? null, buildings: positive(planet.buildings), techs: planet.isMoon ? {} : positive(owner.techs),
  };
  if (withShips) { card.fleet = positive(planet.fleet); card.defenses = positive(planet.defenses); }
  return card;
}

/** what is queued right now, as an ordered list of "take this to that level": the running job first, then the waiting ones, buildings of the planet then research */
export function orderCard(owner: Player, planet: Planet): OrderCard {
  const steps: OrderStep[] = [];
  const next: Record<string, number> = {};
  const add = (kind: 'building' | 'tech', id: string, base: number, running?: number) => {
    const level = running ?? (next[id] ?? base) + 1;
    next[id] = level;
    steps.push({ kind, id, level });
  };
  const b = planet.buildQueue;
  if (b && !b.down) { next[b.id] = b.level; steps.push({ kind: 'building', id: b.id, level: b.level }); }
  for (const id of planet.buildBacklog ?? []) add('building', id, lvl(planet.buildings, id as BuildingId) + (b && !b.down && b.id === id ? 1 : 0));
  const r = owner.research;
  const nextT: Record<string, number> = {};
  if (r) { nextT[r.id] = r.level; steps.push({ kind: 'tech', id: r.id, level: r.level }); }
  for (const q of owner.researchBacklog ?? []) {
    const level = (nextT[q.id] ?? lvl(owner.techs, q.id as TechId) + (r?.id === q.id ? 1 : 0)) + 1;
    nextT[q.id] = level;
    steps.push({ kind: 'tech', id: q.id, level });
  }
  return { kind: 'order', owner: owner.username, planet: planet.name, steps: steps.filter((s) => s.kind === 'building' ? s.id in BUILDINGS : s.id in TECHS) };
}

export function publish(w: World, card: ShareCard, subject: string, now: number): string {
  const shared = (w.shared ||= {});
  const id = (card.kind === 'planet' ? 'p' : 'o') + uid(5);
  shared[id] = { id, at: now, subject, report: card };
  const ids = Object.keys(shared);
  if (ids.length > MAX_SHARED) for (const old of ids.sort((x, y) => shared[x].at - shared[y].at).slice(0, ids.length - MAX_SHARED)) delete shared[old];
  return id;
}
