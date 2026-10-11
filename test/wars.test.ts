import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { allianceView } from '../server/views';
import { WAR, activeWar, startWar, processWars, recordBattle, warScore, warsView } from '../server/wars';
import { createWorld, atWar, type Player, type World } from '../server/world';

const T0 = Date.UTC(2026, 9, 12);
const HOUR = 3_600_000;
let w: World; let a1: Player, a2: Player, b1: Player, b2: Player, solo: Player;
let A: string, B: string;

beforeEach(() => {
  w = createWorld({ npcDensity: 0, raidIntervalMin: 0 }, T0);
  [a1, a2, b1, b2, solo] = ['ann', 'abe', 'bob', 'bea', 'sol'].map((n) => register(w, n, 'secret1', T0).player);
  AL.createAlliance(w, a1, 'AAA', 'Alpha'); AL.joinAlliance(w, a2, a1.allianceId!);
  AL.createAlliance(w, b1, 'BBB', 'Bravo'); AL.joinAlliance(w, b2, b1.allianceId!);
  A = a1.allianceId!; B = b1.allianceId!;
});

const fight = (attackers: [Player, number][], defenders: [Player, number][], at = T0 + HOUR) =>
  recordBattle(w, attackers.map(([p, lost]) => ({ playerId: p.id, lost })), defenders.map(([p, lost]) => ({ playerId: p.id, lost })), at);

describe('declaring a war', () => {
  it('starts a timed war and marks both sides', () => {
    AL.declareWar(w, a1, B);
    const war = activeWar(w, A)!;
    expect(war).toBeTruthy();
    expect(activeWar(w, B)).toBe(war);
    expect(war.endsAt - war.startedAt).toBe(w.config.warHours * HOUR);
    expect(atWar(w, a1.id, b2.id)).toBe(true);
    expect(w.alliances[A].diplomacy![B].warId).toBe(war.id);
  });

  it('needs the diplomacy permission, two members on each side, and a free alliance', () => {
    expect(() => AL.declareWar(w, a2, B)).toThrow(/rank/);
    AL.createAlliance(w, solo, 'SOLO', 'Lonely');
    expect(() => AL.declareWar(w, a1, solo.allianceId!)).toThrow(/at least 2/);
    AL.declareWar(w, a1, B);
    AL.joinAlliance(w, ...([register(w, 'cat', 'secret1', T0).player, a1.allianceId!] as [Player, string]));
    expect(() => AL.declareWar(w, a1, B)).toThrow(/Already at war/);
  });

  it('allows one war at a time per alliance', () => {
    const c1 = register(w, 'cyrus', 'secret1', T0).player, c2 = register(w, 'cora', 'secret1', T0).player;
    AL.createAlliance(w, c1, 'CCC', 'Charlie'); AL.joinAlliance(w, c2, c1.allianceId!);
    AL.declareWar(w, a1, B);
    expect(() => AL.declareWar(w, a1, c1.allianceId!)).toThrow(/already at war/);
    expect(() => AL.declareWar(w, c1, B)).toThrow(/already at war/);
  });

  it('replaces a pact, and can be switched off by the server', () => {
    AL.proposePact(w, a1, B); AL.respondPact(w, b1, A, true);
    AL.declareWar(w, a1, B);
    expect(w.alliances[A].diplomacy![B].kind).toBe('war');
    const off = createWorld({ npcDensity: 0, raidIntervalMin: 0, warHours: 0 }, T0);
    const [x1, x2, y1, y2] = ['xavi', 'xena', 'yuri', 'yara'].map((n) => register(off, n, 'secret1', T0).player);
    AL.createAlliance(off, x1, 'XXX', 'Exes'); AL.joinAlliance(off, x2, x1.allianceId!);
    AL.createAlliance(off, y1, 'YYY', 'Whys'); AL.joinAlliance(off, y2, y1.allianceId!);
    expect(() => AL.declareWar(off, x1, y1.allianceId!)).toThrow(/switched off/);
  });
});

describe('scoring', () => {
  beforeEach(() => { AL.declareWar(w, a1, B); });

  it('scores the value of enemy units destroyed, whichever side attacked', () => {
    fight([[a1, 0]], [[b1, 50_000]]);                  // we attacked and destroyed 50,000 of theirs
    fight([[b2, 0]], [[a2, 20_000]]);                  // they attacked and destroyed 20,000 of ours
    const war = activeWar(w, A)!;
    expect(war.score[A].kills).toBeCloseTo(50_000 / WAR.valuePerPoint);
    expect(war.score[B].kills).toBeCloseTo(20_000 / WAR.valuePerPoint);
  });

  it('credits the commanders who fought, and shares among those fighting on a side', () => {
    fight([[a1, 0], [a2, 0]], [[b1, 40_000]]);
    const war = activeWar(w, A)!;
    expect(war.score[A].by[a1.id]).toBeCloseTo(20);
    expect(war.score[A].by[a2.id]).toBeCloseTo(20);
  });

  it('ignores battles with outsiders, friendly losses and the unaligned', () => {
    fight([[a1, 10_000]], [[solo, 90_000]]);           // we lost, they are not in the war
    fight([[a1, 0]], [[a2, 80_000]]);                  // both ours
    fight([[solo, 0]], [[b1, 80_000]]);                // an outsider hit them: no points for us
    const war = activeWar(w, A)!;
    expect(warScore(war.score[A])).toBe(0);
    expect(warScore(war.score[B])).toBe(0);
  });

  it('allies of a warring alliance on the same side do not score against each other', () => {
    fight([[a1, 30_000], [b1, 0]], [[a2, 0]]);         // an odd mixed side: b1 still scores against a1 only if on opposite sides
    expect(warScore(activeWar(w, A)!.score[B])).toBe(0);
  });

  it('stops counting after the window closes', () => {
    fight([[a1, 0]], [[b1, 10_000]], activeWar(w, A)!.endsAt + 1);
    expect(warScore(activeWar(w, A)!.score[A])).toBe(0);
  });

  it('adds points for the systems each side holds, by the hour', () => {
    w.alliances[A].territory = 4; w.alliances[B].territory = 1;
    const war = activeWar(w, A)!;
    const t0 = war.startedAt;
    processWars(w, t0 + 2 * HOUR);
    expect(war.score[A].held).toBeCloseTo(4 * WAR.heldPerHour * 2);
    expect(war.score[B].held).toBeCloseTo(1 * WAR.heldPerHour * 2);
    processWars(w, t0 + 3 * HOUR);
    expect(war.score[A].held).toBeCloseTo(4 * WAR.heldPerHour * 3);
  });
});

describe('the end of a war', () => {
  const end = () => processWars(w, activeWar(w, A)!.endsAt + 1000);
  beforeEach(() => { AL.declareWar(w, a1, B); });

  it('goes to the higher score: loot to the bank, credits to the fighters, treaty cleared', () => {
    fight([[a1, 0], [a2, 0]], [[b1, 200_000]]);          // 200 points, 100 each
    fight([[b2, 0]], [[a1, 80_000]]);
    const credits = [a1.credits, a2.credits, b1.credits];
    end();
    const war = w.wars![0];
    expect(war.winnerId).toBe(A);
    expect(war.endedAt).toBeTruthy();
    expect(activeWar(w, A)).toBeUndefined();
    expect(w.alliances[A].diplomacy?.[B]).toBeUndefined();
    expect(atWar(w, a1.id, b1.id)).toBe(false);
    const loot = Math.round(200_000 * WAR.lootShare);
    expect(war.reward!.loot).toBe(loot);
    expect(w.alliances[A].bank.metal + w.alliances[A].bank.crystal + w.alliances[A].bank.deuterium).toBeCloseTo(loot, 0);
    expect(a1.credits).toBeGreaterThan(credits[0]);
    expect(a2.credits - credits[1]).toBe(a1.credits - credits[0]);          // equal contributions, equal shares
    expect(b1.credits).toBe(credits[2]);
  });

  it('pays nothing when almost nothing was fought', () => {
    w.alliances[A].territory = 3;
    fight([[a1, 0]], [[b1, (WAR.minFightPoints - 1) * WAR.valuePerPoint]]);
    const before = a1.credits;
    end();
    expect(w.wars![0].winnerId).toBe(A);
    expect(w.wars![0].reward).toBeUndefined();
    expect(a1.credits).toBe(before);
  });

  it('can be won by holding systems, but then pays nothing', () => {
    w.alliances[A].territory = 5;
    const bank = { ...w.alliances[A].bank };
    end();
    expect(w.wars![0].winnerId).toBe(A);
    expect(w.alliances[A].bank).toEqual(bank);
  });

  it('is a draw when scores are level', () => {
    end();
    expect(w.wars![0].winnerId).toBeNull();
    expect(warsView(w, w.alliances[A]).history[0].winner).toBe('draw');
  });

  it('conceding ends it at once, in the other side\'s favour', () => {
    fight([[a1, 0]], [[b1, 100_000]]);
    AL.endTreaty(w, b1, A);
    const war = w.wars![0];
    expect(war.winnerId).toBe(A);
    expect(war.how).toBe('conceded');
    expect(war.reward!.loot).toBeGreaterThan(0);
    expect(activeWar(w, B)).toBeUndefined();
  });

  it('a conceded war with no fighting pays nothing, so it cannot be farmed', () => {
    AL.endTreaty(w, b1, A);
    expect(w.wars![0].reward).toBeUndefined();
  });

  it('a war ends if one alliance is dissolved', () => {
    AL.disbandAlliance(w, b1);
    processWars(w, T0 + HOUR);
    expect(w.wars![0].endedAt).toBeTruthy();
    expect(w.wars![0].how).toBe('dissolved');
    expect(w.wars![0].reward).toBeUndefined();
  });

  it('the same two alliances must wait before fighting again', () => {
    end();
    expect(() => AL.declareWar(w, a1, B)).toThrow(/recently/);
    const endedAt = w.wars![0].endedAt!;
    expect(() => startWar(w, w.alliances[A], w.alliances[B], endedAt + WAR.rematchHours * HOUR - 1)).toThrow(/recently/);
    expect(startWar(w, w.alliances[A], w.alliances[B], endedAt + WAR.rematchHours * HOUR + 1).id).toBeTruthy();
  });

  it('keeps only the latest few wars', () => {
    for (let i = 0; i < WAR.history + 4; i++) {
      w.wars!.unshift({ id: 'old' + i, aId: 'x', bId: 'y', tags: {}, startedAt: 0, endsAt: 1, heldAt: 1, score: { x: { kills: 0, held: 0, by: {} }, y: { kills: 0, held: 0, by: {} } }, endedAt: 2 });
    }
    end();
    expect(w.wars!.filter((x) => x.endedAt).length).toBeLessThanOrEqual(WAR.history);
  });
});

describe('what players see', () => {
  it('shows the running war and a short history on the alliance view', () => {
    expect(allianceView(w, w.alliances[A], a1).war.current).toBeNull();
    AL.declareWar(w, a1, B);
    fight([[a1, 0]], [[b1, 30_000]]);
    const v = allianceView(w, w.alliances[A], a1).war;
    expect(v.current!.us.kills).toBe(30);
    expect(v.current!.them.tag).toBe('BBB');
    expect(v.current!.top[0].username).toBe('ann');
    expect(v.rules.hours).toBe(w.config.warHours);
    const theirs = allianceView(w, w.alliances[B], b1).war.current!;
    expect(theirs.them.kills).toBe(30);
  });

  it('wars end with a season reset', async () => {
    const { resetSeason } = await import('../server/season');
    AL.declareWar(w, a1, B);
    resetSeason(w, T0 + HOUR);
    expect(w.wars).toEqual([]);
    expect(w.alliances[A].diplomacy).toEqual({});
  });
});
