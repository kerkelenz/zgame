import { describe, expect, it } from 'vitest';
import { lookName } from '../client/src/PlanetHero';
import { MOON_LOOKS, PLANET_LOOKS } from '../shared/artlist';

describe('what the planet banner calls a world', () => {
  it('names planets and moons by their look', () => {
    expect(lookName('desert', false)).toBe('Desert planet');
    expect(lookName('tempest', true)).toBe('Tempest moon');
    expect(lookName('gasgiant', false)).toBe('Gas giant');
    expect(lookName(undefined, false)).toBe('Planet');
    expect(lookName(null, true)).toBe('Moon');
  });
  it('has a description for every look it can show', () => {
    for (const k of Object.keys(PLANET_LOOKS)) expect(PLANET_LOOKS[k].length, k).toBeGreaterThan(10);
    for (const k of Object.keys(MOON_LOOKS)) expect(MOON_LOOKS[k].length, k).toBeGreaterThan(10);
  });
});
