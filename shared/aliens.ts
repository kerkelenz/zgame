import { UNITS } from './data';
import type { Fleet, ShipId } from './types';

/**
 * The kinds of ship in a Void invasion. Each is a mix of ordinary combat ships with a twist, so what beats it is something a commander can
 * plan for with ships they already know: no new units, just different fights.
 */
export type AlienKindId = 'swarm' | 'breaker' | 'bio' | 'carrier' | 'mothership';
export interface AlienKind {
  id: AlienKindId;
  label: string;
  /** what the ships are, by share of the wave's value */
  mix: [ShipId, number][];
  /** added to the Armada's technology level for this kind (weapons, shielding, armour) */
  tech: { weapons: number; shielding: number; armour: number };
  /** the share of its starting fleet this kind rebuilds before every engagement */
  regen: number;
  /** one plain sentence on how to fight it */
  hint: string;
}

export const ALIEN_KINDS: Record<AlienKindId, AlienKind> = {
  swarm: {
    id: 'swarm', label: 'Swarm', mix: [['lightFighter', 0.6], ['heavyFighter', 0.25], ['cruiser', 0.15]], tech: { weapons: -1, shielding: -1, armour: -1 }, regen: 0.05,
    hint: 'Many light ships. Cruisers have rapid fire against light fighters, so a cruiser-heavy front shreds them; slow, heavy ships waste their shots.',
  },
  breaker: {
    id: 'breaker', label: 'Shield-breakers', mix: [['battlecruiser', 0.4], ['bomber', 0.3], ['battleship', 0.3]], tech: { weapons: 4, shielding: -2, armour: 0 }, regen: 0.05,
    hint: 'Hard hitters with weak shields. They tear through shields and hulls alike, so Armour Technology and killing them fast matter more than numbers.',
  },
  bio: {
    id: 'bio', label: 'Bio-ships', mix: [['cruiser', 0.35], ['battleship', 0.35], ['destroyer', 0.3]], tech: { weapons: 0, shielding: 0, armour: 1 }, regen: 0.15,
    hint: 'They regrow 15% of their fleet before every engagement. A trickle of damage is wasted: bring enough fleets together to finish them in one go.',
  },
  carrier: {
    id: 'carrier', label: 'Carriers', mix: [['destroyer', 0.5], ['battlecruiser', 0.3], ['battleship', 0.2]], tech: { weapons: -1, shielding: 2, armour: 4 }, regen: 0.05,
    hint: 'Huge, armoured hulls with strong shields. Weapons Technology and heavy guns count; light fighters and small cargo ships only die.',
  },
  mothership: {
    id: 'mothership', label: 'Mothership', mix: [['lightFighter', 0.15], ['heavyFighter', 0.1], ['cruiser', 0.25], ['battleship', 0.2], ['battlecruiser', 0.15], ['destroyer', 0.15]], tech: { weapons: 0, shielding: 0, armour: 0 }, regen: 0.05,
    hint: 'The whole Armada at once, every kind of ship. Everything you have, together.',
  },
};

const shipValue = (id: ShipId) => UNITS[id].cost.metal + UNITS[id].cost.crystal;

/** ships of a kind worth about `budget` */
export function buildWave(kind: AlienKindId, budget: number): Fleet {
  const f: Fleet = {};
  for (const [id, share] of ALIEN_KINDS[kind].mix) {
    const n = Math.floor((budget * share) / shipValue(id));
    if (n > 0) f[id] = n;
  }
  return f;
}

export interface WavePlan { index: number; kind: AlienKindId; name: string; share: number }

/**
 * The waves of one invasion: the first is a swarm, the last the mothership, the ones between alternate between shield-breakers, bio-ships
 * and carriers (which comes first depends on the invasion number). Each wave is bigger than the one before; the shares add up to one, so
 * the whole invasion is as big as the single Armada used to be.
 */
export function planWaves(count: number, number: number): WavePlan[] {
  const n = Math.max(1, Math.min(8, Math.round(count)));
  const middle: AlienKindId[] = ['breaker', 'bio', 'carrier'];
  const weights = Array.from({ length: n }, (_, i) => i + 2);
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((wt, i) => {
    const kind: AlienKindId = n === 1 || i === n - 1 ? 'mothership' : i === 0 ? 'swarm' : middle[(i - 1 + number) % middle.length];
    const name = n === 1 ? 'The Armada' : i === 0 ? 'Scouts' : i === n - 1 ? 'Mothership' : n === 3 ? 'Assault' : `Assault ${i}`;
    return { index: i, kind, name, share: wt / sum };
  });
}

/** the alien strike teams that hit planets: the same kinds, in smaller groups */
export const STRIKE_KINDS: AlienKindId[] = ['swarm', 'breaker', 'bio', 'carrier'];
