import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { sendFleet } from '../server/fleet';
import { galaxyView } from '../server/galaxy';
import { allianceView } from '../server/views';
import { GameError, atWar, createWorld, friendly, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
let w: World; let a: Player, b: Player, c: Player, d: Player;
// a founds [AAA] with b (member) and c; d founds [DDD]

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  [a, b, c, d] = ['alice', 'bobby', 'carol', 'dave'].map((n) => register(w, n, 'secret1', T0).player);
  AL.createAlliance(w, a, 'AAA', 'Alpha');
  AL.joinAlliance(w, b, a.allianceId!);
  AL.joinAlliance(w, c, a.allianceId!);
  AL.createAlliance(w, d, 'DDD', 'Delta');
});
const A = () => w.alliances[a.allianceId!];
const D = () => w.alliances[d.allianceId!];

describe('ranks and permissions', () => {
  it('plain members can do nothing, plain officers everything but ranks, founders everything', () => {
    expect(AL.permsOf(A(), b.id)).toEqual([]);
    AL.setRole(w, a, b.id, 'officer');
    expect(AL.permsOf(A(), b.id)).toContain('bank');
    expect(AL.permsOf(A(), b.id).length).toBe(8);
    expect(AL.permsOf(A(), a.id).length).toBe(8);
    expect(() => AL.createRank(w, b, 'Quartermaster', ['bank'])).toThrow(/founder/);
  });

  it('a custom rank grants exactly its permissions', () => {
    const r = AL.createRank(w, a, 'Quartermaster', ['bank', 'bogus']);
    expect(r.perms).toEqual(['bank']);
    AL.assignRank(w, a, b.id, r.id);
    expect(AL.permsOf(A(), b.id)).toEqual(['bank']);
    A().bank = { metal: 1000, crystal: 0, deuterium: 0 };
    AL.withdraw(w, b, c.id, { metal: 500 }, T0);
    expect(A().bank.metal).toBe(500);
    expect(() => AL.kickMember(w, b, c.id)).toThrow(/rank does not allow/);
    expect(() => AL.buyUpgrade(w, b, 'production')).toThrow(/rank does not allow/);
    expect(() => AL.updateAlliance(w, b, { description: 'x' })).toThrow(/rank does not allow/);
    expect(() => AL.postBulletin(w, b, 'hi')).toThrow(/rank does not allow/);
  });

  it('manages ranks: names, limits, edits, deletion strips members of the rank', () => {
    const r = AL.createRank(w, a, 'Recruiter', ['applications', 'kick']);
    expect(() => AL.createRank(w, a, 'recruiter', [])).toThrow(/already exists/);
    expect(() => AL.createRank(w, a, 'x', [])).toThrow(/2-20/);
    for (let i = 0; i < 7; i++) AL.createRank(w, a, 'Rank' + i, []);
    expect(() => AL.createRank(w, a, 'OneTooMany', [])).toThrow(/At most 8/);
    AL.assignRank(w, a, b.id, r.id);
    AL.updateRank(w, a, r.id, { name: 'Scout', perms: ['bulletin'] });
    expect(AL.permsOf(A(), b.id)).toEqual(['bulletin']);
    AL.deleteRank(w, a, r.id);
    expect(AL.permsOf(A(), b.id)).toEqual([]);
    expect(() => AL.assignRank(w, a, b.id, 'nope')).toThrow(/No such rank/);
    expect(() => AL.assignRank(w, a, a.id, null)).toThrow(GameError);
  });

  it('ranked members cannot kick other ranked members, only the founder can', () => {
    const r = AL.createRank(w, a, 'Sergeant', ['kick']);
    AL.assignRank(w, a, b.id, r.id);
    AL.assignRank(w, a, c.id, r.id);
    expect(() => AL.kickMember(w, b, c.id)).toThrow(/Insufficient rank/);
    AL.kickMember(w, a, c.id);
    expect(c.allianceId).toBeNull();
  });

  it('shows up in the alliance view', () => {
    const r = AL.createRank(w, a, 'Quartermaster', ['bank']);
    AL.assignRank(w, a, b.id, r.id);
    const v = allianceView(w, A(), b);
    expect(v.myPerms).toEqual(['bank']);
    expect(v.members.find((m) => m.id === b.id)).toMatchObject({ rank: 'Quartermaster' });
    expect(allianceView(w, A(), c).myPerms).toEqual([]);
  });
});

describe('bulletin board and mass messages', () => {
  it('posts, pins and removes with the right permission', () => {
    AL.setRole(w, a, b.id, 'officer');
    AL.postBulletin(w, b, 'Rally at 1:20');
    AL.postBulletin(w, a, 'Rules: be nice', true);
    expect(() => AL.postBulletin(w, c, 'hello')).toThrow(/rank does not allow/);
    expect(() => AL.postBulletin(w, a, '  ')).toThrow(/Empty/);
    const view = allianceView(w, A(), c).bulletin;
    expect(view.map((x) => x.text)).toEqual(['Rules: be nice', 'Rally at 1:20']); // pinned first
    AL.pinBulletin(w, a, view[1].id, true);
    AL.removeBulletin(w, b, view[1].id); // author may remove their own
    expect(A().bulletin).toHaveLength(1);
    expect(() => AL.removeBulletin(w, c, A().bulletin![0].id)).toThrow(/rank does not allow/);
    AL.removeBulletin(w, a, A().bulletin![0].id);
    expect(A().bulletin).toHaveLength(0);
  });

  it('keeps the newest 50 and never drops pinned posts first', () => {
    AL.postBulletin(w, a, 'pinned', true);
    for (let i = 0; i < 60; i++) AL.postBulletin(w, a, 'p' + i);
    expect(A().bulletin).toHaveLength(50);
    expect(A().bulletin!.some((x) => x.text === 'pinned')).toBe(true);
    expect(A().bulletin!.some((x) => x.text === 'p59')).toBe(true);
    expect(A().bulletin!.some((x) => x.text === 'p0')).toBe(false);
  });

  it('mass messages reach every other member and need the permission', () => {
    expect(AL.massMessage(w, a, 'Operation', 'Gather at dawn')).toBe(2);
    for (const p of [b, c]) expect(w.messages.some((m) => m.to === p.id && m.body === 'Gather at dawn' && /\[AAA\] Operation/.test(m.subject))).toBe(true);
    expect(w.messages.some((m) => m.to === a.id && m.body === 'Gather at dawn')).toBe(false);
    expect(() => AL.massMessage(w, b, 's', 't')).toThrow(/rank does not allow/);
    expect(() => AL.massMessage(w, a, 's', ' ')).toThrow(/Empty/);
  });
});

describe('diplomacy', () => {
  it('pacts need both sides, stop attacks between the alliances, and can be ended', () => {
    const home = (p: Player) => w.planets[p.planetIds[0]];
    home(a).fleet = { cruiser: 10 }; home(a).resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 }; a.techs.combustionDrive = 4; a.techs.computer = 5;
    const strike = () => sendFleet(w, a, { fromPlanetId: home(a).id, to: home(d).coords, ships: { cruiser: 2 }, mission: 'attack' }, T0);
    expect(strike().mission).toBe('attack'); // enemies for now
    AL.proposePact(w, a, D().id);
    expect(friendly(w, a.id, d.id)).toBe(false);
    expect(allianceView(w, D(), d).proposals[0]).toMatchObject({ tag: 'AAA' });
    expect(() => AL.proposePact(w, a, D().id)).toThrow(/already made/);
    AL.respondPact(w, d, A().id, true);
    expect(friendly(w, a.id, d.id)).toBe(true);
    expect(A().diplomacy![D().id].kind).toBe('pact');
    expect(D().proposals).toEqual([]);
    expect(() => strike()).toThrow(/pact partner/);
    expect(() => AL.proposePact(w, a, D().id)).toThrow(/already have a pact/);
    AL.endTreaty(w, d, A().id);
    expect(friendly(w, a.id, d.id)).toBe(false);
    expect(strike().mission).toBe('attack');
  });

  it('declining removes the offer; offering back to someone who offered signs the pact', () => {
    AL.proposePact(w, a, D().id);
    AL.respondPact(w, d, A().id, false);
    expect(D().proposals).toEqual([]);
    expect(A().diplomacy?.[D().id]).toBeUndefined();
    AL.proposePact(w, d, A().id);
    AL.proposePact(w, a, D().id);
    expect(A().diplomacy![D().id].kind).toBe('pact');
  });

  it('war replaces a pact, is mutual and flagged in the galaxy', () => {
    AL.proposePact(w, a, D().id);
    AL.respondPact(w, d, A().id, true);
    AL.declareWar(w, d, A().id);
    expect(A().diplomacy![D().id].kind).toBe('war');
    expect(atWar(w, a.id, d.id)).toBe(true);
    expect(friendly(w, a.id, d.id)).toBe(false);
    expect(() => AL.declareWar(w, a, D().id)).toThrow(/Already at war/);
    expect(w.messages.some((m) => m.to === a.id && m.subject === 'War declared')).toBe(true);
    const slot = galaxyView(w, a, w.planets[d.planetIds[0]].coords.g, w.planets[d.planetIds[0]].coords.s, T0).find((s) => s.planet?.id === d.planetIds[0]);
    expect(slot!.planet!.relation).toBe('war');
    const mate = galaxyView(w, a, w.planets[b.planetIds[0]].coords.g, w.planets[b.planetIds[0]].coords.s, T0).find((s) => s.planet?.id === b.planetIds[0]);
    expect(mate!.planet!.relation).toBe('ally');
    AL.endTreaty(w, a, D().id);
    expect(atWar(w, a.id, d.id)).toBe(false);
  });

  it('needs the diplomacy permission and cleans up when an alliance disappears', () => {
    expect(() => AL.proposePact(w, b, D().id)).toThrow(/rank does not allow/);
    expect(() => AL.declareWar(w, a, A().id)).toThrow(/No such alliance/);
    AL.declareWar(w, a, D().id);
    AL.proposePact(w, d, A().id);
    const did = D().id;
    AL.disbandAlliance(w, d);
    expect(A().diplomacy?.[did]).toBeUndefined();
    expect(A().proposals ?? []).toEqual([]);
  });
});
