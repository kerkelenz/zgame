import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { fleetEvents } from '../server/events';
import { processMovements, sendFleet } from '../server/fleet';
import { fleetsView } from '../server/views';
import { createWorld, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
let w: World;
let alice: Player, bob: Player, cara: Player;
let ap: Planet, bp: Planet, cp: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 100, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  [alice, bob, cara] = ['alice', 'bobby', 'carol'].map((n) => register(w, n, 'secret1', T0).player);
  [ap, bp, cp] = [alice, bob, cara].map((p) => w.planets[p.planetIds[0]]);
  ap.coords = { g: 1, s: 5, p: 6 }; bp.coords = { g: 1, s: 7, p: 8 }; cp.coords = { g: 1, s: 9, p: 3 };
  for (const p of [ap, bp, cp]) { p.buildings = { shipyard: 6, solarPlant: 20, roboticsFactory: 4 }; p.resources = { metal: 5e6, crystal: 5e6, deuterium: 5e6 }; p.fleet = { cruiser: 10, smallCargo: 10, recycler: 2, espionageProbe: 3 }; }
  for (const p of [alice, bob, cara]) p.techs = { combustionDrive: 6, impulseDrive: 4, energy: 8, computer: 3 };
});

describe('the fleet event list', () => {
  it('shows an outgoing fleet arriving and the return it will make afterwards', () => {
    const m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 4 }, mission: 'attack' }, T0);
    const ev = fleetEvents(w, alice);
    expect(ev.map((e) => [e.step, e.projected])).toEqual([['arrive', false], ['return', true]]);
    expect(ev[0]).toMatchObject({ kind: 'own', mission: 'attack', ships: 4, at: m.arriveAt, from: { name: ap.name, coords: ap.coords }, to: { name: bp.name, coords: bp.coords }, targetOwner: { name: 'bobby' } });
    expect(ev[1].at).toBe(m.arriveAt + m.flightMs);
    expect(ev[1].from.coords).toEqual(bp.coords);       // the return runs the other way
    expect(ev[1].to.coords).toEqual(ap.coords);
  });

  it('shows a fleet already on its way home, and a holding fleet leaving', () => {
    const t = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { smallCargo: 2 }, mission: 'transport', cargo: { metal: 1000 } }, T0);
    processMovements(w, t.arriveAt);
    const ev = fleetEvents(w, alice).filter((e) => e.id.startsWith(t.id));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ step: 'return', projected: false, at: t.returnAt });
    AL.createAlliance(w, alice, 'AAA', 'Alpha'); AL.joinAlliance(w, cara, alice.allianceId!);
    const h = sendFleet(w, alice, { fromPlanetId: ap.id, to: cp.coords, ships: { cruiser: 1 }, mission: 'hold', holdHours: 2 } as never, T0 + 100);
    processMovements(w, h.arriveAt);
    const held = fleetEvents(w, alice).filter((e) => e.id.startsWith(h.id));
    expect(held.map((e) => e.step)).toEqual(['end', 'return']);
    expect(held[1].at).toBe(h.holdUntil! + h.flightMs);
  });

  it('lists incoming hostile fleets for you and for allies, hiding the ships of an enemy with better espionage', () => {
    bob.techs.espionage = 2;
    AL.createAlliance(w, alice, 'AAA', 'Alpha'); AL.joinAlliance(w, cara, alice.allianceId!);
    const hit = sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { cruiser: 5 }, mission: 'attack' }, T0);
    const hitAlly = sendFleet(w, bob, { fromPlanetId: bp.id, to: cp.coords, ships: { cruiser: 3 }, mission: 'attack' }, T0 + 10);
    const ev = fleetEvents(w, alice).filter((e) => e.kind === 'hostile');
    expect(ev.map((e) => e.id)).toEqual([`${hit.id}:arrive`, `${hitAlly.id}:arrive`].sort((a, b) => ev.findIndex((x) => x.id === a) - ev.findIndex((x) => x.id === b)));
    for (const e of ev) { expect(e.ships).toBeNull(); expect(e.owner.name).toBe('bobby'); expect(e.from.name).toBe(bp.name); }
    expect(ev.find((e) => e.id === `${hit.id}:arrive`)!.targetOwner).toBeNull();                 // you
    expect(ev.find((e) => e.id === `${hitAlly.id}:arrive`)!.targetOwner).toMatchObject({ name: 'carol' });
    // the attacker sees only their own side of it
    expect(fleetEvents(w, bob).every((e) => e.kind === 'own')).toBe(true);
  });

  it('says how many resources a fleet is carrying: the delivery on the way out, the loot on the way home', () => {
    const t = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { smallCargo: 2 }, mission: 'transport', cargo: { metal: 1200, crystal: 300 } }, T0);
    const out = fleetEvents(w, alice);
    expect(out.find((e) => e.id === `${t.id}:arrive`)!.cargo).toEqual({ metal: 1200, crystal: 300, deuterium: 0 });
    expect(out.find((e) => e.id === `${t.id}:return`)!.cargo).toBeNull();                 // it comes back empty
    // a fleet that is already flying home with loot
    w.movements[t.id].phase = 'returning'; w.movements[t.id].returnAt = T0 + 1000; w.movements[t.id].cargo = { metal: 5000, crystal: 0, deuterium: 250 };
    expect(fleetEvents(w, alice).find((e) => e.id === `${t.id}:return`)!.cargo).toEqual({ metal: 5000, crystal: 0, deuterium: 250 });
    // nothing on board: no cargo at all
    const plain = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 1 }, mission: 'attack' }, T0);
    expect(fleetEvents(w, alice).find((e) => e.id === `${plain.id}:arrive`)!.cargo).toBeNull();
  });

  it('shows what an ally is delivering to you, but never what a hostile fleet carries', () => {
    AL.createAlliance(w, alice, 'AAA', 'Alpha'); AL.joinAlliance(w, bob, alice.allianceId!);
    const gift = sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { smallCargo: 2 }, mission: 'transport', cargo: { metal: 777 } }, T0);
    expect(fleetEvents(w, alice).find((e) => e.id === `${gift.id}:arrive`)!.cargo).toEqual({ metal: 777, crystal: 0, deuterium: 0 });
    const raid = sendFleet(w, cara, { fromPlanetId: cp.id, to: ap.coords, ships: { cruiser: 2 }, mission: 'attack' }, T0);
    expect(fleetEvents(w, alice).find((e) => e.id === `${raid.id}:arrive`)!.cargo).toBeNull();
  });

  it('tells how much of a hostile fleet you can see from your espionage level compared with theirs', () => {
    sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { cruiser: 6, lightFighter: 0, smallCargo: 2 }, mission: 'attack' }, T0);
    const see = () => fleetEvents(w, alice).find((e) => e.kind === 'hostile')!;
    bob.techs.espionage = 3;
    alice.techs.espionage = 1;                                      // behind: nothing
    expect(see()).toMatchObject({ intel: 'none', ships: null, shipTypes: null, fleet: null });
    alice.techs.espionage = 3;                                      // level: how many ships
    expect(see()).toMatchObject({ intel: 'count', ships: 8, shipTypes: null, fleet: null });
    alice.techs.espionage = 4;
    expect(see()).toMatchObject({ intel: 'count', ships: 8 });
    alice.techs.espionage = 5;                                      // two ahead: and the types
    expect(see()).toMatchObject({ intel: 'types', ships: 8 });
    expect([...see().shipTypes!].sort()).toEqual(['cruiser', 'smallCargo']);
    expect(see().fleet).toBeNull();
    alice.techs.espionage = 7;                                      // four ahead: the exact fleet
    expect(see()).toMatchObject({ intel: 'exact', ships: 8, fleet: { cruiser: 6, smallCargo: 2 } });
  });

  it('gives the same intel on the incoming list, and treats a missing espionage as level 0', () => {
    sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { cruiser: 4 }, mission: 'attack' }, T0);
    alice.techs.espionage = 0; bob.techs.espionage = 0;
    expect(fleetsView(w, alice).incoming[0]).toMatchObject({ intel: 'count', shipCount: 4, ships: {} });
    alice.techs.espionage = 4;
    expect(fleetsView(w, alice).incoming[0]).toMatchObject({ intel: 'exact', fleet: { cruiser: 4 } });
    bob.techs.espionage = 9;
    expect(fleetsView(w, alice).incoming[0].intel).toBe('none');
  });

  it('shows friendly deliveries, but not other commanders\' business', () => {
    AL.createAlliance(w, alice, 'AAA', 'Alpha'); AL.joinAlliance(w, bob, alice.allianceId!);
    const gift = sendFleet(w, bob, { fromPlanetId: bp.id, to: ap.coords, ships: { smallCargo: 2 }, mission: 'transport', cargo: { metal: 500 } }, T0);
    expect(fleetEvents(w, alice).find((e) => e.id === `${gift.id}:arrive`)).toMatchObject({ kind: 'friendly', ships: 2 });
    sendFleet(w, cara, { fromPlanetId: cp.id, to: bp.coords, ships: { espionageProbe: 1 }, mission: 'espionage' }, T0);
    expect(fleetEvents(w, alice).some((e) => e.owner.name === 'carol')).toBe(false);
  });

  it('is sorted by time and part of the fleets view', () => {
    sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { cruiser: 1 }, mission: 'attack' }, T0);
    sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { smallCargo: 1 }, mission: 'transport' }, T0 + 5000);
    const ev = fleetsView(w, alice).events;
    expect(ev.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < ev.length; i++) expect(ev[i].at).toBeGreaterThanOrEqual(ev[i - 1].at);
  });
});
