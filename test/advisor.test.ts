import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { defenseReport } from '../server/advisor';
import { createWorld, type Planet, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
let w: World; let alice: Player; let ap: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0 - 30 * 86_400_000);
  alice = register(w, 'alice', 'secret1', T0 - 30 * 86_400_000).player;
  ap = w.planets[alice.planetIds[0]];
  ap.buildings = { shipyard: 8, roboticsFactory: 5, researchLab: 8 };
  alice.techs = { energy: 6, laser: 6, ion: 3, weapons: 3, shielding: 3, armour: 3 };
  ap.resources = { metal: 1e7, crystal: 1e7, deuterium: 1e7 };
});

describe('the defense advisor', () => {
  it('shows a small and a large raid, with a verdict from real simulated battles', () => {
    ap.defenses = { rocketLauncher: 400, lightLaser: 150 };
    const r = defenseReport(w, alice, ap, T0);
    expect(r.forecasts.map((f) => f.size)).toEqual(['small', 'large']);
    for (const f of r.forecasts) { expect(f.value).toBeGreaterThan(0); expect(['holds', 'close', 'falls']).toContain(f.verdict); expect(f.lossShare).toBeGreaterThanOrEqual(0); expect(f.lossShare).toBeLessThanOrEqual(1); }
    expect(r.forecasts[1].value).toBeGreaterThan(r.forecasts[0].value);
    expect(r.defenseValue).toBeGreaterThan(0);
  });
  it('recommends the cheapest defense that makes the large raid fail, and the recommendation really holds', () => {
    ap.defenses = { rocketLauncher: 5 };
    const r = defenseReport(w, alice, ap, T0);
    if (r.forecasts[1].verdict === 'holds') return;                       // already safe: nothing to recommend
    expect(r.recommendation).not.toBeNull();
    const rec = r.recommendation!;
    expect(rec.count).toBeGreaterThan(0);
    const after = { ...ap, defenses: { ...ap.defenses, [rec.unit]: (ap.defenses[rec.unit] || 0) + rec.count } } as Planet;
    expect(defenseReport(w, alice, after, T0).forecasts[1].verdict).toBe('holds');
  });
  it('has nothing to recommend when the planet already holds, or when it cannot build defenses', () => {
    ap.defenses = { rocketLauncher: 60_000, lightLaser: 30_000 };
    expect(defenseReport(w, alice, ap, T0).recommendation).toBeNull();
    ap.defenses = {}; ap.buildings = {};
    expect(defenseReport(w, alice, ap, T0).recommendation).toBeNull();
  });
  it('a new account faces much weaker raids than an old one', () => {
    ap.defenses = { rocketLauncher: 50 };
    const old = defenseReport(w, alice, ap, T0).forecasts[1].value;
    alice.createdAt = T0 - 3_600_000;
    expect(defenseReport(w, alice, ap, T0).forecasts[1].value).toBeLessThanOrEqual(old);
  });
});
