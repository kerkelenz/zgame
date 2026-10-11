/**
 * Writes a ready-to-play demo universe: three developed commanders in one alliance
 * (accounts alice / bob / carol, password "demo1234"), an outsider "rival", fleets and defenses.
 *
 *   npm run demo        # seeds data/demo-world.json and starts the server on it
 */
import { resolve } from 'node:path';
import { SHIP_IDS, TECH_IDS } from '../shared/data';
import { register } from './accounts';
import { createAlliance, joinAlliance, donate } from './alliance';
import { createMoon, createPlanet } from './galaxy';
import { generateEmpires } from './empires';
import { saveWorld } from './store';
import { createWorld } from './world';
import { env } from './env';

export function buildDemoWorld(now = Date.now()) {
  const w = createWorld({ economySpeed: 60, fleetSpeed: 30, protectionPoints: 100, raidIntervalMin: 20, npcDensity: 0.2 }, now);
  const names = ['alice', 'bob', 'carol', 'rival'];
  const players = names.map((n) => register(w, n, 'demo1234', now).player);
  players.forEach((p, i) => {
    const home = w.planets[p.planetIds[0]];
    home.coords = { g: 1, s: 10 + (i < 3 ? i : 12), p: 5 + i };
    for (const t of TECH_IDS) p.techs[t] = 0;
    Object.assign(p.techs, { energy: 6, combustionDrive: 6, impulseDrive: 5, computer: 4, espionage: 5, astrophysics: 3, weapons: 3, shielding: 3, armour: 3, laser: 6, ion: 4 });
    Object.assign(home.buildings, { metalMine: 14, crystalMine: 12, deuteriumSynthesizer: 10, solarPlant: 18, roboticsFactory: 6, shipyard: 8, researchLab: 8, metalStorage: 6, crystalStorage: 6, deuteriumTank: 5 });
    Object.assign(home.resources, { metal: 800_000, crystal: 500_000, deuterium: 300_000 });
    for (const s of ['smallCargo', 'largeCargo', 'lightFighter', 'cruiser', 'recycler', 'espionageProbe', 'colonyShip'] as const) home.fleet[s] = 10 + i * 5;
    home.fleet.battleship = 0;
    home.defenses = { rocketLauncher: 40, lightLaser: 20, heavyLaser: 8, ionCannon: 4 };
  });
  const [alice, bob, carol] = players;
  const ally = createAlliance(w, alice, 'DEMO', 'Demo Squad');
  joinAlliance(w, bob, ally.id);
  joinAlliance(w, carol, ally.id);
  donate(w, alice, alice.planetIds[0], { metal: 200_000, crystal: 150_000, deuterium: 80_000 }, now);
  createPlanet(w, alice, { g: 1, s: 14, p: 9 }, { name: 'Outpost', now });
  // a developed moon for alice (phalanx + gate) and a second one on the outpost for jump-gate demos
  const aliceHome = w.planets[alice.planetIds[0]];
  const outpost = w.planets[alice.planetIds[1]];
  for (const parent of [aliceHome, outpost]) {
    const moon = createMoon(w, parent, now);
    Object.assign(moon.buildings, { lunarBase: 4, sensorPhalanx: 3, jumpGate: 1, shipyard: 3, roboticsFactory: 2 });
    Object.assign(moon.resources, { metal: 100_000, crystal: 100_000, deuterium: 100_000 });
    moon.fleet = { cruiser: 5 };
  }
  alice.techs.hyperspace = 7;
  // missiles for bob
  const bobHome = w.planets[bob.planetIds[0]];
  bobHome.buildings.missileSilo = 5;
  bobHome.defenses = { ...bobHome.defenses, interplanetaryMissile: 10, antiBallisticMissile: 5 };
  alice.credits = 1500; // enough to hire a couple of officers
  alice.rep.chain = 45; // ready to join the Black Chain
  const n = generateEmpires(w, now, 20260101);
  void n;
  void SHIP_IDS;
  return w;
}

if (process.argv[1] && /seed-demo/.test(process.argv[1])) {
  const file = resolve(env('SAVE') || 'data/demo-world.json');
  saveWorld(file, buildDemoWorld());
  console.log(`Demo universe written to ${file}\nLog in as alice / bob / carol (or rival) with password "demo1234".`);
}
