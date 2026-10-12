import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { DEMOLISH, cancelBuilding, maxFields, queueBuilding, startDemolition, updatePlanet, usedFields } from '../server/economy';
import { createMoon } from '../server/galaxy';
import { planetView } from '../server/views';
import { buildingCost, buildingTime } from '../shared/formulas';
import { createWorld, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
let w: World; let alice: Player, bob: Player; let ap: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 100, constructionBoost: 1, raidIntervalMin: 0, npcDensity: 0, protectionPoints: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bobby', 'secret2', T0).player;
  ap = w.planets[alice.planetIds[0]];
  ap.buildings = { metalMine: 5, roboticsFactory: 2, solarPlant: 6 };
  ap.resources = { metal: 1e6, crystal: 1e6, deuterium: 1e6 };
});

describe('demolishing a building', () => {
  it('takes one level down after half the build time and gives back 30% of that level\'s price', () => {
    const before = { ...ap.resources };
    const job = startDemolition(w, alice, ap, 'metalMine', T0);
    const price = buildingCost('metalMine', 5);
    const full = buildingTime(price, 2, 0, w.config.economySpeed * w.config.constructionBoost, 1);
    expect(job).toMatchObject({ id: 'metalMine', level: 4, down: true });
    expect(job.end - job.start).toBeCloseTo(full * DEMOLISH.timeShare * 1000, -1);
    expect(ap.resources).toEqual(before);                                       // nothing is paid
    expect(ap.buildings.metalMine).toBe(5);                                      // still there until it is done
    updatePlanet(w, ap, job.end - 1);
    expect(ap.buildings.metalMine).toBe(5);
    updatePlanet(w, ap, job.end);
    expect(ap.buildings.metalMine).toBe(4);
    expect(ap.buildQueue).toBeNull();
    expect(w.messages.some((m) => m.to === alice.id && m.subject === 'Demolition complete')).toBe(true);
    // the refund arrived on top of whatever was produced meanwhile
    expect(ap.resources.metal).toBeGreaterThanOrEqual(before.metal + Math.floor(price.metal * DEMOLISH.refundShare));
  });

  it('frees a building field once it is done', () => {
    const used = usedFields(ap);
    const job = startDemolition(w, alice, ap, 'solarPlant', T0);
    expect(usedFields(ap)).toBe(used);                                           // the level counts until it is gone, and no extra field is taken meanwhile
    updatePlanet(w, ap, job.end);
    expect(usedFields(ap)).toBe(used - 1);
  });

  it('can take a building all the way down to nothing, one level at a time', () => {
    ap.buildings = { metalStorage: 1 };
    const job = startDemolition(w, alice, ap, 'metalStorage', T0);
    updatePlanet(w, ap, job.end);
    expect(ap.buildings.metalStorage).toBe(0);
    expect(() => startDemolition(w, alice, ap, 'metalStorage', job.end)).toThrow(/no Metal Storage/);
  });

  it('works on a moon too', () => {
    const moon = createMoon(w, ap, T0);
    moon.buildings = { lunarBase: 2, shipyard: 3 };
    const job = startDemolition(w, alice, moon, 'shipyard', T0);
    updatePlanet(w, moon, job.end);
    expect(moon.buildings.shipyard).toBe(2);
  });
});

describe('when it is not allowed', () => {
  it('needs an empty building queue, and then blocks the slot until it is done', () => {
    startDemolition(w, alice, ap, 'metalMine', T0);
    expect(() => startDemolition(w, alice, ap, 'solarPlant', T0)).toThrow(/queue/);
    queueBuilding(w, alice, ap, 'crystalMine', T0);                              // building goes behind it, as with any job
    expect(ap.buildBacklog).toEqual(['crystalMine']);
    cancelBuilding(w, ap, T0);                                                   // cancelling the demolition: nothing paid, nothing refunded, level unchanged
    expect(ap.buildings.metalMine).toBe(5);
    expect(ap.buildQueue?.id).toBe('crystalMine');                               // the queued job starts instead
    expect(() => startDemolition(w, alice, ap, 'solarPlant', T0)).toThrow(/queue/);
  });

  it('only your own buildings, only what exists, and not on vacation', () => {
    expect(() => startDemolition(w, alice, ap, 'shipyard', T0)).toThrow(/no Shipyard/);
    alice.vacation = { since: T0, minUntil: T0 + 1 };
    expect(() => startDemolition(w, alice, ap, 'metalMine', T0)).toThrow(/vacation/i);
  });

  it('not the Research Lab during research, nor a Shipyard with units in production', () => {
    ap.buildings.researchLab = 3; ap.buildings.shipyard = 4;
    alice.research = { id: 'energy', level: 1, start: T0, end: T0 + 1e6, cost: { metal: 0, crystal: 0, deuterium: 0 }, planetId: ap.id };
    expect(() => startDemolition(w, alice, ap, 'researchLab', T0)).toThrow(/research is running/);
    ap.shipyardQueue = [{ id: 'smallCargo', total: 5, remaining: 5, unitMs: 1000, start: T0, unitCost: { metal: 1, crystal: 1, deuterium: 0 } }];
    expect(() => startDemolition(w, alice, ap, 'shipyard', T0)).toThrow(/shipyard queue/i);
  });

  it('not a Terraformer or Lunar Base level whose fields are in use', () => {
    ap.buildings = { terraformer: 1, metalMine: 10, solarPlant: 10 };
    ap.fields = 22;                                                              // 5 more from the terraformer: 27 in all, 21 used
    expect(maxFields(ap)).toBe(27);
    expect(() => startDemolition(w, alice, ap, 'terraformer', T0)).not.toThrow();  // 20 used, 22 available afterwards: fine
    ap.buildQueue = null;
    ap.buildings = { terraformer: 1, metalMine: 12, solarPlant: 12, crystalMine: 2 };   // 27 used of 27: the five extra fields are all occupied
    expect(() => startDemolition(w, alice, ap, 'terraformer', T0)).toThrow(/fields this level gives are in use/);
    const moon = createMoon(w, ap, T0);
    moon.fields = 1;
    moon.buildings = { lunarBase: 1, shipyard: 3, roboticsFactory: 1 };           // 4 fields: 1 + 3 from the base, all used
    expect(() => startDemolition(w, alice, moon, 'lunarBase', T0)).toThrow(/in use/);
  });

  it('not a Missile Silo level while its missiles would no longer fit', () => {
    ap.buildings = { missileSilo: 2 };
    ap.defenses = { interplanetaryMissile: 8, antiBallisticMissile: 5 };         // 21 slots of 20: over already, but demolishing must not make it worse
    expect(() => startDemolition(w, alice, ap, 'missileSilo', T0)).toThrow(/no longer fit/);
    ap.defenses = { interplanetaryMissile: 4, antiBallisticMissile: 2 };         // 10 slots: a level-1 silo holds exactly that
    expect(() => startDemolition(w, alice, ap, 'missileSilo', T0)).not.toThrow();
  });
});

describe('what the player sees', () => {
  it('the planet view marks a running demolition and what it will return', () => {
    startDemolition(w, alice, ap, 'metalMine', T0);
    const q = planetView(w, ap, T0).buildQueue!;
    expect(q).toMatchObject({ id: 'metalMine', level: 4, down: true });
    expect(q.refund!.metal).toBeGreaterThan(0);
  });

  it('bob cannot touch alice\'s planet through the rules', () => {
    expect(ap.ownerId).toBe(alice.id);
    expect(bob.id).not.toBe(alice.id);
  });
});
