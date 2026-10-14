import { describe, expect, it } from 'vitest';
import { advise, idleCount } from '../client/src/advice';

const NOW = 1_700_000_000_000;
const planet = (over: Record<string, unknown> = {}) => ({
  id: 'p1', name: 'Home', updatedAt: NOW, buildQueue: { id: 'metalMine' }, buildBacklog: [] as string[],
  buildings: { researchLab: 1, shipyard: 1 } as Record<string, number>, fleet: {} as Record<string, number>, defenses: { rocketLauncher: 3 } as Record<string, number>,
  resources: { metal: 100, crystal: 100, deuterium: 100 }, capacity: { metal: 10_000, crystal: 10_000, deuterium: 10_000 },
  production: { metal: 100, crystal: 50, deuterium: 10, efficiency: 1 } as Record<string, number>, ...over,
});
const me = (over: Record<string, unknown> = {}) => ({ player: { research: { id: 'energy' } as unknown, researchBacklog: [] as unknown[] }, slots: { used: 0, max: 3, expUsed: 0, expMax: 1 }, contractsClaimable: 0, ...over });
const ids = (a: { id: string }[]) => a.map((x) => x.id);

describe('what to do next', () => {
  it('has nothing to say when everything is busy and healthy', () => {
    expect(advise({ me: me(), planets: [planet()], now: NOW })).toEqual([]);
  });
  it('flags an idle build queue and idle research first, and tips last', () => {
    const a = advise({ me: me({ player: { research: null, researchBacklog: [] }, contractsClaimable: 2 }), planets: [planet({ buildQueue: null })], now: NOW });
    expect(ids(a).slice(0, 2)).toEqual(['idle-build:p1', 'idle-research']);
    expect(idleCount(a)).toBe(2);
    expect(a[a.length - 1].id).toBe('contracts');
  });
  it('counts a queued job as busy, and research is not idle without a lab', () => {
    expect(advise({ me: me({ player: { research: null, researchBacklog: [{}] } }), planets: [planet({ buildQueue: null, buildBacklog: ['solarPlant'] })], now: NOW })).toEqual([]);
    expect(ids(advise({ me: me({ player: { research: null } }), planets: [planet({ buildings: {} })], now: NOW }))).not.toContain('idle-research');
  });
  it('warns when a store fills within half an hour or is already full, using the time that has passed', () => {
    const near = planet({ resources: { metal: 9_950, crystal: 100, deuterium: 100 } });
    expect(ids(advise({ me: me(), planets: [near], now: NOW }))).toContain('full:p1:metal');
    const later = advise({ me: me(), planets: [planet({ resources: { metal: 9_000, crystal: 100, deuterium: 100 } })], now: NOW + 10 * 3_600_000 });
    expect(later.find((x) => x.id === 'full:p1:metal')!.text).toMatch(/full: production is being wasted/);
    expect(ids(advise({ me: me(), planets: [planet()], now: NOW }))).not.toContain('full:p1:metal');
  });
  it('warns about an energy shortage with the percentage', () => {
    const a = advise({ me: me(), planets: [planet({ production: { metal: 1, crystal: 1, deuterium: 1, efficiency: 0.6 } })], now: NOW });
    expect(a.find((x) => x.id === 'energy:p1')!.text).toMatch(/60%/);
  });
  it('suggests an expedition only with a free slot and ships at home, and an undefended planet that could build', () => {
    expect(ids(advise({ me: me(), planets: [planet({ fleet: { largeCargo: 5 } })], now: NOW }))).toContain('expedition');
    expect(ids(advise({ me: me(), planets: [planet({ fleet: { solarSatellite: 5 } })], now: NOW }))).not.toContain('expedition');
    expect(ids(advise({ me: me({ slots: { used: 3, max: 3, expUsed: 0, expMax: 1 } }), planets: [planet({ fleet: { largeCargo: 5 } })], now: NOW }))).not.toContain('expedition');
    expect(ids(advise({ me: me(), planets: [planet({ defenses: {} })], now: NOW }))).toContain('undefended:p1');
  });
  it('stays quiet on vacation', () => {
    expect(advise({ me: me({ vacation: {} }), planets: [planet({ buildQueue: null })], now: NOW })).toEqual([]);
  });
});
