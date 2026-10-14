import { CHAR_CLASSES, FACTION_BY_ID } from '../shared/data';
import { assignLook } from './looks';
import { colonyCount, playerPoints } from './galaxy';
import { ACHIEVEMENTS } from './progress';
import { SCORE_CATEGORIES, categoryRows } from './rankings';
import { activityOf } from './vacation';
import { GameError, type World } from './world';

/** What anyone may see about a commander: standing, record and history, never resources, fleets or queues. */
export function profileView(w: World, id: string, now: number) {
  const p = w.players[id];
  if (!p || !p.planetIds.length) throw new GameError('No such commander', 404);
  const ally = p.allianceId ? w.alliances[p.allianceId] : null;
  const faction = p.npc ? p.npc.faction : p.faction;
  const home = w.planets[p.planetIds[0]];
  const ranks = SCORE_CATEGORIES.map((c) => {
    const rows = categoryRows(w, c.id);
    const mine = rows.find((r) => r.id === id);
    return { id: c.id, label: c.label, unit: c.unit, rank: mine?.rank ?? null, value: mine?.value ?? 0, of: rows.length };
  });
  return {
    id: p.id, username: p.username, npc: p.npc?.status ?? null,
    alliance: ally ? { tag: ally.tag, name: ally.name } : null,
    faction: faction ? FACTION_BY_ID[faction]?.name ?? null : null,
    charClass: CHAR_CLASSES.find((c) => c.id === p.charClass)?.name ?? null,
    home: home ? home.coords : null, homeName: home?.name ?? null, homeLook: home ? assignLook(home, w) : null, planets: colonyCount(w, p),
    // planet positions are public knowledge (anyone can browse the galaxy), so the profile lists them
    locations: p.planetIds.map((id) => w.planets[id]).filter(Boolean).map((pl) => ({ name: pl.name, coords: pl.coords, moon: !!pl.isMoon, look: assignLook(pl, w) })),
    joinedAt: p.createdAt, activity: p.npc ? null : activityOf(w, p, now), vacation: !!p.vacation,
    points: playerPoints(w, p), stats: p.stats, ranks,
    achievements: ACHIEVEMENTS.filter((a) => p.achievements[a.id]).map((a) => ({ id: a.id, name: a.name, desc: a.desc, doneAt: p.achievements[a.id] })),
    achievementsTotal: ACHIEVEMENTS.length,
    history: p.history.slice(-120),
  };
}
