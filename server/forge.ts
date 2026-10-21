import { addRes, canAfford, lvl, subRes } from '../shared/formulas';
import type { Res } from '../shared/types';
import { bus } from './bus';
import { updatePlanet } from './economy';
import { createMoon } from './galaxy';
import { notifyPlayer } from './messages';
import { assertActive } from './vacation';
import { GameError, ck, type ForgeJob, type Planet, type Player, type World } from './world';

const HOUR = 3_600_000;

/**
 * The Moon Forge: a late-game way to turn the debris field above one of your planets into a moon for certain, at a price. It needs Graviton
 * Technology, a big Shipyard and a big field. The field is consumed when the forge starts (so nobody can recycle it meanwhile), the job
 * takes hours, and a bigger field makes a bigger moon.
 */
export const FORGE = {
  graviton: 1,
  shipyard: 12,
  /** the field above the planet must hold at least this much (metal + crystal) */
  minDebris: 1_000_000,
  /** price, as a share of the debris consumed: deuterium as much again, plus a quarter each of metal and crystal */
  gasShare: 1, metalShare: 0.25, crystalShare: 0.25,
  /** moon size: 3,000 km at the minimum field, up to 8,000 km from this much debris */
  baseDiameter: 3000, maxDiameter: 8000, maxDebris: 5_000_000,
};

export const forgeDiameter = (debris: number) =>
  Math.round(FORGE.baseDiameter + ((Math.min(FORGE.maxDebris, Math.max(FORGE.minDebris, debris)) - FORGE.minDebris) / (FORGE.maxDebris - FORGE.minDebris)) * (FORGE.maxDiameter - FORGE.baseDiameter));
export const forgeCost = (debris: { metal: number; crystal: number }): Res => {
  const d = debris.metal + debris.crystal;
  return { metal: Math.ceil(d * FORGE.metalShare), crystal: Math.ceil(d * FORGE.crystalShare), deuterium: Math.ceil(d * FORGE.gasShare) };
};

const hasMoon = (w: World, planet: Planet) => Object.values(w.planets).some((p) => p.parentId === planet.id);
const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');

/** what the Moon Forge card shows for a planet: the requirements, the field, the price and the result, or the running job */
export function forgeView(w: World, planet: Planet, player: Player) {
  if (planet.isMoon || w.config.forgeHours <= 0) return null;
  const field = w.debris[ck(planet.coords)] ?? null;
  const total = field ? field.metal + field.crystal : 0;
  const job = w.forges?.[planet.id] ?? null;
  const reqs = [
    { label: `Graviton Technology ${FORGE.graviton}`, ok: lvl(player.techs, 'graviton') >= FORGE.graviton },
    { label: `Shipyard ${FORGE.shipyard} on this planet`, ok: lvl(planet.buildings, 'shipyard') >= FORGE.shipyard },
    { label: `A debris field of ${fmtN(FORGE.minDebris)} above it (now ${fmtN(total)})`, ok: total >= FORGE.minDebris },
    { label: 'No moon over this planet yet', ok: !hasMoon(w, planet) },
  ];
  return {
    hours: w.config.forgeHours,
    requirements: reqs,
    debris: field,
    cost: total >= FORGE.minDebris && field ? forgeCost(field) : null,
    diameter: total >= FORGE.minDebris ? forgeDiameter(total) : null,
    running: job ? { start: job.start, end: job.end, diameter: job.diameter, debris: job.debris, cost: job.cost } : null,
    hasMoon: hasMoon(w, planet),
    /** worth showing at all: something to forge from, a forge running, or the means to */
    relevant: !!job || (!hasMoon(w, planet) && (total > 0 || reqs[0].ok)),
  };
}

export function startForge(w: World, player: Player, planet: Planet, now: number): ForgeJob {
  if (w.config.forgeHours <= 0) throw new GameError('The Moon Forge is switched off on this server');
  assertActive(player, 'forge a moon');
  if (planet.ownerId !== player.id || planet.isMoon) throw new GameError('Choose one of your planets');
  if ((w.forges ??= {})[planet.id]) throw new GameError('A Moon Forge is already running there');
  if (hasMoon(w, planet)) throw new GameError('This planet already has a moon');
  if (lvl(player.techs, 'graviton') < FORGE.graviton) throw new GameError(`Graviton Technology ${FORGE.graviton} is required`);
  updatePlanet(w, planet, now);
  if (lvl(planet.buildings, 'shipyard') < FORGE.shipyard) throw new GameError(`A Shipyard of level ${FORGE.shipyard} is required on this planet`);
  const key = ck(planet.coords);
  const field = w.debris[key];
  const total = field ? field.metal + field.crystal : 0;
  if (!field || total < FORGE.minDebris) throw new GameError(`The debris field above this planet needs at least ${fmtN(FORGE.minDebris)} resources`);
  const cost = forgeCost(field);
  if (!canAfford(planet.resources, cost)) throw new GameError('Not enough resources on this planet for the forge');
  planet.resources = subRes(planet.resources, cost);
  const job: ForgeJob = { planetId: planet.id, ownerId: player.id, start: now, end: now + w.config.forgeHours * HOUR, debris: { metal: field.metal, crystal: field.crystal }, cost, diameter: forgeDiameter(total) };
  delete w.debris[key];                                                      // the field goes into the forge: nobody can recycle it meanwhile
  w.forges![planet.id] = job;
  bus.push({ to: player.id, type: 'refresh' });
  return job;
}

/** Stopping the forge gives back what was paid, but the debris is gone for good. */
export function cancelForge(w: World, player: Player, planet: Planet): Res {
  const job = w.forges?.[planet.id];
  if (!job || job.ownerId !== player.id) throw new GameError('No Moon Forge is running there', 404);
  planet.resources = addRes(planet.resources, job.cost);
  delete w.forges![planet.id];
  bus.push({ to: player.id, type: 'refresh' });
  return job.cost;
}

/** Finish forges whose time is up. */
export function processForges(w: World, now: number) {
  if (!w.forges) return;
  for (const job of Object.values(w.forges)) {
    if (now < job.end) continue;
    delete w.forges[job.planetId];
    const planet = w.planets[job.planetId];
    if (!planet || planet.isMoon || hasMoon(w, planet)) continue;            // the planet is gone, or a moon formed in the meantime
    createMoon(w, planet, now, 0, job.diameter);
    notifyPlayer(w, job.ownerId, 'system', 'Your moon is forged', `The Moon Forge above ${planet.name} [${planet.coords.g}:${planet.coords.s}:${planet.coords.p}] has collapsed the debris into a moon (${fmtN(job.diameter)} km). Build a Lunar Base to make it usable.`);
    bus.push({ to: job.ownerId, type: 'refresh' });
  }
}
