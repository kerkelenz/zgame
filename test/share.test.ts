import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { queueBuilding, queueResearch } from '../server/economy';
import { missingSteps } from '../shared/orders';
import { orderCard, planetCard, publish } from '../server/share';
import { createWorld, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
let w: World; let alice: Player; let ap: Planet;
beforeEach(() => {
  w = createWorld({ economySpeed: 1, npcDensity: 0, raidIntervalMin: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  ap = w.planets[alice.planetIds[0]];
  ap.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
  ap.buildings = { metalMine: 3, researchLab: 2, shipyard: 0 };
  ap.fleet = { smallCargo: 4 }; ap.defenses = { rocketLauncher: 9 };
  alice.techs = { energy: 2 };
});

describe('planet link cards', () => {
  it('show the planet and what is built, only the ships and defenses when asked, and drop zeroes', () => {
    const open = planetCard(alice, ap, false);
    expect(open).toMatchObject({ kind: 'planet', name: ap.name, owner: 'alice', role: null });
    expect(open.buildings).toEqual({ metalMine: 3, researchLab: 2 });
    expect(open.techs).toEqual({ energy: 2 });
    expect(open.fleet).toBeUndefined();
    const full = planetCard(alice, ap, true);
    expect(full.fleet).toEqual({ smallCargo: 4 });
    expect(full.defenses).toEqual({ rocketLauncher: 9 });
  });
  it('is stored with a public id and kept at a few hundred', () => {
    const id = publish(w, planetCard(alice, ap, false), 'Home of alice', T0);
    expect(id[0]).toBe('p');
    expect(w.shared![id].subject).toBe('Home of alice');
    for (let i = 0; i < 520; i++) publish(w, planetCard(alice, ap, false), 'x', T0 + i + 1);
    expect(Object.keys(w.shared!).length).toBeLessThanOrEqual(500);
  });
});

describe('build order link cards', () => {
  it('list the running job and every queued one with the level each takes the item to', () => {
    queueBuilding(w, alice, ap, 'metalMine', T0);                         // runs: level 4
    queueBuilding(w, alice, ap, 'metalMine', T0);                         // waits: level 5
    queueBuilding(w, alice, ap, 'solarPlant', T0);                        // waits: level 1
    queueResearch(w, alice, ap, 'laser', T0);
    const card = orderCard(alice, ap);
    expect(card.steps).toEqual([
      { kind: 'building', id: 'metalMine', level: 4 }, { kind: 'building', id: 'metalMine', level: 5 }, { kind: 'building', id: 'solarPlant', level: 1 },
      { kind: 'tech', id: 'laser', level: 1 },
    ]);
    expect(card.owner).toBe('alice');
  });
  it('is empty when nothing is queued', () => {
    expect(orderCard(alice, ap).steps).toEqual([]);
  });
  it('shows a newcomer only the steps they still have to do', () => {
    const card = { kind: 'order' as const, owner: 'a', planet: 'p', steps: [
      { kind: 'building' as const, id: 'metalMine', level: 4 }, { kind: 'building' as const, id: 'solarPlant', level: 1 }, { kind: 'tech' as const, id: 'laser', level: 1 },
    ] };
    expect(missingSteps(card.steps, { metalMine: 4 }, {})).toEqual([card.steps[1], card.steps[2]]);
    expect(missingSteps(card.steps, { metalMine: 9, solarPlant: 2 }, { laser: 3 })).toEqual([]);
  });
});
