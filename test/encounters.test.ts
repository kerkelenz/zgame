import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { ENCOUNTER, answerEncounter, encounterView, isPlaying, processEncounters, spawnEncounter } from '../server/encounters';
import { meView } from '../server/views';
import { createWorld, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
let w: World; let alice: Player, bob: Player; let ap: Planet;
/** a random source that returns the given numbers in turn (then 0.5) */
const seq = (...v: number[]) => { let i = 0; return () => (i < v.length ? v[i++] : 0.5); };

beforeEach(() => {
  w = createWorld({ economySpeed: 20, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0, encounterMinMinutes: 20, encounterMaxMinutes: 40 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bobby', 'secret2', T0).player;
  ap = w.planets[alice.planetIds[0]];
  ap.buildings = { metalMine: 10, crystalMine: 8, deuteriumSynthesizer: 6, solarPlant: 12 };
  ap.resources = { metal: 600_000, crystal: 400_000, deuterium: 300_000 };
  ap.updatedAt = T0;
});

/** play for `minutes`, the page open the whole time */
const play = (p: Player, from: number, minutes: number, rng = seq(0.5)) => {
  let t = from;
  for (let i = 0; i < minutes; i++) { t += MIN; p.lastSeen = t; processEncounters(w, t, rng); }
  return t;
};

describe('when encounters come', () => {
  it('only while the commander plays, after somewhere between the minimum and the maximum of active play', () => {
    play(alice, T0, 15);
    expect(alice.events?.current).toBeUndefined();
    const t = play(alice, T0 + 15 * MIN, 30, seq(0.5));
    expect(alice.events?.current).toBeDefined();
    expect(encounterView(w, alice, t)?.planet?.id).toBe(ap.id);
  });
  it('does not count time while the page is closed, on vacation, or for another commander', () => {
    for (let i = 1; i <= 120; i++) processEncounters(w, T0 + i * MIN, seq(0.5));      // nobody has been seen for hours
    expect(alice.events?.current).toBeUndefined();
    expect(isPlaying(alice, T0 + 100 * MIN)).toBe(false);
    alice.vacation = { since: T0, minUntil: T0 + 1e9 } as never;
    play(alice, T0 + 120 * MIN, 60);
    expect(alice.events?.current).toBeUndefined();
    alice.vacation = null;
    play(bob, T0 + 200 * MIN, 60);
    expect(bob.events?.lastKind).toBeDefined();                                // he had one (it has faded since)
    expect(alice.events?.lastKind).toBeUndefined();
  });
  it('a server that was off adds no play time', () => {
    alice.lastSeen = T0; processEncounters(w, T0, seq(0.5));
    alice.lastSeen = T0 + 5 * 3_600_000; processEncounters(w, T0 + 5 * 3_600_000, seq(0.5));
    expect(alice.events?.current).toBeUndefined();
  });
  it('one card waits at a time', () => {
    const first = spawnEncounter(w, alice, T0, 'find')!;
    play(alice, T0, 8, seq(0.5));
    expect(alice.events?.current?.id).toBe(first.id);
  });
  it('a card fades after its time and the next waits for more play', () => {
    const e = spawnEncounter(w, alice, T0, 'find')!;
    expect(encounterView(w, alice, T0 + MIN)?.id).toBe(e.id);
    expect(encounterView(w, alice, e.expiresAt)).toBeNull();
    processEncounters(w, e.expiresAt + MIN, seq(0.5));
    expect(alice.events?.current).toBeUndefined();
    expect(e.expiresAt - e.createdAt).toBeGreaterThanOrEqual(ENCOUNTER.lifeMin * MIN);
    expect(e.expiresAt - e.createdAt).toBeLessThanOrEqual(ENCOUNTER.lifeMax * MIN);
  });
  it('is switched off by the setting, and is part of the player view', () => {
    w.config.encounterMinMinutes = 0;
    play(alice, T0, 90);
    expect(alice.events?.current).toBeUndefined();
    spawnEncounter(w, alice, T0 + 100 * MIN, 'find');
    expect(meView(w, alice, T0 + 100 * MIN).encounter?.kind).toBe('find');
    expect(meView(w, bob, T0 + 100 * MIN).encounter).toBeNull();
  });
});

describe('what an encounter asks of a poor commander', () => {
  it('a trader only asks for what you hold, and a planet with nothing to trade gets a find instead', () => {
    ap.resources = { metal: 4000, crystal: 100, deuterium: 0 };
    const e = spawnEncounter(w, alice, T0, 'merchant', seq(0, 0, 0))!;
    expect(e.kind).toBe('merchant');
    expect((e.data as any).giveAmt).toBeLessThanOrEqual(4000 * 0.7);
    expect((e.data as any).g).toBe('metal');
    ap.resources = { metal: 100, crystal: 100, deuterium: 0 };
    expect(spawnEncounter(w, alice, T0, 'merchant', seq(0, 0, 0))!.kind).toBe('find');
  });
  it('the fuel for a rescue is never more than the gas on the planet', () => {
    ap.resources = { metal: 5000, crystal: 5000, deuterium: 100 };
    const e = spawnEncounter(w, alice, T0, 'distress', seq(0, 0.5, 0.1))!;
    expect((e.data as any).cost.deuterium).toBeLessThanOrEqual(60);
    expect(answerEncounter(w, alice, e.id, 'rescue', T0 + MIN).done).toBe(true);
  });
  it('a newcomer under protection never meets a pirate patrol', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 60; i++) { alice.events = undefined; kinds.add(spawnEncounter(w, alice, T0, undefined, seq(0, 0.5, (i % 20) / 20))!.kind); }
    expect(alice.stats).toBeDefined();
    const points = 99999; void points;
    expect(kinds.has('raid')).toBe(false);
  });
  it('there is a daily limit on events', () => {
    w.config.encounterDailyMax = 2;
    let t = T0, count = 0, seen = '';
    for (let i = 0; i < 100; i++) { t += MIN; alice.lastSeen = t; processEncounters(w, t, seq(0.1)); const id = alice.events?.current?.id; if (id && id !== seen) { seen = id; count++; } if (alice.events?.current) alice.events.current.expiresAt = t; }
    expect(count).toBe(2);
    expect(alice.events!.today).toBe(2);
  });
});

describe('answering', () => {
  const at = T0 + MIN;
  it('a find pays hours of production on the planet and is gone', () => {
    const e = spawnEncounter(w, alice, T0, 'find', seq(0, 0.2, 0.9))!;
    const before = ap.resources.metal + ap.resources.crystal;
    const out = answerEncounter(w, alice, e.id, 'collect', at);
    expect(out.done).toBe(true);
    expect(ap.resources.metal + ap.resources.crystal).toBeGreaterThan(before);
    expect(alice.events?.current).toBeUndefined();
    expect(alice.stats.encountersDone).toBe(1);
    expect(w.messages.some((m) => m.to === alice.id && /Event:/.test(m.subject))).toBe(true);
  });
  it('a real distress call pays for the fuel; a trap only costs it; a probe tells which', () => {
    ap.fleet = { espionageProbe: 2 };
    const e = spawnEncounter(w, alice, T0, 'distress', seq(0, 0.5, 0.1))!;       // real
    expect(e.options.map((o) => o.id)).toEqual(['rescue', 'scan', 'ignore']);
    const s = answerEncounter(w, alice, e.id, 'scan', at);
    expect(s.done).toBe(false);
    expect(s.text).toMatch(/real freighter/);
    expect(alice.events!.current!.options.map((o) => o.id)).toEqual(['rescue', 'ignore']);
    const credits = alice.credits;
    const metal = ap.resources.metal;
    answerEncounter(w, alice, e.id, 'rescue', at);
    expect(alice.credits).toBe(credits + 5);
    expect(ap.resources.metal).toBeGreaterThan(metal);
    const trap = spawnEncounter(w, alice, T0, 'distress', seq(0, 0.5, 0.99))!;
    expect(answerEncounter(w, alice, trap.id, 'rescue', at).text).toMatch(/trap/);
    expect(alice.credits).toBe(credits + 5);
  });
  it('the trader swaps at a better rate than the merchant, haggling is a coin flip, and you need the goods', () => {
    const e = spawnEncounter(w, alice, T0, 'merchant', seq(0, 0, 0))!;
    const { g, r, giveAmt, getAmt } = e.data as any;
    const gHave = ap.resources[g as 'metal'], rHave = ap.resources[r as 'metal'];
    answerEncounter(w, alice, e.id, 'accept', at);
    expect(Math.abs(ap.resources[g as 'metal'] - (gHave - giveAmt))).toBeLessThan(0.05 * (gHave + 1));
    expect(Math.abs(ap.resources[r as 'metal'] - (rHave + getAmt))).toBeLessThan(0.05 * (rHave + getAmt));
    const TV = { metal: 1, crystal: 1.5, deuterium: 3 } as any;
    expect(getAmt / giveAmt).toBeGreaterThan((TV[g] / TV[r]) * 0.88);          // beats the merchant's 12% fee
    const h = spawnEncounter(w, alice, T0, 'merchant', seq(0, 0, 0))!;
    expect(answerEncounter(w, alice, h.id, 'haggle', at, seq(0.1)).text).toMatch(/too hard/);
    const h2 = spawnEncounter(w, alice, T0, 'merchant', seq(0, 0, 0))!;
    expect(answerEncounter(w, alice, h2.id, 'haggle', at, seq(0.9)).text).toMatch(/haggling worked/);
    const h3 = spawnEncounter(w, alice, T0, 'merchant', seq(0, 0, 0))!;
    ap.resources = { metal: 0, crystal: 0, deuterium: 0 };                     // the goods are spent before he is answered
    expect(() => answerEncounter(w, alice, h3.id, 'accept', at)).toThrow(/You need/);
    expect(alice.events!.current!.id).toBe(h3.id);                             // a failed answer keeps the card
  });
  it('an anomaly gives credits, crystal or a small bill', () => {
    let e = spawnEncounter(w, alice, T0, 'anomaly')!;
    const c = alice.credits;
    expect(answerEncounter(w, alice, e.id, 'study', at, seq(0.1, 0.5)).text).toMatch(/data cache/);
    expect(alice.credits).toBeGreaterThan(c);
    e = spawnEncounter(w, alice, T0, 'anomaly')!;
    const cr = ap.resources.crystal;
    answerEncounter(w, alice, e.id, 'study', at, seq(0.7));
    expect(ap.resources.crystal).toBeGreaterThan(cr);
    e = spawnEncounter(w, alice, T0, 'anomaly')!;
    expect(answerEncounter(w, alice, e.id, 'study', at, seq(0.95)).text).toMatch(/discharged/);
  });
  it('a patrol: pay the toll, or fight when there is something to fight with', () => {
    let e = spawnEncounter(w, alice, T0, 'raid')!;
    expect(e.options.map((o) => o.id)).toEqual(['pay']);                       // nothing to fight with
    const metal = ap.resources.metal;
    answerEncounter(w, alice, e.id, 'pay', at);
    expect(ap.resources.metal).toBeLessThan(metal);
    ap.defenses = { rocketLauncher: 200, lightLaser: 100, heavyLaser: 40 };
    ap.fleet = { cruiser: 30, battleship: 20 };
    e = spawnEncounter(w, alice, T0, 'raid')!;
    expect(e.options.map((o) => o.id)).toEqual(['fight', 'pay']);
    const fought = alice.stats.battlesWon + alice.stats.battlesLost;
    const out = answerEncounter(w, alice, e.id, 'fight', at, seq(0.3));
    expect(out.done).toBe(true);
    expect(alice.stats.battlesWon + alice.stats.battlesLost).toBe(fought + 1);
    expect(out.text).toMatch(/patrol/);
  });
  it('refuses a wrong id, a wrong choice, an expired card and another commanders card', () => {
    const e = spawnEncounter(w, alice, T0, 'find')!;
    expect(() => answerEncounter(w, bob, e.id, 'collect', at)).toThrow(/passed/);
    expect(() => answerEncounter(w, alice, 'nope', 'collect', at)).toThrow(/passed/);
    expect(() => answerEncounter(w, alice, e.id, 'ignore', at)).toThrow(/not a choice/);
    expect(() => answerEncounter(w, alice, e.id, 'collect', e.expiresAt + 1)).toThrow(/passed/);
  });
});
