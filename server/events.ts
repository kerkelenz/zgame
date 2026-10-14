import { fleetCount } from '../shared/combat';
import { sameCoords } from '../shared/formulas';
import { totalRes } from '../shared/formulas';
import { lvl } from '../shared/formulas';
import type { Coords, Fleet, Mission, Res } from '../shared/types';
import { planetAt, sameAlliance, friendly, type Movement, type Player, type World } from './world';

/**
 * The event list: every fleet movement that concerns a commander, in the order things will happen. Their own fleets (the way out, the way
 * home and the projected return), hostile fleets heading for them or their allies, and friendly fleets bringing something. Hostile fleets show
 * only what the target can know: who, from where, where to and when.
 */
export interface FleetEvent {
  /** unique per movement and step */
  id: string;
  at: number;
  /** 'hostile' = an attack on you; 'allyAttack' = an attack on one of your allies (worth knowing, but not an attack on you) */
  kind: 'own' | 'hostile' | 'allyAttack' | 'friendly';
  /** 'arrive' = reaches its target, 'end' = leaves after holding there, 'return' = reaches home again */
  step: 'arrive' | 'end' | 'return' | 'forge';
  /** a later step worked out from the flight time, not yet under way */
  projected: boolean;
  mission: Mission | 'forge';
  /** a Moon Forge finishing: the size of the moon it will make */
  moonKm?: number;
  owner: { id: string | null; name: string; alliance: string | null };
  /** where the fleet is coming from and going to (for a return, the sides are already swapped) */
  from: Place;
  to: Place;
  /** whose planet the target is, when it is not the viewer's */
  targetOwner: { id: string; name: string } | null;
  ships: number | null;
  /** how much of a hostile fleet the viewer can tell (own and friendly fleets are always 'exact'); with the ship types or the full composition when espionage allows */
  intel: Intel;
  shipTypes: string[] | null;
  fleet: Fleet | null;
  /** resources the fleet carries at this step (a delivery on the way out, loot or salvage on the way home); null when it carries none or the viewer cannot know */
  cargo: Res | null;
  speedPct: number | null;
}
export interface Place { coords: Coords; name: string | null; moon: boolean }

/**
 * What you can tell about an enemy fleet depends on your Espionage Technology compared with theirs. Behind: nothing. Level or one ahead: how many
 * ships. Two ahead: and which types. Four ahead: the exact composition. (Raiders from computer empires and pirates count as level 0.)
 */
export type Intel = 'none' | 'count' | 'types' | 'exact';
export const INTEL = { count: 0, types: 2, exact: 4 };
export function intelFields(w: World, viewer: Player, m: Movement): { intel: Intel; count: number | null; shipTypes: string[] | null; fleet: Fleet | null } {
  const theirs = m.ownerId ? lvl(w.players[m.ownerId]?.techs ?? {}, 'espionage') : 0;
  const diff = lvl(viewer.techs, 'espionage') - theirs;
  if (diff < INTEL.count) return { intel: 'none', count: null, shipTypes: null, fleet: null };
  const ships = fleetCount(m.ships);
  const types = Object.entries(m.ships).filter(([, n]) => (n || 0) > 0).map(([id]) => id);
  if (diff < INTEL.types) return { intel: 'count', count: ships, shipTypes: null, fleet: null };
  if (diff < INTEL.exact) return { intel: 'types', count: ships, shipTypes: types, fleet: null };
  return { intel: 'exact', count: ships, shipTypes: types, fleet: { ...m.ships } };
}

/** missions whose fleet flies home after the job */
const RETURNS: Mission[] = ['attack', 'espionage', 'recycle', 'transport', 'destroy', 'scout', 'supply'];

export function fleetEvents(w: World, viewer: Player): FleetEvent[] {
  const mine = new Set(viewer.planetIds.map((id) => w.planets[id]?.coords).filter(Boolean) as Coords[]);
  const ally = viewer.allianceId ? w.alliances[viewer.allianceId] : null;
  const allyOwners = new Set(ally?.members.map((m) => m.playerId) ?? []);
  const allyAt = (c: Coords) => [...allyOwners].some((id) => w.players[id]?.planetIds.some((pid) => sameCoords(w.planets[pid].coords, c)));
  const isMine = (c: Coords) => [...mine].some((x) => sameCoords(x, c));

  const place = (c: Coords, planetId?: string | null, moon = false): Place => {
    const pl = planetId ? w.planets[planetId] : planetAt(w, c, moon);
    return { coords: c, name: pl?.name ?? null, moon: pl ? !!pl.isMoon : moon };
  };
  const ownerOf = (m: Movement) => ({ id: m.ownerId, name: m.ownerName, alliance: (m.ownerId && w.alliances[w.players[m.ownerId]?.allianceId ?? '']?.tag) || null });
  const targetOwner = (m: Movement) => { const t = planetAt(w, m.to, !!m.toMoon); return t && t.ownerId !== viewer.id ? { id: t.ownerId, name: w.players[t.ownerId]?.username ?? '?' } : null; };
  const base = (m: Movement, kind: FleetEvent['kind']) => ({ kind, mission: m.mission, owner: ownerOf(m), targetOwner: targetOwner(m), speedPct: m.speedPct, cargo: null as Res | null, intel: 'exact' as Intel, shipTypes: null as string[] | null, fleet: null as Fleet | null });
  const load = (m: Movement): Res | null => (totalRes(m.cargo) > 0 ? { ...m.cargo } : null);

  const out: FleetEvent[] = [];
  for (const m of Object.values(w.movements)) {
    const home = place(m.from, m.fromPlanetId);
    const dest = place(m.to, undefined, !!m.toMoon);
    if (m.ownerId === viewer.id) {
      const ships = fleetCount(m.ships);
      const b = { ...base(m, 'own'), ships, fleet: { ...m.ships } as Fleet | null, shipTypes: Object.keys(m.ships) as string[] | null };
      const carried = load(m);
      if (m.phase === 'outbound') {
        out.push({ ...b, id: `${m.id}:arrive`, at: m.arriveAt, step: 'arrive', projected: false, from: home, to: dest, cargo: carried });
        if (RETURNS.includes(m.mission)) out.push({ ...b, id: `${m.id}:return`, at: m.arriveAt + m.flightMs, step: 'return', projected: true, from: dest, to: home });
      } else if (m.phase === 'holding') {
        const until = m.holdUntil ?? m.arriveAt;
        out.push({ ...b, id: `${m.id}:end`, at: until, step: 'end', projected: false, from: home, to: dest });
        out.push({ ...b, id: `${m.id}:return`, at: until + m.flightMs, step: 'return', projected: true, from: dest, to: home });
      } else {
        out.push({ ...b, id: `${m.id}:return`, at: m.returnAt ?? m.arriveAt, step: 'return', projected: false, from: dest, to: home, cargo: carried });
      }
      continue;
    }
    if (m.phase !== 'outbound') continue;
    const towardMe = isMine(m.to), towardAlly = allyAt(m.to);
    if ((m.mission === 'attack' || m.mission === 'missile' || m.mission === 'destroy') && (towardMe || towardAlly)) {
      out.push({ ...base(m, towardMe ? 'hostile' : 'allyAttack'), id: `${m.id}:arrive`, at: m.arriveAt, step: 'arrive', projected: false, from: home, to: dest, ...(({ count, ...rest }) => ({ ...rest, ships: count }))(intelFields(w, viewer, m)) });
    } else if ((m.mission === 'transport' || m.mission === 'hold' || m.mission === 'deploy') && towardMe && m.ownerId && (sameAlliance(w, viewer.id, m.ownerId) || friendly(w, viewer.id, m.ownerId))) {
      out.push({ ...base(m, 'friendly'), id: `${m.id}:arrive`, at: m.arriveAt, step: 'arrive', projected: false, from: home, to: dest, ships: fleetCount(m.ships), fleet: { ...m.ships }, shipTypes: Object.keys(m.ships), cargo: load(m) });
    }
  }
  for (const job of Object.values(w.forges ?? {})) {
    if (job.ownerId !== viewer.id) continue;
    const planet = w.planets[job.planetId];
    if (!planet) continue;
    const here = place(planet.coords, planet.id);
    out.push({ id: `forge:${planet.id}`, at: job.end, kind: 'own', step: 'forge', projected: false, mission: 'forge', moonKm: job.diameter, owner: { id: viewer.id, name: viewer.username, alliance: null }, from: here, to: here, targetOwner: null, ships: null, intel: 'exact', shipTypes: null, fleet: null, cargo: null, speedPct: null });
  }
  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
