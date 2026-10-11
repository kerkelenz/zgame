import { BUILDING_IDS, DEFENSE_IDS, SHIP_IDS } from '../shared/data';
import { buildingPoints, lvl, unitPoints } from '../shared/formulas';
import { bus } from './bus';
import { notifyPlayer } from './messages';
import type { Alliance, Planet, World } from './world';

/** Territory: an alliance holds a system when its members' planets there out-weigh everyone else's by a clear margin. */
export const SECTOR = {
  /** every planet counts at least this much, plus the points of what is built and stationed on it */
  planetBase: 100,
  /** an alliance needs this much influence in a system to claim it */
  claimMin: 300,
  /** a challenger must beat the holder by this factor to take a held system (and a claimant must lead the runner-up by it) */
  margin: 1.25,
  /** a holder keeps the system until its influence falls below this share of claimMin */
  keepShare: 0.5,
  /** production bonus for every member per held system, up to the cap */
  bonusPerSector: 0.005,
  bonusCap: 0.10,
  /** how often control is recalculated */
  everyMs: 60_000,
};

export const sectorKey = (g: number, s: number) => `${g}:${s}`;

/** what stands on a planet counts: buildings, ships and defenses (not the owner's research) */
export function planetWeight(pl: Planet): number {
  let n = pl.isMoon ? 0 : SECTOR.planetBase;
  for (const b of BUILDING_IDS) n += buildingPoints(b, lvl(pl.buildings, b));
  for (const s of SHIP_IDS) n += unitPoints(s, pl.fleet[s] || 0);
  for (const d of DEFENSE_IDS) n += unitPoints(d, pl.defenses[d] || 0);
  return Math.floor(n);
}

/** influence of every alliance in every system that has any presence */
export function influenceMap(w: World): Map<string, Map<string, { value: number; planets: number }>> {
  const out = new Map<string, Map<string, { value: number; planets: number }>>();
  for (const pl of Object.values(w.planets)) {
    const owner = w.players[pl.ownerId];
    if (!owner || owner.npc || !owner.allianceId || !w.alliances[owner.allianceId]) continue;
    const k = sectorKey(pl.coords.g, pl.coords.s);
    const per = out.get(k) ?? new Map();
    const cur = per.get(owner.allianceId) ?? { value: 0, planets: 0 };
    cur.value += planetWeight(pl);
    if (!pl.isMoon) cur.planets++;
    per.set(owner.allianceId, cur);
    out.set(k, per);
  }
  return out;
}

export const territoryCount = (w: World, allianceId: string) => Object.values(w.sectors ?? {}).filter((x) => x.allianceId === allianceId).length;
/** The bonus reads the cached count: production is calculated thousands of times a tick and must not scan the map each time. */
export const territoryBonus = (w: World, allianceId: string) => Math.min(SECTOR.bonusCap, (w.alliances[allianceId]?.territory ?? 0) * SECTOR.bonusPerSector);

/** Refresh every alliance's cached count from the map (called by every code path that changes who holds what). */
export function recountTerritory(w: World) {
  const counts = new Map<string, number>();
  for (const h of Object.values(w.sectors ?? {})) counts.set(h.allianceId, (counts.get(h.allianceId) ?? 0) + 1);
  for (const a of Object.values(w.alliances)) a.territory = counts.get(a.id) ?? 0;
}

const tag = (w: World, id: string) => w.alliances[id]?.tag ?? '?';
function tell(w: World, a: Alliance | undefined, subject: string, body: string) {
  if (!a) return;
  a.log.push({ at: Date.now(), text: body });
  if (a.log.length > 100) a.log.shift();
  for (const m of a.members) notifyPlayer(w, m.playerId, 'alliance', subject, body);
}

/** Recalculate who holds what; returns the number of systems that changed hands. */
export function processSectors(w: World, now: number): number {
  const held = (w.sectors ||= {});
  const infl = influenceMap(w);
  let changes = 0;
  const systems = new Set<string>([...infl.keys(), ...Object.keys(held)]);
  for (const k of systems) {
    const per = infl.get(k) ?? new Map<string, { value: number; planets: number }>();
    const ranked = [...per.entries()].sort((a, b) => b[1].value - a[1].value);
    const holder = held[k]?.allianceId;
    const holderValue = holder ? per.get(holder)?.value ?? 0 : 0;
    const [topId, top] = ranked[0] ?? [undefined, undefined];
    const [, second] = ranked[1] ?? [undefined, undefined];
    let next: string | null = holder ?? null;
    if (holder && !w.alliances[holder]) next = null;
    else if (holder) {
      if (holderValue < SECTOR.claimMin * SECTOR.keepShare) next = null;                           // abandoned or crushed
      else if (topId && topId !== holder && top!.value > holderValue * SECTOR.margin && top!.value >= SECTOR.claimMin) next = topId; // taken by force
    } else if (topId && top!.value >= SECTOR.claimMin && (!second || top!.value >= second.value * SECTOR.margin)) next = topId; // a clear lead claims it
    if (next === (holder ?? null)) continue;
    const [g, s] = k.split(':');
    const where = `sector ${g}:${s}`;
    if (next === null) delete held[k]; else held[k] = { allianceId: next, since: now };
    changes++;
    if (holder && next && next !== holder) {
      tell(w, w.alliances[next], 'Sector captured', `[${tag(w, next)}] captured ${where} from [${tag(w, holder)}].`);
      tell(w, w.alliances[holder], 'Sector lost', `[${tag(w, next)}] took ${where} from you.`);
    } else if (next) tell(w, w.alliances[next], 'Sector claimed', `[${tag(w, next)}] now holds ${where}.`);
    else if (holder) tell(w, w.alliances[holder], 'Sector lost', `${where} is no longer under your control.`);
  }
  recountTerritory(w);
  if (changes) bus.push({ to: '*', type: 'refresh' });
  return changes;
}

/** map data: every system with presence or an owner */
export function sectorsView(w: World, viewerAllianceId: string | null) {
  const infl = influenceMap(w);
  const held = w.sectors ?? {};
  const keys = new Set<string>([...infl.keys(), ...Object.keys(held)]);
  const sectors = [...keys].map((k) => {
    const [g, s] = k.split(':').map(Number);
    const per = [...(infl.get(k) ?? new Map()).entries()].map(([id, v]) => ({ id, tag: tag(w, id), value: v.value, planets: v.planets })).sort((a, b) => b.value - a.value);
    const owner = held[k] ? { id: held[k].allianceId, tag: tag(w, held[k].allianceId), name: w.alliances[held[k].allianceId]?.name ?? '', since: held[k].since } : null;
    return { g, s, owner, influence: per.slice(0, 4), contested: per.length > 1 };
  });
  return {
    sectors,
    config: { claimMin: SECTOR.claimMin, margin: SECTOR.margin, perSector: SECTOR.bonusPerSector, cap: SECTOR.bonusCap, galaxies: w.config.galaxies, systems: w.config.systems },
    mine: viewerAllianceId ? { allianceId: viewerAllianceId, count: territoryCount(w, viewerAllianceId), bonus: territoryBonus(w, viewerAllianceId) } : null,
  };
}

export function sectorOf(w: World, g: number, s: number, viewerAllianceId: string | null) {
  const k = sectorKey(g, s);
  const per = [...(influenceMap(w).get(k) ?? new Map()).entries()].map(([id, v]) => ({ id, tag: tag(w, id), value: v.value, planets: v.planets, mine: id === viewerAllianceId })).sort((a, b) => b.value - a.value);
  const h = w.sectors?.[k];
  return { owner: h ? { id: h.allianceId, tag: tag(w, h.allianceId), name: w.alliances[h.allianceId]?.name ?? '', since: h.since, mine: h.allianceId === viewerAllianceId } : null, influence: per.slice(0, 4), claimMin: SECTOR.claimMin };
}
