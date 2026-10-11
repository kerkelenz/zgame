import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { sendFleet } from '../server/fleet';
import { CHAMPION_CREDITS, endSeason, ensureSeason, processSeason, resetSeason, seasonView } from '../server/season';
import { createWorld, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000, DAY = 24 * HOUR;
let w: World; let a: Player, b: Player;

const make = (cfg = {}) => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0, ...cfg }, T0);
  a = register(w, 'alice', 'secret1', T0).player;
  b = register(w, 'bobby', 'secret2', T0).player;
  w.planets[a.planetIds[0]].buildings = { metalMine: 15, crystalMine: 12 }; // alice leads
};
beforeEach(() => make());

describe('seasons', () => {
  it('starts as an endless season 1', () => {
    const s = ensureSeason(w, T0);
    expect(s).toMatchObject({ number: 1, endsAt: null });
    processSeason(w, T0 + 400 * DAY);
    expect(w.season!.ended).toBeUndefined();
  });

  it('ends on time, crowns the highest scorer, records the hall of fame and tells everyone', () => {
    make({ seasonDays: 10, seasonResetHours: 12 });
    expect(ensureSeason(w, T0).endsAt).toBe(T0 + 10 * DAY);
    processSeason(w, T0 + 9 * DAY);
    expect(w.season!.ended).toBeUndefined();
    processSeason(w, T0 + 10 * DAY);
    const e = w.season!.ended!;
    expect(e).toMatchObject({ winnerName: 'alice', reason: 'time', resetAt: T0 + 10 * DAY + 12 * HOUR });
    expect(a.credits).toBe(CHAMPION_CREDITS);
    expect(a.achievements.champion1).toBe(T0 + 10 * DAY);
    expect(b.credits).toBe(0);
    const hof = seasonView(w, T0).hallOfFame[0];
    expect(hof).toMatchObject({ season: 1, reason: 'time' });
    expect(hof.top.map((t) => t.name)).toEqual(['alice', 'bobby']);
    for (const p of [a, b]) expect(w.messages.some((m) => m.to === p.id && /Season 1 is over/.test(m.subject))).toBe(true);
    expect(() => endSeason(w, T0 + 11 * DAY)).toThrow(/already over/);
  });

  it('a victory score ends the season early', () => {
    make({ victoryPoints: 1 });
    processSeason(w, T0);
    expect(w.season!.ended).toMatchObject({ reason: 'victory', winnerName: 'alice' });
  });

  it('an admin can close the season, with no automatic reset when the grace is 0', () => {
    make({ seasonResetHours: 0 });
    endSeason(w, T0, 'admin');
    expect(w.season!.ended!.resetAt).toBeNull();
    processSeason(w, T0 + 100 * DAY);
    expect(w.season!.number).toBe(1);
  });

  it('resets after the grace period: fresh homeworlds, old things gone, accounts and rewards kept', () => {
    make({ seasonDays: 5, seasonResetHours: 1, npcDensity: 0.2 });
    AL.createAlliance(w, a, 'TEAM', 'The Team');
    AL.joinAlliance(w, b, a.allianceId!);
    w.alliances[a.allianceId!].bank = { metal: 999, crystal: 0, deuterium: 0 };
    a.techs.energy = 5; a.officers.geologist = 2; a.achievements.groundbreaking = T0; a.charClass = 'general'; a.stats.battlesWon = 9;
    a.history.push({ t: T0, points: 5, rank: 1, fleet: 0 });
    const oldHome = a.planetIds[0];
    const homeB = w.planets[b.planetIds[0]];
    homeB.fleet = { smallCargo: 3 }; b.techs.combustionDrive = 3;
    sendFleet(w, b, { fromPlanetId: homeB.id, to: w.planets[oldHome].coords, ships: { smallCargo: 1 }, mission: 'transport' }, T0);
    w.wrecks[oldHome] = { planetId: oldHome, ownerId: a.id, ships: {}, value: 1, createdAt: T0, expiresAt: T0 + 1 };
    processSeason(w, T0 + 5 * DAY);
    const credits = a.credits;
    processSeason(w, T0 + 5 * DAY + HOUR);
    expect(w.season).toMatchObject({ number: 2, startedAt: T0 + 5 * DAY + HOUR, endsAt: T0 + 10 * DAY + HOUR });
    expect(w.season!.ended).toBeUndefined();
    expect(a.planetIds).toHaveLength(1);
    expect(a.planetIds[0]).not.toBe(oldHome);
    expect(w.planets[oldHome]).toBeUndefined();
    expect(w.planets[a.planetIds[0]]).toMatchObject({ ownerId: a.id, isHome: true });
    expect(w.planets[a.planetIds[0]].buildings.metalMine).toBeUndefined();
    expect(a.techs).toEqual({}); expect(a.stats.battlesWon).toBe(0); expect(a.history).toEqual([]);
    expect(Object.keys(w.movements)).toHaveLength(0);
    expect(Object.keys(w.wrecks)).toHaveLength(0);
    expect(a.credits).toBe(credits); expect(a.officers.geologist).toBe(2); expect(a.charClass).toBe('general');
    expect(a.achievements.groundbreaking).toBe(T0); expect(a.achievements.champion1).toBeTruthy();
    expect(w.alliances[a.allianceId!].bank.metal).toBe(0);
    expect(w.alliances[a.allianceId!].members).toHaveLength(2);
    expect(Object.values(w.players).filter((p) => p.npc).length).toBeGreaterThan(0); // fresh computer empires
    expect(w.messages.every((m) => /Season 2 has begun/.test(m.subject))).toBe(true);
    for (const pl of Object.values(w.planets)) expect(w.players[pl.ownerId]).toBeTruthy();
    expect(seasonView(w, T0).hallOfFame).toHaveLength(1);
  });
});
