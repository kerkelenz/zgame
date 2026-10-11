import { beforeEach, describe, expect, it } from 'vitest';
import { removePlayer } from '../server/account';
import { register } from '../server/accounts';
import { processMovements, sendFleet } from '../server/fleet';
import * as SOC from '../server/social';
import { GameError, createWorld, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
let w: World; let a: Player, b: Player;

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  a = register(w, 'alice', 'secret1', T0).player;
  b = register(w, 'bobby', 'secret2', T0).player;
});

describe('block list and buddies', () => {
  it('blocking drops their private messages silently and removes them from buddies', () => {
    SOC.addBuddy(w, a, b.id);
    SOC.block(w, a, b.id);
    expect(a.buddies).toEqual([]);
    expect(SOC.blockedBy(w, b.id, a.id)).toBe(true);
    expect(SOC.blockedBy(w, a.id, b.id)).toBe(false);
    expect(() => SOC.addBuddy(w, a, b.id)).toThrow(/Unblock/);
    SOC.unblock(a, b.id);
    expect(SOC.blockedBy(w, b.id, a.id)).toBe(false);
  });
  it('rejects yourself, computer empires and unknown ids', () => {
    expect(() => SOC.block(w, a, a.id)).toThrow(/That is you/);
    expect(() => SOC.addBuddy(w, a, 'nobody')).toThrow(GameError);
    b.npc = { status: 'active', seedPoints: 1, faction: null };
    expect(() => SOC.addBuddy(w, a, b.id)).toThrow(/No such commander/);
  });
  it('buddy view shows presence and where they live', () => {
    SOC.addBuddy(w, a, b.id);
    SOC.addBuddy(w, a, b.id);
    const v = SOC.socialView(w, a, T0 + 60_000);
    expect(v.buddies).toHaveLength(1);
    expect(v.buddies[0]).toMatchObject({ username: 'bobby', activity: 'online' });
    expect(v.buddies[0]!.home).toEqual(w.planets[b.planetIds[0]].coords);
  });
  it('deleting a commander clears them from everyone else\'s lists', () => {
    SOC.addBuddy(w, a, b.id); SOC.block(w, a, b.id); SOC.setNote(a, `p:${b.id}`, 'sneaky');
    removePlayer(w, b);
    expect(a.buddies).toEqual([]); expect(a.blocked).toEqual([]); expect(a.notes?.[`p:${b.id}`]).toBeUndefined();
  });
});

describe('notes, bookmarks and recent targets', () => {
  it('notes attach to players or coordinates, trim, and delete when emptied', () => {
    SOC.setNote(a, `p:${b.id}`, '  farm on Fridays ');
    SOC.setNote(a, 'c:1:5:6', 'good debris');
    expect(a.notes).toEqual({ [`p:${b.id}`]: 'farm on Fridays', 'c:1:5:6': 'good debris' });
    SOC.setNote(a, 'c:1:5:6', '   ');
    expect(a.notes!['c:1:5:6']).toBeUndefined();
    expect(() => SOC.setNote(a, 'evil', 'x')).toThrow(/Invalid note target/);
    expect(() => SOC.setNote(a, '__proto__', 'x')).toThrow(/Invalid note target/);
    expect(SOC.socialView(w, a, T0).notes).toEqual({ [`p:${b.id}`]: 'farm on Fridays' });
  });
  it('caps notes', () => {
    for (let i = 1; i <= 150; i++) SOC.setNote(a, `c:1:${i}:1`, 'n');
    expect(() => SOC.setNote(a, 'c:2:1:1', 'n')).toThrow(/too many/);
    SOC.setNote(a, 'c:1:1:1', 'changed'); // existing ones can still be edited
  });
  it('bookmarks validate coordinates, names default, no duplicates, remove by id', () => {
    SOC.addBookmark(w, a, '', { g: 1, s: 5, p: 6 });
    expect(a.bookmarks![0].name).toBe('1:5:6');
    expect(() => SOC.addBookmark(w, a, 'dup', { g: 1, s: 5, p: 6 })).toThrow(/Already/);
    expect(() => SOC.addBookmark(w, a, 'bad', { g: 99, s: 5, p: 6 })).toThrow(/Invalid coordinates/);
    expect(() => SOC.addBookmark(w, a, 'bad', { g: 1, s: 1.5, p: 6 })).toThrow(/Invalid coordinates/);
    SOC.removeBookmark(a, a.bookmarks![0].id);
    expect(a.bookmarks).toEqual([]);
  });
  it('remembers the last ten distinct targets, newest first, when fleets are sent', () => {
    const home = w.planets[a.planetIds[0]];
    home.fleet = { colonyShip: 20 }; home.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
    a.techs.combustionDrive = 3; a.techs.computer = 10; a.techs.astrophysics = 12;
    for (const s of [3, 4, 3, 5]) sendFleet(w, a, { fromPlanetId: home.id, to: { g: 1, s, p: 2 }, ships: { colonyShip: 1 }, mission: 'colonize' }, T0);
    expect(a.recent!.map((c) => c.s)).toEqual([5, 3, 4]);
    for (let i = 0; i < 15; i++) SOC.rememberTarget(a, { g: 1, s: 10 + i, p: 1 });
    expect(a.recent).toHaveLength(10);
    expect(a.recent![0].s).toBe(24);
  });
});

describe('spy archive', () => {
  it('keeps the newest report per planet and trims to 60', () => {
    SOC.archiveSpy(a, 'p1', { v: 1 }, 1000);
    SOC.archiveSpy(a, 'p1', { v: 2 }, 2000);
    expect(a.spyArchive!.p1).toEqual({ at: 2000, report: { v: 2 } });
    for (let i = 0; i < 70; i++) SOC.archiveSpy(a, 'x' + i, {}, 3000 + i);
    expect(Object.keys(a.spyArchive!)).toHaveLength(60);
    expect(a.spyArchive!.p1).toBeUndefined();
    expect(a.spyArchive!.x69).toBeTruthy();
  });
  it('espionage missions fill it', () => {
    const home = w.planets[a.planetIds[0]], target = w.planets[b.planetIds[0]];
    home.fleet = { espionageProbe: 3 }; home.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
    a.techs.combustionDrive = 3; a.techs.espionage = 8;
    const m = sendFleet(w, a, { fromPlanetId: home.id, to: target.coords, ships: { espionageProbe: 3 }, mission: 'espionage' }, T0);
    processMovements(w, m.arriveAt);
    const list = SOC.spyArchiveView(w, a);
    if (list.length) {
      expect(list[0]).toMatchObject({ planetId: target.id, name: target.name });
      expect((list[0].report as { owner: string }).owner).toBe('bobby');
    } else {
      expect(w.messages.some((x) => x.to === a.id && /Probes lost/.test(x.subject))).toBe(true); // caught: nothing to archive
    }
  });
});

describe('reports', () => {
  it('need a reason, are deduplicated and rate limited, and admins can resolve them', () => {
    expect(() => SOC.reportPlayer(w, a, b.id, 'no', T0)).toThrow(/5\+/);
    SOC.reportPlayer(w, a, b.id, 'spamming chat', T0);
    expect(() => SOC.reportPlayer(w, a, b.id, 'spamming chat again', T0)).toThrow(/already reported/);
    expect(w.reports).toHaveLength(1);
    SOC.resolveReport(w, w.reports![0].id);
    expect(w.reports![0].resolved).toBe(true);
    expect(() => SOC.resolveReport(w, 'nope')).toThrow(GameError);
    const others = ['c1', 'c2', 'c3', 'c4', 'c5'].map((n) => register(w, 'user_' + n, 'secret1', T0).player);
    for (const o of others.slice(0, 4)) SOC.reportPlayer(w, a, o.id, 'bad behaviour', T0);
    expect(() => SOC.reportPlayer(w, a, others[4].id, 'bad behaviour', T0)).toThrow(/Too many reports/);
  });
});
