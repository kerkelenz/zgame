/** A greedy new-player bot that follows the guided objectives with the real game rules: the guard against a quest nobody can finish. */
import { register } from '../../server/accounts';
import { planetCapacity, planetProduction, processPlayer, queueBuilding, queueResearch, queueUnits } from '../../server/economy';
import { processMovements, sendFleet } from '../../server/fleet';
import { OBJECTIVES, checkProgress } from '../../server/progress';
import { createWorld, planetAt } from '../../server/world';
import { generateEmpires } from '../../server/empires';
import { BUILDINGS, TECHS, UNITS } from '../../shared/data';
import { lvl } from '../../shared/formulas';
import { playerPoints } from '../../server/galaxy';


export function runBot(speed = 20, maxDays = 20) {
  const T0 = 1_700_000_000_000;
  const w = createWorld({ economySpeed: speed, raidIntervalMin: 0, invasionIntervalHours: 0 }, T0);
  generateEmpires(w, T0);
  const p = register(w, 'newbie', 'secret1', T0).player;
  const home = w.planets[p.planetIds[0]];
  let now = T0, lastErr = '';
  const HOUR = 3_600_000;
  const fmtT = (t: number) => { const h = (t - T0) / HOUR; return h < 48 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`; };
  const step = () => { now += 30_000; p.lastSeen = now; processPlayer(w, p, now); processMovements(w, now); checkProgress(w, p, now); };
  const tryQ = (f: () => unknown) => { try { f(); return true; } catch (e) { lastErr = (e as Error).message; return false; } };

  function need(id: string, level: number): boolean {
    const isB = id in BUILDINGS;
    const def: any = isB ? (BUILDINGS as any)[id] : (TECHS as any)[id];
    for (const r of def.requires ?? []) if (!need(r.id, r.level)) return false;
    const cur = isB ? lvl(home.buildings, id as never) : lvl(p.techs, id as never);
    if (cur >= level) return true;
    if (isB) { if (!home.buildQueue && !(home.buildBacklog?.length)) tryQ(() => queueBuilding(w, p, home, id as never, now)); }
    else if (!p.research && !(p.researchBacklog?.length)) tryQ(() => queueResearch(w, p, home, id as never, now));
    return false;
  }
  const needUnit = (id: string) => ((UNITS as any)[id].requires ?? []).every((r: any) => need(r.id, r.level));
  /** when the next thing cannot be afforded because the store is too small, raise the store */
  function storage() {
    const cap = planetCapacity(w, home) as any;
    for (const [res, st] of [['metal', 'metalStorage'], ['crystal', 'crystalStorage'], ['deuterium', 'deuteriumTank']] as const) {
      if (home.resources[res] >= cap[res] * 0.9) need(st, lvl(home.buildings, st as never) + 1);
    }
  }

  const inactive = () => Object.values(w.planets).filter((pl) => w.players[pl.ownerId]?.npc?.status === 'inactive' && !pl.isMoon).sort((a, b) => Math.abs(a.coords.s - home.coords.s) - Math.abs(b.coords.s - home.coords.s));
  // a player reads the spy report and picks the weakest of the empires near home: what defends it decides whether the raid pays
  const guard = (pl: any) => Object.entries({ ...pl.fleet, ...pl.defenses }).reduce((t, [id, n]) => t + (n as number) * ((UNITS as any)[id].attack + (UNITS as any)[id].hull / 10), 0);
  let spyTarget = inactive().slice(0, 25).sort((a, b) => guard(a) - guard(b))[0];
  const done: Record<string, number> = {};
  const stuckLog: string[] = [];
  let lastProgress = now, lastCount = 0;

  function work(o: string): void {
    switch (o) {
      case 'o1': need('metalMine', 4) && need('crystalMine', 4); break;
      case 'o2': { need('solarPlant', 4); if (planetProduction(w, home).efficiency < 0.999) need('solarPlant', lvl(home.buildings, 'solarPlant') + 1); break; }
      case 'o3': need('metalMine', 8) && need('crystalMine', 7); break;
      case 'o4': need('deuteriumSynthesizer', 5); break;
      case 'o5': need('energy', 1); break;
      case 'o6': need('shipyard', 1); break;
      case 'o7': {
        if (!need('espionage', 2)) break;
        if ((home.fleet.espionageProbe || 0) < 3 && !home.shipyardQueue.length) needUnit('espionageProbe') && tryQ(() => queueUnits(w, p, home, 'espionageProbe', 3, now));
        if ((home.fleet.espionageProbe || 0) >= 3 && !Object.values(w.movements).some((m) => m.ownerId === p.id)) tryQ(() => sendFleet(w, p, { fromPlanetId: home.id, to: spyTarget.coords, ships: { espionageProbe: 3 }, mission: 'espionage' } as never, now));
        break;
      }
      case 'o8': {
        if (!needUnit('smallCargo') || !needUnit('lightFighter')) break;
        if (Object.values(w.movements).some((m) => m.ownerId === p.id)) break;
        if (!home.shipyardQueue.length && ((home.fleet.smallCargo || 0) < 6 || (home.fleet.lightFighter || 0) < 6)) { tryQ(() => queueUnits(w, p, home, (home.fleet.smallCargo || 0) < 6 ? 'smallCargo' : 'lightFighter', 6, now)); break; }
        if ((home.fleet.smallCargo || 0) >= 6 && (home.fleet.lightFighter || 0) >= 6) tryQ(() => sendFleet(w, p, { fromPlanetId: home.id, to: spyTarget.coords, ships: { smallCargo: 6, lightFighter: 6 }, mission: 'attack' } as never, now));
        break;
      }
      case 'o9': if (!home.shipyardQueue.length && (home.defenses.rocketLauncher || 0) < 20) needUnit('rocketLauncher') && tryQ(() => queueUnits(w, p, home, 'rocketLauncher', 20, now)); break;
      case 'o10': {
        if (!need('astrophysics', 1) || !needUnit('colonyShip')) break;
        if (Object.values(w.movements).some((m) => m.ownerId === p.id)) break;
        if (!home.fleet.colonyShip && !home.shipyardQueue.length) { tryQ(() => queueUnits(w, p, home, 'colonyShip', 1, now)); break; }
        if (home.fleet.colonyShip) {
          for (let s = home.coords.s; s < home.coords.s + 6; s++) for (let pp = 4; pp <= 12; pp++) { const c = { g: home.coords.g, s, p: pp }; if (!planetAt(w, c) && tryQ(() => sendFleet(w, p, { fromPlanetId: home.id, to: c, ships: { colonyShip: 1 }, mission: 'colonize' } as never, now))) return; }
        }
        break;
      }
      case 'o11': {
        if (Object.values(w.movements).some((m) => m.ownerId === p.id)) break;
        if (!home.fleet.smallCargo && !home.shipyardQueue.length) { needUnit('smallCargo') && tryQ(() => queueUnits(w, p, home, 'smallCargo', 4, now)); break; }
        if (home.fleet.smallCargo) tryQ(() => sendFleet(w, p, { fromPlanetId: home.id, to: { g: home.coords.g, s: home.coords.s, p: w.config.positions + 1 }, ships: { smallCargo: Math.min(4, home.fleet.smallCargo ?? 0) }, mission: 'expedition' } as never, now));
        break;
      }
      case 'o12': { const l = lvl(home.buildings, 'metalMine'); need('metalMine', l + 1); need('crystalMine', lvl(home.buildings, 'crystalMine') + 1); need('deuteriumSynthesizer', lvl(home.buildings, 'deuteriumSynthesizer') + 1); if (planetProduction(w, home).efficiency < 1) need('solarPlant', lvl(home.buildings, 'solarPlant') + 1); break; }
    }
  }

  /** a player who is short of something keeps the economy growing meanwhile: the mines in step, energy kept up */
  function grow() {
    if (home.buildQueue || home.buildBacklog?.length) return;
    if (planetProduction(w, home).efficiency < 1) { need('solarPlant', lvl(home.buildings, 'solarPlant') + 1); return; }
    const m = lvl(home.buildings, 'metalMine'), c = lvl(home.buildings, 'crystalMine'), d = lvl(home.buildings, 'deuteriumSynthesizer');
    if (c < m - 1) need('crystalMine', c + 1); else if (d < m - 3) need('deuteriumSynthesizer', d + 1); else need('metalMine', m + 1);
  }

  let stuck = '';
  let iter = 0;
  while (now - T0 < maxDays * 24 * HOUR) {
    iter++;
    const cur = OBJECTIVES.find((o) => !p.objectives[o.id]);
    for (const o of OBJECTIVES) if (p.objectives[o.id] && !(o.id in done)) { done[o.id] = p.objectives[o.id]; lastProgress = now; }
    if (!cur) break;
    if (iter % 4 === 0) { work(cur.id); storage(); if (cur.id !== 'o12') grow(); }
    step();
    const count = Object.keys(p.objectives).length;
    if (count !== lastCount) { lastCount = count; lastProgress = now; }
    if (now - lastProgress > 3 * 24 * HOUR) { console.log(`STUCK on ${cur.id} (${cur.name}) since ${fmtT(lastProgress)}; last error: ${lastErr}`); console.log(JSON.stringify({ b: home.buildings, t: p.techs, res: home.resources, fleet: home.fleet, q: home.buildQueue?.id, r: p.research?.id, spy: spyTarget?.coords })); break; }
  }
  return { done: Object.fromEntries(Object.entries(done).map(([k, t]) => [k, (t - T0) / HOUR])), points: playerPoints(w, p).total, stuck, hours: (now - T0) / HOUR };

}
