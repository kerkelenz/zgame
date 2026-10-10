/**
 * Balance probe: a greedy bot plays one fresh account at the default universe speeds and prints when it hits milestones.
 *   npx tsx server/balance-sim.ts [hours] [economySpeed]
 */
import { BUILDINGS, TECHS, UNITS } from '../shared/data';
import { DEFAULT_CONFIG } from '../shared/config';
import { buildingCost, canAfford, lvl, techCost, totalRes } from '../shared/formulas';
import type { BuildingId, TechId, UnitId } from '../shared/types';
import { register } from './accounts';
import { planetCapacity, planetProduction, processPlayer, queueUnits, requirementsMet, startBuilding, startResearch } from './economy';
import { playerPoints } from './galaxy';
import { GameError, createWorld } from './world';

const hours = Number(process.argv[2] || 72);
const speed = Number(process.argv[3] || DEFAULT_CONFIG.economySpeed);
const T0 = Date.UTC(2026, 0, 1);
const w = createWorld({ economySpeed: speed, raidIntervalMin: 0 }, T0);
const me = register(w, 'bot', 'password1', T0).player;
const home = w.planets[me.planetIds[0]];

const milestones: Record<string, number> = {};
const mark = (name: string, now: number) => { if (!(name in milestones)) milestones[name] = (now - T0) / 3_600_000; };

const buildOrder: BuildingId[] = [
  'metalMine', 'solarPlant', 'metalMine', 'crystalMine', 'solarPlant', 'crystalMine', 'metalMine', 'deuteriumSynthesizer',
  'solarPlant', 'roboticsFactory', 'roboticsFactory', 'metalMine', 'crystalMine', 'researchLab', 'shipyard', 'solarPlant',
];

function cheapestUseful(now: number): BuildingId | null {
  const prod = planetProduction(w, home);
  // energy first
  if (prod.efficiency < 1 || prod.energyProduced - prod.energyUsed < 40) return 'solarPlant';
  const cap = planetCapacity(w, home);
  for (const [k, id] of [['metal', 'metalStorage'], ['crystal', 'crystalStorage'], ['deuterium', 'deuteriumTank']] as const) {
    if (home.resources[k] > cap[k] * 0.9) return id;
  }
  // otherwise follow a ratio-based mine ladder
  const m = lvl(home.buildings, 'metalMine'), c = lvl(home.buildings, 'crystalMine'), d = lvl(home.buildings, 'deuteriumSynthesizer');
  const r = lvl(home.buildings, 'roboticsFactory');
  const candidates: [number, BuildingId][] = [[m + 0, 'metalMine'], [c * 1.5 + 1, 'crystalMine'], [d * 2 + 3, 'deuteriumSynthesizer'], [r * 3 + 4, 'roboticsFactory']];
  candidates.sort((a, b) => a[0] - b[0]);
  void now;
  return candidates[0][1];
}

let steps = 0;
for (let now = T0; now < T0 + hours * 3_600_000; now += 30_000) {
  steps++;
  if (process.env.TRACE && steps % 720 === 1) console.log(((now - T0) / 3.6e6).toFixed(0) + 'h', JSON.stringify({ r: Object.fromEntries(Object.entries(home.resources).map(([k, v]) => [k, Math.round(v)])), q: home.buildQueue?.id, res: me.research?.id, b: home.buildings }));
  processPlayer(w, me, now);
  // early scripted opener, then heuristics
  const level = (id: BuildingId) => lvl(home.buildings, id);
  if (!home.buildQueue) {
    let pick: BuildingId | null = null;
    if (level('researchLab') < 1 && level('metalMine') >= 6 && level('crystalMine') >= 4) pick = 'researchLab';
    else if (level('shipyard') < 1 && level('roboticsFactory') >= 2 && level('researchLab') >= 1) pick = 'shipyard';
    else if (level('shipyard') >= 1 && level('shipyard') < 4 && level('metalMine') >= 10) pick = 'shipyard';
    else if (level('researchLab') >= 1 && level('researchLab') < 5 && level('crystalMine') >= 8) pick = 'researchLab';
    else if (level('missileSilo') < 1 && level('shipyard') >= 4 && level('metalMine') >= 14) pick = 'missileSilo';
    else pick = cheapestUseful(now);
    if (pick) {
      // can never afford it? raise the storage cap first (what a human would do)
      const cost = buildingCost(pick, level(pick) + 1);
      const caps = planetCapacity(w, home);
      if (cost.metal > caps.metal) pick = 'metalStorage';
      else if (cost.crystal > caps.crystal) pick = 'crystalStorage';
      else if (cost.deuterium > caps.deuterium) pick = 'deuteriumTank';
    }
    if (pick) {
      try { startBuilding(w, me, home, pick, now); } catch (e) { if (!(e instanceof GameError)) throw e; if (process.env.TRACE && steps % 720 === 1) console.log('  build', pick, 'failed:', e.message); }
    }
  }
  if (!me.research && level('researchLab') >= 1) {
    const wanted: TechId[] = ['energy', 'combustionDrive', 'computer', 'impulseDrive', 'espionage', 'armour', 'weapons', 'shielding', 'laser', 'ion', 'astrophysics'];
    for (const t of wanted) {
      const targets: Partial<Record<TechId, number>> = { energy: 3, combustionDrive: 3, computer: 3, impulseDrive: 3, espionage: 4, armour: 3, weapons: 3, shielding: 3, laser: 5, ion: 4, astrophysics: 2 };
      const target = targets[t] ?? 0;
      if (lvl(me.techs, t) >= target) continue;
      if (!requirementsMet(home, me, TECHS[t].requires)) continue;
      if (!canAfford(home.resources, techCost(t, lvl(me.techs, t) + 1))) continue;
      try { startResearch(w, me, home, t, now); break; } catch (e) { if (!(e instanceof GameError)) throw e; }
    }
  }
  if (level('shipyard') >= 2 && level('metalMine') >= 14 && level('crystalMine') >= 10 && home.shipyardQueue.length === 0) {
    for (const u of ['smallCargo', 'lightFighter'] as UnitId[]) {
      if (!requirementsMet(home, me, UNITS[u].requires)) continue;
      try { queueUnits(w, me, home, u, 1, now); break; } catch (e) { if (!(e instanceof GameError)) throw e; }
    }
  }

  const bl = (id: BuildingId, l: number) => level(id) >= l && mark(`${BUILDINGS[id].name} ${l}`, now);
  void bl;
  for (const [id, l] of [['metalMine', 5], ['metalMine', 10], ['metalMine', 15], ['metalMine', 20], ['crystalMine', 10], ['deuteriumSynthesizer', 10], ['roboticsFactory', 5], ['shipyard', 4], ['researchLab', 5], ['missileSilo', 1]] as [BuildingId, number][]) {
    if (level(id) >= l) mark(`${BUILDINGS[id].name} ${l}`, now);
  }
  for (const [t, l] of [['energy', 3], ['combustionDrive', 3], ['impulseDrive', 3], ['astrophysics', 2]] as [TechId, number][]) {
    if (lvl(me.techs, t) >= l) mark(`${TECHS[t].name} ${l}`, now);
  }
  if ((home.fleet.smallCargo || 0) >= 1) mark('first small cargo', now);
  if ((home.fleet.lightFighter || 0) >= 5) mark('5 light fighters', now);
}

const pts = playerPoints(w, me);
const p = planetProduction(w, home);
console.log(`economy x${speed}, ${hours}h simulated (${steps} steps)`);
for (const [k, v] of Object.entries(milestones).sort((a, b) => a[1] - b[1])) console.log(`${v.toFixed(2).padStart(7)} h  ${k}`);
console.log(`final points ${pts.total} (B ${pts.buildings} R ${pts.research} F ${pts.fleet}); production/h M ${Math.round(p.metal)} C ${Math.round(p.crystal)} D ${Math.round(p.deuterium)}`);
console.log(`buildings: ${JSON.stringify(home.buildings)}`);
void buildingCost; void totalRes;
