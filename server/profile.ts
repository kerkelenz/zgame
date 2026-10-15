import { CHAR_CLASSES, FACTION_BY_ID } from '../shared/data';
import { PIN_MAX, isAvatar } from '../shared/profile';
import { monumentsOf } from './upgrades';
import { assignLook } from './looks';
import { colonyCount, playerPoints } from './galaxy';
import { ACHIEVEMENTS } from './progress';
import { SCORE_CATEGORIES, categoryRows } from './rankings';
import { activityOf } from './vacation';
import { GameError, type Player, type World } from './world';

/** the world a commander features: only if it is still theirs; shows public facts and its picture */
function featuredOf(w: World, p: Player) {
  const pl = p.profile?.featured ? w.planets[p.profile.featured] : null;
  if (!pl || pl.ownerId !== p.id) return null;
  return { id: pl.id, name: pl.name, coords: pl.coords, moon: !!pl.isMoon, look: assignLook(pl, w), diameter: pl.diameter ?? null };
}

/** the commander's own choices for the public profile; anything not valid is refused */
export function editProfile(w: World, p: Player, body: { avatar?: unknown; pinned?: unknown; featured?: unknown }) {
  if (p.npc) throw new GameError('Computer empires have no profile to edit', 403);
  const prof = (p.profile ||= {});
  if (body.avatar !== undefined) {
    if (body.avatar === null || body.avatar === '') delete prof.avatar;
    else if (isAvatar(body.avatar)) prof.avatar = body.avatar;
    else throw new GameError('Unknown picture');
  }
  if (body.pinned !== undefined) {
    if (!Array.isArray(body.pinned)) throw new GameError('Choose achievements to pin');
    const ids = [...new Set(body.pinned.map(String))];
    if (ids.length > PIN_MAX) throw new GameError(`You can pin up to ${PIN_MAX} achievements`);
    for (const id of ids) if (!p.achievements[id]) throw new GameError('You can only pin achievements you have earned');
    prof.pinned = ids;
  }
  if (body.featured !== undefined) {
    if (body.featured === null || body.featured === '') delete prof.featured;
    else {
      const pl = w.planets[String(body.featured)];
      if (!pl || pl.ownerId !== p.id) throw new GameError('Choose one of your own worlds', 403);
      prof.featured = pl.id;
    }
  }
}

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
    monuments: monumentsOf(p),
    home: home ? home.coords : null, homeName: home?.name ?? null, homeLook: home ? assignLook(home, w) : null, planets: colonyCount(w, p),
    // planet positions are public knowledge (anyone can browse the galaxy), so the profile lists them
    locations: p.planetIds.map((id) => w.planets[id]).filter(Boolean).map((pl) => ({ id: pl.id, name: pl.name, coords: pl.coords, moon: !!pl.isMoon, look: assignLook(pl, w) })),
    joinedAt: p.createdAt, activity: p.npc ? null : activityOf(w, p, now), vacation: !!p.vacation,
    points: playerPoints(w, p), stats: p.stats, ranks,
    achievements: ACHIEVEMENTS.filter((a) => p.achievements[a.id]).map((a) => ({ id: a.id, name: a.name, desc: a.desc, doneAt: p.achievements[a.id] })),
    achievementsTotal: ACHIEVEMENTS.length,
    avatar: p.profile?.avatar ?? null,
    // pinned in the order the commander chose, and only what is really earned
    pinned: (p.profile?.pinned ?? []).filter((aid) => p.achievements[aid]).slice(0, PIN_MAX),
    featured: featuredOf(w, p),
    history: p.history.slice(-120),
  };
}
