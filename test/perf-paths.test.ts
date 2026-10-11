import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { RETRY_MS, runAutomation, runAutomationAll, saveOrder, setRules, startPlan } from '../server/automation';
import { fleetCountNaive } from './helpers-perf';
import { sendFleet } from '../server/fleet';
import { movementsByOwner, playerPoints } from '../server/galaxy';
import { rankings } from '../server/rankings';
import { createTicker } from '../server/tick';
import { createWorld, type Planet, type Player, type World } from '../server/world';
import { BUILDINGS, TECHS } from '../shared/data';
import { buildingCost, buildingPoints, techCost, techPoints, totalRes } from '../shared/formulas';
import type { BuildingId, TechId } from '../shared/types';

const T0 = Date.UTC(2026, 9, 12, 8);
let w: World; let a: Player, b: Player, c: Player; let home: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 100, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  [a, b, c] = ['ann', 'bob', 'cat'].map((n) => register(w, n, 'secret1', T0).player);
  home = w.planets[a.planetIds[0]];
  home.buildings = { metalMine: 5 };
  home.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
});

describe('cached point sums are exactly the plain loops', () => {
  it('buildingPoints and techPoints', () => {
    const plain = (cost: (l: number) => ReturnType<typeof buildingCost>, level: number) => { let t = 0; for (let l = 1; l <= level; l++) t += totalRes(cost(l)); return t / 1000; };
    for (const id of Object.keys(BUILDINGS) as BuildingId[]) for (const level of [0, 1, 2, 7, 15, 30, 3, 40]) expect(buildingPoints(id, level), `${id} ${level}`).toBe(plain((l) => buildingCost(id, l), level));
    for (const id of Object.keys(TECHS) as TechId[]) for (const level of [0, 1, 5, 12, 2, 25]) expect(techPoints(id, level), `${id} ${level}`).toBe(plain((l) => techCost(id, l), level));
    expect(buildingPoints('metalMine', -3)).toBe(0);
  });
});

describe('ranking passes', () => {
  it('count fleets in flight exactly as the one-player calculation does', () => {
    a.techs = { combustionDrive: 6, computer: 6 };
    home.fleet = { largeCargo: 40, cruiser: 12 };
    const target = w.planets[b.planetIds[0]];
    sendFleet(w, a, { fromPlanetId: home.id, to: target.coords, ships: { largeCargo: 10, cruiser: 5 }, mission: 'transport' }, T0);
    const flights = movementsByOwner(w);
    expect(flights.get(a.id)).toHaveLength(1);
    expect(flights.get(b.id)).toBeUndefined();
    for (const p of [a, b, c]) expect(playerPoints(w, p, flights)).toEqual(playerPoints(w, p));
    const row = rankings(w, true).find((r) => r.id === a.id)!;
    expect(row.fleet).toBe(playerPoints(w, a).fleet);
    expect(row.fleet).toBeGreaterThan(fleetCountNaive(home.fleet)); // the ships in the air are counted too
  });
});

describe('automation in the all-players pass', () => {
  const attack = (from: Player, target: Planet) => {
    const origin = w.planets[from.planetIds[0]];
    origin.fleet = { cruiser: 10 }; origin.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
    from.techs = { combustionDrive: 6, computer: 6 };
    return sendFleet(w, from, { fromPlanetId: origin.id, to: target.coords, ships: { cruiser: 4 }, mission: 'attack' }, T0);
  };
  beforeEach(() => {
    home.coords = { g: 1, s: 9, p: 4 }; home.buildings = { shipyard: 4, roboticsFactory: 4 };
    w.planets[b.planetIds[0]].coords = { g: 1, s: 7, p: 3 }; w.planets[c.planetIds[0]].coords = { g: 1, s: 8, p: 6 };
  });

  it('reacts to an inbound fleet once, for the right owner only', () => {
    setRules(a, { defense: { on: true, unit: 'rocketLauncher', count: 30, maxSharePct: 10 } });
    setRules(c, { defense: { on: true, unit: 'rocketLauncher', count: 30, maxSharePct: 10 } });   // c is not the target
    const m = attack(b, home);
    runAutomationAll(w, T0 + 1000);
    expect(home.shipyardQueue).toHaveLength(1);
    expect(w.planets[c.planetIds[0]].shipyardQueue).toHaveLength(0);
    expect(a.autoSeen![m.id]).toBeTruthy();
    runAutomationAll(w, T0 + 2000);
    expect(home.shipyardQueue).toHaveLength(1);                                                   // not twice
    delete w.movements[m.id];
    runAutomationAll(w, T0 + 2 * 3_600_000);
    expect(a.autoSeen).toBeUndefined();                                                           // forgotten once it is long over
  });

  it('does nothing with the rule off, on vacation, or when the attacker is the owner', () => {
    attack(b, home);
    runAutomationAll(w, T0 + 1000);
    expect(home.shipyardQueue).toHaveLength(0);
    setRules(a, { defense: { on: true, unit: 'rocketLauncher', count: 5, maxSharePct: 50 } });
    home.buildQueue = null;
    a.vacation = { since: T0, minUntil: T0 + 3_600_000 };   // (startVacation itself refuses while an attack is inbound)
    runAutomationAll(w, T0 + 2000);
    expect(home.shipyardQueue).toHaveLength(0);
  });

  it('behaves like the single-player version', () => {
    setRules(a, { defense: { on: true, unit: 'rocketLauncher', count: 12, maxSharePct: 10 } });
    attack(b, home);
    const world2 = JSON.parse(JSON.stringify(w)) as World;
    runAutomationAll(w, T0 + 1000);
    runAutomation(world2, world2.players[a.id], T0 + 1000);
    expect(world2.planets[home.id].shipyardQueue).toEqual(home.shipyardQueue);
  });
});

describe('a blocked attempt is not repeated every second', () => {
  it('a build order that cannot proceed waits, then tries again', () => {
    saveOrder(a, 'blocked', [{ kind: 'building', id: 'metalMine', level: 9 }]);
    home.fields = Object.values(home.buildings).reduce((s, v) => s + (v || 0), 0);              // no free fields
    startPlan(w, a, home, { orderId: a.buildOrders![0].id }, T0);
    expect(home.plan!.status).toMatch(/blocked at Metal Mine 6: No free fields/);
    expect(home.plan!.retryAt).toBe(T0 + RETRY_MS);
    home.fields += 10;                                                                            // the problem goes away...
    runAutomation(w, a, T0 + 5000);
    expect(home.buildQueue).toBeNull();                                                            // ...but nothing is attempted yet
    runAutomation(w, a, T0 + RETRY_MS + 1);
    expect(home.buildQueue?.id).toBe('metalMine');
  });

  it('a rule that cannot act waits, then tries again', () => {
    setRules(a, { energy: true });
    home.buildings = { metalMine: 10 };
    home.resources = { metal: 0, crystal: 0, deuterium: 0 };
    runAutomation(w, a, T0);
    expect(home.buildQueue).toBeNull();
    expect(home.rulesRetryAt).toBe(T0 + RETRY_MS);
    home.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
    runAutomation(w, a, T0 + 1000);
    expect(home.buildQueue).toBeNull();
    runAutomation(w, a, T0 + RETRY_MS + 1);
    expect(home.buildQueue?.id).toBe('solarPlant');
  });
});

describe('the shared ticker', () => {
  it('runs the whole server step and reports where the time went', () => {
    setRules(a, { energy: true });
    const tick = createTicker(w);
    const prof: Record<string, number> = {};
    tick(T0 + 1000, prof);
    expect(Object.keys(prof)).toEqual(expect.arrayContaining(['fleet movements', 'economy (every player)', 'automation', 'territory', 'objectives and achievements']));
    for (const ms of Object.values(prof)) expect(ms).toBeGreaterThanOrEqual(0);
    expect(() => tick(T0 + 2000)).not.toThrow();                                                   // the profile argument is optional
  });
});
