import { unitPoints } from '../shared/formulas';
import type { Fleet, ShipId } from '../shared/types';

/** points of ships standing at home only (no fleets in the air) */
export const fleetCountNaive = (f: Fleet) => Object.entries(f).reduce((s, [id, n]) => s + unitPoints(id as ShipId, n || 0), 0);
