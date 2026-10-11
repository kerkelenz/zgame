import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { processMovements, recallFleet, sendFleet } from '../server/fleet';
import { REWARD, announceInvasion, bossBudget, buildBoss, engage, finish, invasionView, processInvasion } from '../server/invasion';
import { fleetValue } from '../server/npc';
import { checkProgress } from '../server/progress';
import { GameError, createWorld, type Planet, type Player, type World } from '../server/world';

const HOUR = 3_600_000, MIN = 60_000;
const T0 = Date.UTC(2026, 9, 12, 8);
let w: World; let a: Player, b: Player, c: Player;
let pa: Planet, pb: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0, invasionIntervalHours: 72, invasionMinPlayers: 2 }, T0);
  [a, b, c] = ['ann', 'bob', 'cat'].map((n) => register(w, n, 'secret1', T0).player);
  for (const p of [a, b, c]) { p.techs = { combustionDrive: 6, impulseDrive: 5, computer: 6, weapons: 3, shielding: 3, armour: 3 }; }
  pa = w.planets[a.planetIds[0]]; pb = w.planets[b.planetIds[0]];
  for (const pl of [pa, pb, w.planets[c.planetIds[0]]]) { pl.resources = { metal: 1e12, crystal: 1e12, deuterium: 1e12 }; pl.buildings = { metalMine: 12 }; }
  pa.fleet = { cruiser: 400, battleship: 100 };
  pb.fleet = { cruiser: 50 };
});

/** open the rift now */
const open = () => {
  const inv = announceInvasion(w, T0, 0);
  processInvasion(w, T0);
  expect(inv.phase).toBe('active');
  return inv;
};
const sendFront = (p: Player, planet: Planet, ships: Record<string, number>, t = T0) => {
  const m = sendFleet(w, p, { fromPlanetId: planet.id, to: w.invasion!.rift, ships, mission: 'invade' }, t);
  processMovements(w, m.arriveAt);
  return m;
};

describe('the Armada', () => {
  it('scales with the strength of the server, within limits', () => {
    pa.fleet = {}; pb.fleet = {};
    const small = bossBudget(w);
    expect(small).toBe(1_000_000);                                   // a tiny server still gets a real fleet
    w.config.invasionStrength = 0.15;
    pa.buildings = { metalMine: 30, crystalMine: 30, solarPlant: 30 };
    expect(bossBudget(w)).toBeGreaterThan(small);
    pa.fleet = { deathstar: 5000 };
    expect(bossBudget(w)).toBe(200_000_000);                         // and never an unbounded one
  });

  it('is built from a mix of combat ships worth about the budget', () => {
    const f = buildBoss(50_000_000);
    expect(Object.keys(f).sort()).toEqual(['battlecruiser', 'battleship', 'cruiser', 'destroyer', 'heavyFighter', 'lightFighter']);
    expect(fleetValue(f)).toBeGreaterThan(48_000_000);
    expect(fleetValue(f)).toBeLessThanOrEqual(50_000_000);
  });
});

describe('the schedule', () => {
  it('plans the first invasion, waits for enough commanders, announces, opens, and ends the event on time', () => {
    processInvasion(w, T0);
    expect(w.nextInvasionAt).toBe(T0 + 72 * HOUR);
    expect(w.invasion).toBeUndefined();
    processInvasion(w, T0 + 72 * HOUR);
    const inv = w.invasion!;
    expect(inv.phase).toBe('announced');
    expect(inv.startsAt).toBe(T0 + 72 * HOUR + 12 * HOUR);
    expect(inv.rift.p).toBe(w.config.positions + 1);                 // deep space
    for (const p of [a, b, c]) expect(w.messages.some((m) => m.to === p.id && /Void invasion incoming: wave 1/.test(m.subject))).toBe(true);
    processInvasion(w, inv.startsAt - 1);
    expect(inv.phase).toBe('announced');
    processInvasion(w, inv.startsAt);
    expect(inv.phase).toBe('active');
    expect(inv.nextEngageAt).toBe(inv.startsAt + 30 * MIN);
    processInvasion(w, inv.endsAt);
    expect(w.invasion).toBeUndefined();                              // withdrew
    expect(w.invasionHistory![0]).toMatchObject({ number: 1, result: 'lost' });
    expect(w.nextInvasionAt).toBe(inv.endsAt + 72 * HOUR);
  });

  it('does nothing when switched off, and waits when too few commanders have started', () => {
    w.config.invasionIntervalHours = 0;
    processInvasion(w, T0 + 1000 * HOUR);
    expect(w.invasion).toBeUndefined();
    w.config.invasionIntervalHours = 72; w.config.invasionMinPlayers = 5;
    w.nextInvasionAt = T0;
    processInvasion(w, T0);
    expect(w.invasion).toBeUndefined();
    expect(w.nextInvasionAt).toBe(T0 + HOUR);
  });

  it('catches up on missed engagements after a long pause, but only up to the end of the event', () => {
    const inv = open();
    processInvasion(w, inv.endsAt - 1);
    expect(w.invasion!.round).toBe(w.config.invasionDurationHours * 2 - 1);
    expect(() => announceInvasion(w, T0)).toThrow(/already under way/);
  });
});

describe('joining the front', () => {
  it('needs an active invasion, the right coordinates and combat ships', () => {
    pa.fleet = { cruiser: 10, espionageProbe: 5 };
    expect(() => sendFleet(w, a, { fromPlanetId: pa.id, to: { g: 1, s: 5, p: w.config.positions + 1 }, ships: { cruiser: 5 }, mission: 'invade' }, T0)).toThrow(/no invasion/);
    const inv = announceInvasion(w, T0, 5 * HOUR);
    expect(() => sendFleet(w, a, { fromPlanetId: pa.id, to: inv.rift, ships: { cruiser: 5 }, mission: 'invade' }, T0)).toThrow(/no invasion/); // announced, not open
    processInvasion(w, T0 + 5 * HOUR);
    expect(() => sendFleet(w, a, { fromPlanetId: pa.id, to: { ...inv.rift, s: inv.rift.s === 1 ? 2 : 1 }, ships: { cruiser: 5 }, mission: 'invade' }, T0 + 5 * HOUR)).toThrow(/rift is at/);
    expect(() => sendFleet(w, a, { fromPlanetId: pa.id, to: inv.rift, ships: { espionageProbe: 5 }, mission: 'invade' }, T0 + 5 * HOUR)).toThrow(/no combat ships/);
    const m = sendFleet(w, a, { fromPlanetId: pa.id, to: inv.rift, ships: { cruiser: 5 }, mission: 'invade', cargo: { metal: 1000, crystal: 0, deuterium: 0 } }, T0 + 5 * HOUR);
    expect(m.cargo.metal).toBe(0);                                   // nothing is carried into a fight
  });

  it('parks the fleet at the rift until the event ends or the owner recalls it', () => {
    const inv = open();
    const m = sendFront(a, pa, { cruiser: 50 });
    expect(m.phase).toBe('holding');
    expect(m.holdUntil).toBe(inv.endsAt);
    expect(w.messages.some((x) => x.to === a.id && x.subject === 'Fleet at the front')).toBe(true);
    recallFleet(w, a, m.id, m.arriveAt + 1000);
    expect(m.phase).toBe('returning');
    processMovements(w, m.returnAt!);
    expect(pa.fleet.cruiser).toBe(400 - 50 + 50);                    // everything came home
  });

  it('a fleet that arrives after the event is over turns round', () => {
    const inv = open();
    pa.fleet = { cruiser: 10 };
    const m = sendFleet(w, a, { fromPlanetId: pa.id, to: inv.rift, ships: { cruiser: 10 }, mission: 'invade' }, T0);
    finish(w, T0 + 1000, 'lost');
    processMovements(w, m.arriveAt);
    expect(m.phase).toBe('returning');
    expect(w.messages.some((x) => x.to === a.id && x.subject === 'The Void is gone')).toBe(true);
  });
});

describe('an engagement', () => {
  it('pits all fleets at the rift against the Armada together, and splits the damage by firepower', () => {
    const inv = open();
    sendFront(a, pa, { cruiser: 400, battleship: 100 });
    sendFront(b, pb, { cruiser: 50 });
    const before = fleetValue(inv.fleet);
    engage(w, T0 + 30 * MIN);
    expect(inv.round).toBe(1);
    expect(fleetValue(inv.fleet)).toBeLessThan(before);               // the Armada took losses
    expect(inv.contrib[a.id].damage).toBeGreaterThan(inv.contrib[b.id].damage * 3); // a brought far more guns
    expect(inv.contrib[a.id].battles).toBe(1);
    const dealt = before - fleetValue(inv.fleet);
    // the damage recorded is the value destroyed (the Armada rebuilt a little first, so compare loosely)
    expect(inv.contrib[a.id].damage + inv.contrib[b.id].damage).toBeGreaterThan(dealt * 0.5);
    expect(inv.contrib[a.id].lost).toBeGreaterThan(0);
  });

  it('writes one rolling report per commander instead of a message every time', () => {
    const inv = open();
    inv.startFleet = buildBoss(400_000_000); inv.fleet = { ...inv.startFleet };   // far stronger than anything we send: it survives every round
    for (const round of [1, 2, 3]) {
      pa.fleet = { cruiser: 100 };
      sendFront(a, pa, { cruiser: 100 }, T0 + round * MIN);
      engage(w, T0 + round * 30 * MIN);
      const reports = w.messages.filter((m) => m.to === a.id && /^Invasion front/.test(m.subject));
      expect(reports).toHaveLength(1);                                          // always exactly one, replaced each time
      expect(reports[0].subject).toBe(`Invasion front: round ${round}`);
    }
    expect((w.messages.find((m) => m.to === a.id && /^Invasion front/.test(m.subject))!.data as { attackers: unknown[] }).attackers).toHaveLength(1);
  });

  it('removes fleets that are wiped out, and the Armada rebuilds a little each round', () => {
    const inv = open();
    pa.fleet = { lightFighter: 5 };
    const m = sendFront(a, pa, { lightFighter: 5 });
    const start = { ...inv.startFleet };
    engage(w, T0 + 30 * MIN);
    expect(w.movements[m.id]).toBeUndefined();                        // five light fighters do not survive
    for (const id of Object.keys(start) as (keyof typeof start)[]) expect(inv.fleet[id]).toBe(start[id]); // untouched and at full strength
    inv.fleet = { cruiser: 1 };
    engage(w, T0 + 60 * MIN);
    expect(inv.fleet.cruiser!).toBeGreaterThan(1);                    // regrown toward its starting numbers
    expect(inv.fleet.cruiser!).toBeLessThanOrEqual(inv.startFleet.cruiser!);
  });

  it('with nobody at the front the Armada simply recovers', () => {
    const inv = open();
    inv.fleet = { cruiser: 1 };
    engage(w, T0 + 30 * MIN);
    expect(inv.fleet.cruiser!).toBeGreaterThan(1);
    expect(Object.keys(inv.contrib)).toHaveLength(0);
  });

  it('is still quick with the largest Armada against a huge fleet', () => {
    const inv = open();
    inv.startFleet = buildBoss(200_000_000); inv.fleet = { ...inv.startFleet };
    pa.fleet = { cruiser: 20000, battleship: 5000, bomber: 2000 };
    sendFront(a, pa, { cruiser: 20000, battleship: 5000, bomber: 2000 });
    const t = Date.now();
    engage(w, T0 + 30 * MIN);
    expect(Date.now() - t).toBeLessThan(15_000);
  });
});

describe('victory and retreat', () => {
  const win = () => {
    const inv = open();
    inv.fleet = { lightFighter: 1 }; inv.startFleet = { lightFighter: 1 };
    sendFront(a, pa, { cruiser: 400, battleship: 100 });
    sendFront(b, pb, { cruiser: 50 });
    engage(w, T0 + 30 * MIN);
    return inv;
  };

  it('destroying the Armada pays Command Credits by damage share, releases the fleets and plans the next wave', () => {
    win();
    expect(w.invasion).toBeUndefined();
    const rec = w.invasionHistory![0];
    expect(rec).toMatchObject({ number: 1, result: 'won' });
    expect(rec.top[0].name).toBe('ann');
    const pool = REWARD.base + REWARD.perParticipant * 2;
    expect(a.credits + b.credits).toBeGreaterThanOrEqual(pool - 2);
    expect(a.credits).toBeGreaterThanOrEqual(b.credits);
    expect(b.credits).toBeGreaterThanOrEqual(REWARD.floor);
    expect(c.credits).toBe(0);                                         // did not fight
    expect(a.stats.invasionsWon).toBe(1);
    expect(a.stats.voidDamage).toBeGreaterThan(0);
    for (const m of Object.values(w.movements).filter((x) => x.mission === 'invade')) expect(m.holdUntil).toBe(T0 + 30 * MIN);
    processMovements(w, T0 + 30 * MIN + 365 * 24 * HOUR);
    expect(Object.values(w.movements).filter((x) => x.mission === 'invade')).toHaveLength(0);
    expect(pa.fleet.cruiser).toBeGreaterThan(0);                       // survivors are home again
    expect(w.nextInvasionAt).toBe(T0 + 30 * MIN + 72 * HOUR);
    for (const p of [a, b, c]) expect(w.messages.some((m) => m.to === p.id && /Void wave 1 destroyed/.test(m.subject))).toBe(true);
  });

  it('earns the Void Slayer achievement', () => {
    win();
    checkProgress(w, a, T0 + HOUR);
    expect(a.achievements.voidslayer).toBeTruthy();
    checkProgress(w, c, T0 + HOUR);
    expect(c.achievements.voidslayer).toBeUndefined();
  });

  it('a retreat pays only a consolation, and nothing to someone with a negligible share', () => {
    const inv = open();
    inv.contrib[a.id] = { damage: 1_000_000, lost: 1, battles: 3 };
    inv.contrib[b.id] = { damage: 1000, lost: 1, battles: 1 };         // 0.1%: below the minimum share
    finish(w, T0 + 5 * HOUR, 'lost');
    expect(a.credits).toBeGreaterThan(0);
    expect(a.credits).toBeLessThan((REWARD.base + 2 * REWARD.perParticipant) / 2);
    expect(b.credits).toBe(0);
    expect(w.invasionHistory![0].result).toBe('lost');
    expect(a.stats.invasionsWon).toBe(0);
  });

  it('ranks players and alliances in the view', () => {
    AL.createAlliance(w, a, 'TEAM', 'The Team'); AL.joinAlliance(w, b, a.allianceId!);
    const inv = open();
    inv.contrib[a.id] = { damage: 700, lost: 10, battles: 2 };
    inv.contrib[b.id] = { damage: 200, lost: 5, battles: 1 };
    inv.contrib[c.id] = { damage: 100, lost: 0, battles: 1 };
    const v = invasionView(w, b.id, T0) as { active: any };
    expect(v.active.players.map((p: any) => p.name)).toEqual(['ann', 'bob', 'cat']);
    expect(v.active.players[1]).toMatchObject({ you: true, rank: 2 });
    expect(v.active.alliances).toEqual([{ rank: 1, tag: 'TEAM', damage: 900, share: 0.9 }]);
    expect(v.active.mine).toMatchObject({ damage: 200, battles: 1 });
    expect(v.active.boss.value).toBeGreaterThan(0);
    expect(invasionView(w, c.id, T0 + HOUR)).toHaveProperty('active.participants', 3);
    finish(w, T0 + 2 * HOUR, 'lost');
    const after = invasionView(w, a.id, T0 + 3 * HOUR) as { active: unknown; history: unknown[] };
    expect(after.active).toBeNull();
    expect(after.history).toHaveLength(1);
  });

  it('closing an invasion that does not exist is an error', () => {
    expect(() => finish(w, T0, 'won')).toThrow(GameError);
  });
});
