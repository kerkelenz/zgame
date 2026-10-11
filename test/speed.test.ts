import { describe, expect, it } from 'vitest';
import { shipSpeed } from '../shared/formulas';

describe('ship speeds follow the drive a ship is built for', () => {
  it('a bomber flies on impulse drive until Hyperspace Drive 8, then on hyperspace drive from a base of 5,000', () => {
    expect(shipSpeed('bomber', { impulseDrive: 10, hyperspaceDrive: 7 })).toBeCloseTo(4000 * (1 + 0.2 * 10));
    expect(shipSpeed('bomber', { impulseDrive: 1, hyperspaceDrive: 8 })).toBeCloseTo(5000 * (1 + 0.3 * 8));       // impulse no longer matters
    expect(shipSpeed('bomber', { impulseDrive: 12, hyperspaceDrive: 10 })).toBeCloseTo(5000 * (1 + 0.3 * 10));
    expect(shipSpeed('bomber', { hyperspaceDrive: 8 }, 0.1)).toBeCloseTo(5000 * (1 + 0.3 * 8) * 1.1);            // allied logistics still applies
  });

  it('a small cargo switches to impulse drive at impulse level 5', () => {
    expect(shipSpeed('smallCargo', { combustionDrive: 6, impulseDrive: 4 })).toBeCloseTo(5000 * (1 + 0.1 * 6));
    expect(shipSpeed('smallCargo', { combustionDrive: 6, impulseDrive: 5 })).toBeCloseTo(10000 * (1 + 0.2 * 5));
  });
});
