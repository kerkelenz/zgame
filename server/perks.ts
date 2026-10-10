import { FACTION_BY_ID } from '../shared/data';
import type { OfficerId } from '../shared/types';
import type { Player } from './world';

/** Officer ranks and faction perks, read through small helpers so the rest of the engine never needs to know where they come from. */
export const officerRank = (p: Player, id: OfficerId): number => p.officers?.[id] ?? 0;
const inFaction = (p: Player, id: string) => p.faction === id;

export const mineBoost = (p: Player) => (1 + 0.05 * officerRank(p, 'quartermaster')) * (inFaction(p, 'solar') ? 1.08 : 1);
export const energyBoost = (p: Player) => 1 + 0.05 * officerRank(p, 'engineer');
/** multiplies every build / research / shipyard duration */
export const timeFactor = (p: Player) => Math.max(0.1, 1 - 0.1 * officerRank(p, 'engineer'));
export const extraFleetSlots = (p: Player) => officerRank(p, 'admiral');
export const extraExpeditionSlots = (p: Player) => Math.floor(officerRank(p, 'admiral') / 2);
export const weaponMul = (p: Player | null | undefined) => (p && inFaction(p, 'chain') ? 1.1 : 1);
export const shieldMul = (p: Player | null | undefined) => (p && inFaction(p, 'iron') ? 1.1 : 1);
export const cargoMul = (p: Player | null | undefined) => (p && inFaction(p, 'verge') ? 1.1 : 1);
export const lootShare = (p: Player | null | undefined) => (p && inFaction(p, 'verge') ? 0.575 : 0.5);
export const debrisShare = (p: Player | null | undefined) => 0.3 + (p ? 0.05 * officerRank(p, 'geologist') : 0);
export const expeditionYield = (p: Player) => 1 + 0.15 * officerRank(p, 'geologist');
/** spy report detail bonus, and how much counter-espionage is reduced */
export const spyBonus = (p: Player) => officerRank(p, 'spymaster');
export const spyEvasion = (p: Player) => 1 - 0.25 * officerRank(p, 'spymaster');

export const factionName = (id: string | null) => (id && FACTION_BY_ID[id as keyof typeof FACTION_BY_ID]?.name) || 'Unaligned';
