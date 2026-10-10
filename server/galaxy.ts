import { buildingPoints, techPoints, unitPoints, lvl } from '../shared/formulas';
import { BUILDING_IDS, DEFENSE_IDS, SHIP_IDS, TECH_IDS, POS_DIAMETER, fieldsFromDiameter } from '../shared/data';
import { extraExpeditionSlots } from './perks';
import type { Coords, UnitId } from '../shared/types';
import { GameError, ck, planetAt, uid, type Planet, type Player, type World } from './world';

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

export function tempFor(p: number): number {
  return Math.round(240 - (p - 1) * 26 + rnd(-20, 20));
}
/** Orbit decides the size: inner worlds are small, middle ones large. Homeworlds are a fixed classic 163 fields. */
export function diameterFor(p: number, home: boolean): number {
  if (home) return 12800;
  const [lo, hi] = POS_DIAMETER[p] ?? [8000, 12000];
  return Math.round((lo + Math.random() * (hi - lo)) / 100) * 100;
}
export function fieldsFor(diameter: number, home: boolean): number {
  return home ? 163 : fieldsFromDiameter(diameter);
}

export function inBounds(w: World, c: Coords, allowExpedition = false): boolean {
  const { galaxies, systems, positions } = w.config;
  const maxP = allowExpedition ? positions + 1 : positions;
  return Number.isInteger(c.g) && Number.isInteger(c.s) && Number.isInteger(c.p) &&
    c.g >= 1 && c.g <= galaxies && c.s >= 1 && c.s <= systems && c.p >= 1 && c.p <= maxP;
}

export function createPlanet(w: World, owner: Player, coords: Coords, opts: { home?: boolean; name?: string; now?: number } = {}): Planet {
  const now = opts.now ?? Date.now();
  const home = !!opts.home;
  const diameter = diameterFor(coords.p, home);
  const planet: Planet = {
    id: uid(),
    ownerId: owner.id,
    name: opts.name ?? (home ? 'Homeworld' : 'Colony'),
    coords,
    diameter,
    fields: fieldsFor(diameter, home),
    maxTemp: tempFor(coords.p),
    isHome: home,
    buildings: {},
    resources: home ? { ...w.config.startResources } : { metal: 500, crystal: 300, deuterium: 100 },
    updatedAt: now,
    buildQueue: null,
    buildBacklog: [],
    shipyardQueue: [],
    fleet: {},
    defenses: {},
    settings: {},
  };
  w.planets[planet.id] = planet;
  owner.planetIds.push(planet.id);
  return planet;
}

/** Find a free slot for a new player's homeworld, spreading players across systems. */
export function findHomeSlot(w: World): Coords {
  const { galaxies, systems } = w.config;
  for (let attempt = 0; attempt < 5000; attempt++) {
    const c = { g: rnd(1, galaxies), s: rnd(1, systems), p: rnd(4, 12) };
    if (!planetAt(w, c)) return c;
  }
  for (let g = 1; g <= galaxies; g++) for (let s = 1; s <= systems; s++) for (let p = 1; p <= w.config.positions; p++) {
    const c = { g, s, p };
    if (!planetAt(w, c)) return c;
  }
  throw new GameError('The universe is full', 503);
}

export function colonyCount(w: World, player: Player): number {
  return player.planetIds.filter((id) => !w.planets[id]?.isMoon).length;
}

export function createMoon(w: World, parent: Planet, now: number, chance = 0.05): Planet {
  const owner = w.players[parent.ownerId];
  const moon: Planet = {
    id: uid(), ownerId: owner.id, name: `${parent.name} Moon`, coords: { ...parent.coords }, fields: 1,
    diameter: Math.round(1000 + chance * 30000 + Math.random() * 3000),
    maxTemp: parent.maxTemp - 20, isHome: false, isMoon: true, parentId: parent.id, buildings: {},
    resources: { metal: 0, crystal: 0, deuterium: 0 }, updatedAt: now, buildQueue: null, buildBacklog: [], shipyardQueue: [],
    fleet: {}, defenses: {}, settings: {},
  };
  w.planets[moon.id] = moon;
  owner.planetIds.push(moon.id);
  return moon;
}

export function maxPlanets(player: Player): number {
  return 1 + Math.ceil(lvl(player.techs, 'astrophysics') / 2);
}
export function maxExpeditions(player: Player): number {
  return Math.floor(Math.sqrt(lvl(player.techs, 'astrophysics'))) + extraExpeditionSlots(player);
}

export interface Points { buildings: number; research: number; fleet: number; defense: number; total: number }

export function playerPoints(w: World, p: Player): Points {
  let buildings = 0, research = 0, fleet = 0, defense = 0;
  for (const id of p.planetIds) {
    const pl = w.planets[id];
    if (!pl) continue;
    for (const b of BUILDING_IDS) buildings += buildingPoints(b, lvl(pl.buildings, b));
    for (const s of SHIP_IDS) fleet += unitPoints(s, pl.fleet[s] || 0);
    for (const d of DEFENSE_IDS) defense += unitPoints(d, pl.defenses[d] || 0);
  }
  for (const t of TECH_IDS) research += techPoints(t, lvl(p.techs, t));
  for (const m of Object.values(w.movements)) {
    if (m.ownerId !== p.id) continue;
    for (const [id, n] of Object.entries(m.ships)) fleet += unitPoints(id as UnitId, n || 0);
  }
  const r = (x: number) => Math.floor(x);
  return { buildings: r(buildings), research: r(research), fleet: r(fleet), defense: r(defense), total: r(buildings + research + fleet + defense) };
}

export function isProtected(w: World, attacker: Player, target: Player): boolean {
  if (target.npc) return false; // computer empires are always fair game
  const a = playerPoints(w, attacker).total, t = playerPoints(w, target).total;
  const { protectionPoints, protectionRatio } = w.config;
  const min = Math.min(a, t), max = Math.max(a, t);
  if (min < protectionPoints) return true;
  if (max > protectionRatio * min && min < protectionPoints * 25) return true;
  return false;
}

export interface GalaxySlot {
  p: number;
  moon: null | { id: string; name: string };
  planet: null | {
    id: string; name: string; owner: string; ownerId: string; alliance: string | null;
    mine: boolean; protectedFor: boolean; debris: { metal: number; crystal: number } | null;
    /** computer empire disposition, or null for a commander */
    npc: string | null; faction: string | null;
  };
  debris: { metal: number; crystal: number } | null;
}

export function galaxyView(w: World, viewer: Player, g: number, s: number): GalaxySlot[] {
  const slots: GalaxySlot[] = [];
  const byPos: Record<number, Planet> = {};
  for (const pl of Object.values(w.planets)) if (pl.coords.g === g && pl.coords.s === s) byPos[pl.coords.p] = pl;
  for (let p = 1; p <= w.config.positions; p++) {
    const pl = byPos[p];
    const debris = w.debris[ck({ g, s, p })] ?? null;
    const moon = Object.values(w.planets).find((x) => x.isMoon && x.coords.g === g && x.coords.s === s && x.coords.p === p);
    if (!pl) { slots.push({ p, planet: null, moon: null, debris }); continue; }
    const owner = w.players[pl.ownerId];
    const ally = owner.allianceId ? w.alliances[owner.allianceId]?.tag ?? null : null;
    slots.push({
      p,
      debris,
      moon: moon ? { id: moon.id, name: moon.name } : null,
      planet: {
        id: pl.id, name: pl.name, owner: owner.username, ownerId: owner.id, alliance: ally,
        mine: owner.id === viewer.id,
        npc: owner.npc?.status ?? null,
        faction: owner.npc ? owner.npc.faction : owner.faction,
        protectedFor: owner.id !== viewer.id && isProtected(w, viewer, owner),
        debris,
      },
    });
  }
  return slots;
}
