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
  /** the chapter it belongs to, for the Quests page */
  chapter: string;
  /** quests that must be done before this one opens (several can be open at once) */
  after: string[];
  /** menu pages this quest opens when it is done (see ALWAYS_PAGES) */
  unlocks: string[];
  /** a side quest: nothing else waits for it, and it can be skipped */
  optional?: boolean;
  reward: Partial<Res> & { credits?: number };
  test: (w: World, p: Player) => boolean;
}

/** the points goal of the last objective: 5,000 at an economy speed of 5 or more, less on a slower server where that would take weeks */
export const o12Target = (w: World) => Math.round(5000 * Math.min(1, Math.max(0.2, w.config.economySpeed / 5)));

/** the pages every new commander has from the start; the quests open the rest of the menu one chapter at a time */
export const ALWAYS_PAGES = ['overview', 'buildings', 'resources', 'quests', 'messages', 'settings', 'guide', 'news'];

/** The guided first hours as a quest line: chapters of short quests, several open at once where they do not depend on each other, each paid when met. */
export const OBJECTIVES: Objective[] = [
  { id: 'o1', chapter: 'Foundations', after: [], unlocks: [], name: 'Dig in', hint: 'Raise the Metal Mine and Crystal Mine to level 4 on the Buildings page.', reward: { metal: 1500, crystal: 800 },
    test: (w, p) => anyWorld(w, p, (x) => lvl(x.buildings, 'metalMine') >= 4 && lvl(x.buildings, 'crystalMine') >= 4) },
  { id: 'o2', chapter: 'Foundations', after: ['o1'], unlocks: [], name: 'Keep the lights on', hint: 'Mines need energy. Build the Solar Plant until the energy readout is no longer red.', reward: { metal: 2000, crystal: 1000 },
    test: (w, p) => anyWorld(w, p, (x) => lvl(x.buildings, 'solarPlant') >= 4 && planetProduction(w, x).efficiency >= 0.999) },
  { id: 'o3', chapter: 'Foundations', after: ['o2'], unlocks: [], name: 'Deeper shafts', hint: 'Metal Mine 8 and Crystal Mine 7. Your whole empire runs on this curve.', reward: { metal: 4000, crystal: 2500, deuterium: 500 },
    test: (w, p) => anyWorld(w, p, (x) => lvl(x.buildings, 'metalMine') >= 8 && lvl(x.buildings, 'crystalMine') >= 7) },
  { id: 'o4', chapter: 'Foundations', after: ['o3'], unlocks: [], name: 'Heavy water', hint: 'Build the Deuterium Synthesizer to level 5 - fleets run on it.', reward: { deuterium: 2000 },
    test: (w, p) => anyWorld(w, p, (x) => lvl(x.buildings, 'deuteriumSynthesizer') >= 5) },
  { id: 'q-lab', chapter: 'Research', after: ['o3'], unlocks: ['research', 'techtree'], name: 'Build a Research Lab', hint: 'Build a Research Lab on the Buildings page. It opens the Research page and the Tech tree.', reward: { crystal: 1500 },
    test: (w, p) => anyWorld(w, p, (x) => lvl(x.buildings, 'researchLab') >= 1) },
  { id: 'o5', chapter: 'Research', after: ['q-lab'], unlocks: [], name: 'Science first', hint: 'Open the Research page and research Energy Technology (it needs the Research Lab).', reward: { crystal: 4000 },
    test: (_w, p) => lvl(p.techs, 'energy') >= 1 },
  { id: 'o6', chapter: 'The yards', after: ['o4', 'o5'], unlocks: ['shipyard', 'defense'], name: 'Open the yards', hint: 'Robotics Factory 2 unlocks the Shipyard. Build both.', reward: { metal: 8000, crystal: 4000 },
    test: (w, p) => anyWorld(w, p, (x) => lvl(x.buildings, 'shipyard') >= 1) },
  { id: 'q-ships', chapter: 'The yards', after: ['o6'], unlocks: ['fleet', 'galaxy', 'map'], name: 'Your first ships', hint: 'Build five ships at the Shipyard (Small Cargo and Light Fighters are the cheapest). Ships fly, fight and carry loot.', reward: { metal: 3000, crystal: 1500 },
    test: (_w, p) => (p.stats.shipsBuilt ?? 0) >= 5 },
  { id: 'o9', chapter: 'The yards', after: ['q-ships'], unlocks: [], name: 'Dig in deeper', hint: 'Put up 20 defenses (Rocket Launchers are cheap, Light Lasers count too) on the Defense page before hostiles notice you.', reward: { metal: 20000, crystal: 10000 },
    test: (w, p) => anyWorld(w, p, (x) => (x.defenses.rocketLauncher || 0) + (x.defenses.lightLaser || 0) >= 20) },
  { id: 'o7', chapter: 'Scouting and raiding', after: ['q-ships'], unlocks: ['contacts'], name: 'Eyes out there', hint: 'Spy Probes need Shipyard 3, Research Lab 3, Combustion Drive 3 and Espionage Technology 2 (the item cards list what is missing). Research those, build 3 Espionage Probes, then send them to spy on an inactive empire from the Galaxy.', reward: { credits: 100 },
    test: (w, p) => w.messages.some((m) => m.to === p.id && m.kind === 'espionage' && m.subject.startsWith('Spy report')) },
  { id: 'o8', chapter: 'Scouting and raiding', after: ['o7'], unlocks: ['contracts', 'highscore', 'alliance', 'chat'], name: 'First raid', hint: 'Build 6 Small Cargo (Shipyard 2, Combustion Drive 2) and a few Light Fighters (Shipyard 1, Combustion Drive 1), then attack an inactive empire from the Galaxy. The spy report shows how much there is to loot; the cargo ships carry it home.', reward: { credits: 150 },
    test: (_w, p) => p.stats.plundered > 0 },
  { id: 'o10', chapter: 'Expansion', after: ['o8'], unlocks: ['empire', 'economy', 'market'], name: 'Room to grow', hint: 'Research Astrophysics (it needs Espionage Technology 4 and Impulse Drive 3), build a Colony Ship (Shipyard 4, Impulse Drive 3) and settle a second planet from the Galaxy.', reward: { credits: 300 },
    test: (w, p) => colonyCount(w, p) >= 2 },
  { id: 'o11', chapter: 'Expansion', after: ['o10'], unlocks: ['command'], name: 'Into the deep', hint: 'Send a few ships on an Expedition to the deep-space slot (the last position) of any system. Astrophysics gives you the expedition slot.', reward: { credits: 200 },
    test: (_w, p) => p.stats.expeditions >= 1 },
  { id: 'q-trade', chapter: 'Trade and upgrades', after: ['o10'], unlocks: ['upgrades', 'lifeform'], name: 'Make a deal', hint: 'Open the Market and trade with the travelling merchant (swap a little of one resource for another), or take an offer from another commander.', reward: { credits: 50 },
    test: (_w, p) => (p.stats.trades ?? 0) + (p.stats.marketDeals ?? 0) > 0 },
  { id: 'q-upgrade', chapter: 'Trade and upgrades', after: ['q-trade'], unlocks: [], name: 'Invest in the empire', hint: 'Open Upgrades and buy any empire upgrade: more queue slots, faster research and more. They last for good.', reward: { credits: 100 },
    test: (_w, p) => Object.values(p.upgrades?.levels ?? {}).some((n) => (n ?? 0) > 0) },
  { id: 'q-class', chapter: 'Command', after: ['o11'], unlocks: [], name: 'Choose your path', hint: 'Open Command and choose a class. The first one is free and shapes how your empire grows.', reward: { credits: 100 },
    test: (_w, p) => !!p.charClass },
  { id: 'q-ally', chapter: 'Community', after: ['o8'], unlocks: [], optional: true, name: 'Find friends', hint: 'Open the Alliance page and join one (open alliances let you in at once). Members share a bank and bonuses and defend each other.', reward: { credits: 150 },
    test: (_w, p) => !!p.allianceId },
  { id: 'o12', chapter: 'Independence', after: ['o11'], unlocks: [], name: 'Stand on your own', hint: 'You know the loop now: mine, research, build, raid, defend. Reach 5,000 points (fewer on a slow server).', reward: { credits: 500 },
    test: (w, p) => playerPoints(w, p).total >= o12Target(w) },
];

const questById = new Map(OBJECTIVES.map((o) => [o.id, o]));
export const questDone = (p: Player, id: string) => !!p.objectives[id];
/** quests that are open now: not done, and everything they wait for is done */
export const openQuests = (p: Player): Objective[] => OBJECTIVES.filter((o) => !p.objectives[o.id] && o.after.every((a) => questDone(p, a)));

/** the menu pages this commander has so far; null means all of them (a veteran, or a server with the onboarding switched off) */
export function unlockedPages(w: World, p: Player): string[] | null {
  if (!w.config.onboarding || p.onboarding === 'legacy') return null;
  const out = new Set(ALWAYS_PAGES);
  for (const o of OBJECTIVES) if (p.objectives[o.id]) for (const page of o.unlocks) out.add(page);
  return [...out];
}

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
  { id: 'outpostBreaker', name: 'Outpost Breaker', desc: 'Break a pirate or alien outpost.', reward: 150, test: (_w, p) => (p.stats.outpostsCleared ?? 0) >= 1 },
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
  [r.metal && `${r.metal.toLocaleString('en-US')} metal`, r.crystal && `${r.crystal.toLocaleString('en-US')} crystal`, r.deuterium && `${r.deuterium.toLocaleString('en-US')} deuterium`, r.credits && `${r.credits.toLocaleString('en-US')} credits`]
    .filter(Boolean).join(', ');

/** the quest to point a commander at first: the first open one that is not a side quest */
export const currentObjective = (p: Player): Objective | null => openQuests(p).find((o) => !o.optional) ?? openQuests(p)[0] ?? null;

/** Pay out any objectives / achievements the commander has completed. Cheap enough to call every few seconds. */
const PAGE_NAMES: Record<string, string> = { research: 'Research', techtree: 'Tech tree', shipyard: 'Shipyard', defense: 'Defense', fleet: 'Fleet', galaxy: 'Galaxy', map: 'Map', contacts: 'Contacts', contracts: 'Contracts', highscore: 'Standing', alliance: 'Alliance', chat: 'Chat', empire: 'Empire', economy: 'Economy', market: 'Market', command: 'Command', upgrades: 'Upgrades', lifeform: 'Lifeform' };

/**
 * A commander whose account is older than the quest line keeps everything: the first time it is checked, every quest they have already met is
 * marked done without paying again (they have the pages, so the menu shows them all).
 */
function seedVeteran(w: World, p: Player, now: number) {
  if (p.questsSeeded) return;
  p.questsSeeded = true;
  if (p.onboarding !== 'legacy') return;
  for (let guard = 0; guard < OBJECTIVES.length; guard++) {
    const o = openQuests(p).find((q) => { try { return q.test(w, p); } catch { return false; } });
    if (!o) break;
    p.objectives[o.id] = now;
  }
}

export function checkProgress(w: World, p: Player, now: number) {
  if (p.npc || !p.planetIds.length) return;
  seedVeteran(w, p, now);
  for (let guard = 0; guard < OBJECTIVES.length * 2; guard++) {   // a reward can complete the next objective
    const o = openQuests(p).find((q) => { try { return q.test(w, p); } catch { return false; } });
    if (!o) break;
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
    const opened = o.unlocks.length ? ` New pages: ${o.unlocks.map((id) => PAGE_NAMES[id] ?? id).join(', ')}.` : '';
    notifyPlayer(w, p.id, 'system', `Quest complete: ${o.name}`,
      `Delivered: ${resLine(o.reward)}.${opened} ${next ? `Next: ${next.hint}` : 'That was the last guided quest - the galaxy is yours.'}`);
    bus.push({ to: p.id, type: 'toast', data: `Quest complete: ${o.name}` });
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
