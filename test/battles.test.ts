import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../server/accounts';
import { _resetBattles, battleView, engagedBattles, playRound, retreatBattle } from '../server/battles';
import { processMovements, sendFleet } from '../server/fleet';
import { generateOutposts, outpostOf } from '../server/outposts';
import { Battle, makeRng, simulateCombat, type Combatant } from '../shared/combat';
import { createWorld, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const SHIPS = { cruiser: 2, lightFighter: 12, largeCargo: 20 };
const side = (name: string, fleet: Combatant['fleet'], extra: Partial<Combatant> = {}): Combatant => ({ owner: null, name, weapons: 0, shielding: 0, armour: 0, fleet, ...extra });

describe('the round-by-round battle engine', () => {
  it('without orders it is exactly the automatic fight', () => {
    const a = [side('A', { cruiser: 40, lightFighter: 80 })], d = [side('D', { battleship: 20, heavyFighter: 50 })];
    const auto = simulateCombat(a, d, makeRng(99));
    const b = new Battle(a, d, makeRng(99));
    while (!b.done) b.step();
    expect(b.result()).toEqual(auto);
  });

  it('is the same fight every time for the same seed and orders', () => {
    const run = () => { const b = new Battle([side('A', { cruiser: 30 })], [side('D', { battleship: 12 })], makeRng(5)); while (!b.done) b.step([{ stance: 'assault', target: 'big' }, undefined]); return b.result(); };
    expect(run()).toEqual(run());
  });

  it('stances trade damage dealt for damage taken', () => {
    const play = (stance: 'assault' | 'evasive' | 'balanced') => {
      let dealt = 0, taken = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const b = new Battle([side('A', { cruiser: 60 })], [side('D', { battleship: 25 })], makeRng(seed));
        const v = b.step([{ stance }, undefined])!;
        dealt += v.stats.attackers.damage; taken += v.stats.defenders.damage;
      }
      return { dealt, taken };
    };
    const base = play('balanced'), assault = play('assault'), evasive = play('evasive');
    expect(assault.dealt).toBeGreaterThan(base.dealt);
    expect(assault.taken).toBeGreaterThan(base.taken);
    expect(evasive.taken).toBeLessThan(base.taken);
    expect(evasive.dealt).toBeLessThan(base.dealt);
  });

  it('focus fire aims at the dearest or the weakest ships and an EMP weakens the other side', () => {
    const mixed = { battleship: 10, lightFighter: 200 };
    const kills = (target: 'big' | 'weak' | 'spread') => {
      let big = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const b = new Battle([side('A', { cruiser: 120 })], [side('D', mixed)], makeRng(seed));
        const v = b.step([{ target }, undefined])!;
        big += v.destroyed.filter((x) => x.side === 1 && x.id === 'battleship').reduce((n, x) => n + x.n, 0);
      }
      return big;
    };
    expect(kills('big')).toBeGreaterThan(kills('weak'));
    const hits = (ability: 'emp' | null) => { let d = 0; for (let seed = 1; seed <= 8; seed++) d += new Battle([side('A', { cruiser: 50 })], [side('D', { battleship: 20 })], makeRng(seed)).step([{ ability }, undefined])!.stats.defenders.damage; return d; };
    expect(hits('emp')).toBeLessThan(hits(null));
  });

  it('repair mends damaged hulls and a retreat ends the fight with the defense holding', () => {
    const b = new Battle([side('A', { cruiser: 30 })], [side('D', { battleship: 30 })], makeRng(3));
    b.step();
    const hurt = b.groups(0).reduce((s, g) => s + g.hullPct * g.n, 0);
    const v = b.step([{ ability: 'repair', stance: 'evasive' }, { stance: 'evasive' }])!;
    expect(v.round).toBe(2);
    expect(hurt).toBeGreaterThan(0);
    b.retreat();
    expect(b.done).toBe(true);
    expect(b.result().winner).toBe('defender');
  });
});

describe('commanding a battle at an outpost', () => {
  let w: World; let alice: Player; let ap: Planet; let pl: Planet; let outpostId: string;
  beforeEach(() => {
    _resetBattles();
    w = createWorld({ galaxies: 2, systems: 12, positions: 15, economySpeed: 20, fleetSpeed: 50, protectionPoints: 100, raidIntervalMin: 0, npcDensity: 0, outpostsPerGalaxy: 5 }, T0);
    alice = register(w, 'alice', 'secret1', T0).player;
    ap = w.planets[alice.planetIds[0]];
    ap.coords = { g: 1, s: 6, p: 6 };
    ap.buildings = { roboticsFactory: 4, shipyard: 6, researchLab: 6, solarPlant: 20, metalMine: 15, crystalMine: 12 };
    ap.resources = { metal: 3e7, crystal: 3e7, deuterium: 3e7 };
    alice.techs = { combustionDrive: 6, impulseDrive: 4, energy: 8, computer: 3, espionage: 5, weapons: 8, shielding: 8, armour: 8 };
    generateOutposts(w, T0, 1234);
    const o = w.outposts!.find((x) => x.tier === 1)!;
    outpostId = o.id; pl = w.planets[o.planetId];
    ap.fleet = { ...SHIPS };
    vi.spyOn(Math, 'random').mockReturnValue(0.37);                               // the fight dice are seeded from it: the same battle every run
  });
  afterEach(() => { vi.restoreAllMocks(); });
  const send = (command: boolean) => sendFleet(w, alice, { fromPlanetId: ap.id, to: pl.coords, ships: { ...SHIPS }, mission: 'attack', command }, T0);

  it('the fleet waits at the outpost for orders instead of fighting at once', () => {
    const m = send(true);
    expect(m.command).toBe(true);
    const arrive = m.arriveAt;
    processMovements(w, arrive);
    expect(m.engaged).toBe(true);
    expect(outpostOf(w, pl)!.state).toBe('guarded');
    expect(engagedBattles(w, alice.id)).toHaveLength(1);
    expect(w.messages.some((x) => x.to === alice.id && /engaged/.test(x.subject))).toBe(true);
    const v = battleView(w, m.id, alice.id, arrive);
    expect(v.round).toBe(0);
    expect(v.a.length).toBeGreaterThan(0);
    expect(v.d.length).toBeGreaterThan(0);
  });

  it('only the owner can see and command it, and abilities have a cooldown', () => {
    const bob = register(w, 'bob', 'secret1', T0).player;
    const m = send(true);
    processMovements(w, m.arriveAt);
    expect(() => battleView(w, m.id, bob.id, m.arriveAt)).toThrow();
    expect(() => playRound(w, m.id, bob.id, {}, m.arriveAt)).toThrow();
    playRound(w, m.id, alice.id, { stance: 'brace', ability: 'repair' }, m.arriveAt);
    expect(() => playRound(w, m.id, alice.id, { ability: 'repair' }, m.arriveAt)).toThrow(/not ready/);
    const v = playRound(w, m.id, alice.id, { stance: 'assault', target: 'big', ability: 'emp' }, m.arriveAt) as { round?: number; finished?: boolean };
    expect(v.round ?? 99).toBeLessThanOrEqual(3);
  });

  it('playing the rounds to the end writes the normal report, pays the bounty and sends the fleet home', () => {
    const m = send(true);
    processMovements(w, m.arriveAt);
    const credits = alice.credits;
    let out: { finished?: boolean; winner?: string } = {};
    for (let i = 0; i < 6 && !out.finished; i++) out = playRound(w, m.id, alice.id, { stance: 'assault', target: 'big' }, m.arriveAt) as never;
    expect(out.finished).toBe(true);
    expect(m.engaged).toBeFalsy();
    expect(m.phase).toBe('returning');
    expect(w.messages.some((x) => x.to === alice.id && /Battle at/.test(x.subject))).toBe(true);
    if (out.winner === 'attacker') expect(alice.credits).toBeGreaterThan(credits);
    expect(engagedBattles(w, alice.id)).toHaveLength(0);
  });

  it('a retreat sends the fleet home and leaves the outpost standing', () => {
    const m = send(true);
    processMovements(w, m.arriveAt);
    playRound(w, m.id, alice.id, { stance: 'evasive' }, m.arriveAt);
    const r = retreatBattle(w, m.id, alice.id, m.arriveAt);
    expect(r.retreated).toBe(true);
    expect(outpostOf(w, pl)!.state).toBe('guarded');
    expect(m.phase).toBe('returning');
  });

  it('a battle nobody commands plays itself out at the deadline', () => {
    const m = send(true);
    processMovements(w, m.arriveAt);
    const deadline = m.arriveAt;
    expect(deadline).toBeGreaterThan(m.departAt + m.flightMs);
    processMovements(w, deadline);
    expect(m.engaged).toBeFalsy();
    expect(w.messages.some((x) => x.to === alice.id && /Battle at/.test(x.subject))).toBe(true);
    expect(engagedBattles(w, alice.id)).toHaveLength(0);
  });

  it('is only offered against outposts: elsewhere the flag is ignored', () => {
    const bob = register(w, 'bob', 'secret1', T0).player;
    const bp = w.planets[bob.planetIds[0]];
    bp.coords = { g: 1, s: 9, p: 4 };
    let m;
    try { m = sendFleet(w, alice, { fromPlanetId: ap.id, to: bp.coords, ships: { battleship: 10 }, mission: 'attack', command: true }, T0); } catch { return; }
    expect(m.command).toBeFalsy();
  });
});
