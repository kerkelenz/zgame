import { OFFICERS, OFFICER_MAX, FACTIONS, FACTION_BY_ID, JOIN_REP, CHAR_CLASSES, CLASS_CHANGE_COST } from '../shared/data';
import { lvl } from '../shared/formulas';
import type { OfficerId, Res } from '../shared/types';
import { bus } from './bus';
import { planetProduction, updatePlanet } from './economy';
import { colonyCount, playerPoints } from './galaxy';
import { notifyPlayer } from './messages';
import { rankOf } from './rankings';
import { GameError, type Planet, type Player, type World } from './world';

const worlds = (w: World, p: Player): Planet[] => p.planetIds.map((id) => w.planets[id]).filter((x): x is Planet => !!x && !x.isMoon);
const anyWorld = (w: World, p: Player, f: (pl: Planet) => boolean) => worlds(w, p).some(f);

export interface Objective {
  id: string; name: string; hint: string;
  reward: Partial<Res> & { credits?: number };
  test: (w: World, p: Player) => boolean;
}

/** The guided first hours: one open at a time, in order, each paid when met. */
export const OBJECTIVES: Objective[] = [
  { id: 'o1', name: 'Dig in', hint: 'Raise the Metal Mine and Crystal Mine to level 4 on the Resources screen.', reward: { metal: 1500, crystal: 800 },
    test: (w, p) => anyWorld(w, p, (x) => lvl(x.buildings, 'metalMine') >= 4 && lvl(x.buildings, 'crystalMine') >= 4) },
  { id: 'o2', name: 'Keep the lights on', hint: 'Mines need energy. Build the Solar Plant until the energy readout is no longer red.', reward: { metal: 2000, crystal: 1000 },
    test: (w, p) => anyWorld(w, p, (x) => lvl(x.buildings, 'solarPlant') >= 4 && planetProduction(w, x).efficiency >= 0.999) },
  { id: 'o3', name: 'Deeper shafts', hint: 'Metal Mine 8 and Crystal Mine 7. Your whole empire runs on this curve.', reward: { metal: 4000, crystal: 2500, deuterium: 500 },
    test: (w, p) => anyWorld(w, p, (x) => lvl(x.buildings, 'metalMine') >= 8 && lvl(x.buildings, 'crystalMine') >= 7) },
  { id: 'o4', name: 'Heavy water', hint: 'Build the Vespene Extractor to level 5 - fleets run on it.', reward: { deuterium: 2000 },
    test: (w, p) => anyWorld(w, p, (x) => lvl(x.buildings, 'deuteriumSynthesizer') >= 5) },
  { id: 'o5', name: 'Science first', hint: 'Build a Research Lab, then research Energy Technology.', reward: { crystal: 4000 },
    test: (_w, p) => lvl(p.techs, 'energy') >= 1 },
  { id: 'o6', name: 'Open the yards', hint: 'Robotics Factory 2 unlocks the Shipyard. Build both.', reward: { metal: 8000, crystal: 4000 },
    test: (w, p) => anyWorld(w, p, (x) => lvl(x.buildings, 'shipyard') >= 1) },
  { id: 'o7', name: 'Eyes out there', hint: 'Research Espionage Technology 2, build 3 Spy Probes, then send them to spy on an inactive empire from the Galaxy.', reward: { credits: 100 },
    test: (w, p) => w.messages.some((m) => m.to === p.id && m.kind === 'espionage' && m.subject.startsWith('Spy report')) },
  { id: 'o8', name: 'First raid', hint: 'Build cargo ships and fighters, then attack an inactive empire. The spy report shows how much there is to loot.', reward: { credits: 150 },
    test: (_w, p) => p.stats.plundered > 0 },
  { id: 'o9', name: 'Dig in deeper', hint: 'Put up defenses - Rocket Launchers are cheap - before hostiles notice you.', reward: { metal: 20000, crystal: 10000 },
    test: (w, p) => anyWorld(w, p, (x) => (x.defenses.rocketLauncher || 0) + (x.defenses.lightLaser || 0) >= 20) },
  { id: 'o10', name: 'Room to grow', hint: 'Research Astrophysics, build a Colony Ship and settle a second planet.', reward: { credits: 300 },
    test: (w, p) => colonyCount(w, p) >= 2 },
  { id: 'o11', name: 'Into the deep', hint: 'Send a fleet on an Expedition to the deep-space slot of any system.', reward: { credits: 200 },
    test: (_w, p) => p.stats.expeditions >= 1 },
  { id: 'o12', name: 'Stand on your own', hint: 'You know the loop now: mine, research, build, raid, defend. Reach 5,000 points.', reward: { credits: 500 },
    test: (w, p) => playerPoints(w, p).total >= 5000 },
];

export interface Achievement { id: string; name: string; desc: string; reward: number; test: (w: World, p: Player) => boolean }

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'firstMine', name: 'Groundbreaking', desc: 'Raise any mine to level 10.', reward: 50, test: (w, p) => anyWorld(w, p, (x) => lvl(x.buildings, 'metalMine') >= 10) },
  { id: 'industrial', name: 'Industrialist', desc: 'Raise any mine to level 20.', reward: 200, test: (w, p) => anyWorld(w, p, (x) => lvl(x.buildings, 'metalMine') >= 20) },
  { id: 'firstBlood', name: 'First Blood', desc: 'Win a battle.', reward: 60, test: (_w, p) => p.stats.battlesWon >= 1 },
  { id: 'warlord', name: 'Warlord', desc: 'Destroy 1,000,000 resources worth of enemy units.', reward: 300, test: (_w, p) => p.stats.destroyed >= 1e6 },
  { id: 'colonist', name: 'Colonist', desc: 'Settle a second planet.', reward: 100, test: (w, p) => colonyCount(w, p) >= 2 },
  { id: 'empire', name: 'Empire Builder', desc: 'Hold five planets.', reward: 400, test: (w, p) => colonyCount(w, p) >= 5 },
  { id: 'moonlit', name: 'Moonlit', desc: 'Gain a moon of your own.', reward: 250, test: (w, p) => p.planetIds.some((id) => w.planets[id]?.isMoon) },
  { id: 'explorer', name: 'Explorer', desc: 'Complete 10 expeditions.', reward: 150, test: (_w, p) => p.stats.expeditions >= 10 },
  { id: 'salvager', name: 'Salvager', desc: 'Harvest 500,000 resources from debris.', reward: 150, test: (_w, p) => p.stats.harvested >= 5e5 },
  { id: 'pirate', name: 'Pirate', desc: 'Plunder 1,000,000 resources.', reward: 200, test: (_w, p) => p.stats.plundered >= 1e6 },
  { id: 'missileer', name: 'Missileer', desc: 'Destroy defenses with an interplanetary strike.', reward: 150, test: (_w, p) => p.stats.ipmKills >= 1 },
  { id: 'moonbreaker', name: 'Moonbreaker', desc: 'Destroy a moon with your Deathstars.', reward: 300, test: (_w, p) => p.stats.moonsDestroyed >= 1 },
  { id: 'diplomat', name: 'Diplomat', desc: 'Join a faction.', reward: 200, test: (_w, p) => !!p.faction },
  { id: 'voidslayer', name: 'Void Slayer', desc: 'Help destroy a Void Armada.', reward: 250, test: (_w, p) => p.stats.invasionsWon >= 1 },
  { id: 'voidguardian', name: 'Void Guardian', desc: 'Destroy 1,000,000 resources of Void strike teams at home.', reward: 200, test: (_w, p) => p.stats.voidHome >= 1_000_000 },
  { id: 'voidquartermaster', name: 'Void Quartermaster', desc: 'Deliver 500,000 resources of supplies to the front.', reward: 200, test: (_w, p) => p.stats.voidSupplied >= 500_000 },
  { id: 'voidscout', name: 'Void Scout', desc: 'Scout the Void rift three times.', reward: 150, test: (_w, p) => p.stats.voidScouts >= 3 },
  { id: 'topTen', name: 'Top Ten', desc: 'Reach the top 10 of the highscore.', reward: 500, test: (w, p) => rankOf(w, p.id) <= 10 },
];

const resLine = (r: Partial<Res> & { credits?: number }) =>
  [r.metal && `${r.metal.toLocaleString('en-US')} metal`, r.crystal && `${r.crystal.toLocaleString('en-US')} crystal`, r.deuterium && `${r.deuterium.toLocaleString('en-US')} vespene gas`, r.credits && `${r.credits.toLocaleString('en-US')} credits`]
    .filter(Boolean).join(', ');

export const currentObjective = (p: Player): Objective | null => OBJECTIVES.find((o) => !p.objectives[o.id]) ?? null;

/** Pay out any objectives / achievements the commander has completed. Cheap enough to call every few seconds. */
export function checkProgress(w: World, p: Player, now: number) {
  if (p.npc || !p.planetIds.length) return;
  for (let guard = 0; guard < OBJECTIVES.length; guard++) {   // a reward can complete the next objective
    const o = currentObjective(p);
    if (!o) break;
    let done = false;
    try { done = o.test(w, p); } catch { done = false; }
    if (!done) break;
    p.objectives[o.id] = now;
    const home = worlds(w, p)[0];
    if (home) {
      updatePlanet(w, home, now);
      home.resources.metal += o.reward.metal ?? 0;
      home.resources.crystal += o.reward.crystal ?? 0;
      home.resources.deuterium += o.reward.deuterium ?? 0;
    }
    p.credits += o.reward.credits ?? 0;
    const next = currentObjective(p);
    notifyPlayer(w, p.id, 'system', `Objective complete: ${o.name}`,
      `Delivered: ${resLine(o.reward)}. ${next ? `Next: ${next.hint}` : 'That was the last guided objective - the galaxy is yours.'}`);
    bus.push({ to: p.id, type: 'toast', data: `Objective complete: ${o.name}` });
  }
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    let done = false;
    try { done = a.test(w, p); } catch { done = false; }
    if (!done) continue;
    p.achievements[a.id] = now;
    p.credits += a.reward;
    notifyPlayer(w, p.id, 'system', `Achievement: ${a.name}`, `${a.desc} Reward: ${a.reward} Command Credits - spend them on officers in the Command screen.`);
    bus.push({ to: p.id, type: 'toast', data: `Achievement: ${a.name} (+${a.reward} credits)` });
  }
}

export function hireOfficer(w: World, p: Player, id: string) {
  const def = OFFICERS.find((o) => o.id === id);
  if (!def) throw new GameError('Unknown officer');
  const rank = p.officers[def.id] ?? 0;
  if (rank >= OFFICER_MAX) throw new GameError(`${def.name} is already at the top rank`);
  const cost = def.cost[rank];
  if (p.credits < cost) throw new GameError(`That costs ${cost.toLocaleString('en-US')} credits and you have ${Math.floor(p.credits).toLocaleString('en-US')}`);
  p.credits -= cost;
  p.officers[def.id as OfficerId] = rank + 1;
  return rank + 1;
}

// ---------------------------------------------------------------- factions

const clampRep = (v: number) => Math.max(-100, Math.min(100, v));

/** Hitting a faction's members costs standing with them and earns a little with their rival. Hit your own and you are expelled. */
export function adjustRep(w: World, p: Player, factionId: string | null | undefined, delta: number) {
  if (!factionId || !delta || !(factionId in FACTION_BY_ID)) return;
  const f = FACTION_BY_ID[factionId as keyof typeof FACTION_BY_ID];
  p.rep[factionId] = clampRep((p.rep[factionId] || 0) + delta);
  p.rep[f.rival] = clampRep((p.rep[f.rival] || 0) - delta * 0.5);
  if (p.faction === factionId && delta < 0) {
    p.faction = null;
    p.rep[factionId] = Math.min(p.rep[factionId], 0);
    notifyPlayer(w, p.id, 'news', `Expelled from ${f.name}`, 'You attacked your own. The pact is void and their perk is gone.');
  }
}

export function joinFaction(p: Player, id: string) {
  const f = FACTIONS.find((x) => x.id === id);
  if (!f) throw new GameError('Unknown faction');
  if (p.faction === id) throw new GameError(`You already fly with ${f.name}`);
  if ((p.rep[id] || 0) < JOIN_REP) throw new GameError(`${f.name} wants standing of ${JOIN_REP}; you have ${Math.round(p.rep[id] || 0)}. Raid their rival, ${FACTION_BY_ID[f.rival].name}, to earn it.`);
  p.faction = f.id;
}

export function leaveFaction(p: Player) { p.faction = null; }

// ---------------------------------------------------------------- character classes

/** The first class is free; switching later costs Command Credits. */
export function chooseClass(p: Player, id: string) {
  const def = CHAR_CLASSES.find((c) => c.id === id);
  if (!def) throw new GameError('Unknown class');
  if (p.charClass === def.id) throw new GameError(`You are already a ${def.name}`);
  if (p.charClass) {
    if (p.credits < CLASS_CHANGE_COST) throw new GameError(`Changing class costs ${CLASS_CHANGE_COST.toLocaleString('en-US')} Command Credits and you have ${Math.floor(p.credits).toLocaleString('en-US')}`);
    p.credits -= CLASS_CHANGE_COST;
  }
  p.charClass = def.id;
}
