/**
 * Load probe: fill a universe with N commanders (developed planets, fleets, moons, alliances, fleets in flight)
 * and time the hot paths. Run: npx tsx server/bench.ts [players]
 */
import { performance } from 'node:perf_hooks';
import { SHIP_IDS, TECH_IDS } from '../shared/data';
import { register } from './accounts';
import { createAlliance, joinAlliance } from './alliance';
import { processPlayer } from './economy';
import { processMovements, sendFleet } from './fleet';
import { createMoon, createPlanet, galaxyView, playerPoints } from './galaxy';
import { processRaids } from './npc';
import { saveWorld } from './store';
import { meView, planetView, fleetsView } from './views';
import { createWorld, planetAt } from './world';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { statSync } from 'node:fs';

const N = Number(process.argv[2] || 500);
const T0 = Date.now();
const w = createWorld({ galaxies: 4, systems: 60, maxPlayers: N + 10, economySpeed: 20, fleetSpeed: 10, protectionPoints: 1, raidIntervalMin: 45 }, T0);
const t = (label: string, fn: () => void, runs = 1) => {
  const s = performance.now();
  for (let i = 0; i < runs; i++) fn();
  const ms = (performance.now() - s) / runs;
  console.log(`${label.padEnd(44)} ${ms.toFixed(2).padStart(9)} ms`);
  return ms;
};

t(`register ${N} players`, () => {
  for (let i = 0; i < N; i++) {
    const p = register(w, `cmd${i}`, 'password1', T0).player;
    for (const tech of TECH_IDS) p.techs[tech] = 6;
    for (let c = 0; c < 2; c++) {
      // find a free slot near a pseudo-random spot
      let spot = { g: 1 + ((i + c) % 4), s: 1 + ((i * 7 + c * 13) % 60), p: 1 };
      while (planetAt(w, spot)) spot = { ...spot, p: (spot.p % 15) + 1, s: spot.p === 15 ? (spot.s % 60) + 1 : spot.s };
      createPlanet(w, p, spot, { now: T0 });
    }
    for (const id of p.planetIds) {
      const pl = w.planets[id];
      Object.assign(pl.buildings, { metalMine: 12, crystalMine: 10, solarPlant: 15, shipyard: 6, roboticsFactory: 4, researchLab: 5 });
      for (const s of SHIP_IDS) if (s !== 'deathstar' && s !== 'solarSatellite') pl.fleet[s] = 10;
      pl.defenses = { rocketLauncher: 30 };
    }
    createMoon(w, w.planets[p.planetIds[0]], T0);
  }
});
const ids = Object.keys(w.players);
for (let a = 0; a < Math.floor(N / 10); a++) {
  const founder = w.players[ids[a * 10]];
  const al = createAlliance(w, founder, `A${a}`.padEnd(3, 'X'), `Alliance ${a}`);
  for (let k = 1; k < 10; k++) joinAlliance(w, w.players[ids[a * 10 + k]], al.id);
}
let sent = 0;
for (const pid of ids) {
  const p = w.players[pid];
  const target = w.planets[w.players[ids[(ids.indexOf(pid) + 17) % ids.length]].planetIds[0]];
  try { sendFleet(w, p, { fromPlanetId: p.planetIds[0], to: target.coords, ships: { largeCargo: 3 }, mission: 'transport' }, T0); sent++; } catch { /* slot/range etc. */ }
}
console.log(`planets: ${Object.keys(w.planets).length}, fleets in flight: ${sent}, alliances: ${Object.keys(w.alliances).length}`);

let now = T0 + 5000;
const tick = () => {
  now += 1000;
  processMovements(w, now);
  processRaids(w, now);
  for (const p of Object.values(w.players)) processPlayer(w, p, now);
};
const tickMs = t('server tick (all players)', tick, 20);
const me = w.players[ids[0]];
t('GET /me', () => meView(w, me, now), 20);
t('GET /planets (all of one player)', () => me.planetIds.forEach((id) => planetView(w, w.planets[id], now)), 20);
t('GET /fleets', () => fleetsView(w, me), 20);
t('GET /galaxy/1/10', () => galaxyView(w, me, 1, 10), 20);
t('GET /highscore (points for everyone)', () => Object.values(w.players).forEach((p) => playerPoints(w, p)), 3);
const file = join(tmpdir(), 'ogame-bench-world.json');
t('save world', () => saveWorld(file, w, { everyMs: Infinity, keep: 0 }), 3);
console.log(`save file: ${(statSync(file).size / 1e6).toFixed(1)} MB`);
console.log(tickMs > 250 ? 'WARNING: tick uses >25% of its 1s budget' : 'tick budget OK');
