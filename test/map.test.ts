import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { sendFleet } from '../server/fleet';
import { mapGalaxy, mapPlanet, mapSystem, mapUniverse, visibleMoves } from '../server/map';
import { generateOutposts } from '../server/outposts';
import { archiveSpy } from '../server/social';
import { announceInvasion } from '../server/invasion';
import { createWorld, ck, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
let w: World; let alice: Player, bob: Player; let ap: Planet, bp: Planet;

beforeEach(() => {
  w = createWorld({ galaxies: 2, systems: 12, positions: 15, economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0, outpostsPerGalaxy: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bobby', 'secret2', T0).player;
  ap = w.planets[alice.planetIds[0]]; bp = w.planets[bob.planetIds[0]];
  ap.coords = { g: 1, s: 5, p: 6 }; bp.coords = { g: 1, s: 7, p: 9 };
  bp.fleet = { battleship: 40, cruiser: 20 }; bp.defenses = { rocketLauncher: 100, heavyLaser: 30 };
  ap.fleet = { cruiser: 10, smallCargo: 5 }; ap.defenses = { rocketLauncher: 50 };
  alice.techs = { combustionDrive: 6, impulseDrive: 4 };
  bob.techs = { combustionDrive: 6, impulseDrive: 4 };
  ap.resources = { metal: 1e7, crystal: 1e7, deuterium: 1e7 }; bp.resources = { metal: 1e7, crystal: 1e7, deuterium: 1e7 };
});

describe('the map: what you may see', () => {
  it('shows your own world in full and another commander\'s only with a spy report, with its age', () => {
    const own = mapSystem(w, alice, 1, 5, T0).positions.find((x) => x.planet?.mine)!.planet!;
    expect(own.strength).toMatchObject({ ships: 15, defenses: 50 });
    const other = () => mapSystem(w, alice, 1, 7, T0).positions.find((x) => x.planet && !x.planet.mine)!.planet!;
    expect(other().strength).toBeNull();
    expect(other().intel).toBeNull();
    archiveSpy(alice, bp.id, { level: 5, fleet: { battleship: 40, cruiser: 20 }, defenses: { rocketLauncher: 100, heavyLaser: 30 } }, T0 - 3_600_000);
    const i = other().intel!;
    expect(T0 - i.at).toBe(3_600_000);
    expect(i.ships).toBe(60);
    expect(i.defenses).toBe(130);
    expect(i.fleetValue).toBeGreaterThan(0);
    expect(JSON.stringify(mapSystem(w, bob, 1, 7, T0))).toContain('"mine":true');
  });
  it('the planet view gives the full fleet and defenses only for your own world', () => {
    const mine = mapPlanet(w, alice, ap.id, T0);
    expect(mine.mine).toBe(true);
    expect(mine.fleet).toEqual(ap.fleet);
    expect(mine.defenses).toEqual(ap.defenses);
    const theirs = mapPlanet(w, alice, bp.id, T0);
    expect(theirs.mine).toBe(false);
    expect(theirs.fleet).toBeNull();
    expect(theirs.defenses).toBeNull();
    expect(theirs.intel).toBeNull();
    archiveSpy(alice, bp.id, { level: 7, fleet: { battleship: 40 }, defenses: { rocketLauncher: 100 } }, T0 - 60_000);
    expect(mapPlanet(w, alice, bp.id, T0).intel).toMatchObject({ fleet: { battleship: 40 }, defenses: { rocketLauncher: 100 } });
    expect(() => mapPlanet(w, alice, 'nope', T0)).toThrow(/No such world/);
  });
  it('lists your holders, and moon and planet point at each other', () => {
    const moon = { ...ap, id: 'mm', name: 'Moon', isMoon: true, parentId: ap.id, fleet: {}, defenses: {} } as Planet;
    w.planets.mm = moon; alice.planetIds.push('mm');
    expect(mapPlanet(w, alice, ap.id, T0).sibling).toMatchObject({ id: 'mm', isMoon: true });
    expect(mapPlanet(w, alice, 'mm', T0).sibling).toMatchObject({ id: ap.id, isMoon: false });
  });
});

describe('the map: the levels', () => {
  it('the system has every position, and a debris field shows on its position', () => {
    w.debris[ck({ g: 1, s: 5, p: 11 })] = { metal: 5000, crystal: 2000 };
    const v = mapSystem(w, alice, 1, 5, T0);
    expect(v.positions).toHaveLength(15);
    expect(v.positions.find((x) => x.p === 11)!.debris).toEqual({ metal: 5000, crystal: 2000 });
    expect(v.positions.find((x) => x.p === 6)!.planet!.mine).toBe(true);
    expect(() => mapSystem(w, alice, 9, 5, T0)).toThrow(/No such system/);
  });
  it('the galaxy counts mine, others, outposts, debris and a hold of an alliance per system', () => {
    w.debris[ck({ g: 1, s: 7, p: 12 })] = { metal: 1, crystal: 1 };
    w.config.outpostsPerGalaxy = 4; generateOutposts(w, T0, 99);
    const v = mapGalaxy(w, alice, 1, T0);
    const s5 = v.systems.find((x) => x.s === 5)!, s7 = v.systems.find((x) => x.s === 7)!;
    expect(s5).toMatchObject({ mine: 1, others: 0 });
    expect(s7).toMatchObject({ mine: 0, others: 1, debris: 1 });
    expect(v.systems.reduce((t, x) => t + x.outposts, 0)).toBe(w.outposts!.filter((o) => w.planets[o.planetId].coords.g === 1).length);
    expect(v.systemCount).toBe(12);
    expect(() => mapGalaxy(w, alice, 5, T0)).toThrow(/No such galaxy/);
  });
  it('the universe lists every galaxy with its planets and marks the invasion rift', () => {
    w.config.invasionMinPlayers = 1;
    const inv = announceInvasion(w, T0, 1000);
    const v = mapUniverse(w, alice, T0);
    expect(v.galaxies).toHaveLength(2);
    expect(v.galaxies[0]).toMatchObject({ g: 1, planets: 2, mine: 1 });
    expect(v.galaxies.find((x) => x.g === inv.rift.g)!.rift).toMatchObject({ phase: 'announced' });
    expect(v.galaxies.filter((x) => x.rift)).toHaveLength(1);
  });
});

describe('the map: fleets and alerts', () => {
  it('a hostile fleet on its way to you raises an alert on the system and the planet, and is visible; one aimed at a stranger is not', () => {
    bp.fleet = { battleship: 30, smallCargo: 10 };
    const m = sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { battleship: 30 }, mission: 'attack' }, T0);
    const g = mapGalaxy(w, alice, 1, T0);
    expect(g.systems.find((x) => x.s === 5)!.alert).toMatchObject({ count: 1, arriveAt: m.arriveAt });
    const pos = mapSystem(w, alice, 1, 5, T0).positions.find((x) => x.planet?.mine)!.planet!;
    expect(pos.alert).toMatchObject({ count: 1 });
    expect(visibleMoves(w, alice).some((x) => x.kind === 'hostile' && x.id === m.id)).toBe(true);
    const carol = register(w, 'carol', 'secret3', T0).player;
    expect(visibleMoves(w, carol).some((x) => x.id === m.id)).toBe(false);
  });
  it('your own fleets show with their way and phase, on the galaxy and the universe too', () => {
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { smallCargo: 5 }, mission: 'transport' }, T0);
    const mv = visibleMoves(w, alice).find((x) => x.id === m.id)!;
    expect(mv).toMatchObject({ kind: 'own', mission: 'transport', phase: 'outbound', ships: 5 });
    expect(mv.from).toEqual(ap.coords);
    expect(mv.to).toEqual(bp.coords);
    expect(mapSystem(w, alice, 1, 5, T0).moves.map((x) => x.id)).toContain(m.id);
    expect(mapSystem(w, alice, 1, 9, T0).moves.map((x) => x.id)).not.toContain(m.id);
    expect(mapGalaxy(w, alice, 1, T0).systems.find((x) => x.s === 7)!.traffic).toBe(1);
    expect(mapUniverse(w, alice, T0).galaxies[0].traffic).toBe(1);
    expect(mapUniverse(w, alice, T0).galaxies[1].traffic).toBe(0);
    expect(mapUniverse(w, bob, T0).galaxies[0].traffic).toBe(0);                 // another commander's transport is not yours to see
  });
});
