import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { fleetEvents } from '../server/events';
import { FORGE, cancelForge, forgeCost, forgeDiameter, forgeView, processForges, startForge } from '../server/forge';
import { createMoon } from '../server/galaxy';
import { planetView } from '../server/views';
import { createWorld, ck, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
let w: World; let alice: Player, bob: Player; let ap: Planet;
const key = () => ck(ap.coords);

beforeEach(() => {
  w = createWorld({ economySpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bobby', 'secret2', T0).player;
  ap = w.planets[alice.planetIds[0]];
  ap.coords = { g: 1, s: 5, p: 6 };
  ap.buildings = { shipyard: FORGE.shipyard, roboticsFactory: 10, solarPlant: 10 };
  ap.resources = { metal: 5e7, crystal: 5e7, deuterium: 5e7 };
  alice.techs = { graviton: 1, energy: 12 };
  w.debris[key()] = { metal: 800_000, crystal: 400_000 };
});

describe('the Moon Forge: rules', () => {
  it('starts, uses up the field, takes the price and runs for the configured time', () => {
    const job = startForge(w, alice, ap, T0);
    expect(w.debris[key()]).toBeUndefined();                                  // nobody can recycle it meanwhile
    expect(job.cost).toEqual({ metal: 300_000, crystal: 300_000, deuterium: 1_200_000 });
    expect(ap.resources).toEqual({ metal: 5e7 - 300_000, crystal: 5e7 - 300_000, deuterium: 5e7 - 1_200_000 });
    expect(job.end - job.start).toBe(w.config.forgeHours * HOUR);
    expect(job.diameter).toBe(forgeDiameter(1_200_000));
    expect(w.forges![ap.id]).toBe(job);
  });

  it('needs Graviton Technology, a big Shipyard, a big field, no moon yet, and the resources', () => {
    alice.techs = { graviton: 0 };
    expect(() => startForge(w, alice, ap, T0)).toThrow(/Graviton/);
    alice.techs = { graviton: 1 };
    ap.buildings.shipyard = FORGE.shipyard - 1;
    expect(() => startForge(w, alice, ap, T0)).toThrow(/Shipyard/);
    ap.buildings.shipyard = FORGE.shipyard;
    w.debris[key()] = { metal: 500_000, crystal: 499_999 };
    expect(() => startForge(w, alice, ap, T0)).toThrow(/at least/);
    delete w.debris[key()];
    expect(() => startForge(w, alice, ap, T0)).toThrow(/at least/);
    w.debris[key()] = { metal: 800_000, crystal: 400_000 };
    ap.resources = { metal: 1000, crystal: 1000, deuterium: 1000 };
    expect(() => startForge(w, alice, ap, T0)).toThrow(/Not enough/);
    expect(w.debris[key()]).toBeTruthy();                                     // nothing is used up when it cannot start
    ap.resources = { metal: 5e7, crystal: 5e7, deuterium: 5e7 };
    createMoon(w, ap, T0);
    expect(() => startForge(w, alice, ap, T0)).toThrow(/already has a moon/);
  });

  it('only on your own planets, never on a moon, and one forge at a time per planet', () => {
    expect(() => startForge(w, bob, ap, T0)).toThrow(/your planets/);
    startForge(w, alice, ap, T0);
    w.debris[key()] = { metal: 2e6, crystal: 0 };
    expect(() => startForge(w, alice, ap, T0)).toThrow(/already running/);
    const other = w.planets[bob.planetIds[0]];
    const moon = createMoon(w, other, T0);
    expect(() => startForge(w, bob, moon, T0)).toThrow(/your planets/);
  });

  it('can be switched off by the server', () => {
    w.config.forgeHours = 0;
    expect(() => startForge(w, alice, ap, T0)).toThrow(/switched off/);
    expect(forgeView(w, ap, alice)).toBeNull();
  });

  it('cancelling gives back what was paid but not the debris', () => {
    startForge(w, alice, ap, T0);
    const back = cancelForge(w, alice, ap);
    expect(back.deuterium).toBe(1_200_000);
    expect(ap.resources).toEqual({ metal: 5e7, crystal: 5e7, deuterium: 5e7 });
    expect(w.forges![ap.id]).toBeUndefined();
    expect(w.debris[key()]).toBeUndefined();
    expect(() => cancelForge(w, alice, ap)).toThrow(/No Moon Forge/);
  });
});

describe('the Moon Forge: result', () => {
  it('makes a moon of the promised size when the time is up, and not before', () => {
    const job = startForge(w, alice, ap, T0);
    processForges(w, T0 + job.end - job.start - 1);
    expect(Object.values(w.planets).some((p) => p.parentId === ap.id)).toBe(false);
    processForges(w, job.end);
    const moon = Object.values(w.planets).find((p) => p.parentId === ap.id)!;
    expect(moon.isMoon).toBe(true);
    expect(moon.diameter).toBe(job.diameter);
    expect(moon.coords).toEqual(ap.coords);
    expect(w.forges![ap.id]).toBeUndefined();
    expect(w.messages.some((m) => m.to === alice.id && m.subject === 'Your moon is forged')).toBe(true);
  });

  it('a bigger field makes a bigger moon, within limits', () => {
    expect(forgeDiameter(FORGE.minDebris)).toBe(FORGE.baseDiameter);
    expect(forgeDiameter(FORGE.maxDebris)).toBe(FORGE.maxDiameter);
    expect(forgeDiameter(9e9)).toBe(FORGE.maxDiameter);
    expect(forgeDiameter(3_000_000)).toBeGreaterThan(forgeDiameter(1_500_000));
    expect(forgeCost({ metal: 1_000_000, crystal: 1_000_000 }).deuterium).toBe(2_000_000);
  });

  it('does not make a second moon if one formed meanwhile, or when the planet is gone', () => {
    const job = startForge(w, alice, ap, T0);
    createMoon(w, ap, T0 + 1000);                                              // a battle made one in the meantime
    processForges(w, job.end);
    expect(Object.values(w.planets).filter((p) => p.parentId === ap.id)).toHaveLength(1);
    const j2 = { ...job, planetId: 'missing' };
    w.forges!.missing = j2;
    expect(() => processForges(w, job.end)).not.toThrow();
    expect(w.forges!.missing).toBeUndefined();
  });
});

describe('what the player sees', () => {
  it('the planet view lists the requirements, price and result, and the running job', () => {
    let f = planetView(w, ap, T0).forge!;
    expect(f.requirements.every((r) => r.ok)).toBe(true);
    expect(f.cost).toEqual({ metal: 300_000, crystal: 300_000, deuterium: 1_200_000 });
    expect(f.diameter).toBe(forgeDiameter(1_200_000));
    expect(f.running).toBeNull();
    alice.techs = {};
    f = planetView(w, ap, T0).forge!;
    expect(f.requirements[0].ok).toBe(false);
    alice.techs = { graviton: 1 };
    startForge(w, alice, ap, T0);
    f = planetView(w, ap, T0).forge!;
    expect(f.running).toMatchObject({ end: T0 + 12 * HOUR });
    expect(planetView(w, createMoon(w, ap, T0 + 1), T0).forge).toBeNull();      // moons have none
  });

  it('is not shown to someone with no use for it', () => {
    w.debris = {};
    alice.techs = {};
    expect(planetView(w, ap, T0).forge!.relevant).toBe(false);
    w.debris[key()] = { metal: 10, crystal: 0 };
    expect(planetView(w, ap, T0).forge!.relevant).toBe(true);
    createMoon(w, ap, T0 + 5);                                                   // a planet that already has a moon is offered no forge
    expect(planetView(w, ap, T0).forge!.relevant).toBe(false);
    alice.techs = { graviton: 1 };
    expect(planetView(w, ap, T0).forge!.relevant).toBe(false);
  });

  it('appears in the event list with the moon size', () => {
    const job = startForge(w, alice, ap, T0);
    const ev = fleetEvents(w, alice).find((e) => e.step === 'forge')!;
    expect(ev).toMatchObject({ kind: 'own', mission: 'forge', at: job.end, moonKm: job.diameter });
    expect(fleetEvents(w, bob).some((e) => e.step === 'forge')).toBe(false);
  });
});
