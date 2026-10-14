import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../server/accounts';
import { SCOUT, SUPPLY, convoyRisk, creditStrike, deliverSupply, repairFront, spawnStrikes, strikeTargets } from '../server/alien';
import { processMovements, sendFleet } from '../server/fleet';
import { REWARD, announceInvasion, engage, finish, invasionView, processInvasion, shares } from '../server/invasion';
import { fleetValue } from '../server/npc';
import { checkProgress } from '../server/progress';
import { ALIEN_KINDS } from '../shared/aliens';
import { GameError, createWorld, type Planet, type Player, type World } from '../server/world';

const HOUR = 3_600_000, MIN = 60_000;
const T0 = Date.UTC(2026, 9, 12, 8);
let w: World; let a: Player, b: Player, c: Player;
let pa: Planet, pb: Planet, pc: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 20, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0, invasionIntervalHours: 72, invasionMinPlayers: 2, invasionHomeShare: 0 }, T0 - 30 * 86_400_000);
  [a, b, c] = ['ann', 'bob', 'cat'].map((n) => register(w, n, 'secret1', T0 - 30 * 86_400_000).player);
  for (const p of [a, b, c]) { p.techs = { combustionDrive: 6, impulseDrive: 5, computer: 8, weapons: 3, shielding: 3, armour: 3, espionage: 5 }; p.lastSeen = T0; }
  [pa, pb, pc] = [a, b, c].map((p) => w.planets[p.planetIds[0]]);
  for (const pl of [pa, pb, pc]) { pl.resources = { metal: 1e12, crystal: 1e12, deuterium: 1e12 }; pl.buildings = { metalMine: 12 }; }
  pa.fleet = { cruiser: 400, battleship: 100, espionageProbe: 40, largeCargo: 60 };
  pb.fleet = { cruiser: 50, smallCargo: 20, espionageProbe: 8 };
  pc.fleet = { cruiser: 30 };
});

const open = (delay = 0) => { const inv = announceInvasion(w, T0, delay); processInvasion(w, T0 + delay); return inv; };
const sendFront = (p: Player, planet: Planet, ships: Record<string, number>, t = T0) => { const m = sendFleet(w, p, { fromPlanetId: planet.id, to: w.invasion!.rift, ships, mission: 'invade' }, t); processMovements(w, m.arriveAt); return m; };

describe('waves', () => {
  it('an invasion is announced as several waves; the first waits at the rift and the others are scheduled', () => {
    const inv = announceInvasion(w, T0, 12 * HOUR);
    expect(inv.waves).toHaveLength(4);
    expect(inv.waves!.map((x) => x.status)).toEqual(['active', 'pending', 'pending', 'pending']);
    expect(inv.waves![0].kind).toBe('swarm');
    expect(inv.waves![3].kind).toBe('mothership');
    expect(inv.fleet).toEqual(inv.waves![0].fleet);
    expect(inv.startValue).toBe(inv.waves![0].value);
    expect(inv.totalValue).toBeCloseTo(inv.waves!.reduce((s, x) => s + x.value, 0));
    const sched = inv.waves!.map((x) => x.scheduledAt);
    expect(sched[0]).toBe(inv.startsAt);
    for (let i = 1; i < 4; i++) expect(sched[i]).toBeGreaterThan(sched[i - 1]);
    expect(sched[3]).toBeLessThan(inv.endsAt);                                         // the last wave arrives well before the end
    expect(inv.nextWaveAt).toBe(sched[1]);
    expect(w.messages.some((m) => m.to === a.id && /Void invasion incoming/.test(m.subject))).toBe(true);
  });

  it('the whole invasion is no bigger than the single Armada used to be, and each wave is bigger than the one before', () => {
    w.config.invasionStrength = 20;                                   // a big Armada, so that rounding the ships off barely shows
    const inv = announceInvasion(w, T0, 0);
    const vals = inv.waves!.map((x) => x.value);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
    w.invasion = undefined; w.invasionCount = 0; w.config.invasionWaves = 1;
    const single = announceInvasion(w, T0, 0);
    expect(inv.totalValue! / single.totalValue!).toBeGreaterThan(0.93);
    expect(inv.totalValue! / single.totalValue!).toBeLessThan(1.02);
  });

  it('the next wave arrives on time, joining what is left of the one before', () => {
    const inv = open();
    const first = { ...inv.fleet };
    const at = inv.waves![1].scheduledAt;
    processInvasion(w, at - MIN);
    expect(inv.waveIndex).toBe(0);
    processInvasion(w, at + MIN);
    expect(inv.waveIndex).toBe(1);
    expect(inv.waves![1].status).toBe('active');
    expect(inv.waves![0].status).toBe('active');                                       // not cleared: its ships are still there
    for (const [id, n] of Object.entries(first)) expect(inv.fleet[id as keyof typeof first]!).toBeGreaterThanOrEqual(n!);
    expect(inv.startValue).toBeGreaterThan(inv.waves![0].value);
    expect(w.messages.some((m) => /Void wave 2 of 4/.test(m.subject))).toBe(true);
  });

  it('a cleared wave brings the next one sooner, a pause after it; the last wave destroyed wins', () => {
    const inv = open();
    pa.fleet = { cruiser: 40000, battleship: 20000 };
    sendFront(a, pa, { cruiser: 40000, battleship: 20000 });
    for (let i = 0; i < 4 && inv.waves![0].status !== 'cleared'; i++) engage(w, T0 + (i + 1) * 30 * MIN);
    expect(inv.waves![0].status).toBe('cleared');
    expect(inv.fleet).toEqual({});
    expect(inv.nextWaveAt!).toBeLessThanOrEqual(inv.waves![0].clearedAt! + w.config.invasionBreatherMinutes * MIN);
    expect(inv.nextWaveAt!).toBeLessThan(inv.waves![1].scheduledAt);
    expect(w.messages.some((m) => /Void wave 1 destroyed/.test(m.subject))).toBe(true);
    // nothing on the field: an engagement does nothing and costs nobody anything
    const round = inv.round;
    engage(w, T0 + 5 * HOUR);
    expect(inv.round).toBe(round);
    // the last wave, cleared, finishes the invasion as a win
    for (let k = 1; k <= 3; k++) { processInvasion(w, inv.nextWaveAt!); for (let i = 0; i < 6 && inv.waves![k].status !== 'cleared' && w.invasion; i++) engage(w, T0 + 6 * HOUR + (k * 10 + i) * MIN); }
    expect(w.invasion).toBeUndefined();
    expect(w.invasionHistory![0].result).toBe('won');
    expect(w.invasionHistory![0].wavesCleared).toBe(4);
  });

  it('bio-ships regrow far more than other kinds between engagements', () => {
    const regrown = (kind: 'swarm' | 'bio') => {
      const inv = w.invasion ?? open();
      inv.waves![0].kind = kind;
      inv.startFleet = { cruiser: 1000 }; inv.fleet = { cruiser: 100 };
      engage(w, T0 + 30 * MIN);                                                         // nobody at the front: the aliens just recover
      return inv.fleet.cruiser!;
    };
    const swarm = regrown('swarm');
    const bio = regrown('bio');
    expect(swarm).toBe(100 + Math.ceil(1000 * ALIEN_KINDS.swarm.regen));
    expect(bio).toBe(100 + Math.ceil(1000 * ALIEN_KINDS.bio.regen));
    expect(bio).toBeGreaterThan(swarm + 50);
  });

  it('the view hides a wave that has not come and not been scouted, and shows one that has', () => {
    const inv = open();
    const v1 = invasionView(w, a.id, T0).active!;
    expect(v1.waves[0].kind).toBe('swarm');
    expect(v1.waves[2].kind).toBeNull();
    expect(v1.waves[2].label).toBe('Unknown');
    expect(v1.waves[2].fleet).toBeNull();
    expect(v1.kind!.id).toBe('swarm');
    inv.scouted![2] = { by: a.id, at: T0, exact: false };
    expect(invasionView(w, b.id, T0).active!.waves[2].kind).not.toBeNull();            // everybody sees what a scout found
    expect(invasionView(w, b.id, T0).active!.waves[2].fleet).toBeNull();                // but only an exact look shows the fleet
  });

  it('an invasion saved before waves existed keeps working as a single wave', () => {
    const inv = open();
    delete (inv as any).waves; delete (inv as any).waveIndex; delete (inv as any).scouted; delete (inv as any).supply;
    processInvasion(w, T0 + 1000);
    expect(inv.waves).toHaveLength(1);
    expect(inv.waves![0].kind).toBe('mothership');
    expect(() => invasionView(w, a.id, T0)).not.toThrow();
  });
});

describe('scouting the rift', () => {
  const scout = (p: Player, planet: Planet, probes: number, t = T0) => {
    const m = sendFleet(w, p, { fromPlanetId: planet.id, to: w.invasion!.rift, ships: { espionageProbe: probes }, mission: 'scout' }, t);
    processMovements(w, m.arriveAt);
    return m;
  };
  it('needs an invasion, the rift, and probes', () => {
    expect(() => sendFleet(w, a, { fromPlanetId: pa.id, to: { g: 1, s: 1, p: 16 }, ships: { espionageProbe: 3 }, mission: 'scout' }, T0)).toThrow(/no invasion/);
    const inv = announceInvasion(w, T0, 12 * HOUR);
    expect(() => sendFleet(w, a, { fromPlanetId: pa.id, to: { g: inv.rift.g, s: inv.rift.s === 1 ? 2 : 1, p: 16 }, ships: { espionageProbe: 3 }, mission: 'scout' }, T0)).toThrow(/rift is at/);
    expect(() => sendFleet(w, a, { fromPlanetId: pa.id, to: inv.rift, ships: { cruiser: 3 }, mission: 'scout' }, T0)).toThrow(/Probes/);
  });
  it('can scout before the rift opens, learns what is coming, tells everyone, and the probes fly home', () => {
    const inv = announceInvasion(w, T0, 12 * HOUR);
    const m = scout(a, pa, 3);
    const idx = 1;
    expect(inv.scouted![idx]).toMatchObject({ by: a.id, exact: false });
    expect(inv.scouted![idx].fleet).toBeUndefined();
    expect(inv.contrib[a.id].scouts).toBe(1);
    const msg = w.messages.filter((x) => x.to === a.id && /Rift scouted/.test(x.subject));
    expect(msg).toHaveLength(1);
    expect(msg[0].body).toContain(ALIEN_KINDS[inv.waves![idx].kind].label);
    expect(m.phase).toBe('returning');
    expect(w.movements[m.id].ships.espionageProbe).toBe(3);
    expect(invasionView(w, b.id, T0).active!.waves[idx].scoutedBy!.name).toBe('ann');
  });
  it('enough probes show the exact fleet, once more credit is earned, and repeats earn nothing', () => {
    const inv = announceInvasion(w, T0, 12 * HOUR);
    scout(a, pa, 3);
    scout(a, pa, SCOUT.exactProbes);
    expect(inv.scouted![1].exact).toBe(true);
    expect(inv.scouted![1].fleet).toEqual(inv.waves![1].fleet);
    expect(inv.contrib[a.id].scouts).toBe(2);
    scout(a, pa, SCOUT.exactProbes);
    scout(b, pb, 2);
    expect(inv.contrib[a.id].scouts).toBe(2);
    expect(inv.contrib[b.id]?.scouts ?? 0).toBe(0);
    expect(invasionView(w, c.id, T0).active!.waves[1].fleet).toEqual(inv.waves![1].fleet);
  });
  it('once every wave has come, a scout looks at the one on the field', () => {
    const inv = open();
    inv.waveIndex = 3; inv.waves!.forEach((x, i) => { x.status = i < 3 ? 'cleared' : 'active'; });
    scout(a, pa, 2);
    expect(inv.scouted![3]).toBeDefined();
  });
  it('a scout that arrives after the invasion is over finds nothing', () => {
    open();
    const m = sendFleet(w, a, { fromPlanetId: pa.id, to: w.invasion!.rift, ships: { espionageProbe: 3 }, mission: 'scout' }, T0);
    finish(w, T0 + 1000, 'lost');
    processMovements(w, m.arriveAt);
    expect(w.messages.some((x) => x.to === a.id && /rift is gone/.test(x.subject))).toBe(true);
  });
});

describe('strike teams at home', () => {
  beforeEach(() => { w.config.invasionHomeShare = 1; });
  it('go for active commanders past newbie protection who are not on vacation, and no one else', () => {
    b.vacation = { since: T0, minUntil: T0 + 1 };
    c.lastSeen = T0 - 20 * 86_400_000;
    expect(strikeTargets(w, T0).map((p) => p.username)).toEqual(['ann']);
    b.vacation = null; c.lastSeen = T0;
    w.config.protectionPoints = 1e12;
    expect(strikeTargets(w, T0)).toEqual([]);
  });
  it('are sent when a wave arrives, one at a planet of each commander, from the rift, with a warning', () => {
    const inv = open();
    const sent = Object.values(w.movements).filter((m) => m.alien);
    expect(sent).toHaveLength(3);
    for (const m of sent) {
      expect(m.ownerId).toBeNull();
      expect(m.mission).toBe('attack');
      expect(m.from).toEqual(inv.rift);
      expect(m.arriveAt - T0).toBeGreaterThanOrEqual(15 * MIN);
      expect(m.alien!.wave).toBe(0);
    }
    expect(inv.strikes).toBe(3);
    const msg = w.messages.filter((x) => x.to === a.id && x.subject === 'Raid incoming!' && /Void strike team/.test(x.body));
    expect(msg.length).toBe(1);
  });
  it('are sized from what defends the planet, more in later waves, and never zero for a bare planet', () => {
    const inv = announceInvasion(w, T0, 0);
    pa.defenses = { rocketLauncher: 5000, lightLaser: 5000 };
    const small = (wave: number) => { const before = Object.keys(w.movements).length; void before; for (const m of Object.values(w.movements)) delete w.movements[m.id]; spawnStrikes(w, inv, inv.waves![wave], T0, () => 0); return fleetValue(Object.values(w.movements).find((m) => m.alien && w.planets[a.planetIds[0]].coords.s === m.to.s)!.ships); };
    const first = small(0), last = small(3);
    expect(first).toBeGreaterThan(0);
    expect(last).toBeGreaterThan(first);
    pc.defenses = {}; pc.fleet = {};
    for (const m of Object.values(w.movements)) delete w.movements[m.id];
    spawnStrikes(w, inv, inv.waves![0], T0, () => 0);
    expect(Object.values(w.movements).some((m) => m.alien && m.to.s === pc.coords.s && m.to.g === pc.coords.g)).toBe(true);
  });
  it('are weaker against a young account', () => {
    const inv = announceInvasion(w, T0, 0);
    const size = () => { for (const m of Object.values(w.movements)) delete w.movements[m.id]; spawnStrikes(w, inv, inv.waves![2], T0, () => 0); return fleetValue(Object.values(w.movements).find((m) => m.to.s === pa.coords.s && m.to.g === pa.coords.g && m.alien)!.ships); };
    pa.defenses = { gaussCannon: 20000 };
    const old = size();
    a.createdAt = T0 - 2 * HOUR;
    expect(size()).toBeLessThan(old);
  });
  it('a switch of zero sends none, and the teams turn back when the invasion ends', () => {
    w.config.invasionHomeShare = 0;
    open();
    expect(Object.values(w.movements).filter((m) => m.alien)).toHaveLength(0);
    w.config.invasionHomeShare = 1;
    const inv = w.invasion!;
    spawnStrikes(w, inv, inv.waves![0], T0, () => 0);
    expect(Object.values(w.movements).filter((m) => m.alien).length).toBeGreaterThan(0);
    finish(w, T0 + MIN, 'lost');
    expect(Object.values(w.movements).filter((m) => m.alien)).toHaveLength(0);
  });
  it('fighting one is a normal battle with the aliens\' technology, and the aliens destroyed are credited to the defenders', () => {
    const inv = open();
    pa.defenses = { rocketLauncher: 3000, lightLaser: 3000, heavyLaser: 800 };
    const m = Object.values(w.movements).find((x) => x.alien && x.to.s === pa.coords.s && x.to.g === pa.coords.g)!;
    expect(m.alien!.weapons).toBeGreaterThanOrEqual(0);
    const before = inv.contrib[a.id]?.home ?? 0;
    processMovements(w, m.arriveAt);
    expect(inv.contrib[a.id].home!).toBeGreaterThan(before);
    expect(w.movements[m.id]).toBeUndefined();                                          // the team is spent
    expect(w.messages.some((x) => x.to === a.id && (x.kind === 'combat' || x.kind === 'raid') && x.subject !== 'Raid incoming!')).toBe(true);
  });
  it('allies who held the planet share the credit 60 to 40', () => {
    const inv = open();
    const res = { attackers: [{ lost: { metal: 1000, crystal: 0, deuterium: 0 } }] } as any;
    creditStrike(w, { alien: { wave: 0, weapons: 0, shielding: 0, armour: 0 } } as any, res, a.id, [b.id, b.id, c.id]);
    expect(inv.contrib[a.id].home).toBeCloseTo(600);
    expect(inv.contrib[b.id].home).toBeCloseTo(200);
    expect(inv.contrib[c.id].home).toBeCloseTo(200);
    creditStrike(w, { alien: { wave: 0, weapons: 0, shielding: 0, armour: 0 } } as any, res, a.id, []);
    expect(inv.contrib[a.id].home).toBeCloseTo(1600);
  });
});

describe('supply convoys', () => {
  const convoy = (p: Player, planet: Planet, ships: Record<string, number>, cargo: { metal?: number; crystal?: number; deuterium?: number }, t = T0) => {
    const m = sendFleet(w, p, { fromPlanetId: planet.id, to: w.invasion!.rift, ships, mission: 'supply', cargo: { metal: 0, crystal: 0, deuterium: 0, ...cargo } }, t);
    return m;
  };
  it('need an invasion, the rift and cargo ships', () => {
    expect(() => sendFleet(w, a, { fromPlanetId: pa.id, to: { g: 1, s: 1, p: 16 }, ships: { largeCargo: 5 }, mission: 'supply' }, T0)).toThrow(/no invasion/);
    const inv = announceInvasion(w, T0, 12 * HOUR);
    expect(() => sendFleet(w, a, { fromPlanetId: pa.id, to: inv.rift, ships: { espionageProbe: 5 }, mission: 'supply' }, T0)).toThrow(/cargo ships/);
  });
  it('deliver their cargo to the supplies at the front, credit the sender, and go home empty', () => {
    const inv = announceInvasion(w, T0, 12 * HOUR);                                  // before the rift opens there is no risk
    const m = convoy(a, pa, { largeCargo: 20 }, { metal: 200_000, crystal: 100_000, deuterium: 50_000 });
    expect(pa.resources.metal).toBeLessThan(1e12);                                    // the cargo (and fuel) left the planet
    processMovements(w, m.arriveAt);
    expect(inv.supply).toEqual({ metal: 200_000, crystal: 100_000, deuterium: 50_000 });
    expect(inv.contrib[a.id].supplied).toBeCloseTo(200_000 + 150_000 + 150_000);
    expect(inv.contrib[a.id].convoys).toBe(1);
    expect(w.movements[m.id].phase).toBe('returning');
    expect(w.movements[m.id].cargo).toEqual({ metal: 0, crystal: 0, deuterium: 0 });
    expect(w.messages.some((x) => x.to === a.id && /Supply convoy delivered/.test(x.subject))).toBe(true);
  });
  it('are caught more often later in the invasion, and an escort of warships cuts the risk', () => {
    const inv = open();
    const bare = convoyRisk(inv, { largeCargo: 20 });
    expect(bare).toBeCloseTo(SUPPLY.riskBase);
    inv.waveIndex = 3;
    const later = convoyRisk(inv, { largeCargo: 20 });
    expect(later).toBeGreaterThan(bare);
    expect(later).toBeLessThanOrEqual(SUPPLY.riskMax);
    expect(convoyRisk(inv, { largeCargo: 5, battleship: 200 })).toBeLessThan(later * 0.4);
    inv.phase = 'announced';
    expect(convoyRisk(inv, { largeCargo: 20 })).toBe(0);
  });
  it('a caught convoy loses a share of its ships and cargo but the rest gets through', () => {
    const inv = open();
    const m = convoy(a, pa, { largeCargo: 20 }, { metal: 100_000 });
    const r = deliverSupply(w, w.movements[m.id], T0, () => 0);                         // the dice say: caught
    expect(r.caught).toBe(true);
    expect(w.movements[m.id].ships.largeCargo).toBe(20 - Math.ceil(20 * SUPPLY.lossShare));
    expect(inv.supply!.metal).toBe(Math.floor(100_000 * (1 - SUPPLY.lossShare)));
    const clean = convoy(a, pa, { largeCargo: 20 }, { metal: 100_000 });
    const r2 = deliverSupply(w, w.movements[clean.id], T0, () => 0.99);
    expect(r2.caught).toBe(false);
    expect(w.movements[clean.id].ships.largeCargo).toBe(20);
  });
  it('a convoy that arrives after the invasion turns back with its cargo', () => {
    open();
    const m = convoy(a, pa, { largeCargo: 20 }, { metal: 100_000 });
    finish(w, T0 + 1000, 'lost');
    processMovements(w, m.arriveAt);
    expect(w.movements[m.id].cargo.metal).toBe(100_000);
    expect(w.messages.some((x) => x.to === a.id && /turned back/.test(x.subject))).toBe(true);
  });
  it('supplies rebuild ships lost at the last engagement, at half price, before the next', () => {
    const inv = open();
    const m = sendFront(b, pb, { cruiser: 50 });
    inv.supply = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
    inv.lastLoss = { [b.id]: { cruiser: 10 } };
    const front = Object.values(w.movements).filter((x) => x.mission === 'invade' && x.phase === 'holding');
    const before = w.movements[m.id].ships.cruiser!;
    const value = repairFront(w, inv, front);
    expect(w.movements[m.id].ships.cruiser).toBe(before + 10);
    expect(value).toBeGreaterThan(0);
    expect(inv.supply!.metal).toBe(1e9 - 10 * 20000 * SUPPLY.repairShare);
    expect(inv.lastLoss).toEqual({});
  });
  it('a small pool repairs as much as it can afford, and nothing for a commander who left the front', () => {
    const inv = open();
    const m = sendFront(b, pb, { cruiser: 50 });
    inv.supply = { metal: 50_000, crystal: 1e9, deuterium: 1e9 };                       // metal for 5 cruisers at half price
    inv.lastLoss = { [b.id]: { cruiser: 10 }, [c.id]: { cruiser: 10 } };
    repairFront(w, inv, Object.values(w.movements).filter((x) => x.mission === 'invade' && x.phase === 'holding'));
    expect(w.movements[m.id].ships.cruiser).toBe(55);
    expect(inv.supply.metal).toBe(0);
  });
  afterEach(() => { vi.restoreAllMocks(); });
  it('an engagement uses the pool: what was lost last time comes back', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.93);                                   // the dice of the fight are fixed, so a win with losses stays a win with losses
    const inv = open();
    const n = Math.ceil((inv.startValue * 0.9) / 27000);                              // a fleet nearly the size of the wave: it wins, with losses
    pa.fleet = { cruiser: n };
    const m = sendFront(a, pa, { cruiser: n });
    engage(w, T0 + 30 * MIN);
    const lost = inv.lastLoss![a.id];
    expect(lost && Object.keys(lost).length > 0).toBe(true);
    expect(w.movements[m.id]).toBeDefined();
    inv.supply = { metal: 1e12, crystal: 1e12, deuterium: 1e12 };
    const lostCount = lost.cruiser!;
    const left = w.movements[m.id].ships.cruiser!;
    if (Object.keys(inv.fleet).length) {
      engage(w, T0 + 60 * MIN);
      expect(inv.repaired!).toBeGreaterThan(0);
      expect(inv.supply!.metal).toBeLessThan(1e12);
      expect(lostCount).toBeGreaterThan(0);
      expect(left).toBeGreaterThan(0);
    }
  });
});

describe('rewards for every job', () => {
  const credit = (id: string, over: Record<string, number>) => { const inv = w.invasion!; inv.contrib[id] = { damage: 0, lost: 0, battles: 0, ...over }; };
  it('fighting alone pays as before: by damage share', () => {
    open();
    credit(a.id, { damage: 3000, battles: 1 }); credit(b.id, { damage: 1000, battles: 1 });
    const s = shares(w, w.invasion!);
    expect(s[0]).toMatchObject({ id: a.id });
    expect(s[0].share).toBeCloseTo(0.75);
    expect(s[1].share).toBeCloseTo(0.25);
  });
  it('a job nobody did does not count, and the weights follow the jobs that were done', () => {
    open();
    credit(a.id, { damage: 1000, battles: 1 });
    credit(b.id, { home: 500 });
    credit(c.id, { supplied: 800, convoys: 1 });
    const s = Object.fromEntries(shares(w, w.invasion!).map((x) => [x.id, x.share]));
    const W = REWARD.weights, sum = W.damage + W.home + W.supply;                          // no scouting happened
    expect(s[a.id]).toBeCloseTo(W.damage / sum);
    expect(s[b.id]).toBeCloseTo(W.home / sum);
    expect(s[c.id]).toBeCloseTo(W.supply / sum);
    expect(Object.values(s).reduce((x, y) => x + y, 0)).toBeCloseTo(1);
  });
  it('supply, home defense and scouting alone earn credits, achievements follow, and lost ships come back in part', () => {
    open();
    pa.resources = { metal: 0, crystal: 0, deuterium: 0 };
    credit(a.id, { damage: 4000, lost: 1_000_000, battles: 2 });
    credit(b.id, { home: 2_000_000 });
    credit(c.id, { supplied: 900_000, convoys: 2, scouts: 3 });
    const before = [a, b, c].map((p) => p.credits);
    finish(w, T0 + HOUR, 'won');
    for (const [i, p] of [a, b, c].entries()) expect(p.credits, p.username).toBeGreaterThan(before[i]);
    expect(pa.resources.metal).toBe(Math.round(1_000_000 * REWARD.relief * 0.6));
    expect(pa.resources.crystal).toBe(Math.round(1_000_000 * REWARD.relief * 0.4));
    expect(b.stats.voidHome).toBe(2_000_000);
    expect(c.stats.voidSupplied).toBe(900_000);
    expect(c.stats.voidScouts).toBe(3);
    expect(w.messages.some((m) => m.to === b.id && /aliens destroyed at home/.test(m.body))).toBe(true);
    checkProgress(w, b, T0 + HOUR); checkProgress(w, c, T0 + HOUR);
    expect(b.achievements.voidguardian).toBeDefined();
    expect(c.achievements.voidquartermaster).toBeDefined();
    expect(c.achievements.voidscout).toBeDefined();
    expect(w.invasionHistory![0]).toMatchObject({ waves: 4, strikes: 0, supplied: 900_000 });
  });
  it('half the relief when the aliens withdrew', () => {
    open();
    pa.resources = { metal: 0, crystal: 0, deuterium: 0 };
    credit(a.id, { damage: 4000, lost: 1_000_000, battles: 2 });
    finish(w, T0 + HOUR, 'lost');
    expect(pa.resources.metal).toBe(Math.round(Math.round(1_000_000 * REWARD.relief * 0.5) * 0.6));
  });
  it('the view shows the four boards, your own reward share, the supplies and the last engagement for the replay', () => {
    const inv = open();
    pa.fleet = { cruiser: 4000, battleship: 600 };
    sendFront(a, pa, { cruiser: 4000, battleship: 600 });
    engage(w, T0 + 30 * MIN);
    credit(b.id, { home: 100, supplied: 300 });
    inv.supply = { metal: 5, crystal: 6, deuterium: 7, };
    const v = invasionView(w, b.id, T0 + 31 * MIN).active!;
    expect(Object.keys(v.boards)).toEqual(['damage', 'home', 'supply', 'scout']);
    expect(v.boards.home.rows[0]).toMatchObject({ name: 'bob', you: true });
    expect(v.mine!.reward).toBeGreaterThan(0);
    expect(v.supply).toMatchObject({ metal: 5, crystal: 6, deuterium: 7 });
    expect(v.last!.roundLog.length).toBeGreaterThanOrEqual(2);
    expect(v.last!.rounds).toBeGreaterThan(0);
    expect(v.strikes.sent).toBe(0);
  });
  it('the view lists strike teams on their way to your planets', () => {
    w.config.invasionHomeShare = 1;
    open();
    const v = invasionView(w, a.id, T0).active!;
    expect(v.strikes.sent).toBe(3);
    expect(v.strikes.onTheWay).toHaveLength(1);
    expect(v.strikes.onTheWay[0].arriveAt).toBeGreaterThan(T0);
  });
  it('closing an invasion that does not exist is still an error', () => {
    expect(() => finish(w, T0, 'won')).toThrow(GameError);
  });
});
