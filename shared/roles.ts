import { BUILDINGS } from './data';
import { lvl, type Levels } from './formulas';
import type { BuildingId } from './types';

/**
 * A role is a label you give a planet so the game can suggest a sensible next building for it. It changes no numbers: every planet can still
 * build anything. The ladders are an opinionated order, one step at a time, skipping what is already high enough.
 */
export type PlanetRole = 'mining' | 'fleet' | 'defense' | 'research';
export const ROLES: { id: PlanetRole; label: string; hint: string }[] = [
  { id: 'mining', label: 'Mining', hint: 'mines, energy and storage' },
  { id: 'fleet', label: 'Fleet base', hint: 'shipyard and factories' },
  { id: 'defense', label: 'Fortress', hint: 'shipyard, silo and defenses' },
  { id: 'research', label: 'Research', hint: 'lab and the buildings it needs' },
];
export const isRole = (x: unknown): x is PlanetRole => ROLES.some((r) => r.id === x);

type Step = [BuildingId, number];
export const LADDERS: Record<PlanetRole, Step[]> = {
  mining: [
    ['metalMine', 4], ['crystalMine', 3], ['solarPlant', 5], ['deuteriumSynthesizer', 3], ['metalMine', 8], ['crystalMine', 6], ['solarPlant', 8],
    ['roboticsFactory', 3], ['deuteriumSynthesizer', 6], ['metalStorage', 3], ['crystalStorage', 3], ['metalMine', 12], ['crystalMine', 9], ['solarPlant', 11],
    ['deuteriumTank', 3], ['deuteriumSynthesizer', 9], ['fusionReactor', 4], ['metalMine', 16], ['crystalMine', 13], ['metalStorage', 6], ['crystalStorage', 6],
    ['metalMine', 20], ['crystalMine', 17], ['deuteriumSynthesizer', 13], ['fusionReactor', 8],
  ],
  fleet: [
    ['solarPlant', 5], ['metalMine', 4], ['crystalMine', 3], ['roboticsFactory', 2], ['shipyard', 4], ['roboticsFactory', 5], ['shipyard', 8],
    ['solarPlant', 9], ['metalMine', 8], ['crystalMine', 6], ['deuteriumSynthesizer', 4], ['roboticsFactory', 10], ['shipyard', 10], ['naniteFactory', 2], ['shipyard', 12],
  ],
  defense: [
    ['solarPlant', 4], ['metalMine', 4], ['crystalMine', 3], ['roboticsFactory', 2], ['shipyard', 2], ['shipyard', 5], ['metalMine', 8], ['crystalMine', 6],
    ['missileSilo', 2], ['shipyard', 8], ['roboticsFactory', 6], ['missileSilo', 4], ['spaceDock', 2], ['shipyard', 12],
  ],
  research: [
    ['solarPlant', 5], ['metalMine', 4], ['crystalMine', 3], ['researchLab', 3], ['researchLab', 6], ['solarPlant', 8], ['crystalMine', 8], ['researchLab', 9],
    ['deuteriumSynthesizer', 6], ['researchLab', 12], ['fusionReactor', 5], ['naniteFactory', 1],
  ],
};

/** the next building for a planet in this role, with the level to take it to; null once the whole ladder is done */
export function nextForRole(role: PlanetRole, buildings: Levels<BuildingId>): { id: BuildingId; level: number; name: string } | null {
  for (const [id, level] of LADDERS[role]) if (lvl(buildings, id) < level) return { id, level: lvl(buildings, id) + 1, name: BUILDINGS[id].name };
  return null;
}
