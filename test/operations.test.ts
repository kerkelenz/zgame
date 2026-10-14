import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { createAlliance, joinAlliance } from '../server/alliance';
import { OPS, closeOperation, createOperation, operationsView, processOperations, shipsFor, signUp, withdraw } from '../server/operations';
import { createWorld, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const MIN = 60_000, HOUR = 3_600_000;
let w: World; let alice: Player, bob: Player, carol: Player; let bp: Planet;
const target = { g: 1, s: 30, p: 5 };

beforeEach(() => {
  w = createWorld({ npcDensity: 0, protectionPoints: 0, raidIntervalMin: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bobby', 'secret2', T0).player;
  carol = register(w, 'carol', 'secret3', T0).player;
  createAlliance(w, alice, 'ABC', 'Alpha');
  w.alliances[alice.allianceId!].open = true;
  joinAlliance(w, bob, alice.allianceId!, '');
  bp = w.planets[bob.planetIds[0]];
  bp.coords = { g: 1, s: 10, p: 4 };
  bp.fleet = { cruiser: 20, lightFighter: 50, smallCargo: 30, espionageProbe: 5, solarSatellite: 9 };
});

describe('alliance operations', () => {
  it('needs an alliance, a name, a target inside the galaxy and a sensible landing time', () => {
    expect(() => createOperation(w, carol, { kind: 'attack', name: 'Strike', target }, T0)).toThrow(/not in an alliance/);
    expect(() => createOperation(w, alice, { kind: 'attack', name: 'x', target }, T0)).toThrow(/name/);
    expect(() => createOperation(w, alice, { kind: 'nuke', name: 'Strike', target }, T0)).toThrow(/attack or a defense/);
    expect(() => createOperation(w, alice, { kind: 'attack', name: 'Strike', target: { g: 9, s: 1, p: 1 } }, T0)).toThrow(/outside/);
    expect(() => createOperation(w, alice, { kind: 'attack', name: 'Strike', target, arriveAt: T0 + MIN }, T0)).toThrow(/between 5 minutes/);
    const op = createOperation(w, alice, { kind: 'attack', name: 'Strike', target, arriveAt: T0 + 2 * HOUR }, T0);
    expect(operationsView(w, bob)).toHaveLength(1);
    expect(operationsView(w, carol)).toHaveLength(0);                          // another alliance never sees it
    expect(w.messages.some((m) => m.to === bob.id && /Operation: Strike/.test(m.subject))).toBe(true);
    expect(op.signups).toEqual([]);
  });
  it('limits the number open at once', () => {
    for (let i = 0; i < OPS.maxOpen; i++) createOperation(w, alice, { kind: 'attack', name: `Op ${i}x`, target }, T0);
    expect(() => createOperation(w, alice, { kind: 'attack', name: 'One more', target }, T0)).toThrow(/At most/);
  });
  it('signs a member up with the warships of a planet and works out when to leave to land at the set time', () => {
    const op = createOperation(w, alice, { kind: 'attack', name: 'Strike', target, arriveAt: T0 + 3 * HOUR }, T0);
    expect(shipsFor(bp.fleet, 'warships')).toEqual({ cruiser: 20, lightFighter: 50 });          // no cargo, probes or satellites
    expect(Object.keys(shipsFor(bp.fleet, 'all')).sort()).toEqual(['cruiser', 'espionageProbe', 'lightFighter', 'smallCargo']);
    const s = signUp(w, bob, op.id, bp.id, 'warships', T0);
    expect(s.ships).toEqual({ cruiser: 20, lightFighter: 50 });
    expect(s.secs).toBeGreaterThan(0);
    expect(s.departAt).toBe(op.arriveAt! - s.secs * 1000);
    expect(signUp(w, bob, op.id, bp.id, 'all', T0).ships.smallCargo).toBe(30);               // signing up again replaces it
    expect(op.signups).toHaveLength(1);
    expect(operationsView(w, bob)[0].mine).toEqual([bp.id]);
  });
  it('refuses a planet that is not yours, no ships, or a landing time you can no longer make', () => {
    const op = createOperation(w, alice, { kind: 'attack', name: 'Strike', target, arriveAt: T0 + 6 * MIN }, T0);
    expect(() => signUp(w, bob, op.id, w.planets[alice.planetIds[0]].id, 'all', T0)).toThrow(/Not your planet/);
    expect(() => signUp(w, alice, op.id, w.planets[alice.planetIds[0]].id, 'warships', T0)).toThrow(/no warships/);
    expect(() => signUp(w, bob, op.id, bp.id, 'warships', T0)).toThrow(/Too late/);        // the flight is far longer than 6 minutes
    expect(() => signUp(w, carol, op.id, w.planets[carol.planetIds[0]].id, 'all', T0)).toThrow(/No such operation/);
  });
  it('reminds once, ten minutes before leaving, and closes an operation after it landed', () => {
    const op = createOperation(w, alice, { kind: 'defend', name: 'Hold', target, arriveAt: T0 + 5 * HOUR }, T0);
    const s = signUp(w, bob, op.id, bp.id, 'warships', T0);
    processOperations(w, s.departAt! - 11 * MIN);
    expect(w.messages.filter((m) => /Operation: (time to|launch)/.test(m.subject))).toHaveLength(0);
    processOperations(w, s.departAt! - 9 * MIN);
    processOperations(w, s.departAt! - 8 * MIN);
    expect(w.messages.filter((m) => m.to === bob.id && /Operation: time to launch/.test(m.subject))).toHaveLength(1);
    processOperations(w, op.arriveAt! + OPS.keepAfterMs + MIN);
    expect(operationsView(w, bob)).toHaveLength(0);
  });
  it('lets a member withdraw, and only the planner or an officer close it', () => {
    const op = createOperation(w, alice, { kind: 'attack', name: 'Strike', target }, T0);
    signUp(w, bob, op.id, bp.id, 'warships', T0);
    withdraw(w, bob, op.id);
    expect(op.signups).toHaveLength(0);
    expect(() => closeOperation(w, bob, op.id)).toThrow(/Only the one who planned it/);
    closeOperation(w, alice, op.id);
    expect(operationsView(w, alice)).toHaveLength(0);
    expect(() => signUp(w, bob, op.id, bp.id, 'warships', T0)).toThrow(/closed/);
  });
});
