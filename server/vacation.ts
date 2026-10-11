import { updatePlanet } from './economy';
import { GameError, type Player, type World } from './world';

const HOUR = 3_600_000;

/** Players on vacation cannot act, produce, or be attacked; see the rules in startVacation. */
export const onVacation = (p: Player | null | undefined): boolean => !!p?.vacation;

export function assertActive(p: Player | null | undefined, what = 'do that') {
  if (p?.vacation) throw new GameError(`You are in vacation mode and cannot ${what}. Leave vacation mode in Settings first.`, 403);
}

export type Activity = 'online' | 'active' | 'inactive' | 'longInactive';

/** How recently a commander was around: online (5 min), active, inactive (i, 7 days), long inactive (I, 28 days). */
export function activityOf(w: World, p: Player, now: number): Activity {
  const idle = now - p.lastSeen;
  if (idle < 5 * 60_000) return 'online';
  if (idle >= w.config.longInactiveDays * 24 * HOUR) return 'longInactive';
  if (idle >= w.config.inactiveDays * 24 * HOUR) return 'inactive';
  return 'active';
}

/**
 * Vacation mode freezes your empire: nothing is produced and nobody can attack, spy on or station fleets with you.
 * Like the classic game it needs a quiet empire (no fleets, no queues, no hostile fleets inbound) and lasts at
 * least `vacationMinHours`.
 */
export function startVacation(w: World, p: Player, now: number) {
  if (p.npc) throw new GameError('Computer empires cannot take vacation');
  if (p.vacation) throw new GameError('You are already in vacation mode');
  const mine = new Set(p.planetIds);
  const planets = p.planetIds.map((id) => w.planets[id]).filter(Boolean);

  const flying = Object.values(w.movements).filter((m) => m.ownerId === p.id);
  if (flying.length) throw new GameError('Bring your fleets home first: you have fleets or missiles in flight');
  const here = (m: { to: { g: number; s: number; p: number } }) => planets.some((pl) => pl.coords.g === m.to.g && pl.coords.s === m.to.s && pl.coords.p === m.to.p);
  for (const m of Object.values(w.movements)) {
    if (m.ownerId === p.id || !here(m)) continue;
    if (m.mission === 'attack' || m.mission === 'destroy' || m.mission === 'missile') throw new GameError('Hostile fleets are on their way to you - you cannot leave now');
    if (m.mission === 'hold' && m.phase === 'holding') throw new GameError('Allied fleets are stationed at your planets - ask them to leave first');
  }
  if (p.research || p.researchBacklog?.length) throw new GameError('Finish or cancel your research first');
  for (const pl of planets) {
    if (pl.buildQueue || pl.buildBacklog?.length || pl.shipyardQueue.length) throw new GameError(`Finish or cancel the construction queues on ${pl.name} first`);
    if (!mine.has(pl.id)) continue;
  }
  for (const pl of planets) updatePlanet(w, pl, now); // bank everything produced up to now
  p.vacation = { since: now, minUntil: now + w.config.vacationMinHours * HOUR };
}

export function endVacation(w: World, p: Player, now: number) {
  if (!p.vacation) throw new GameError('You are not in vacation mode');
  if (now < p.vacation.minUntil) {
    const left = p.vacation.minUntil - now;
    throw new GameError(`Vacation mode lasts at least ${w.config.vacationMinHours} hours - ${Math.ceil(left / 60_000)} more minutes`);
  }
  p.vacation = null;
  // no catch-up production for the time away
  for (const id of p.planetIds) { const pl = w.planets[id]; if (pl) pl.updatedAt = now; }
}
