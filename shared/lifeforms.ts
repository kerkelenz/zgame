import type { Res } from './types';

/**
 * Lifeforms: each planet is settled by one of four peoples, picked once (free the first time, a big price to start over). Every people has five
 * structures raised level by level with resources, and each structure leans the planet one way: more of one resource, bigger stores, quicker
 * building, research or ship production, more room, or a safer stock. Pure data; the engine reads the totals through `lifeformEffects`.
 */
export type LifeformId = 'humans' | 'rocktal' | 'mechas' | 'kaelesh';
export type LfEffect = 'metal' | 'crystal' | 'deuterium' | 'energy' | 'storage' | 'buildTime' | 'shipTime' | 'researchTime' | 'fields' | 'vault';

export interface LfStructure { id: string; name: string; desc: string; effect: LfEffect; /** per level: a share for most (0.03 is 3%), whole fields for 'fields'; time effects are shares taken off */ per: number; base: Res; growth: number }
export interface Lifeform { id: LifeformId; name: string; tagline: string; desc: string; structures: LfStructure[] }
export const LF_MAX_LEVEL = 12;

const r = (metal = 0, crystal = 0, deuterium = 0): Res => ({ metal, crystal, deuterium });
const s = (id: string, name: string, desc: string, effect: LfEffect, per: number, base: Res, growth = 1.65): LfStructure => ({ id, name, desc, effect, per, base, growth });

export const LIFEFORMS: Record<LifeformId, Lifeform> = {
  humans: {
    id: 'humans', name: 'Humans', tagline: 'Builders and scholars', desc: 'Adaptable settlers: room to grow, quick builders and good scientists.',
    structures: [
      s('residential', 'Residential Sector', 'Housing blocks that free up space on the planet.', 'fields', 3, r(12000, 8000, 3000)),
      s('researchAnnex', 'Research Annex', 'A campus beside the labs: research started here finishes sooner.', 'researchTime', 0.02, r(8000, 12000, 4000)),
      s('solarGardens', 'Solar Gardens', 'Mirror fields that add to the energy of the planet.', 'energy', 0.03, r(9000, 6000, 2000)),
      s('planningOffice', 'Planning Office', 'Buildings go up sooner on this planet.', 'buildTime', 0.02, r(10000, 6000, 2000)),
      s('warehouses', 'Warehouses', 'More room in all three stores.', 'storage', 0.04, r(7000, 4000, 0)),
    ],
  },
  rocktal: {
    id: 'rocktal', name: "Rock'tal", tagline: 'Miners of the deep', desc: 'Stone-folk who dig: more metal and crystal, vast vaults and a stock that is hard to raid.',
    structures: [
      s('deepBore', 'Deep Bore Station', 'Shafts reach richer metal seams.', 'metal', 0.03, r(10000, 5000, 1500)),
      s('smelter', 'Crystal Smelter', 'Furnaces free more crystal from the rock.', 'crystal', 0.03, r(9000, 7000, 2000)),
      s('gasPumps', 'Gas Pumps', 'Deep wells for more Vespene Gas.', 'deuterium', 0.03, r(9000, 6000, 3000)),
      s('rockVaults', 'Rock Vaults', 'Chambers cut into the mountain for all three stores.', 'storage', 0.05, r(8000, 4000, 0)),
      s('stoneFortress', 'Stone Fortress', 'Hidden strongrooms: raiders find less to take.', 'vault', 0.03, r(12000, 9000, 2000)),
    ],
  },
  mechas: {
    id: 'mechas', name: 'Mechas', tagline: 'Machines that make machines', desc: 'A living factory: quick ship production and building, strong power and plenty of gas.',
    structures: [
      s('assemblyLines', 'Assembly Lines', 'Ships and defenses come off the lines sooner.', 'shipTime', 0.03, r(12000, 8000, 3000)),
      s('fabricationBay', 'Fabrication Bay', 'Self-building scaffolds: buildings go up sooner.', 'buildTime', 0.02, r(10000, 6000, 2000)),
      s('fusionCore', 'Fusion Core', 'A reactor tended by the machines: more energy.', 'energy', 0.04, r(9000, 7000, 3000)),
      s('refineryDrones', 'Refinery Drones', 'Swarms that skim the atmosphere for Vespene Gas.', 'deuterium', 0.03, r(9000, 6000, 3000)),
      s('droneHangars', 'Drone Hangars', 'Hangars in orbit that add building fields.', 'fields', 2, r(14000, 9000, 4000)),
    ],
  },
  kaelesh: {
    id: 'kaelesh', name: 'Kaelesh', tagline: 'Dreamers of the stars', desc: 'Strange and clever: rich crystal, good energy and scholars of far-off places.',
    structures: [
      s('spiceGardens', 'Spice Gardens', 'Crystal-bearing blooms: more crystal.', 'crystal', 0.04, r(8000, 8000, 2000)),
      s('aetherLooms', 'Aether Looms', 'Looms that weave energy from the void.', 'energy', 0.04, r(9000, 7000, 2000)),
      s('dreamArchive', 'Dream Archive', 'Research started here finishes sooner.', 'researchTime', 0.03, r(8000, 14000, 5000)),
      s('glassVaults', 'Glass Vaults', 'More room in all three stores.', 'storage', 0.03, r(7000, 5000, 0)),
      s('silentDocks', 'Silent Docks', 'Ships come out of the yards sooner.', 'shipTime', 0.02, r(11000, 8000, 3000)),
    ],
  },
};

export const LIFEFORM_IDS = Object.keys(LIFEFORMS) as LifeformId[];
/** what starting over costs, at speed 1 (it is multiplied by the economy speed like every price here) */
export const LF_SWITCH_COST = r(200_000, 150_000, 80_000);

export interface PlanetLifeform { id: LifeformId; levels: Record<string, number> }

/** the total of every effect from a planet's structures: shares as 0.12, fields as whole numbers */
export function lifeformEffects(lf: PlanetLifeform | undefined): Record<LfEffect, number> {
  const out: Record<LfEffect, number> = { metal: 0, crystal: 0, deuterium: 0, energy: 0, storage: 0, buildTime: 0, shipTime: 0, researchTime: 0, fields: 0, vault: 0 };
  if (!lf) return out;
  for (const st of LIFEFORMS[lf.id]?.structures ?? []) out[st.effect] += (lf.levels[st.id] ?? 0) * st.per;
  return out;
}
/** a time effect as a multiplier: never below a tenth */
export const timeMul = (share: number) => Math.max(0.1, 1 - share);
