import { UNITS } from '../shared/data';
import { galaxyView } from './galaxy';
import { assignLook } from './looks';
import { outpostTag } from './outposts';
import { sectorOf } from './sectors';
import { fleetsView } from './views';
import { sameCoords } from '../shared/formulas';
import { GameError, ck, type Planet, type Player, type World } from './world';

/**
 * Data for the Map page: four zoom levels (all galaxies, one galaxy, one system, one planet) built from what a commander may know. Their own
 * worlds are shown in full; any other world only with what is public (owner, alliance, activity, protection, outposts, the moving fleets they can
 * see) and what their latest spy report on it found, with its age. Nothing about another commander's defenses or fleet is ever sent without a report.
 */
const worth = (u: Record<string, number | undefined> | undefined) => Object.entries(u ?? {}).reduce((s, [id, n]) => s + (n || 0) * ((UNITS as any)[id]?.cost.metal + (UNITS as any)[id]?.cost.crystal || 0), 0);
type Coords = { g: number; s: number; p: number };
export interface MapMove { id: string; kind: 'own' | 'hostile' | 'ally' | 'guest'; mission: string; phase: string; from: Coords; to: Coords; departAt: number; arriveAt: number; returnAt?: number; flightMs?: number; ships: number; owner: string }

/** every movement the commander can know about: their own, hostile fleets heading for them or an ally, allies holding at their planets */
export function visibleMoves(w: World, p: Player): MapMove[] {
  const v = fleetsView(w, p);
  const count = (s: Record<string, number | undefined> | undefined) => Object.values(s ?? {}).reduce<number>((t, n) => t + (n || 0), 0);
  const out: MapMove[] = [];
  const add = (m: any, kind: MapMove['kind'], ships?: number) => out.push({ id: m.id, kind, mission: m.mission, phase: m.phase, from: m.from, to: m.to, departAt: m.departAt, arriveAt: m.arriveAt, returnAt: m.returnAt, flightMs: m.flightMs, ships: ships ?? count(m.ships), owner: m.ownerName });
  for (const m of v.mine) add(m, 'own');
  for (const m of v.incoming) add(m, m.ally ? 'ally' : 'hostile', (m as any).shipCount ?? undefined);
  for (const m of v.stationed) add(m, 'guest');
  return out;
}

const inSystem = (c: Coords, g: number, s: number) => c.g === g && c.s === s;

export function mapUniverse(w: World, p: Player, now: number) {
  const moves = visibleMoves(w, p);
  const galaxies = Array.from({ length: w.config.galaxies }, (_, i) => i + 1).map((g) => {
    let planets = 0, mine = 0, npc = 0;
    const occupied = new Set<number>();
    for (const pl of Object.values(w.planets)) {
      if (pl.isMoon || pl.coords.g !== g) continue;
      planets++; occupied.add(pl.coords.s);
      const owner = w.players[pl.ownerId];
      if (pl.ownerId === p.id) mine++; else if (owner?.npc) npc++;
    }
    const holders = new Map<string, { tag: string; count: number; mine: boolean }>();
    for (const [k, h] of Object.entries(w.sectors ?? {})) {
      if (Number(k.split(':')[0]) !== g) continue;
      const a = w.alliances[h.allianceId];
      if (!a) continue;
      const cur = holders.get(a.id) ?? { tag: a.tag, count: 0, mine: a.id === p.allianceId };
      cur.count++; holders.set(a.id, cur);
    }
    return {
      g, systems: w.config.systems, occupied: occupied.size, planets, mine, npc,
      outposts: (w.outposts ?? []).filter((o) => w.planets[o.planetId]?.coords.g === g && o.state === 'guarded').length,
      holders: [...holders.values()].sort((a, b) => b.count - a.count).slice(0, 3),
      rift: w.invasion && w.invasion.rift.g === g ? { phase: w.invasion.phase } : null,
      traffic: moves.filter((m) => m.from.g === g || m.to.g === g).length,
      alert: moves.some((m) => m.kind === 'hostile' && m.to.g === g && m.phase === 'outbound'),
    };
  });
  return { galaxies, moves, now };
}

export function mapGalaxy(w: World, p: Player, g: number, now: number) {
  if (!(g >= 1 && g <= w.config.galaxies)) throw new GameError('No such galaxy', 404);
  const moves = visibleMoves(w, p);
  type Sys = { s: number; planets: number; mine: number; allies: number; npc: number; others: number; outposts: number; debris: number; holder: { tag: string; mine: boolean } | null; rift: boolean; alert: { arriveAt: number; count: number } | null; traffic: number };
  const systems: Record<number, Sys> = {};
  const sys = (s: number): Sys => (systems[s] ??= { s, planets: 0, mine: 0, allies: 0, npc: 0, others: 0, outposts: 0, debris: 0, holder: null, rift: false, alert: null, traffic: 0 });
  const me = p.allianceId;
  for (const pl of Object.values(w.planets)) {
    if (pl.isMoon || pl.coords.g !== g) continue;
    const o = sys(pl.coords.s), owner = w.players[pl.ownerId];
    o.planets++;
    if (pl.ownerId === p.id) o.mine++;
    else if (owner?.npc) { o.npc++; if (outpostTag(w, pl)?.state === 'guarded') o.outposts++; }
    else if (me && owner?.allianceId === me) o.allies++;
    else o.others++;
  }
  for (const k of Object.keys(w.debris)) { const [dg, ds] = k.split(':').map(Number); if (dg === g) { const f = w.debris[k]; if (f.metal + f.crystal > 0) sys(ds).debris++; } }
  for (const [k, h] of Object.entries(w.sectors ?? {})) { const [sg, ss] = k.split(':').map(Number); if (sg === g && w.alliances[h.allianceId]) sys(ss).holder = { tag: w.alliances[h.allianceId].tag, mine: h.allianceId === me }; }
  if (w.invasion && w.invasion.rift.g === g) sys(w.invasion.rift.s).rift = true;
  for (const m of moves) {
    for (const c of [m.from, m.to]) if (c.g === g) sys(c.s).traffic++;
    if (m.kind === 'hostile' && m.phase === 'outbound' && m.to.g === g) { const o = sys(m.to.s); o.alert = { arriveAt: o.alert ? Math.min(o.alert.arriveAt, m.arriveAt) : m.arriveAt, count: (o.alert?.count ?? 0) + 1 }; }
  }
  return { g, systemCount: w.config.systems, systems: Object.values(systems).sort((a, b) => a.s - b.s), moves: moves.filter((m) => m.from.g === g || m.to.g === g), now };
}

/** what the commander's latest spy report said about a world, with its age; null when there is none */
function intelOf(p: Player, planet: Planet) {
  const e = p.spyArchive?.[planet.id];
  if (!e) return null;
  const r = e.report as { fleet?: Record<string, number>; defenses?: Record<string, number>; level?: number } | undefined;
  return { at: e.at, level: r?.level ?? null, fleetValue: r?.fleet ? Math.round(worth(r.fleet)) : null, defenseValue: r?.defenses ? Math.round(worth(r.defenses)) : null, ships: r?.fleet ? Object.values(r.fleet).reduce((t, n) => t + (n || 0), 0) : null, defenses: r?.defenses ? Object.values(r.defenses).reduce((t, n) => t + (n || 0), 0) : null };
}

export function mapSystem(w: World, p: Player, g: number, s: number, now: number) {
  if (!(g >= 1 && g <= w.config.galaxies && s >= 1 && s <= w.config.systems)) throw new GameError('No such system', 404);
  const slots = galaxyView(w, p, g, s, now);
  const moves = visibleMoves(w, p);
  const positions = slots.map((sl) => {
    const c = { g, s, p: sl.p };
    const pl = sl.planet ? w.planets[sl.planet.id] : null;
    const planet = sl.planet && pl ? {
      ...sl.planet,
      diameter: pl.diameter ?? null,
      moon: sl.moon,
      // what is known of its strength: in full for your own worlds, otherwise only what your latest report found
      strength: sl.planet.mine ? { fleetValue: Math.round(worth(pl.fleet)), defenseValue: Math.round(worth(pl.defenses)), ships: Object.values(pl.fleet).reduce<number>((t, n) => t + (n || 0), 0), defenses: Object.values(pl.defenses).reduce<number>((t, n) => t + (n || 0), 0) } : null,
      intel: sl.planet.mine ? null : intelOf(p, pl),
      holders: Object.values(w.movements).filter((m) => m.phase === 'holding' && m.mission === 'hold' && sameCoords(m.to, c) && (sl.planet!.mine || m.ownerId === p.id || (p.allianceId && w.players[m.ownerId ?? '']?.allianceId === p.allianceId))).length,
      alert: moves.filter((m) => m.kind !== 'own' && m.kind !== 'guest' && m.phase === 'outbound' && sameCoords(m.to, c)).reduce<{ arriveAt: number; count: number } | null>((a, m) => ({ arriveAt: a ? Math.min(a.arriveAt, m.arriveAt) : m.arriveAt, count: (a?.count ?? 0) + 1 }), null),
      own: moves.filter((m) => m.kind === 'own' && sameCoords(m.to, c)).length,
    } : null;
    return { p: sl.p, planet, debris: sl.debris };
  });
  return {
    g, s, positions, positionCount: w.config.positions, sector: sectorOf(w, g, s, p.allianceId),
    rift: w.invasion && inSystem(w.invasion.rift, g, s) ? { phase: w.invasion.phase, at: w.invasion.rift } : null,
    moves: moves.filter((m) => inSystem(m.from, g, s) || inSystem(m.to, g, s)), now,
  };
}

export function mapPlanet(w: World, p: Player, planetId: string, now: number) {
  const pl = w.planets[planetId];
  if (!pl) throw new GameError('No such world', 404);
  const owner = w.players[pl.ownerId];
  const mine = pl.ownerId === p.id;
  const moves = visibleMoves(w, p);
  const holders = Object.values(w.movements).filter((m) => m.phase === 'holding' && m.mission === 'hold' && sameCoords(m.to, pl.coords) && !!m.toMoon === !!pl.isMoon && (mine || m.ownerId === p.id || (p.allianceId && w.players[m.ownerId ?? '']?.allianceId === p.allianceId)))
    .map((m) => ({ owner: m.ownerName, ownerId: m.ownerId, mine: m.ownerId === p.id, ships: m.ships, until: m.holdUntil ?? null }));
  const sibling = pl.isMoon ? w.planets[pl.parentId ?? ''] : Object.values(w.planets).find((x) => x.parentId === pl.id);
  return {
    id: pl.id, name: pl.name, look: assignLook(pl, w), isMoon: !!pl.isMoon, diameter: pl.diameter ?? null, coords: pl.coords, mine,
    owner: { id: owner.id, name: owner.username, npc: owner.npc?.status ?? null, alliance: owner.allianceId ? w.alliances[owner.allianceId]?.tag ?? null : null },
    outpost: outpostTag(w, pl),
    sibling: sibling && (sibling.ownerId === pl.ownerId) ? { id: sibling.id, name: sibling.name, isMoon: !!sibling.isMoon, look: assignLook(sibling, w) } : null,
    // your own world in full; another one only through your latest report
    fleet: mine ? pl.fleet : null, defenses: mine ? pl.defenses : null,
    intel: mine ? null : (() => { const e = p.spyArchive?.[pl.id]; if (!e) return null; const r = e.report as any; return { at: e.at, level: r?.level ?? null, fleet: r?.fleet ?? null, defenses: r?.defenses ?? null }; })(),
    holders,
    moves: moves.filter((m) => sameCoords(m.from, pl.coords) || sameCoords(m.to, pl.coords)),
    debris: w.debris[ck(pl.coords)] ?? null,
    now,
  };
}

