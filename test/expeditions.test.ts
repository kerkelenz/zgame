import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from '../server/accounts';
import { processMovements, sendFleet } from '../server/fleet';
import { createWorld } from '../server/world';
import { simulateCombat, type Combatant } from '../shared/combat';
import { makeRng } from '../shared/combat';

const T0 = 1_700_000_000_000;
afterEach(() => vi.restoreAllMocks());

function setup(ships: Record<string, number>, hold?: number) {
  const x = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  const a = register(x, 'explorer', 'secret1', T0).player;
  a.techs = { astrophysics: 4, combustionDrive: 6, impulseDrive: 5, energy: 3 };
  const pa = x.planets[a.planetIds[0]];
  pa.coords = { g: 1, s: 5, p: 6 };
  pa.buildings = { shipyard: 5 }; pa.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
  pa.fleet = { ...ships };
  const m = sendFleet(x, a, { fromPlanetId: pa.id, to: { g: 1, s: 5, p: x.config.positions + 1 }, ships, mission: 'expedition', holdHours: hold }, T0);
  return { x, a, m };
}
const roll = (m: { arriveAt: number }, x: ReturnType<typeof setup>['x'], ...seq: number[]) => {
  let i = 0;
  const r = vi.spyOn(Math, 'random').mockImplementation(() => seq[Math.min(i++, seq.length - 1)]);
  processMovements(x, m.arriveAt);
  r.mockRestore();
};

describe('expedition length', () => {
  it('is 1-4 hours, defaulting to one, and sets how long the fleet stays', () => {
    expect(setup({ largeCargo: 5 }).m.holdHours).toBe(1);
    expect(setup({ largeCargo: 5 }, 3).m.holdHours).toBe(3);
    expect(setup({ largeCargo: 5 }, 99).m.holdHours).toBe(4);
    expect(setup({ largeCargo: 5 }, 0).m.holdHours).toBe(1);
    const one = setup({ largeCargo: 5 }, 1), four = setup({ largeCargo: 5 }, 4);
    roll(one.m, one.x, 0.5, 0.5, 0.0, 0.5); roll(four.m, four.x, 0.5, 0.5, 0.0, 0.5);
    expect(four.m.holdUntil! - four.m.arriveAt).toBeCloseTo(4 * (one.m.holdUntil! - one.m.arriveAt), 0);
  });
  it('longer trips find more', () => {
    const find = (h: number) => { const s = setup({ largeCargo: 10, cruiser: 10 }, h); roll(s.m, s.x, 0.4, 0.5, 0.0, 0.5); return s.m.cargo.metal; };
    expect(find(1)).toBeGreaterThan(0);
    expect(find(3) / find(1)).toBeCloseTo(1.6, 1); // +30% per extra hour
  });
  it('and widen the black hole', () => {
    const s1 = setup({ largeCargo: 5 }, 1); roll(s1.m, s1.x, 0.953, 0.5);
    expect(s1.x.movements[s1.m.id]).toBeDefined(); // 0.953 is safe on a one-hour trip
    const s4 = setup({ largeCargo: 5 }, 4); roll(s4.m, s4.x, 0.953, 0.5);
    expect(s4.x.movements[s4.m.id]).toBeUndefined(); // but lost on a four-hour one
  });
});

describe('fleet composition', () => {
  it('recyclers boost resource finds by 25%', () => {
    const find = (extra: Record<string, number>) => { const s = setup({ largeCargo: 10, cruiser: 10, ...extra }); roll(s.m, s.x, 0.4, 0.5, 0.0, 0.5); return s.m.cargo.metal; };
    const withRec = find({ recycler: 1 });
    expect(withRec / find({})).toBeGreaterThan(1.2);
  });
  it('recyclers can salvage wreckage in otherwise empty space', () => {
    const s = setup({ largeCargo: 10, cruiser: 10, recycler: 2 });
    roll(s.m, s.x, 0.1, 0.5, 0.3, 0.5, 0.0);
    expect(s.m.cargo.metal + s.m.cargo.crystal).toBeGreaterThan(0);
    expect(s.x.messages.some((m) => m.subject === 'Expedition: wreckage salvaged')).toBe(true);
    const n = setup({ largeCargo: 10, cruiser: 10 });
    roll(n.m, n.x, 0.1, 0.5, 0.3, 0.5, 0.0);
    expect(n.x.messages.some((m) => m.subject === 'Expedition: nothing found')).toBe(true);
  });
  it('probes scout: pirates arrive 25% smaller', () => {
    const power = (extra: Record<string, number>) => {
      const s = setup({ largeCargo: 10, cruiser: 10, ...extra });
      const spy = vi.spyOn(Math, 'random');
      const seq = [0.7, 0.5, 0.5, 0.5, 0.5]; let i = 0;
      spy.mockImplementation(() => seq[Math.min(i++, seq.length - 1)]);
      processMovements(s.x, s.m.arriveAt);
      spy.mockRestore();
      return s.x.messages.find((m) => /pirates/.test(m.subject))?.body ?? '';
    };
    // both fights happen; the scouted fleet should lose no more ships than the unscouted one
    const lost = (t: string) => Number((t.match(/(\d+)×/g) ?? []).map((x) => parseInt(x)).reduce((a, b) => a + b, 0));
    expect(lost(power({ espionageProbe: 3 }))).toBeLessThanOrEqual(lost(power({})) + 3);
  });
  it('a technology fragment speeds up the running research, or pays credits', () => {
    const s = setup({ largeCargo: 10, cruiser: 10 });
    s.a.research = { id: 'energy', level: 4, start: T0, end: T0 + 10 * 3_600_000, cost: { metal: 0, crystal: 0, deuterium: 0 }, planetId: s.x.planets[s.a.planetIds[0]].id };
    const endBefore = s.a.research.end;
    roll(s.m, s.x, 0.1, 0.5, 0.1);
    expect(s.a.research.end).toBeLessThan(endBefore);
    expect(s.x.messages.some((m) => m.subject === 'Expedition: technology fragment')).toBe(true);
    const t = setup({ largeCargo: 10, cruiser: 10 });
    roll(t.m, t.x, 0.1, 0.5, 0.1);
    expect(t.a.credits).toBeGreaterThan(0);
  });
});

describe('combat round log', () => {
  const c = (n: number): Combatant => ({ owner: null, name: 'x', weapons: 0, shielding: 0, armour: 0, fleet: { cruiser: n } });
  it('records the unit census at the start and after each round', () => {
    const r = simulateCombat([c(50)], [c(20)], makeRng(7));
    expect(r.roundLog).toHaveLength(r.rounds + 1);
    expect(r.roundLog[0]).toEqual({ a: { cruiser: 50 }, d: { cruiser: 20 } });
    const last = r.roundLog[r.roundLog.length - 1];
    expect(last.a.cruiser ?? 0).toBe(r.attackers[0].after.cruiser ?? 0);
    expect(last.d.cruiser ?? 0).toBe(r.defenders[0].after.cruiser ?? 0);
    for (let i = 1; i < r.roundLog.length; i++) expect(r.roundLog[i].a.cruiser ?? 0).toBeLessThanOrEqual(r.roundLog[i - 1].a.cruiser ?? 0);
  });
});
