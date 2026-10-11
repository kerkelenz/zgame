import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { categoryRows } from '../server/rankings';
import { refreshStandingDay, standingChange } from '../server/standing';
import { createWorld, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const DAY = 24 * 3_600_000;
let w: World; let alice: Player, bob: Player;
const row = (id: string, cat = 'total') => categoryRows(w, cat, true).find((r) => r.id === id)!;

beforeEach(() => {
  w = createWorld({ npcDensity: 0, raidIntervalMin: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bobby', 'secret2', T0).player;
  w.planets[alice.planetIds[0]].buildings = { metalMine: 5 };
  w.planets[bob.planetIds[0]].buildings = { metalMine: 10 };
});

describe('the daily standing snapshot', () => {
  it('is taken the first time and then only once every 24 hours', () => {
    expect(refreshStandingDay(w, T0)).toBe(true);
    expect(w.standingDay!.at).toBe(T0);
    expect(refreshStandingDay(w, T0 + DAY - 1)).toBe(false);
    expect(w.standingDay!.at).toBe(T0);
    expect(refreshStandingDay(w, T0 + DAY)).toBe(true);
    expect(w.standingDay!.at).toBe(T0 + DAY);
  });

  it('records value and place in every category', () => {
    refreshStandingDay(w, T0);
    expect(w.standingDay!.byCat.total[bob.id]).toMatchObject({ r: 1 });
    expect(w.standingDay!.byCat.total[alice.id]).toMatchObject({ r: 2 });
    expect(Object.keys(w.standingDay!.byCat)).toContain('fleet');
    expect(w.standingDay!.byCat.total[bob.id].v).toBe(row(bob.id).value);
  });

  it('shows the points gained or lost and the places climbed since, until the next snapshot', () => {
    refreshStandingDay(w, T0);
    w.planets[alice.planetIds[0]].buildings = { metalMine: 14 };                 // alice overtakes bobby
    const a = row(alice.id), b = row(bob.id);
    expect(a.rank).toBe(1);
    const ca = standingChange(w, 'total', alice.id, a.value, a.rank)!;
    const cb = standingChange(w, 'total', bob.id, b.value, b.rank)!;
    expect(ca.points).toBeGreaterThan(0);
    expect(ca.places).toBe(1);                                                    // from 2nd to 1st
    expect(cb.points).toBe(0);
    expect(cb.places).toBe(-1);                                                   // from 1st to 2nd
    w.planets[bob.planetIds[0]].buildings = { metalMine: 3 };
    expect(standingChange(w, 'total', bob.id, row(bob.id).value, row(bob.id).rank)!.points).toBeLessThan(0);   // lost points
  });

  it('starts over at the next snapshot, and says nothing about someone who was not listed yet', () => {
    refreshStandingDay(w, T0);
    const cara = register(w, 'carol', 'secret3', T0 + 10).player;
    const c = row(cara.id);
    expect(standingChange(w, 'total', cara.id, c.value, c.rank)).toBeNull();
    refreshStandingDay(w, T0 + DAY);
    expect(standingChange(w, 'total', cara.id, c.value, row(cara.id).rank)).toMatchObject({ points: 0 });
  });
});
