import { canAfford } from '../shared/formulas';
import { LF_MAX_LEVEL, LF_SWITCH_COST, LIFEFORMS, LIFEFORM_IDS, lifeformEffects, type LifeformId } from '../shared/lifeforms';
import { levelCost, scaledCost } from '../shared/upgrades';
import { notifyPlayer } from './messages';
import { pay } from './upgrades';
import { GameError, type Planet, type Player, type World } from './world';

/**
 * Choose the people of a planet (free the first time; starting over with another people costs a lot and loses the structures), and raise
 * their structures with resources from that planet.
 */
export function chooseLifeform(w: World, p: Player, planet: Planet, id: string, now: number): LifeformId {
  const def = LIFEFORMS[id as LifeformId];
  if (!def) throw new GameError('Unknown people', 404);
  if (planet.isMoon) throw new GameError('Lifeforms settle planets, not moons');
  if (planet.ownerId !== p.id) throw new GameError('Not your planet', 403);
  if (planet.lifeform?.id === def.id) throw new GameError(`${def.name} already live here`);
  if (planet.lifeform) pay(w, p, planet, scaledCost(LF_SWITCH_COST, w.config.economySpeed), now);     // starting over costs a great deal
  planet.lifeform = { id: def.id, levels: {} };
  notifyPlayer(w, p.id, 'news', `${def.name} settle ${planet.name}`, `${def.tagline}. ${def.desc}`);
  return def.id;
}

export function buyStructure(w: World, p: Player, planet: Planet, structureId: string, now: number): number {
  const lf = planet.lifeform;
  if (!lf) throw new GameError('Choose a people for this planet first');
  const st = LIFEFORMS[lf.id].structures.find((x) => x.id === structureId);
  if (!st) throw new GameError('Unknown structure', 404);
  const level = lf.levels[st.id] ?? 0;
  if (level >= LF_MAX_LEVEL) throw new GameError(`${st.name} is at its highest level`);
  pay(w, p, planet, levelCost(st, level + 1, w.config.economySpeed), now);
  lf.levels[st.id] = level + 1;
  return level + 1;
}

const word = (st: { effect: string; per: number }, n: number) => {
  const v = n * st.per;
  if (st.effect === 'fields') return `+${v} building fields`;
  const pct = `${Math.round(v * 1000) / 10}%`;
  const what: Record<string, string> = { metal: 'metal output', crystal: 'crystal output', deuterium: 'Vespene Gas output', energy: 'energy', storage: 'storage', buildTime: 'shorter building times', shipTime: 'shorter ship and defense times', researchTime: 'shorter research here', vault: 'less taken when raided' };
  return st.effect.endsWith('Time') || st.effect === 'vault' ? `${pct} ${what[st.effect]}` : `+${pct} ${what[st.effect]}`;
};

export function lifeformView(w: World, planet: Planet) {
  const speed = w.config.economySpeed, lf = planet.lifeform, have = planet.resources;
  return {
    planetId: planet.id, planetName: planet.name, isMoon: !!planet.isMoon, maxLevel: LF_MAX_LEVEL,
    current: lf ? lf.id : null,
    switchCost: scaledCost(LF_SWITCH_COST, speed), switchAffordable: canAfford(have, scaledCost(LF_SWITCH_COST, speed)),
    peoples: LIFEFORM_IDS.map((id) => ({ id, name: LIFEFORMS[id].name, tagline: LIFEFORMS[id].tagline, desc: LIFEFORMS[id].desc, structures: LIFEFORMS[id].structures.map((s) => s.name) })),
    structures: lf ? LIFEFORMS[lf.id].structures.map((st) => {
      const level = lf.levels[st.id] ?? 0, next = level < LF_MAX_LEVEL ? levelCost(st, level + 1, speed) : null;
      return { id: st.id, name: st.name, desc: st.desc, level, max: LF_MAX_LEVEL, now: level > 0 ? word(st, level) : null, next: next && { cost: next, effect: word(st, level + 1), affordable: canAfford(have, next) } };
    }) : [],
    totals: lifeformEffects(lf),
  };
}
