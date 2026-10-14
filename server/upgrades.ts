import { subRes, canAfford } from '../shared/formulas';
import type { Res } from '../shared/types';
import {
  BOOSTS, BOOST_MAX_HOURS, EMPIRE_UPGRADES, MONUMENTS, PLANET_PROJECTS, levelCost, scaledCost, unscaledValue,
  type BoostId, type EmpireId, type PlayerUpgrades, type ProjectId,
} from '../shared/upgrades';
import { bus } from './bus';
import { updatePlanet } from './economy';
import { notifyPlayer } from './messages';
import { assertActive } from './vacation';
import { GameError, type Planet, type Player, type World } from './world';

const HOUR = 3_600_000;
const state = (p: Player): PlayerUpgrades => (p.upgrades ??= { levels: {}, boosts: {}, monuments: [], spent: 0 });

function pay(w: World, p: Player, planet: Planet, cost: Res, now: number) {
  assertActive(p, 'spend on upgrades');
  if (planet.ownerId !== p.id) throw new GameError('Not your planet', 403);
  updatePlanet(w, planet, now);
  if (!canAfford(planet.resources, cost)) throw new GameError(`Not enough resources on ${planet.name} for that`);
  planet.resources = subRes(planet.resources, cost);
  state(p).spent += unscaledValue(cost, w.config.economySpeed);
  bus.push({ to: p.id, type: 'refresh' });
}

export function buyEmpireUpgrade(w: World, p: Player, planet: Planet, id: string, now: number): number {
  const def = EMPIRE_UPGRADES[id as EmpireId];
  if (!def) throw new GameError('Unknown upgrade', 404);
  const u = state(p), level = u.levels[id as EmpireId] ?? 0;
  if (level >= def.max) throw new GameError(`${def.name} is at its highest level`);
  pay(w, p, planet, levelCost(def, level + 1, w.config.economySpeed), now);
  u.levels[id as EmpireId] = level + 1;
  return level + 1;
}

export function buyProject(w: World, p: Player, planet: Planet, id: string, now: number): number {
  const def = PLANET_PROJECTS[id as ProjectId];
  if (!def) throw new GameError('Unknown project', 404);
  if (planet.isMoon) throw new GameError('Projects are for planets, not moons');
  const level = planet.projects?.[id as ProjectId] ?? 0;
  if (level >= def.max) throw new GameError(`${def.name} is at its highest level here`);
  pay(w, p, planet, levelCost(def, level + 1, w.config.economySpeed), now);
  (planet.projects ??= {})[id as ProjectId] = level + 1;
  return level + 1;
}

export function buyBoost(w: World, p: Player, planet: Planet, id: string, now: number): number {
  const def = BOOSTS[id as BoostId];
  if (!def) throw new GameError('Unknown boost', 404);
  const u = state(p), current = Math.max(now, u.boosts[id as BoostId] ?? 0);
  if (current + def.hours * HOUR - now > BOOST_MAX_HOURS * HOUR) throw new GameError(`${def.name} cannot run longer than ${BOOST_MAX_HOURS} hours`);
  pay(w, p, planet, scaledCost(def.cost, w.config.economySpeed), now);
  u.boosts[id as BoostId] = current + def.hours * HOUR;
  return u.boosts[id as BoostId]!;
}

export function buildMonument(w: World, p: Player, planet: Planet, id: string, now: number): string {
  const i = MONUMENTS.findIndex((x) => x.id === id);
  if (i < 0) throw new GameError('Unknown monument', 404);
  const u = state(p);
  if (u.monuments.includes(id)) throw new GameError('You have already built that');
  if (i > 0 && !u.monuments.includes(MONUMENTS[i - 1].id)) throw new GameError(`Build the ${MONUMENTS[i - 1].name} first`);
  pay(w, p, planet, scaledCost(MONUMENTS[i].cost, w.config.economySpeed), now);
  u.monuments.push(id);
  notifyPlayer(w, p.id, 'news', `Monument raised: ${MONUMENTS[i].name}`, `${MONUMENTS[i].desc} It stands on ${planet.name} and adds to your standing.`);
  return MONUMENTS[i].name;
}

/** the Upgrades page for one planet: everything that can be bought, what it costs next and what it gives */
export function upgradesView(w: World, p: Player, planet: Planet, now: number) {
  const u = state(p), speed = w.config.economySpeed;
  const have = planet.resources;
  const level = (def: { max: number; base: Res; growth: number; effect: (n: number) => string; name: string; desc: string }, n: number) => {
    const next = n < def.max ? levelCost(def, n + 1, speed) : null;
    return { name: def.name, desc: def.desc, level: n, max: def.max, now: n > 0 ? def.effect(n) : null, next: next && { cost: next, effect: def.effect(n + 1), affordable: canAfford(have, next) } };
  };
  return {
    planetId: planet.id, planetName: planet.name, isMoon: !!planet.isMoon,
    empire: (Object.keys(EMPIRE_UPGRADES) as EmpireId[]).map((id) => ({ id, ...level(EMPIRE_UPGRADES[id], u.levels[id] ?? 0) })),
    projects: planet.isMoon ? [] : (Object.keys(PLANET_PROJECTS) as ProjectId[]).map((id) => ({ id, ...level(PLANET_PROJECTS[id], planet.projects?.[id] ?? 0) })),
    boosts: (Object.keys(BOOSTS) as BoostId[]).map((id) => {
      const cost = scaledCost(BOOSTS[id].cost, speed), until = u.boosts[id] ?? 0;
      return { id, name: BOOSTS[id].name, desc: BOOSTS[id].desc, hours: BOOSTS[id].hours, cost, affordable: canAfford(have, cost), until: until > now ? until : null };
    }),
    monuments: MONUMENTS.map((m, i) => {
      const cost = scaledCost(m.cost, speed), built = u.monuments.includes(m.id);
      return { id: m.id, name: m.name, desc: m.desc, cost, built, locked: i > 0 && !u.monuments.includes(MONUMENTS[i - 1].id), affordable: canAfford(have, cost) };
    }),
    points: Math.floor(u.spent / 1000),
  };
}

/** what the profile shows: the monuments a commander has raised */
export const monumentsOf = (p: Player) => (p.upgrades?.monuments ?? []).map((id) => MONUMENTS.find((m) => m.id === id)?.name).filter((x): x is string => !!x);
