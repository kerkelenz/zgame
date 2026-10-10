import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../server/accounts';
import { processMovements, sendFleet } from '../server/fleet';
import { createMoon } from '../server/galaxy';
import { loadWorld, saveWorld } from '../server/store';
import { createWorld } from '../server/world';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ogame-store-')); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });

describe('persistence', () => {
  it('round-trips a live world, including queues, moons and movements, and keeps playing', () => {
    const T0 = 1_700_000_000_000;
    const w = createWorld({ economySpeed: 100, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0 }, T0);
    const a = register(w, 'alice', 'secret1', T0).player;
    const b = register(w, 'bob', 'secret2', T0).player;
    const ap = w.planets[a.planetIds[0]], bp = w.planets[b.planetIds[0]];
    ap.coords = { g: 1, s: 5, p: 6 }; bp.coords = { g: 1, s: 6, p: 8 };
    Object.assign(ap.buildings, { shipyard: 4, roboticsFactory: 3 });
    ap.resources = { metal: 1e6, crystal: 1e6, deuterium: 1e6 };
    ap.fleet = { largeCargo: 3 };
    createMoon(w, ap, T0);
    const m = sendFleet(w, a, { fromPlanetId: ap.id, to: bp.coords, ships: { largeCargo: 3 }, mission: 'transport', cargo: { metal: 1000 } }, T0);

    const file = join(dir, 'world.json');
    saveWorld(file, w);
    const loaded = loadWorld(file);
    expect(loaded.movements[m.id]).toEqual(m);
    expect(Object.values(loaded.planets).some((p) => p.isMoon)).toBe(true);
    expect(loaded.players[a.id].hash).toBe(a.hash);

    processMovements(loaded, m.arriveAt + 10 * 3_600_000);
    expect(loaded.movements[m.id]).toBeUndefined();
    expect(loaded.planets[ap.id].fleet.largeCargo).toBe(3);
  });

  it('applies new defaults to old configs and lets overrides win', () => {
    const file = join(dir, 'world.json');
    const w = createWorld({}, 1);
    delete (w.config as unknown as Record<string, unknown>).raidIntervalMin;
    saveWorld(file, w);
    const loaded = loadWorld(file, { economySpeed: 7 });
    expect(loaded.config.raidIntervalMin).toBeGreaterThan(0);
    expect(loaded.config.economySpeed).toBe(7);
  });

  it('quarantines an unreadable save instead of overwriting it', () => {
    const file = join(dir, 'world.json');
    writeFileSync(file, '{"players": {"truncated');
    const w = loadWorld(file);
    expect(Object.keys(w.players)).toHaveLength(0);
    expect(existsSync(file)).toBe(false);
    const kept = readdirSync(dir).filter((f) => f.startsWith('world.json.corrupt-'));
    expect(kept).toHaveLength(1);
    expect(readFileSync(join(dir, kept[0]), 'utf8')).toContain('truncated');
    saveWorld(file, w); // a fresh save must not clobber the quarantined copy
    expect(readdirSync(dir).filter((f) => f.startsWith('world.json.corrupt-'))).toHaveLength(1);
  });

  it('rejects valid JSON that is not a world', () => {
    const file = join(dir, 'world.json');
    writeFileSync(file, '{"hello": 1}');
    expect(Object.keys(loadWorld(file).players)).toHaveLength(0);
    expect(readdirSync(dir).some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  it('writes rolling backups at most once per interval and prunes old ones', () => {
    const file = join(dir, 'world.json');
    const w = createWorld({}, 1);
    const opts = { everyMs: 1000, keep: 3 };
    saveWorld(file, w, opts, 10_000); // nothing to back up yet
    const backups = () => readdirSync(join(dir, 'backups')).sort();
    expect(existsSync(join(dir, 'backups'))).toBe(false);
    saveWorld(file, w, opts, 20_000);
    saveWorld(file, w, opts, 20_500); // too soon
    expect(backups()).toHaveLength(1);
    saveWorld(file, w, opts, 22_000);
    saveWorld(file, w, opts, 24_000);
    saveWorld(file, w, opts, 26_000);
    expect(backups()).toEqual(['world-22000.json', 'world-24000.json', 'world-26000.json']);
    // a backup is itself a loadable world
    const latest = backups().at(-1)!;
    expect(loadWorld(join(dir, 'backups', latest)).players).toBeTruthy();
  });
});
