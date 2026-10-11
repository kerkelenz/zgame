import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { automationView, cleanSteps, removeOrder, runAutomation, saveOrder, setRules, startPlan, stopPlan } from '../server/automation';
import { planetProduction, processPlayer } from '../server/economy';
import { sendFleet } from '../server/fleet';
import { startVacation } from '../server/vacation';
import { GameError, createWorld, type Planet, type Player, type World } from '../server/world';
import { BUILD_ORDER_TEMPLATES } from '../shared/data';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
let w: World; let a: Player, b: Player; let home: Planet;

/** advance time, letting the server tick (finish jobs, then run automation) once per simulated minute */
const run = (hours: number, from = T0) => {
  let t = from;
  for (; t < from + hours * HOUR; t += 60_000) { processPlayer(w, a, t); runAutomation(w, a, t); }
  return t;
};

beforeEach(() => {
  w = createWorld({ economySpeed: 100, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  a = register(w, 'alice', 'secret1', T0).player;
  b = register(w, 'bobby', 'secret2', T0).player;
  home = w.planets[a.planetIds[0]];
  home.buildings = {};
  home.resources = { metal: 1e7, crystal: 1e7, deuterium: 1e7 };
});

describe('build orders', () => {
  it('validate their steps', () => {
    expect(() => cleanSteps('x')).toThrow(/list of steps/);
    expect(() => cleanSteps([])).toThrow(/at least one/);
    expect(() => cleanSteps([{ kind: 'building', id: 'nope', level: 1 }])).toThrow(/Unknown building/);
    expect(() => cleanSteps([{ kind: 'tech', id: 'energy', level: 0 }])).toThrow(/1 to 60/);
    expect(() => cleanSteps([{ kind: 'ship', id: 'energy', level: 1 }])).toThrow(/building or a technology/);
    expect(() => cleanSteps(Array.from({ length: 81 }, () => ({ kind: 'building', id: 'metalMine', level: 1 })))).toThrow(/At most 80/);
    expect(cleanSteps([{ kind: 'building', id: 'metalMine', level: 3.9 }])).toEqual([{ kind: 'building', id: 'metalMine', level: 3 }]);
  });

  it('save by name (replacing), cap at twelve and delete', () => {
    const s = [{ kind: 'building', id: 'metalMine', level: 2 }];
    saveOrder(a, 'Mine', s);
    saveOrder(a, 'mine', [{ kind: 'building', id: 'metalMine', level: 5 }]);
    expect(a.buildOrders).toHaveLength(1);
    expect(a.buildOrders![0].steps[0].level).toBe(5);
    expect(() => saveOrder(a, '', s)).toThrow(/name/);
    for (let i = 0; i < 11; i++) saveOrder(a, 'o' + i, s);
    expect(() => saveOrder(a, 'too many', s)).toThrow(/At most 12/);
    removeOrder(a, a.buildOrders![0].id);
    expect(a.buildOrders).toHaveLength(11);
  });

  it('every built-in template is valid', () => {
    for (const t of BUILD_ORDER_TEMPLATES) expect(() => cleanSteps(t.steps), t.id).not.toThrow();
  });
});

describe('running a plan', () => {
  it('builds the steps in order until every level is reached, then finishes with a message', () => {
    saveOrder(a, 'Start', [{ kind: 'building', id: 'solarPlant', level: 2 }, { kind: 'building', id: 'metalMine', level: 3 }]);
    startPlan(w, a, home, { orderId: a.buildOrders![0].id }, T0);
    expect(home.buildQueue!.id).toBe('solarPlant'); // started immediately
    expect(home.plan!.status).toMatch(/Solar Plant → 1/);
    run(40);
    expect(home.buildings).toMatchObject({ solarPlant: 2, metalMine: 3 });
    expect(home.plan).toBeUndefined();
    expect(w.messages.some((m) => m.to === a.id && m.subject === 'Build order complete')).toBe(true);
    expect(a.autoLog![0].text).toMatch(/finished/);
  });

  it('waits for resources instead of dropping a step, and resumes when they arrive', () => {
    home.resources = { metal: 0, crystal: 0, deuterium: 0 };
    startPlan(w, a, home, { template: 'colony' }, T0);
    expect(home.buildQueue).toBeNull();
    expect(home.plan!.status).toMatch(/waiting for resources: Solar Plant 1/);
    expect(w.messages.some((m) => /dropped/.test(m.subject))).toBe(false);
    home.resources = { metal: 0, crystal: 0, deuterium: 0 };
    run(1);                                   // only the free basic income trickles in: it is enough for a first step, never for losing one
    expect(home.plan).toBeDefined();
    expect(w.messages.some((m) => /dropped/.test(m.subject))).toBe(false);
    home.resources = { metal: 1e7, crystal: 1e7, deuterium: 1e7 };
    run(60, T0 + HOUR);
    expect(home.buildings.solarPlant).toBe(5);
    expect(home.plan).toBeUndefined();
  });

  it('adds missing prerequisites by itself', () => {
    saveOrder(a, 'Yard', [{ kind: 'building', id: 'shipyard', level: 1 }]);
    startPlan(w, a, home, { orderId: a.buildOrders![0].id }, T0);
    run(40);
    expect(home.buildings.roboticsFactory).toBeGreaterThanOrEqual(2);
    expect(home.buildings.shipyard).toBe(1);
    expect(home.plan).toBeUndefined();
    expect(a.autoLog!.some((l) => /added Robotics Factory 2/.test(l.text))).toBe(true);
  });

  it('runs research in its own lane alongside the buildings', () => {
    saveOrder(a, 'Sci', [{ kind: 'building', id: 'researchLab', level: 1 }, { kind: 'tech', id: 'energy', level: 1 }, { kind: 'building', id: 'solarPlant', level: 2 }]);
    startPlan(w, a, home, { orderId: a.buildOrders![0].id }, T0);
    run(60);
    expect(a.techs.energy).toBe(1);
    expect(home.buildings).toMatchObject({ researchLab: 1, solarPlant: 2 });
    expect(home.plan).toBeUndefined();
  });

  it('does not touch a queue the player filled by hand', () => {
    saveOrder(a, 'Mines', [{ kind: 'building', id: 'metalMine', level: 1 }]);
    home.buildQueue = { id: 'solarPlant', level: 1, start: T0, end: T0 + 10 * HOUR, cost: { metal: 0, crystal: 0, deuterium: 0 } };
    startPlan(w, a, home, { orderId: a.buildOrders![0].id }, T0);
    expect(home.buildQueue.id).toBe('solarPlant');
    expect(home.plan!.status).toMatch(/waiting for the queue/);
  });

  it('can be stopped, is skipped on vacation, and stays on its planet', () => {
    startPlan(w, a, home, { template: 'colony' }, T0);
    stopPlan(a, home, T0);
    expect(home.plan).toBeUndefined();
    expect(() => stopPlan(a, home, T0)).toThrow(/No build order/);
    const other = w.planets[b.planetIds[0]];
    expect(() => startPlan(w, a, other, { template: 'colony' }, T0)).toThrow(GameError);
    expect(() => startPlan(w, a, home, { template: 'nope' }, T0)).toThrow(/Unknown template/);
    startPlan(w, a, home, { template: 'colony' }, T0);
    home.buildQueue = null; home.buildings = {};
    startVacation(w, a, T0 + 1);
    expect(a.vacation).toBeTruthy();
    runAutomation(w, a, T0 + HOUR);
    expect(home.buildQueue).toBeNull();
  });

  it('is described in the automation view', () => {
    startPlan(w, a, home, { template: 'colony' }, T0);
    const v = automationView(w, a);
    expect(v.plans).toHaveLength(1);
    expect(v.plans[0]).toMatchObject({ planet: home.name, name: 'Colony starter' });
    expect(v.plans[0].steps[0]).toMatchObject({ name: 'Solar Plant', done: false });
    expect(v.templates.length).toBeGreaterThanOrEqual(3);
  });
});

describe('automation rules', () => {
  it('validate their settings', () => {
    expect(() => setRules(a, { defense: { unit: 'smallCargo' } })).toThrow(/defense/);
    expect(() => setRules(a, { defense: { unit: 'interplanetaryMissile' } })).toThrow(/defense/);
    const r = setRules(a, { energy: true, defense: { on: true, unit: 'lightLaser', count: 9999, maxSharePct: 0 } });
    expect(r).toMatchObject({ energy: true, storage: false, defense: { on: true, unit: 'lightLaser', count: 1000, maxSharePct: 1 } });
  });

  it('build a solar plant when energy runs short', () => {
    home.buildings = { metalMine: 10 };
    expect(planetProduction(w, home).energyProduced).toBeLessThan(planetProduction(w, home).energyUsed);
    runAutomation(w, a, T0);
    expect(home.buildQueue).toBeNull(); // off by default
    setRules(a, { energy: true });
    runAutomation(w, a, T0);
    expect(home.buildQueue?.id).toBe('solarPlant');
    expect(a.autoLog![0].text).toMatch(/Energy was short/);
  });

  it('upgrade storage that is nearly full', () => {
    setRules(a, { storage: true });
    const cap = { metal: 1e6 * 100 * 5 };
    void cap;
    home.resources = { metal: 1e12, crystal: 0, deuterium: 0 };
    runAutomation(w, a, T0);
    expect(home.buildQueue?.id).toBe('metalStorage');
  });

  it('never start while another job is running on the planet', () => {
    setRules(a, { energy: true });
    home.buildings = { metalMine: 10 };
    home.buildQueue = { id: 'metalMine', level: 11, start: T0, end: T0 + HOUR, cost: { metal: 0, crystal: 0, deuterium: 0 } };
    runAutomation(w, a, T0);
    expect(home.buildQueue.id).toBe('metalMine');
  });

  describe('defense', () => {
    const attack = () => {
      const bp = w.planets[b.planetIds[0]];
      bp.coords = { g: 1, s: 7, p: 3 }; bp.fleet = { cruiser: 5 }; bp.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
      b.techs = { combustionDrive: 6, computer: 4 };
      home.coords = { g: 1, s: 9, p: 4 };
      return sendFleet(w, b, { fromPlanetId: bp.id, to: home.coords, ships: { cruiser: 2 }, mission: 'attack' }, T0);
    };
    beforeEach(() => { home.buildings = { shipyard: 4, roboticsFactory: 4 }; });

    it('queue defenses once per incoming fleet, within the spending limit', () => {
      setRules(a, { defense: { on: true, unit: 'rocketLauncher', count: 50, maxSharePct: 10 } });
      home.resources = { metal: 1_000_000, crystal: 0, deuterium: 0 };
      const m = attack();
      runAutomation(w, a, T0 + 1000);
      const queued = home.shipyardQueue[0];
      expect(queued.id).toBe('rocketLauncher');
      expect(queued.total).toBe(50); // a rocket launcher costs 2,000 metal: 10% of 1M allows 50, count caps at 50
      expect(Math.abs(home.resources.metal - (1_000_000 - 50 * 2000))).toBeLessThan(100); // a few seconds of free income may have arrived
      runAutomation(w, a, T0 + 2000);
      expect(home.shipyardQueue).toHaveLength(1); // the same fleet does not trigger it twice
      expect(a.autoSeen![m.id]).toBeTruthy();
      expect(w.messages.some((x) => x.to === a.id && x.subject === 'Automation built defenses')).toBe(true);
    });

    it('respects the spending limit, and says so when it allows nothing', () => {
      setRules(a, { defense: { on: true, unit: 'rocketLauncher', count: 500, maxSharePct: 5 } });
      home.resources = { metal: 100_000, crystal: 0, deuterium: 0 };
      attack();
      runAutomation(w, a, T0 + 1000);
      expect(home.shipyardQueue[0].total).toBe(2); // 5% of 100k = 5k = 2 launchers
      const lowId = Object.keys(w.movements)[0];
      delete w.movements[lowId]; a.autoSeen = {};
      home.shipyardQueue = []; home.resources = { metal: 1000, crystal: 0, deuterium: 0 };
      attack();
      runAutomation(w, a, T0 + 2000);
      expect(home.shipyardQueue).toHaveLength(0);
      expect(a.autoLog![0].text).toMatch(/allows no Rocket Launcher/);
    });

    it('stay off unless switched on', () => {
      attack();
      runAutomation(w, a, T0 + 1000);
      expect(home.shipyardQueue).toHaveLength(0);
    });
  });
});
