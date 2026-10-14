import { lvl } from './formulas';
import type { BuildingId, TechId } from './types';

export interface OrderStep { kind: 'building' | 'tech'; id: string; level: number }

/** the steps of a shared build order that someone with these levels still has to do, in order */
export function missingSteps(steps: OrderStep[], buildings: Record<string, number | undefined>, techs: Record<string, number | undefined>): OrderStep[] {
  return steps.filter((s) => (s.kind === 'building' ? lvl(buildings, s.id as BuildingId) : lvl(techs, s.id as TechId)) < s.level);
}
