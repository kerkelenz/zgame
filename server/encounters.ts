import { makeRng, simulateCombat, type Rng } from '../shared/combat';
import { UNITS, isStationary, resName } from '../shared/data';
import { lvl } from '../shared/formulas';
import type { Fleet, Res, ShipId, UnitId } from '../shared/types';
import { bus } from './bus';
import { planetProduction, updatePlanet } from './economy';
import { combatant, onlyDefs, onlyShips } from './fleet';
import { notifyPlayer } from './messages';
import { RAID_MIX, buyUnits, tierOf } from './npcunits';
import { onVacation } from './vacation';
import { GameError, uid, type Planet, type Player, type World } from './world';

const MIN = 60_000;
type ResKey = 'metal' | 'crystal' | 'deuterium';
const KEYS: ResKey[] = ['metal', 'crystal', 'deuterium'];

/**
 * Encounters: now and then, while a commander is actually playing, something turns up at one of their planets: a ship in distress, a wandering
 * trader, an anomaly, a small pirate patrol, a lucky find. Only that commander sees it, it waits 10 to 20 minutes, and they choose what to do.
 * Rewards are an hour or two of the planet's production (more for the lucky, less for the careless), never enough to change the game.
 */
export type EncounterKind = 'distress' | 'merchant' | 'anomaly' | 'raid' | 'find';
export interface EncounterOption { id: string; label: string; hint: string }
export interface Encounter {
  id: string; kind: EncounterKind; planetId: string; createdAt: number; expiresAt: number;
  title: string; text: string; options: EncounterOption[];
  /** what the commander has not been told: the true nature of a distress call, the exact offer of a trader */
  data: Record<string, any>;
}
export interface EventState { /** milliseconds of active play since the last encounter */ clock: number; /** how much play brings the next one */ next: number; last: number; /** when the clock last ran for this commander */ tickAt?: number; lastKind?: EncounterKind; current?: Encounter; done: number }

export const ENCOUNTER = {
  /** a commander counts as playing when the game talked to the server this recently (the open page does every 15 s) */
  activeMs: 3 * MIN,
  /** the card waits this long, in minutes */
  lifeMin: 10, lifeMax: 20,
  /** hours of the planet's production that rewards are made of, with a floor for planets that make little (resources, before the economy speed factor) */
  floor: { metal: 2000, crystal: 1000, deuterium: 400 },
  weights: { distress: 25, merchant: 20, anomaly: 20, raid: 15, find: 20 } as Record<EncounterKind, number>,
  /** a raid needs something worth defending; below this (value of ships and defenses on the planet) there is no fight to offer */
  fightMin: 20_000,
};

const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
const resText = (r: Res) => KEYS.filter((k) => r[k] >= 1).map((k) => `${fmtN(r[k])} ${resName(k)}`).join(', ') || 'nothing';
const speedFloor = (w: World) => Math.sqrt(Math.max(1, w.config.economySpeed));
const state = (p: Player): EventState => (p.events ??= { clock: 0, next: 0, last: 0, done: 0 });

/** hours of this planet's production, but at least a floor, per resource */
function worth(w: World, planet: Planet, hours: Partial<Record<ResKey, number>>): Res {
  const prod = planetProduction(w, planet), f = speedFloor(w);
  const out: Res = { metal: 0, crystal: 0, deuterium: 0 };
  for (const k of KEYS) if (hours[k]) out[k] = Math.floor(Math.max(ENCOUNTER.floor[k] * f * (hours[k]! / 1.5), Math.max(0, prod[k]) * hours[k]!));
  return out;
}
const give = (w: World, planet: Planet, r: Res, now: number) => { updatePlanet(w, planet, now); for (const k of KEYS) planet.resources[k] += r[k]; };
const take = (planet: Planet, r: Res) => { for (const k of KEYS) planet.resources[k] = Math.max(0, planet.resources[k] - r[k]); };
const has = (planet: Planet, r: Res) => KEYS.every((k) => planet.resources[k] >= r[k]);
const pick = <T,>(rng: Rng, list: T[]) => list[Math.floor(rng() * list.length)];
const strength = (planet: Planet) => {
  let v = 0;
  for (const [id, n] of Object.entries(planet.fleet)) if (n && UNITS[id as ShipId].attack > 1 && !isStationary(id)) v += n * (UNITS[id as ShipId].cost.metal + UNITS[id as ShipId].cost.crystal);
  for (const [id, n] of Object.entries(planet.defenses)) if (n && !UNITS[id as UnitId].missile) v += n * (UNITS[id as UnitId].cost.metal + UNITS[id as UnitId].cost.crystal);
  return v;
};

// ------------------------------------------------------------------ making one

function make(w: World, p: Player, planet: Planet, kind: EncounterKind, now: number, rng: Rng): Encounter {
  const life = (ENCOUNTER.lifeMin + rng() * (ENCOUNTER.lifeMax - ENCOUNTER.lifeMin)) * MIN;
  const base = { id: uid(), kind, planetId: planet.id, createdAt: now, expiresAt: now + life };
  const ignore: EncounterOption = { id: 'ignore', label: 'Ignore it', hint: 'Nothing happens.' };
  switch (kind) {
    case 'distress': {
      const real = rng() < 0.75;
      const cost = worth(w, planet, { deuterium: 0.3 });
      const reward = worth(w, planet, { metal: 1, crystal: 1, deuterium: 0.5 });
      const probes = (planet.fleet.espionageProbe ?? 0) > 0;
      return { ...base, title: 'Distress signal', text: `A weak distress call is coming from just outside ${planet.name}: a freighter with a failing drive, asking for a tow. It could also be bait.`,
        options: [
          { id: 'rescue', label: 'Send a rescue', hint: `Costs about ${resText(cost)} of fuel. Probably worth it.` },
          ...(probes ? [{ id: 'scan', label: 'Scan it with a probe first', hint: 'Tells you whether it is real. Costs nothing.' }] : []),
          ignore,
        ], data: { real, cost, reward, scanned: false } };
    }
    case 'merchant': {
      const g = pick(rng, KEYS), r = pick(rng, KEYS.filter((k) => k !== g));
      const prodG = worth(w, planet, { [g]: 1.2 } as Partial<Record<ResKey, number>>)[g];
      const rate = 1.3;
      const TV = { metal: 1, crystal: 1.5, deuterium: 3 } as const;
      const getAmt = Math.floor((prodG * TV[g]) / TV[r] * rate);
      return { ...base, title: 'A wandering trader', text: `A trader's ship has dropped out of hyperspace above ${planet.name} with a short-lived offer: ${fmtN(prodG)} ${resName(g)} from you for ${fmtN(getAmt)} ${resName(r)}, a better rate than any merchant gives.`,
        options: [
          { id: 'accept', label: 'Take the deal', hint: `You give ${fmtN(prodG)} ${resName(g)} and get ${fmtN(getAmt)} ${resName(r)}.` },
          { id: 'haggle', label: 'Haggle for more', hint: 'Even odds: a much better rate, or he flies off.' },
          { id: 'decline', label: 'Decline', hint: 'He moves on.' },
        ], data: { g, r, giveAmt: prodG, getAmt, TV } };
    }
    case 'anomaly':
      return { ...base, title: 'A strange signal', text: `Sensors at ${planet.name} picked up an anomaly in orbit: a faint, regular pulse from something drifting there. Studying it could pay off, or not.`,
        options: [
          { id: 'study', label: 'Study it', hint: 'Usually a find; now and then it bites back a little.' },
          { id: 'leave', label: 'Leave it alone', hint: 'It drifts away.' },
        ], data: {} };
    case 'raid': {
      const value = strength(planet), canFight = value >= ENCOUNTER.fightMin;
      const pay = worth(w, planet, { metal: 0.5, crystal: 0.25 });
      return { ...base, title: 'Pirate patrol', text: `A small pirate patrol has appeared over ${planet.name} and is demanding a toll before it moves on.${canFight ? ' Your defenses are ready to teach them a lesson.' : ' There is nothing here to fight them with.'}`,
        options: [
          ...(canFight ? [{ id: 'fight', label: 'Fight them', hint: 'A fair fight against ships worth about half of your defense here. Winners keep the wreckage as loot.' }] : []),
          { id: 'pay', label: 'Pay the toll', hint: `${resText(pay)}, and they leave.` },
        ], data: { pay, value } };
    }
    case 'find': {
      const crystal = rng() < 0.5;
      const reward = crystal ? worth(w, planet, { crystal: 2 }) : worth(w, planet, { metal: 2, crystal: 0.5 });
      return { ...base, title: crystal ? 'A crystal vein' : 'A meteor field', text: crystal ? `A scan of ${planet.name}'s orbit shows a drifting rock laced with crystal, close enough to grab.` : `A cloud of metal-rich meteors is passing close to ${planet.name}. Your crews can catch some of it.`,
        options: [{ id: 'collect', label: 'Collect it', hint: `About ${resText(reward)}.` }], data: { reward } };
    }
  }
}

function kindFor(w: World, p: Player, rng: Rng): EncounterKind {
  const st = state(p);
  const options = (Object.keys(ENCOUNTER.weights) as EncounterKind[]).filter((k) => k !== st.lastKind);
  const total = options.reduce((s, k) => s + ENCOUNTER.weights[k], 0);
  let r = rng() * total;
  for (const k of options) { r -= ENCOUNTER.weights[k]; if (r <= 0) return k; }
  return options[0];
}

/** Put an encounter in front of a commander (the clock does this; the admin can too). Returns nothing if there is no planet to put it at. */
export function spawnEncounter(w: World, p: Player, now: number, kind?: EncounterKind, rng: Rng = Math.random): Encounter | null {
  const worlds = p.planetIds.map((id) => w.planets[id]).filter((x): x is Planet => !!x && !x.isMoon);
  if (!worlds.length) return null;
  const planet = pick(rng, worlds);
  const st = state(p);
  const e = make(w, p, planet, kind ?? kindFor(w, p, rng), now, rng);
  st.current = e; st.last = now; st.lastKind = e.kind; st.clock = 0;
  st.next = (w.config.encounterMinMinutes + rng() * Math.max(0, w.config.encounterMaxMinutes - w.config.encounterMinMinutes)) * MIN;
  bus.push({ to: p.id, type: 'toast', data: `${e.title} at ${planet.name}` });
  bus.push({ to: p.id, type: 'refresh' });
  return e;
}

// ------------------------------------------------------------------ the clock

export const isPlaying = (p: Player, now: number) => !p.npc && p.planetIds.length > 0 && !onVacation(p) && !p.banned && now - p.lastSeen < ENCOUNTER.activeMs;

/** Runs about once a minute: counts the time a commander really plays, and sends them an encounter when enough has passed */
export function processEncounters(w: World, now: number, rng: Rng = Math.random): void {
  if (w.config.encounterMinMinutes <= 0) return;
  for (const p of Object.values(w.players)) {
    if (p.npc || !p.planetIds.length) continue;
    const st = state(p);
    if (st.current && st.current.expiresAt <= now) { st.current = undefined; bus.push({ to: p.id, type: 'refresh' }); }
    if (!st.next) st.next = (w.config.encounterMinMinutes + rng() * Math.max(0, w.config.encounterMaxMinutes - w.config.encounterMinMinutes)) * MIN;
    const since = st.tickAt ? Math.min(now - st.tickAt, 90_000) : 0;                  // a server that was off adds no play time
    st.tickAt = now;
    if (!isPlaying(p, now) || st.current) continue;
    st.clock += since;
    if (st.clock >= st.next) spawnEncounter(w, p, now, undefined, rng);
  }
}

// ------------------------------------------------------------------ the view and the answer

export function encounterView(w: World, p: Player, now: number) {
  const e = p.events?.current;
  if (!e || e.expiresAt <= now) return null;
  const planet = w.planets[e.planetId];
  return { id: e.id, kind: e.kind, title: e.title, text: e.text, options: e.options, expiresAt: e.expiresAt, planet: planet ? { id: planet.id, name: planet.name, coords: planet.coords } : null, scanned: !!e.data.scanned };
}

export interface Outcome { text: string; done: boolean }

/** The commander's answer to the encounter in front of them. `done` false means it goes on (a scan was made); the text says what happened. */
export function answerEncounter(w: World, p: Player, encounterId: string, optionId: string, now: number, rng: Rng = Math.random): Outcome {
  const st = state(p);
  const e = st.current;
  if (!e || e.id !== encounterId || e.expiresAt <= now) throw new GameError('That has passed.', 404);
  if (onVacation(p)) throw new GameError('You are in vacation mode.', 403);
  const planet = w.planets[e.planetId];
  if (!planet || planet.ownerId !== p.id) { st.current = undefined; throw new GameError('That world is no longer yours.'); }
  if (!e.options.some((o) => o.id === optionId)) throw new GameError('That is not a choice here.');
  updatePlanet(w, planet, now);
  const finish = (text: string): Outcome => {
    st.current = undefined; st.done++; p.stats.encountersDone = (p.stats.encountersDone ?? 0) + 1;
    notifyPlayer(w, p.id, 'news', `Event: ${e.title}`, text);
    bus.push({ to: p.id, type: 'refresh' });
    return { text, done: true };
  };
  const d = e.data;
  if (optionId === 'ignore' || optionId === 'leave' || optionId === 'decline') return finish(e.kind === 'merchant' ? 'The trader shrugs and flies on.' : e.kind === 'anomaly' ? 'The signal drifts out of range.' : 'You let it pass. The signal fades.');
  switch (e.kind) {
    case 'distress': {
      if (optionId === 'scan') {
        d.scanned = true;
        e.options = e.options.filter((o) => o.id !== 'scan');
        const text = d.real ? 'The probe confirms it: a real freighter with a dying drive and a frightened crew.' : 'The probe finds hidden weapons on the "freighter". It is bait.';
        e.text += ` ${text}`;
        return { text, done: false };
      }
      const cost: Res = d.cost;
      if (!has(planet, cost)) throw new GameError(`You need ${resText(cost)} of fuel here.`);
      take(planet, cost);
      if (d.real) { give(w, planet, d.reward, now); p.credits += 5; return finish(`You towed the freighter in. The grateful crew left ${resText(d.reward)} and 5 Command Credits as thanks.`); }
      return finish('It was a trap: the "freighter" fired a warning shot and ran, and the fuel you spent is gone. No harm done.');
    }
    case 'merchant': {
      let giveAmt: number = d.giveAmt, getAmt: number = d.getAmt;
      if (optionId === 'haggle') {
        if (rng() < 0.5) return finish('You pushed too hard: the trader laughed, closed his hatch and left.');
        getAmt = Math.floor((giveAmt * d.TV[d.g]) / d.TV[d.r] * 1.6);
      }
      if (planet.resources[d.g as ResKey] < giveAmt) throw new GameError(`You need ${fmtN(giveAmt)} ${resName(d.g)} on ${planet.name} for this.`);
      planet.resources[d.g as ResKey] -= giveAmt; planet.resources[d.r as ResKey] += getAmt;
      return finish(`${optionId === 'haggle' ? 'The haggling worked. ' : ''}You gave ${fmtN(giveAmt)} ${resName(d.g)} and received ${fmtN(getAmt)} ${resName(d.r)}.`);
    }
    case 'anomaly': {
      const r = rng();
      if (r < 0.55) { const c = 10 + Math.floor(rng() * 16); p.credits += c; return finish(`The pulse was a data cache from an old probe. Decoding it earned ${c} Command Credits.`); }
      if (r < 0.85) { const g = worth(w, planet, { crystal: 2 }); give(w, planet, g, now); return finish(`Beneath the signal sat a crystal-rich fragment. Your crews hauled in ${resText(g)}.`); }
      const loss = worth(w, planet, { deuterium: 0.25 }); take(planet, loss);
      p.credits += 5;
      return finish(`The anomaly discharged into the drives of your survey ship. The repairs burned ${resText(loss)}, but the readings were worth 5 Command Credits.`);
    }
    case 'raid': {
      const pay: Res = d.pay;
      if (optionId === 'pay') {
        const owed: Res = { metal: Math.min(pay.metal, planet.resources.metal), crystal: Math.min(pay.crystal, planet.resources.crystal), deuterium: 0 };
        take(planet, owed);
        return finish(`You paid ${resText(owed)} and the patrol left.`);
      }
      return fight(w, p, planet, e, finish, now, rng);
    }
    case 'find': {
      give(w, planet, d.reward, now);
      return finish(`Your crews brought in ${resText(d.reward)}.`);
    }
  }
}

function fight(w: World, p: Player, planet: Planet, e: Encounter, finish: (t: string) => Outcome, now: number, rng: Rng): Outcome {
  const value = Math.max(strength(planet), ENCOUNTER.fightMin);
  const tier = value < 200_000 ? 0 : value < 2_000_000 ? 1 : value < 20_000_000 ? 2 : 3;
  const budget = value * 0.5, split = (v: number): Res => ({ metal: v * 0.55, crystal: v * 0.33, deuterium: v * 0.12 });
  const raiders: Fleet = {};
  for (const [id, n] of Object.entries(buyUnits(split(budget), RAID_MIX[tier]))) raiders[id as ShipId] = n;
  const level = (id: 'weapons' | 'shielding' | 'armour') => Math.max(0, lvl(p.techs, id) - 1);
  const pirate = { owner: null, name: 'Pirate patrol', weapons: level('weapons'), shielding: level('shielding'), armour: level('armour'), fleet: raiders };
  const res = simulateCombat([pirate], [combatant(w, p, p.username, planet.fleet, planet.defenses)], makeRng(Math.floor(rng() * 2 ** 31)));
  const missiles = Object.fromEntries(Object.entries(planet.defenses).filter(([id]) => UNITS[id as UnitId].missile));
  planet.fleet = onlyShips(res.defenders[0].after);
  planet.defenses = { ...onlyDefs(res.defenders[0].after), ...missiles };
  const lostValue = res.defenders[0].lost.metal + res.defenders[0].lost.crystal;
  if (res.winner === 'defender') {
    const loot: Res = { metal: Math.floor((res.attackers[0].lost.metal) * 0.4), crystal: Math.floor((res.attackers[0].lost.crystal) * 0.4), deuterium: 0 };
    give(w, planet, loot, now);
    p.stats.battlesWon++;
    return finish(`The patrol broke and ran. You lost ${fmtN(lostValue)} of ships and defenses and salvaged ${resText(loot)} from the wreckage.`);
  }
  const toll: Res = { metal: Math.floor(planet.resources.metal * 0.05), crystal: Math.floor(planet.resources.crystal * 0.05), deuterium: 0 };
  take(planet, toll);
  p.stats.battlesLost++;
  return finish(`The patrol won the exchange. You lost ${fmtN(lostValue)} of ships and defenses and ${resText(toll)} was taken before they left.`);
}
