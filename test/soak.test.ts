import { describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { cancelBuilding, cancelResearch, processPlayer, queueUnits, startBuilding, startResearch } from '../server/economy';
import { jumpGate, launchMissiles, phalanxScan, processMovements, recallFleet, sendFleet } from '../server/fleet';
import { createMoon } from '../server/galaxy';
import { processRaids } from '../server/npc';
import { BUILDING_IDS, SHIP_IDS, TECH_IDS, DEFENSE_IDS } from '../shared/data';
import { createWorld, GameError, type World } from '../server/world';
import { makeRng } from '../shared/combat';

const T0 = 1_700_000_000_000;

function invariants(w: World) {
  for (const p of Object.values(w.planets)) {
    for (const k of ['metal', 'crystal', 'deuterium'] as const) {
      expect(Number.isFinite(p.resources[k]), `${p.name} ${k}`).toBe(true);
      expect(p.resources[k], `${p.name} ${k} negative`).toBeGreaterThanOrEqual(-1e-6);
    }
    for (const [id, n] of [...Object.entries(p.fleet), ...Object.entries(p.defenses)]) {
      expect(Number.isInteger(n) && (n as number) >= 0, `${p.name} ${id}=${n}`).toBe(true);
    }
    for (const [id, n] of Object.entries(p.buildings)) expect(Number.isInteger(n) && (n as number) >= 0, id).toBe(true);
    expect(w.players[p.ownerId]).toBeTruthy();
  }
  const moonAt = new Set<string>();
  for (const p of Object.values(w.planets)) {
    if (!p.isMoon) continue;
    const parent = w.planets[p.parentId!];
    expect(parent && !parent.isMoon, 'moon parent').toBeTruthy();
    expect(parent.coords).toEqual(p.coords);
    expect(parent.ownerId).toBe(p.ownerId);
    const key = p.coords.g + ':' + p.coords.s + ':' + p.coords.p;
    expect(moonAt.has(key), 'duplicate moon ' + key).toBe(false);
    moonAt.add(key);
  }
  for (const m of Object.values(w.movements)) {
    for (const [id, n] of Object.entries(m.ships)) expect(Number.isInteger(n) && (n as number) > 0, `movement ${m.mission} ${id}=${n}`).toBe(true);
    for (const k of ['metal', 'crystal', 'deuterium'] as const) expect(Number.isFinite(m.cargo[k]) && m.cargo[k] >= 0).toBe(true);
    expect(Number.isFinite(m.arriveAt) && Number.isFinite(m.flightMs)).toBe(true);
  }
  for (const d of Object.values(w.debris)) expect(d.metal >= 0 && d.crystal >= 0).toBe(true);
  for (const a of Object.values(w.alliances)) {
    expect(a.members.length).toBeGreaterThan(0);
    for (const k of ['metal', 'crystal', 'deuterium'] as const) expect(a.bank[k]).toBeGreaterThanOrEqual(0);
    for (const m of a.members) expect(w.players[m.playerId].allianceId).toBe(a.id);
  }
}

describe('soak', () => {
  for (const seed of (process.env.SOAK_SEEDS ? Array.from({ length: Number(process.env.SOAK_SEEDS) }, (_, i) => i + 1) : [1, 2, 3])) {
    it(`random play for simulated days keeps the world consistent (seed ${seed})`, () => {
      const rng = makeRng(seed);
      const pick = <T,>(a: readonly T[]) => a[Math.floor(rng() * a.length)];
      const w = createWorld({ galaxies: 1, systems: 3, positions: 15, economySpeed: 200, fleetSpeed: 200, protectionPoints: 5, raidIntervalMin: 90 }, T0);
      const players = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => register(w, 'bot_' + n, 'password1', T0).player);
      // rich start so all systems get exercised
      for (const p of players) {
        for (const t of TECH_IDS) p.techs[t] = 8;
        for (const id of p.planetIds) {
          const pl = w.planets[id];
          Object.assign(pl.resources, { metal: 5e7, crystal: 5e7, deuterium: 5e7 });
          Object.assign(pl.buildings, { roboticsFactory: 6, shipyard: 12, missileSilo: 6, researchLab: 10, solarPlant: 15, metalStorage: 10, crystalStorage: 10, deuteriumTank: 10 });
          for (const sid of SHIP_IDS) if (sid !== 'deathstar') pl.fleet[sid] = 5 + Math.floor(rng() * 40);
          for (const did of DEFENSE_IDS) pl.defenses[did] = did.endsWith('Shield') ? 1 : Math.floor(rng() * 30);
        }
      }
      for (const p of players) {
        for (const hid of [...p.planetIds]) {
          const moon = createMoon(w, w.planets[hid], T0);
          Object.assign(moon.buildings, { lunarBase: 4, sensorPhalanx: 3, jumpGate: 1, shipyard: 4, roboticsFactory: 3 });
          Object.assign(moon.resources, { metal: 1e7, crystal: 1e7, deuterium: 1e7 });
          moon.fleet = { cruiser: 20, largeCargo: 10 };
        }
      }
      let now = T0;
      let ok = 0, rejected = 0;
      const spy = (() => { const orig = Math.random; Math.random = rng; return () => { Math.random = orig; }; })();
      try {
        for (let step = 0; step < 1500; step++) {
          now += Math.floor(rng() * 900_000);
          const p = pick(players);
          const planet = w.planets[pick(p.planetIds)];
          const moonShot = rng() < 0.25;
          const act = Math.floor(rng() * 15);
          try {
            switch (act) {
              case 0: startBuilding(w, p, planet, pick(BUILDING_IDS), now); break;
              case 1: startResearch(w, p, planet, pick(TECH_IDS), now); break;
              case 2: queueUnits(w, p, planet, pick([...SHIP_IDS, ...DEFENSE_IDS]), 1 + Math.floor(rng() * 30), now); break;
              case 3: case 4: case 5: {
                const ships: Record<string, number> = {};
                for (const id of SHIP_IDS) if ((planet.fleet[id] || 0) > 0 && rng() < 0.5) ships[id] = 1 + Math.floor(rng() * (planet.fleet[id] || 1));
                const target = rng() < 0.7 ? w.planets[pick(Object.keys(w.planets))].coords : { g: 1, s: 1 + Math.floor(rng() * 3), p: 1 + Math.floor(rng() * 16) };
                const join = pick(Object.values(w.movements).filter((m) => m.mission === 'attack' && m.ownerId));
                sendFleet(w, p, {
                  fromPlanetId: planet.id, to: target, ships,
                  mission: pick(['attack', 'transport', 'deploy', 'hold', 'espionage', 'colonize', 'recycle', 'expedition'] as const),
                  speedPct: 10 * (1 + Math.floor(rng() * 10)), cargo: { metal: Math.floor(rng() * 5000), crystal: Math.floor(rng() * 5000) }, holdHours: rng() * 3,
                  joinFleetId: rng() < 0.3 ? join?.id : undefined, toMoon: moonShot,
                }, now);
                break;
              }
              case 6: { const m = pick(Object.values(w.movements).filter((x) => x.ownerId === p.id)); if (m) recallFleet(w, p, m.id, now); break; }
              case 7: if (!p.allianceId) { rng() < 0.5 && Object.keys(w.alliances).length ? AL.joinAlliance(w, p, pick(Object.keys(w.alliances))) : AL.createAlliance(w, p, 'T' + Math.floor(rng() * 9999), 'Team ' + step); } else AL.leaveAlliance(w, p); break;
              case 8: if (p.allianceId) AL.donate(w, p, planet.id, { metal: Math.floor(rng() * 1e6), crystal: Math.floor(rng() * 1e5) }, now); break;
              case 9: if (p.allianceId) AL.buyUpgrade(w, p, pick(['production', 'research', 'logistics'])); break;
              case 10: cancelBuilding(w, planet, now); break;
              case 13: phalanxScan(w, p, planet.id, w.planets[pick(Object.keys(w.planets))].coords, now); break;
              case 14: jumpGate(w, p, planet.id, w.planets[pick(p.planetIds)].id, { cruiser: 1 + Math.floor(rng() * 5) }, now); break;
              case 12: launchMissiles(w, p, planet.id, w.planets[pick(Object.keys(w.planets))].coords, 1 + Math.floor(rng() * 8), now); break;
              case 11: rng() < 0.5 ? cancelResearch(w, p, now) : processPlayer(w, p, now); break;
            }
            ok++;
          } catch (e) {
            if (!(e instanceof GameError)) throw e;
            rejected++;
          }
          processMovements(w, now);
          processRaids(w, now);
          for (const q of players) processPlayer(w, q, now);
          if (step % 25 === 0) invariants(w);
        }
        invariants(w);
      } finally { spy(); }
      expect(ok).toBeGreaterThan(200);
      // something interesting actually happened
      expect(w.messages.length).toBeGreaterThan(50);
      const kinds: Record<string, number> = {};
      for (const m of w.messages) kinds[m.kind] = (kinds[m.kind] || 0) + 1;
      if (process.env.SOAK_LOG) console.log(seed, { ok, rejected, kinds, planets: Object.keys(w.planets).length, alliances: Object.keys(w.alliances).length });
    });
  }
});
