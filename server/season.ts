import { bus } from './bus';
import { generateEmpires, NPC_TICK_MS } from './empires';
import { createPlanet, findHomeSlot, playerPoints } from './galaxy';
import { notifyPlayer } from './messages';
import { GameError, blankStats, type World } from './world';

const HOUR = 3_600_000;
export const CHAMPION_CREDITS = 2000;

export interface SeasonState {
  number: number;
  startedAt: number;
  /** null = no time limit */
  endsAt: number | null;
  /** set when the season is over and the universe waits for its reset */
  ended?: { at: number; winnerId: string | null; winnerName: string | null; reason: 'time' | 'victory' | 'admin'; resetAt: number | null };
}
export interface HallEntry {
  season: number; startedAt: number; endedAt: number; reason: string;
  top: { id: string; name: string; alliance: string | null; points: number }[];
  topAlliance: { tag: string; name: string; points: number } | null;
}

export function ensureSeason(w: World, now: number): SeasonState {
  if (!w.season) w.season = { number: 1, startedAt: w.createdAt || now, endsAt: w.config.seasonDays > 0 ? (w.createdAt || now) + w.config.seasonDays * 24 * HOUR : null };
  w.hallOfFame ??= [];
  return w.season;
}

function standings(w: World) {
  return Object.values(w.players).filter((p) => !p.npc && p.planetIds.length)
    .map((p) => ({ p, total: playerPoints(w, p).total }))
    .sort((a, b) => b.total - a.total);
}

/** Close the season: record the hall of fame, crown the champion and announce it. */
export function endSeason(w: World, now: number, reason: 'time' | 'victory' | 'admin' = 'time') {
  const s = ensureSeason(w, now);
  if (s.ended) throw new GameError('This season is already over');
  const ranked = standings(w);
  const champion = ranked[0]?.p ?? null;
  const alliances = Object.values(w.alliances).map((a) => ({ a, points: a.members.reduce((t, m) => t + (w.players[m.playerId] ? playerPoints(w, w.players[m.playerId]).total : 0), 0) })).sort((x, y) => y.points - x.points);
  w.hallOfFame!.unshift({
    season: s.number, startedAt: s.startedAt, endedAt: now, reason,
    top: ranked.slice(0, 10).map(({ p, total }) => ({ id: p.id, name: p.username, alliance: p.allianceId ? w.alliances[p.allianceId]?.tag ?? null : null, points: total })),
    topAlliance: alliances[0] ? { tag: alliances[0].a.tag, name: alliances[0].a.name, points: alliances[0].points } : null,
  });
  if (w.hallOfFame!.length > 50) w.hallOfFame!.length = 50;
  const resetAt = w.config.seasonResetHours > 0 ? now + w.config.seasonResetHours * HOUR : null;
  s.ended = { at: now, winnerId: champion?.id ?? null, winnerName: champion?.username ?? null, reason, resetAt };
  if (champion) {
    champion.credits += CHAMPION_CREDITS;
    champion.achievements[`champion${s.number}`] = now;
  }
  const why = reason === 'victory' ? 'A commander reached the victory score.' : reason === 'admin' ? 'An admin closed the season.' : 'The season timer ran out.';
  const body = `Season ${s.number} is over. ${why} Champion: ${champion?.username ?? 'nobody'}${champion ? ` with ${ranked[0].total.toLocaleString('en-US')} points` : ''}.${resetAt ? ` The universe resets ${new Date(resetAt).toLocaleString()} - everyone keeps their account, credits, officers and achievements.` : ' An admin will reset the universe.'}`;
  for (const p of Object.values(w.players)) if (!p.npc) notifyPlayer(w, p.id, 'news', `Season ${s.number} is over`, body);
  bus.push({ to: '*', type: 'toast', data: `Season ${s.number} is over - champion: ${champion?.username ?? 'nobody'}` });
  bus.push({ to: '*', type: 'refresh' });
}

/** Wipe the universe for a new season. Accounts, credits, officers, achievements, class, alliances and contacts survive. */
export function resetSeason(w: World, now: number) {
  const s = ensureSeason(w, now);
  w.movements = {}; w.debris = {}; w.wrecks = {}; w.shared = {}; w.sectors = {};
  w.planets = {};
  w.messages = [];
  for (const [id, p] of Object.entries(w.players)) if (p.npc) delete w.players[id];
  for (const p of Object.values(w.players)) {
    p.techs = {}; p.research = null; p.researchBacklog = [];
    p.planetIds = [];
    p.stats = blankStats(); p.objectives = {}; p.history = [];
    p.faction = null; p.rep = {}; p.heat = {}; p.truces = {}; p.tributes = []; p.nextTribute = 0;
    p.vacation = null; p.dealUsed = undefined; p.recent = []; p.spyArchive = {};
    createPlanet(w, p, findHomeSlot(w), { home: true, name: `${p.username}'s Homeworld`, now });
  }
  for (const a of Object.values(w.alliances)) {
    a.bank = { metal: 0, crystal: 0, deuterium: 0 };
    a.upgrades = { production: 0, research: 0, logistics: 0, command: 0 };
    a.diplomacy = {}; a.proposals = [];
    a.log.push({ at: now, text: `Season ${s.number + 1} began.` });
  }
  w.rngSeed = Math.floor(Math.random() * 2 ** 31);
  w.nextRaidAt = w.config.raidIntervalMin > 0 ? now + w.config.raidIntervalMin * 60_000 : 0;
  w.nextNpcTick = 0;
  if (w.config.npcDensity > 0) { generateEmpires(w, now); w.nextNpcTick = now + NPC_TICK_MS; }
  w.season = { number: s.number + 1, startedAt: now, endsAt: w.config.seasonDays > 0 ? now + w.config.seasonDays * 24 * HOUR : null };
  for (const p of Object.values(w.players)) if (!p.npc) notifyPlayer(w, p.id, 'news', `Season ${w.season.number} has begun`, 'The universe has been reset. You start again on a fresh homeworld; your credits, officers, class and achievements carried over.');
  bus.push({ to: '*', type: 'refresh' });
}

/** Called every tick: ends the season on time or on victory, and resets after the grace period. */
export function processSeason(w: World, now: number) {
  const s = ensureSeason(w, now);
  if (s.ended) {
    if (s.ended.resetAt && now >= s.ended.resetAt) resetSeason(w, now);
    return;
  }
  if (s.endsAt && now >= s.endsAt) return endSeason(w, now, 'time');
  if (w.config.victoryPoints > 0) {
    const top = standings(w)[0];
    if (top && top.total >= w.config.victoryPoints) endSeason(w, now, 'victory');
  }
}

export function seasonView(w: World, now: number) {
  const s = ensureSeason(w, now);
  return { number: s.number, startedAt: s.startedAt, endsAt: s.endsAt, ended: s.ended ?? null, victoryPoints: w.config.victoryPoints, hallOfFame: w.hallOfFame ?? [] };
}
export const seasonBanner = (w: World, now: number) => {
  const s = ensureSeason(w, now);
  return { number: s.number, endsAt: s.endsAt, ended: s.ended ? { winnerName: s.ended.winnerName, resetAt: s.ended.resetAt } : null };
};
