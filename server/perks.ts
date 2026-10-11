import { FACTION_BY_ID, GENERAL_FAST_SHIPS, UNITS, TRADE_FEE, TRADE_FEE_COLLECTOR } from '../shared/data';
import type { Fleet, OfficerId, ShipId } from '../shared/types';
import type { Player } from './world';

/** Officer ranks, faction perks and character classes, read through small helpers so the rest of the engine never needs to know where they come from. */
export const officerRank = (p: Player, id: OfficerId): number => p.officers?.[id] ?? 0;
const inFaction = (p: Player, id: string) => p.faction === id;
const isClass = (p: Player | null | undefined, c: string) => p?.charClass === c;

export const mineBoost = (p: Player) => (1 + 0.05 * officerRank(p, 'quartermaster')) * (inFaction(p, 'solar') ? 1.08 : 1) * (isClass(p, 'collector') ? 1.15 : 1);
export const energyBoost = (p: Player) => (1 + 0.05 * officerRank(p, 'engineer')) * (isClass(p, 'collector') ? 1.1 : 1);
/** multiplies every build / research / shipyard duration */
export const timeFactor = (p: Player) => Math.max(0.1, 1 - 0.1 * officerRank(p, 'engineer'));
/** extra multiplier on research duration only */
export const researchFactor = (p: Player) => (isClass(p, 'discoverer') ? 0.9 : 1);
export const extraFleetSlots = (p: Player) => officerRank(p, 'admiral') + (isClass(p, 'general') ? 2 : 0);
export const extraExpeditionSlots = (p: Player) => Math.floor(officerRank(p, 'admiral') / 2) + (isClass(p, 'discoverer') ? 1 : 0);
export const weaponMul = (p: Player | null | undefined) => (p && inFaction(p, 'chain') ? 1.1 : 1);
export const shieldMul = (p: Player | null | undefined) => (p && inFaction(p, 'iron') ? 1.1 : 1);
/** faction cargo bonus (applied on top of the per-ship class bonus in cargoFor) */
export const cargoMul = (p: Player | null | undefined) => (p && inFaction(p, 'verge') ? 1.1 : 1);
export const lootShare = (p: Player | null | undefined) => (p && inFaction(p, 'verge') ? 0.575 : 0.5);
export const debrisShare = (p: Player | null | undefined) => 0.3 + (p ? 0.05 * officerRank(p, 'geologist') : 0) + (isClass(p, 'general') ? 0.03 : 0);
export const expeditionYield = (p: Player) => (1 + 0.15 * officerRank(p, 'geologist')) * (isClass(p, 'discoverer') ? 1.5 : 1);
/** Discoverers turn half of the pirate ambushes and black holes into quiet trips */
export const dodgesBadLuck = (p: Player) => isClass(p, 'discoverer');
export const crawlerMul = (p: Player) => (isClass(p, 'collector') ? 1.5 : 1);
export const colonyFieldsMul = (p: Player) => (isClass(p, 'discoverer') ? 1.1 : 1);
export const tradeFee = (p: Player | null | undefined) => (isClass(p, 'collector') ? TRADE_FEE_COLLECTOR : TRADE_FEE);
export const fuelFactor = (p: Player) => (isClass(p, 'general') ? 0.75 : 1);
/** class flight speed bonus for one ship type */
export const classSpeedFor = (p: Player | null | undefined, id: ShipId): number => (isClass(p, 'general') && GENERAL_FAST_SHIPS.includes(id) ? 0.25 : 0);
export const classSpeedBonus = (p: Player) => (isClass(p, 'general') ? 0.25 : 0);

/** hold capacity of a fleet for this owner: Collectors carry more in cargo ships, Verge Syndicate members more in everything */
export function cargoFor(p: Player | null | undefined, ships: Fleet): number {
  let total = 0;
  for (const [id, n] of Object.entries(ships)) {
    if (!n || id === 'espionageProbe') continue;
    const bonus = isClass(p, 'collector') && (id === 'smallCargo' || id === 'largeCargo') ? 1.25 : 1;
    total += UNITS[id as ShipId].cargo * n * bonus;
  }
  return Math.floor(total * cargoMul(p));
}

export const spyBonus = (p: Player) => officerRank(p, 'spymaster');
export const spyEvasion = (p: Player) => 1 - 0.25 * officerRank(p, 'spymaster');

export const factionName = (id: string | null) => (id && FACTION_BY_ID[id as keyof typeof FACTION_BY_ID]?.name) || 'Unaligned';
