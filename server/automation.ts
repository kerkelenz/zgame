import { BUILDINGS, BUILD_ORDER_TEMPLATES, TECHS, UNITS, resName } from '../shared/data';
import { lvl } from '../shared/formulas';
import type { BuildingId, Requirement, TechId, UnitId } from '../shared/types';
import { planetCapacity, planetProduction, queueUnits, requirementsMet, startBuilding, startResearch } from './economy';
import { notifyPlayer } from './messages';
import { onVacation } from './vacation';
import { GameError, uid, type AutoRules, type BuildOrder, type BuildStep, type Planet, type Player, type World } from './world';

const MAX_STEPS = 80;
const MAX_ORDERS = 12;
const LOG_MAX = 30;
const STORAGE_OF = { metal: 'metalStorage', crystal: 'crystalStorage', deuterium: 'deuteriumTank' } as const;

export const defaultRules = (): AutoRules => ({ energy: false, storage: false, defense: { on: false, unit: 'rocketLauncher', count: 20, maxSharePct: 25 } });

const nameOf = (s: { kind: string; id: string }) => (s.kind === 'building' ? BUILDINGS[s.id as BuildingId]?.name : TECHS[s.id as TechId]?.name) ?? s.id;
const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');

function log(p: Player, text: string, now: number) {
  const l = (p.autoLog ||= []);
  l.unshift({ at: now, text });
  if (l.length > LOG_MAX) l.length = LOG_MAX;
}

// ------------------------------------------------------------------ validation and storage of orders
export function cleanSteps(raw: unknown): BuildStep[] {
  if (!Array.isArray(raw)) throw new GameError('A build order needs a list of steps');
  if (raw.length < 1) throw new GameError('Add at least one step');
  if (raw.length > MAX_STEPS) throw new GameError(`At most ${MAX_STEPS} steps`);
  return raw.map((s) => {
    const kind = s?.kind === 'tech' ? 'tech' : s?.kind === 'building' ? 'building' : null;
    const id = String(s?.id ?? '');
    const level = Math.floor(Number(s?.level));
    if (!kind) throw new GameError('Every step is a building or a technology');
    if (!Object.hasOwn(kind === 'building' ? BUILDINGS : TECHS, id)) throw new GameError(`Unknown ${kind} ${id}`);
    if (!(level >= 1 && level <= 60)) throw new GameError('Levels run from 1 to 60');
    return { kind, id, level } as BuildStep;
  });
}

export function saveOrder(p: Player, name: string, steps: unknown): BuildOrder {
  name = (name || '').trim().slice(0, 30);
  if (!name) throw new GameError('Give the build order a name');
  const clean = cleanSteps(steps);
  const list = (p.buildOrders ||= []);
  const same = list.find((o) => o.name.toLowerCase() === name.toLowerCase());
  if (same) { same.name = name; same.steps = clean; return same; }
  if (list.length >= MAX_ORDERS) throw new GameError(`At most ${MAX_ORDERS} saved build orders`);
  const o = { id: uid(3), name, steps: clean };
  list.push(o);
  return o;
}
export function removeOrder(p: Player, id: string) { p.buildOrders = p.buildOrders?.filter((o) => o.id !== id); }

// ------------------------------------------------------------------ plans (a build order running on one planet)
export function startPlan(w: World, p: Player, planet: Planet, src: { orderId?: string; template?: string }, now: number) {
  if (planet.ownerId !== p.id) throw new GameError('Not your planet', 403);
  if (onVacation(p)) throw new GameError('You are in vacation mode');
  let name: string, steps: BuildStep[];
  if (src.template) {
    const t = BUILD_ORDER_TEMPLATES.find((x) => x.id === src.template);
    if (!t) throw new GameError('Unknown template', 404);
    name = t.name; steps = cleanSteps(t.steps);
  } else {
    const o = p.buildOrders?.find((x) => x.id === src.orderId);
    if (!o) throw new GameError('Unknown build order', 404);
    name = o.name; steps = cleanSteps(o.steps);
  }
  planet.plan = { name, steps, status: 'Starting…', startedAt: now, added: 0 };
  log(p, `Started "${name}" on ${planet.name}.`, now);
  runPlan(w, p, planet, now);
}
export function stopPlan(p: Player, planet: Planet, now: number) {
  if (planet.ownerId !== p.id) throw new GameError('Not your planet', 403);
  if (!planet.plan) throw new GameError('No build order is running here');
  log(p, `Stopped "${planet.plan.name}" on ${planet.name}.`, now);
  planet.plan = undefined;
}

const levelOf = (planet: Planet, p: Player, s: BuildStep) => (s.kind === 'building' ? lvl(planet.buildings, s.id as BuildingId) : lvl(p.techs, s.id as TechId));
const unmetReq = (planet: Planet, p: Player, reqs: Requirement[]) => reqs.find((r) => (r.id in BUILDINGS ? lvl(planet.buildings, r.id as BuildingId) : lvl(p.techs, r.id as TechId)) < r.level);

/** One step forward: start the next building and the next research when their lanes are free. Never drops anything: what cannot be paid waits. */
function runPlan(w: World, p: Player, planet: Planet, now: number) {
  const plan = planet.plan;
  if (!plan) return;
  const pending = plan.steps.filter((s) => levelOf(planet, p, s) < s.level);
  if (!pending.length) {
    notifyPlayer(w, p.id, 'system', 'Build order complete', `"${plan.name}" is finished on ${planet.name}.`);
    log(p, `"${plan.name}" finished on ${planet.name}.`, now);
    planet.plan = undefined;
    return;
  }
  const notes: string[] = [];
  const lane = (kind: 'building' | 'tech') => {
    const step = pending.find((s) => s.kind === kind);
    if (!step) return;
    const busy = kind === 'building' ? planet.buildQueue || planet.buildBacklog?.length : p.research || p.researchBacklog?.length;
    const next = levelOf(planet, p, step) + 1;
    if (busy) {
      const running = kind === 'building' ? planet.buildQueue : p.research;
      notes.push(running?.id === step.id ? `${nameOf(step)} → ${running.level}` : `waiting for the queue before ${nameOf(step)} ${next}`);
      return;
    }
    try {
      if (kind === 'building') startBuilding(w, p, planet, step.id as BuildingId, now);
      else startResearch(w, p, planet, step.id as TechId, now);
      notes.push(`${nameOf(step)} → ${next}`);
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      if (e.message.startsWith('Not enough resources')) { notes.push(`waiting for resources: ${nameOf(step)} ${next}`); return; }
      if (e.message === 'Requirements not met') {
        const def = kind === 'building' ? BUILDINGS[step.id as BuildingId] : TECHS[step.id as TechId];
        const miss = def && !requirementsMet(planet, p, def.requires) ? unmetReq(planet, p, def.requires) : undefined;
        if (miss && plan.steps.length < MAX_STEPS) {
          const add: BuildStep = { kind: miss.id in BUILDINGS ? 'building' : 'tech', id: miss.id, level: miss.level };
          plan.steps.splice(plan.steps.indexOf(step), 0, add);
          plan.added++;
          log(p, `${plan.name}: added ${nameOf(add)} ${add.level} (needed for ${nameOf(step)}).`, now);
          notes.push(`added prerequisite ${nameOf(add)} ${add.level}`);
          return;
        }
      }
      notes.push(`blocked at ${nameOf(step)} ${next}: ${e.message}`);
    }
  };
  lane('building');
  lane('tech');
  plan.status = notes.join(' · ');
}

// ------------------------------------------------------------------ automation rules
export function setRules(p: Player, patch: { energy?: boolean; storage?: boolean; defense?: Partial<AutoRules['defense']> }): AutoRules {
  const r = (p.autoRules ||= defaultRules());
  if (typeof patch.energy === 'boolean') r.energy = patch.energy;
  if (typeof patch.storage === 'boolean') r.storage = patch.storage;
  const d = patch.defense;
  if (d) {
    if (typeof d.on === 'boolean') r.defense.on = d.on;
    if (d.unit !== undefined) {
      const u = UNITS[d.unit as UnitId];
      if (!Object.hasOwn(UNITS, d.unit) || !u || u.kind !== 'defense' || u.missile) throw new GameError('Pick a defense to build');
      r.defense.unit = d.unit;
    }
    if (d.count !== undefined) r.defense.count = Math.min(1000, Math.max(1, Math.floor(Number(d.count)) || 1));
    if (d.maxSharePct !== undefined) r.defense.maxSharePct = Math.min(100, Math.max(1, Math.floor(Number(d.maxSharePct)) || 1));
  }
  return r;
}

function runRules(w: World, p: Player, planet: Planet, now: number) {
  const rules = p.autoRules;
  if (!rules) return;
  const queueFree = !planet.buildQueue && !planet.buildBacklog?.length;
  if (rules.energy && queueFree && !planet.isMoon) {
    const prod = planetProduction(w, planet);
    if (prod.energyProduced < prod.energyUsed) {
      try { startBuilding(w, p, planet, 'solarPlant', now); log(p, `Energy was short on ${planet.name}: building a Solar Plant.`, now); return; } catch (e) { if (!(e instanceof GameError)) throw e; }
    }
  }
  if (rules.storage && !planet.isMoon && !planet.buildQueue && !planet.buildBacklog?.length) {
    const cap = planetCapacity(w, planet);
    for (const k of ['metal', 'crystal', 'deuterium'] as const) {
      if (cap[k] > 0 && planet.resources[k] >= cap[k] * 0.9) {
        try { startBuilding(w, p, planet, STORAGE_OF[k], now); log(p, `${resName(k)} was nearly full on ${planet.name}: upgrading its storage.`, now); return; } catch (e) { if (!(e instanceof GameError)) throw e; }
      }
    }
  }
}

/** Reaction to incoming attacks: build defenses, once per incoming fleet and only within the spending limit. */
function runDefenseRule(w: World, p: Player, now: number) {
  const d = p.autoRules?.defense;
  if (!d?.on) return;
  const seen = (p.autoSeen ||= {});
  const mine = new Map(p.planetIds.map((id) => [id, w.planets[id]] as const).filter(([, pl]) => !!pl));
  for (const m of Object.values(w.movements)) {
    if (m.ownerId === p.id || m.phase !== 'outbound' || !['attack', 'destroy', 'missile'].includes(m.mission) || seen[m.id]) continue;
    const planet = [...mine.values()].find((pl) => !!pl.isMoon === !!m.toMoon && pl.coords.g === m.to.g && pl.coords.s === m.to.s && pl.coords.p === m.to.p);
    if (!planet) continue;
    seen[m.id] = now;
    const cost = UNITS[d.unit as UnitId].cost;
    const share = d.maxSharePct / 100;
    const n = Math.min(d.count, ...(['metal', 'crystal', 'deuterium'] as const).map((k) => (cost[k] > 0 ? Math.floor((planet.resources[k] * share) / cost[k]) : Infinity)));
    if (!(n >= 1)) { log(p, `A fleet is heading for ${planet.name}, but your limit allows no ${UNITS[d.unit as UnitId].name}.`, now); continue; }
    try {
      queueUnits(w, p, planet, d.unit as UnitId, n, now);
      log(p, `Hostile fleet inbound to ${planet.name}: queued ${fmtN(n)} ${UNITS[d.unit as UnitId].name}.`, now);
      notifyPlayer(w, p.id, 'system', 'Automation built defenses', `A fleet from ${m.ownerName} is heading for ${planet.name}; your rule queued ${fmtN(n)} ${UNITS[d.unit as UnitId].name}.`);
    } catch (e) { if (!(e instanceof GameError)) throw e; log(p, `Could not build defenses on ${planet.name}: ${e.message}`, now); }
  }
  for (const id of Object.keys(seen)) if (!w.movements[id] && now - seen[id] > 3_600_000) delete seen[id];
}

/** Called every server tick (and by tests): runs the build orders and rules of one player. */
export function runAutomation(w: World, p: Player, now: number) {
  if (p.npc || p.vacation) return;
  for (const pid of p.planetIds) {
    const planet = w.planets[pid];
    if (!planet) continue;
    runRules(w, p, planet, now);       // energy and storage first: they keep the economy alive
    if (planet.plan) runPlan(w, p, planet, now);
  }
  runDefenseRule(w, p, now);
}

// ------------------------------------------------------------------ view
export function automationView(w: World, p: Player) {
  return {
    templates: BUILD_ORDER_TEMPLATES,
    orders: p.buildOrders ?? [],
    rules: p.autoRules ?? defaultRules(),
    log: p.autoLog ?? [],
    plans: p.planetIds.map((id) => w.planets[id]).filter((pl) => pl?.plan).map((pl) => ({
      planetId: pl.id, planet: pl.name, name: pl.plan!.name, status: pl.plan!.status, added: pl.plan!.added,
      steps: pl.plan!.steps.map((s) => ({ ...s, name: nameOf(s), have: levelOf(pl, p, s), done: levelOf(pl, p, s) >= s.level })),
    })),
    defenses: Object.values(UNITS).filter((u) => u.kind === 'defense' && !u.missile).map((u) => ({ id: u.id, name: u.name })),
  };
}
