import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { fleetValue, RAID, raidRamp, spawnRaid } from '../server/npc';
import { playerPoints } from '../server/galaxy';
import { createWorld, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const DAY = 86_400_000;
let w: World; let alice: Player, warlord: Player;
const home = () => w.planets[alice.planetIds[0]];
/** a raid's strength without the unarmed cargo ships it brings along to carry loot */
const strength = (ships: Record<string, number | undefined>) => fleetValue({ ...ships, largeCargo: 0 });

beforeEach(() => {
  w = createWorld({ npcDensity: 0, raidIntervalMin: 0, protectionPoints: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  warlord = register(w, 'warlord', 'secret1', T0).player;
  warlord.npc = { status: 'aggressive', seedPoints: 3000, faction: null };
  w.planets[warlord.planetIds[0]].coords = { g: 2, s: 40, p: 5 };
  alice.createdAt = T0 - 30 * DAY;                                      // an established account unless a test says otherwise
  home().coords = { g: 1, s: 5, p: 6 };
});

describe('raid strength over the first week', () => {
  it('starts gentle and reaches full strength after a week', () => {
    expect(raidRamp(-1000)).toBeCloseTo(RAID.youngShare);
    expect(raidRamp(0)).toBeCloseTo(RAID.youngShare);
    expect(raidRamp(DAY)).toBeCloseTo(RAID.youngShare);
    expect(raidRamp(4 * DAY)).toBeCloseTo(0.3 + 0.7 * (3 / 6), 9);
    expect(raidRamp(RAID.fullAfterDays * DAY)).toBeCloseTo(1, 9);
    expect(raidRamp(100 * DAY)).toBe(1);
    expect(raidRamp(3 * DAY)).toBeLessThan(raidRamp(5 * DAY));
  });

  it('a new account is raided with a much smaller fleet than an established one with the same defenses', () => {
    home().defenses = { gaussCannon: 200, plasmaTurret: 50 };
    const old = spawnRaid(w, T0, () => 0.5)!;
    const oldStrength = strength(old.ships);
    delete w.movements[old.id];
    alice.createdAt = T0;
    const young = spawnRaid(w, T0, () => 0.5)!;
    expect(strength(young.ships)).toBeLessThan(oldStrength * 0.45);
  });
});

describe('what a raid is sized from', () => {
  it('is no more than a little over what defends the planet, so a good defense holds', () => {
    home().defenses = { gaussCannon: 300, plasmaTurret: 80 };
    home().fleet = { battleship: 40 };
    const defVal = [home().fleet, home().defenses].reduce((s, bag) => s + Object.entries(bag).reduce((a, [id, n]) => a + (n || 0) * (({ gaussCannon: 20000 + 15000, plasmaTurret: 50000 + 50000, battleship: 45000 + 15000 } as Record<string, number>)[id] ?? 0), 0), 0);
    for (const roll of [0, 0.5, 0.99]) {
      const m = spawnRaid(w, T0, () => roll)!;
      expect(strength(m.ships), `roll ${roll}`).toBeLessThanOrEqual(defVal * RAID.vsDefense[1] * 1.02);
      delete w.movements[m.id];
    }
  });

  it('does not punish a big economy with little military: the raid stays a small share of what was invested', () => {
    home().buildings = { metalMine: 25, crystalMine: 25, deuteriumSynthesizer: 20, solarPlant: 25, roboticsFactory: 10, shipyard: 8, researchLab: 10 };
    home().defenses = {};
    home().fleet = {};
    const invested = playerPoints(w, alice).total * 1000;
    expect(invested).toBeGreaterThan(2_000_000);
    const m = spawnRaid(w, T0, () => 0.999)!;                                // the strongest roll
    expect(strength(m.ships)).toBeLessThanOrEqual(invested * RAID.floorEmpire[1] * 1.02);
    expect(strength(m.ships)).toBeGreaterThan(0);
  });

  it('generic raiders (no computer empires) are gentler still', () => {
    warlord.npc = { status: 'inactive', seedPoints: 3000, faction: null };
    home().buildings = { metalMine: 25, crystalMine: 25, solarPlant: 25 };
    const invested = playerPoints(w, alice).total * 1000;
    const m = spawnRaid(w, T0, () => 0.999)!;
    expect(m.ownerId).toBeNull();
    expect(strength(m.ships)).toBeLessThanOrEqual(Math.max(6000, invested * RAID.floorGeneric[1]) * 1.05);
  });

  it('still scales with the configured raid strength', () => {
    home().defenses = { gaussCannon: 300 };
    const normal = strength(spawnRaid(w, T0, () => 0.5)!.ships);
    w.config.raidStrength = 0.5;
    const half = strength(spawnRaid(w, T0, () => 0.5)!.ships);
    expect(half).toBeLessThan(normal * 0.65);
  });
});
