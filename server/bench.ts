/**
 * Load probe: fill a universe with N commanders (developed planets, fleets, moons, alliances, automation running,
 * fleets in flight, computer empires, an invasion in progress) and time what the live server does.
 *   npx tsx server/bench.ts [players]          e.g. 300 or 1000
 * Exit code 1 if a budget is blown, so it can run in CI.
 */
import { statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { SHIP_IDS, TECH_IDS } from '../shared/data';
import { register } from './accounts';
import { createAlliance, joinAlliance } from './alliance';
import { automationView, saveOrder, setRules, startPlan } from './automation';
import { contractsView } from './contracts';
import { generateEmpires } from './empires';
import { sendFleet } from './fleet';
import { createMoon, createPlanet, galaxyView, playerPoints } from './galaxy';
import { announceInvasion, engage, invasionView, processInvasion } from './invasion';
import { profileView } from './profile';
import { categoryRows, rankings } from './rankings';
import { influenceMap, processSectors, sectorsView } from './sectors';
import { SqlStore } from './sqlstore';
import { saveWorld } from './store';
import { createTicker } from './tick';
import { allianceView, fleetsView, meView, planetView } from './views';
import { createWorld, planetAt } from './world';

const N = Number(process.argv[2] || 300);
const T0 = Date.now();
// the universe grows with the player count: two planets each plus computer empires must fit, with room to spare
const SYSTEMS = Math.max(60, Math.ceil((N * 2.6) / (4 * 15)));
const w = createWorld({ galaxies: 4, systems: SYSTEMS, maxPlayers: N + 10, economySpeed: 20, fleetSpeed: 10, protectionPoints: 1, raidIntervalMin: 45, npcDensity: 0.3 }, T0);

const BUDGET = { tickP95: 250, request: 50, save: 500, engage: 3000, heavyRequest: 200 };
let failed = 0;
const row = (label: string, ms: number, budget?: number, extra = '') => {
  const bad = budget !== undefined && ms > budget;
  if (bad) failed++;
  console.log(`${label.padEnd(46)} ${ms.toFixed(2).padStart(10)} ms ${budget === undefined ? '' : bad ? `  OVER BUDGET (${budget} ms)` : `  ok (< ${budget})`} ${extra}`);
};
const time = (label: string, fn: () => void, runs = 1, budget?: number) => {
  const s = performance.now();
  for (let i = 0; i < runs; i++) fn();
  const ms = (performance.now() - s) / runs;
  row(label, ms, budget);
  return ms;
};
const pct = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))];
const mb = (n: number) => (n / 1e6).toFixed(1) + ' MB';

// ---------------------------------------------------------------- build the world
const setup = performance.now();
for (let i = 0; i < N; i++) {
  const p = register(w, `cmd${i}`, 'password1', T0).player;
  for (const tech of TECH_IDS) p.techs[tech] = 6;
  p.techs.astrophysics = 8;
  for (let c = 0; c < 2; c++) {
    let spot = { g: 1 + ((i + c) % 4), s: 1 + ((i * 7 + c * 13) % SYSTEMS), p: 1 };
    while (planetAt(w, spot)) spot = { ...spot, p: (spot.p % 15) + 1, s: spot.p === 15 ? (spot.s % SYSTEMS) + 1 : spot.s };
    createPlanet(w, p, spot, { now: T0 });
  }
  for (const id of p.planetIds) {
    const pl = w.planets[id];
    Object.assign(pl.buildings, { metalMine: 14, crystalMine: 12, deuteriumSynthesizer: 8, solarPlant: 18, shipyard: 6, roboticsFactory: 4, researchLab: 5, metalStorage: 5 });
    pl.resources = { metal: 5e6, crystal: 3e6, deuterium: 1e6 };
    for (const s of SHIP_IDS) if (s !== 'deathstar' && s !== 'solarSatellite') pl.fleet[s] = 10 + (i % 30);
    pl.defenses = { rocketLauncher: 30 };
  }
  createMoon(w, w.planets[p.planetIds[0]], T0);
}
const ids = Object.keys(w.players);
for (let a = 0; a < Math.floor(N / 10); a++) {
  const founder = w.players[ids[a * 10]];
  const al = createAlliance(w, founder, `A${a}`.padEnd(3, 'X'), `Alliance ${a}`);
  for (let k = 1; k < 10; k++) joinAlliance(w, w.players[ids[a * 10 + k]], al.id);
}
const npcs = generateEmpires(w, T0);
// half of the commanders run automation: rules on, and a build order on each planet
for (let i = 0; i < ids.length; i += 2) {
  const p = w.players[ids[i]];
  setRules(p, { energy: true, storage: true, defense: { on: true, unit: 'rocketLauncher', count: 20, maxSharePct: 20 } });
  saveOrder(p, 'bench', [{ kind: 'building', id: 'metalMine', level: 30 }, { kind: 'building', id: 'solarPlant', level: 30 }, { kind: 'tech', id: 'energy', level: 12 }, { kind: 'building', id: 'naniteFactory', level: 2 }]);
  for (const id of p.planetIds) { try { startPlan(w, p, w.planets[id], { orderId: p.buildOrders![0].id }, T0); } catch { /* moons and such */ } }
}
let flights = 0;
for (let i = 0; i < ids.length; i++) {
  const p = w.players[ids[i]];
  const target = w.planets[w.players[ids[(i + 17) % ids.length]].planetIds[0]];
  try { sendFleet(w, p, { fromPlanetId: p.planetIds[0], to: target.coords, ships: { largeCargo: 3 }, mission: 'transport' }, T0); flights++; } catch { /* slot, range, protection */ }
}
console.log(`built in ${((performance.now() - setup) / 1000).toFixed(1)} s: ${N} commanders, ${npcs} computer empires, ${Object.keys(w.planets).length} planets, ${Object.keys(w.alliances).length} alliances, ${flights} fleets in flight`);
console.log(`memory after setup: ${mb(process.memoryUsage().heapUsed)}\n`);

// ---------------------------------------------------------------- the server tick, as it really runs
console.log('SERVER TICK (the exact code the game runs every second)');
const tick = createTicker(w);
let now = T0 + 5000;
const quiet: number[] = [];
const slow: number[] = [];
const prof: Record<string, number> = {};
const STEPS = 130;
for (let s = 0; s < STEPS; s++) {                     // 130 simulated seconds crosses the 5 s and 60 s cadences several times
  now += 1000;
  const t0 = performance.now();
  tick(now, prof);
  const ms = performance.now() - t0;
  (s % 60 === 0 || s % 5 === 0 ? slow : quiet).push(ms);
}
row('tick, ordinary second (p50)', pct(quiet, 0.5));
row('tick, ordinary second (p95)', pct(quiet, 0.95), BUDGET.tickP95);
row('tick, with achievements/territory (max)', Math.max(...slow), BUDGET.tickP95 * 2);
const perPlayer = pct(quiet, 0.95) / (ids.length + npcs);
console.log(`  => about ${(perPlayer * 1000).toFixed(1)} microseconds of tick per commander or empire: the 250 ms budget lasts to roughly ${Math.round(BUDGET.tickP95 / perPlayer).toLocaleString('en-US')} of them`);
console.log('  where the time goes (average per tick):');
for (const [k, v] of Object.entries(prof).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(32)} ${(v / STEPS).toFixed(2).padStart(8)} ms`);
console.log('');

// ---------------------------------------------------------------- one slow job on its own
console.log('JOBS THAT RUN ON A TIMER');
time('territory recalculation (once a minute)', () => processSectors(w, now), 5, BUDGET.request * 4);
time('  of which: influence map', () => influenceMap(w), 5);

// ---------------------------------------------------------------- the invasion
console.log('\nVOID INVASION');
const inv = announceInvasion(w, now, 0);
processInvasion(w, now);
const boss = (inv.fleet.cruiser ?? 0) + (inv.fleet.battleship ?? 0) + (inv.fleet.lightFighter ?? 0);
const fighters = ids.slice(0, 40);
for (const id of fighters) {
  const p = w.players[id];
  const home = w.planets[p.planetIds[0]];
  home.fleet = { ...home.fleet, cruiser: 2000, battleship: 600 };
  try { const m = sendFleet(w, p, { fromPlanetId: home.id, to: inv.rift, ships: { cruiser: 2000, battleship: 600 }, mission: 'invade' }, now); m.arriveAt = now; m.phase = 'holding'; m.holdUntil = inv.endsAt; } catch { /* slot */ }
}
const atFront = Object.values(w.movements).filter((m) => m.mission === 'invade').length;
console.log(`Armada: ${boss.toLocaleString('en-US')} ships of three main types, ${atFront} fleets at the front`);
time('one engagement (all fleets vs the Armada)', () => engage(w, now), 1, BUDGET.engage);
const afterEngage = Object.keys(w.invasion?.fleet ?? {}).length;
void afterEngage;

// ---------------------------------------------------------------- what players ask for
console.log('\nREQUESTS');
const me = w.players[ids[0]];
const mid = w.players[ids[Math.floor(ids.length / 2)]];
time('GET /me', () => meView(w, me, now), 30, BUDGET.request);
time('GET /planets (one player, all planets)', () => me.planetIds.forEach((id) => planetView(w, w.planets[id], now)), 30, BUDGET.request);
time('GET /fleets', () => fleetsView(w, me), 30, BUDGET.request);
time('GET /galaxy/1/10', () => galaxyView(w, me, 1, 10, now), 30, BUDGET.request);
time('GET /contracts', () => contractsView(w, me, now), 30, BUDGET.request);
time('GET /automation', () => automationView(w, me), 30, BUDGET.request);
time('GET /alliance', () => allianceView(w, w.alliances[me.allianceId!], me), 30, BUDGET.request);
time('GET /sectors (whole map)', () => sectorsView(w, me.allianceId), 10, BUDGET.heavyRequest);
time('GET /invasion', () => invasionView(w, me.id, now), 10, BUDGET.request);
time('GET /highscore (rankings, forced)', () => rankings(w, true), 3, BUDGET.heavyRequest);
time('  one category', () => categoryRows(w, 'fleet', true), 3, BUDGET.heavyRequest);
time('GET /players/:id (profile, 12 category ranks)', () => profileView(w, mid.id, now), 3, BUDGET.heavyRequest);
time('points for one commander', () => playerPoints(w, me), 30);

// ---------------------------------------------------------------- persistence
console.log('\nSAVING');
const file = join(tmpdir(), 'zgame-bench-world.json');
time('JSON save (whole world)', () => saveWorld(file, w, { everyMs: Infinity, keep: 0 }), 3, BUDGET.save);
console.log(`  JSON file: ${mb(statSync(file).size)}`);
const db = new SqlStore(join(tmpdir(), `zgame-bench-${Date.now()}.sqlite`));
let r = { written: 0, deleted: 0, total: 0 };
time('SQLite first save (every row)', () => { r = db.save(w); }, 1);
console.log(`  ${r.total.toLocaleString('en-US')} rows`);
now += 1000; tick(now);
time('SQLite autosave after one more tick', () => { r = db.save(w); }, 1, BUDGET.save);
console.log(`  wrote ${r.written.toLocaleString('en-US')} changed rows of ${r.total.toLocaleString('en-US')}`);
time('SQLite autosave when nothing changed', () => { r = db.save(w); }, 3);
const loadStart = performance.now();
db.load();
row('SQLite load (server start)', performance.now() - loadStart);
db.close();

console.log(`\nmemory at the end: ${mb(process.memoryUsage().heapUsed)}`);
console.log(failed ? `\n${failed} BUDGET(S) BLOWN` : '\nall budgets met');
process.exit(failed ? 1 : 0);
