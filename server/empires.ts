/**
 * Computer-controlled empires. They are ordinary Players (flagged `npc`, no login) so attacks, espionage,
 * looting, moons, debris and highscores all work on them with no special cases.
 *
 *   inactive   - frozen economy, resources pile up (good raid targets)
 *   active     - keeps upgrading mines and defenses
 *   aggressive - builds warfleets, fights its neighbours and eventually raids commanders
 */
import { FACTIONS } from '../shared/data';
import { makeRng, simulateCombat, type Combatant, type Rng } from '../shared/combat';
import { UNITS } from '../shared/data';
import { buildingCost, canAfford, distance, lvl, subRes, totalRes } from '../shared/formulas';
import type { BuildingId, FactionId, Fleet, Res, UnitId } from '../shared/types';
import { planetCapacity, planetProduction, updatePlanet } from './economy';
import { addDebris, maybeCreateMoon, onlyDefs, onlyShips } from './fleet';
import { colonyCount, createPlanet, playerPoints } from './galaxy';
import { notifyPlayer } from './messages';
import { rankings } from './rankings';
import { shieldMul, weaponMul } from './perks';
import { GameError, blankPlayer, planetAt, uid, type Movement, type NpcStatus, type Planet, type Player, type World } from './world';

export const NPC_TICK_MS = 20 * 60_000;

const SYL_A = ['Ka', 'Vor', 'Ul', 'Dra', 'Sen', 'Mir', 'Tal', 'Xe', 'Or', 'Bel', 'Qua', 'Ny', 'Ro', 'Ith', 'Zan', 'Hel', 'Cor', 'Ves', 'Ae', 'Lun'];
const SYL_B = ['rik', 'dan', 'thas', 'mora', 'lex', 'vin', 'goth', 'ra', 'tor', 'ssa', 'nox', 'ven', 'dor', 'mir', 'kai', 'lis', 'ron', 'eth', 'zar', 'uun'];
const TITLES = ['Admiral', 'Warden', 'Archon', 'Magistrate', 'Overseer', 'Consul', 'Marshal', 'Regent', 'Prefect', 'Voidlord'];
const PLANET_NAMES = ['Ashfall', 'Brine', 'Cinder', 'Dusk', 'Ember', 'Fathom', 'Glint', 'Harrow', 'Ironreach', 'Jade', 'Kestrel', 'Lumen', 'Mire',
  'Nadir', 'Obsidian', 'Pale', 'Quarry', 'Rime', 'Sable', 'Tidewater', 'Umber', 'Vantage', 'Wick', 'Zenith', 'Cairn', 'Halcyon', 'Ossuary', 'Solace'];

import { NPC_DEF_MIX, NPC_FLEET_MIX, RAID_MIX, buyUnits, tierOf, type Mix } from './npcunits';
export { NPC_FLEET_MIX, RAID_MIX, buyUnits, tierOf };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pick = <T,>(rng: Rng, arr: readonly T[]) => arr[Math.floor(rng() * arr.length)];
const KEYS = ['metal', 'crystal', 'deuterium'] as const;

const addTo = (bucket: Record<string, number | undefined>, bought: Record<string, number>) => { for (const [id, n] of Object.entries(bought)) bucket[id] = (bucket[id] || 0) + n; };

function npcName(w: World, rng: Rng): string {
  for (let i = 0; i < 50; i++) {
    const n = pick(rng, SYL_A) + pick(rng, SYL_B);
    const name = rng() < 0.45 ? `${pick(rng, TITLES)} ${n}` : rng() < 0.5 ? n : `${n}-${Math.floor(rng() * 90 + 10)}`;
    if (!Object.values(w.players).some((p) => p.username.toLowerCase() === name.toLowerCase())) return name;
  }
  return `Empire-${uid(3)}`;
}

function balanceEnergy(w: World, planet: Planet) {
  for (let guard = 0; guard < 60 && planetProduction(w, planet).efficiency < 1; guard++) planet.buildings.solarPlant = lvl(planet.buildings, 'solarPlant') + 1;
}

/** Initial development of an NPC planet from the empire's "points" size. */
export function developNpcPlanet(w: World, planet: Planet, npc: Player, rng: Rng) {
  const info = npc.npc!;
  const P = info.seedPoints;
  const L = clamp(Math.round(1 + 5 * Math.log10(P) + (rng() * 3 - 1.5)), 1, 32);
  planet.buildings = {
    metalMine: L, crystalMine: Math.max(0, L - 2), deuteriumSynthesizer: Math.max(0, L - 4),
    roboticsFactory: Math.round(L / 4), shipyard: L > 5 ? Math.round(L / 3) : 0, researchLab: Math.round(L / 4),
    metalStorage: Math.round(L / 5), crystalStorage: Math.round(L / 6), deuteriumTank: Math.round(L / 7), solarPlant: 1,
  };
  balanceEnergy(w, planet);
  const pr = planetProduction(w, planet), cap = planetCapacity(w, planet);
  const speed = Math.max(1, w.config.economySpeed);
  const hours = info.status === 'inactive' ? 12 + rng() * 60 : 1 + rng() * 10;
  for (const k of KEYS) planet.resources[k] = Math.min(cap[k], Math.max(0, pr[k]) * (hours / speed) * Math.min(speed, 4));
  const tier = tierOf(P), budgetTotal = P * 1000;
  const [defShare, fleetShare] = { inactive: [0.12, 0.02], active: [0.25, 0.1], aggressive: [0.15, 0.35] }[info.status];
  const split = (v: number): Res => ({ metal: v * 0.55, crystal: v * 0.33, deuterium: v * 0.12 });
  const owned = Math.max(1, npc.planetIds.length);
  addTo(planet.defenses, buyUnits(split((budgetTotal * defShare) / owned), NPC_DEF_MIX[tier]));
  if (fleetShare) addTo(planet.fleet, buyUnits(split((budgetTotal * fleetShare) / owned), NPC_FLEET_MIX[tier]));
  if (P > 3000 && rng() < 0.4) planet.defenses.smallShield = 1;
  if (P > 40000 && rng() < 0.4) planet.defenses.largeShield = 1;
  planet.updatedAt = Date.now();
}

export const empireList = (w: World) => Object.values(w.players).filter((p) => p.npc);
export const hasEmpires = (w: World) => empireList(w).length > 0;

/** Settle ~density of the free slots with computer empires (empires own up to 4 planets each, within one galaxy). */
export function generateEmpires(w: World, now = Date.now(), seed = w.rngSeed): number {
  const density = w.config.npcDensity;
  if (!(density > 0)) return 0;
  const rng = makeRng(seed);
  const { galaxies, systems, positions } = w.config;
  const list: Player[] = [];
  for (let g = 1; g <= galaxies; g++) for (let s = 1; s <= systems; s++) for (let p = 1; p <= positions; p++) {
    const coords = { g, s, p };
    if (planetAt(w, coords)) continue;
    if (rng() > density) continue;
    let npc: Player | null = null;
    const local = list.filter((n) => n.planetIds.length && w.planets[n.planetIds[0]].coords.g === g && n.planetIds.length < 4);
    if (local.length && rng() < 0.3) npc = pick(rng, local);
    if (!npc) {
      const r = rng();
      const status: NpcStatus = r < 0.42 ? 'inactive' : r < 0.9 ? 'active' : 'aggressive';
      // outer galaxies hold older, stronger empires
      const seedPoints = Math.pow(10, 1 + Math.pow(rng(), 1.4) * (2.4 + g * 0.6)) * (status === 'aggressive' ? 2 : 1);
      const faction: FactionId | null = rng() < 0.15 ? null : pick(rng, FACTIONS).id;
      const t = Math.log10(seedPoints);
      const tl = (mul: number, spread = 1) => Math.max(0, Math.round(t * mul + (rng() * 2 - 1) * spread));
      npc = blankPlayer(uid(), npcName(w, rng), now, {
        npc: { status, seedPoints, faction },
        techs: {
          weapons: tl(2), shielding: tl(2), armour: tl(2.2), espionage: tl(2, 2), energy: tl(2),
          combustionDrive: tl(2.2), impulseDrive: tl(1.6), hyperspaceDrive: tl(1.1), plasma: Math.max(0, tl(1.5) - 4), computer: tl(2),
        },
      });
      w.players[npc.id] = npc;
      list.push(npc);
    }
    const pl = createPlanet(w, npc, coords, { name: npc.planetIds.length ? pick(rng, PLANET_NAMES) : 'Capital', now });
    pl.resources = { metal: 500, crystal: 500, deuterium: 0 };
  }
  for (const npc of list) {
    for (const id of [...npc.planetIds]) {
      const pl = w.planets[id];
      developNpcPlanet(w, pl, npc, rng);
      if (rng() < 0.12) { // some empires already hold a moon from an old battle
        const moon = (() => { const rnd = Math.random; Math.random = rng; try { return maybeCreateMoon(w, pl, { metal: 1_000_000, crystal: 0 }, now); } finally { Math.random = rnd; } })();
        if (moon) {
          moon.buildings = { lunarBase: 1 + Math.floor(rng() * 4), roboticsFactory: Math.floor(rng() * 4), shipyard: Math.floor(rng() * 5) };
          if (rng() < 0.5) moon.buildings.sensorPhalanx = 1 + Math.floor(rng() * 3);
          const pts = npc.npc!.seedPoints;
          addTo(moon.defenses, buyUnits({ metal: pts * 60, crystal: pts * 30, deuterium: pts * 10 }, NPC_DEF_MIX[tierOf(pts)]));
        }
      }
    }
  }
  // small debris fields from "old battles" so recyclers have work early on
  for (let i = 0; i < 25; i++) {
    const c = { g: 1 + Math.floor(rng() * galaxies), s: 1 + Math.floor(rng() * systems), p: 1 + Math.floor(rng() * positions) };
    addDebris(w, c, Math.round(rng() * 20000 * c.g), Math.round(rng() * 12000 * c.g));
  }
  w.nextNpcTick = now + NPC_TICK_MS;
  return list.length;
}

// ---------------------------------------------------------------- the 20-minute tick

const shipTotal = (f: Record<string, number | undefined>) => Object.values(f).reduce<number>((a, b) => a + (b ?? 0), 0);
const valueOf = (u: Record<string, number | undefined>) => Object.entries(u).reduce((a, [id, n]) => a + totalRes(UNITS[id as UnitId].cost) * (n || 0), 0);
const humans = (w: World) => Object.values(w.players).filter((p) => !p.npc && p.planetIds.length);
const awake = (w: World) => humans(w).filter((p) => !p.vacation);

function npcCombatant(npc: Player, planet: Planet | null, fleet: Fleet, withDefenses: boolean): Combatant {
  return {
    owner: npc.id, name: npc.username,
    weapons: lvl(npc.techs, 'weapons'), shielding: lvl(npc.techs, 'shielding'), armour: lvl(npc.techs, 'armour'),
    weaponMul: weaponMul(npc), shieldMul: shieldMul(npc),
    fleet: { ...fleet }, defenses: withDefenses && planet ? { ...planet.defenses } : undefined,
  };
}

export function npcTick(w: World, now: number) {
  w.nextNpcTick = now + NPC_TICK_MS;
  for (const npc of empireList(w)) {
    const info = npc.npc!;
    if (info.status !== 'inactive') {
      for (const id of npc.planetIds) {
        const p = w.planets[id];
        if (!p || p.isMoon) continue;
        updatePlanet(w, p, now);
        // 1) upgrade the cheapest affordable mine or storage a few times
        for (let i = 0; i < 6; i++) {
          const pr = planetProduction(w, p), cap = planetCapacity(w, p);
          let choice: BuildingId | null = null;
          if (pr.efficiency < 1) choice = 'solarPlant';
          else {
            const full = KEYS.find((k) => p.resources[k] > cap[k] * 0.85);
            choice = full ? ({ metal: 'metalStorage', crystal: 'crystalStorage', deuterium: 'deuteriumTank' } as const)[full]
              : (['metalMine', 'crystalMine', 'deuteriumSynthesizer'] as BuildingId[]).filter((k) => lvl(p.buildings, k) < 32)
                .sort((a, b) => buildingCost(a, lvl(p.buildings, a) + 1).metal - buildingCost(b, lvl(p.buildings, b) + 1).metal)[0] ?? null;
          }
          if (!choice) break;
          const cost = buildingCost(choice, lvl(p.buildings, choice) + 1);
          if (!canAfford(p.resources, cost)) break;
          p.resources = subRes(p.resources, cost);
          p.buildings[choice] = lvl(p.buildings, choice) + 1;
        }
        // 2) spend part of the rest on units
        const tier = tierOf(info.seedPoints);
        const budget: Res = { metal: p.resources.metal * 0.4, crystal: p.resources.crystal * 0.4, deuterium: p.resources.deuterium * 0.3 };
        const before = { ...budget };
        if (info.status === 'aggressive' && Math.random() < 0.6) addTo(p.fleet, buyUnits(budget, NPC_FLEET_MIX[tier]));
        else addTo(p.defenses, buyUnits(budget, NPC_DEF_MIX[tier]));
        for (const k of KEYS) p.resources[k] -= before[k] - budget[k];
      }
      if (Math.random() < 0.04) {
        const k = Object.keys(npc.techs)[Math.floor(Math.random() * Object.keys(npc.techs).length)] as keyof typeof npc.techs;
        if (k) npc.techs[k] = (npc.techs[k] || 0) + 1;
      }
      info.seedPoints *= 1.004; // empires grow a little stronger over time
    }
  }
  npcWars(w, now);
  npcExpansion(w, now);
  factionAid(w, now);
  recordHistory(w, now);
  // grudges cool off slowly, and a hot enough grudge turns an empire hostile
  for (const p of humans(w)) {
    for (const [id, heat] of Object.entries(p.heat)) {
      const npc = w.players[id];
      if (!npc?.npc) { delete p.heat[id]; continue; }
      if (heat > 40_000 && npc.npc.status !== 'aggressive') {
        npc.npc.status = 'aggressive';
        notifyPlayer(w, p.id, 'news', `${npc.username} has declared a vendetta`, `After your raids on their planets, ${npc.username} has turned its economy to war. Expect their fleets at your coordinates.`);
      }
      p.heat[id] = heat * 0.97;
      if (p.heat[id] < 100) delete p.heat[id];
    }
  }
}

/** Aggressive empires fight their neighbours so rankings, debris and moons keep moving. Battles resolve instantly. */
export function npcWars(w: World, now: number) {
  let headlines = 1; // at most one per tick so inboxes stay readable
  const { systems, positions } = w.config;
  for (const npc of empireList(w).filter((n) => n.npc!.status === 'aggressive')) {
    if (Math.random() > 0.25) continue;
    const base = npc.planetIds.map((id) => w.planets[id]).find((p): p is Planet => !!p && !p.isMoon && shipTotal(p.fleet) > 5);
    if (!base) continue;
    let target: Planet | null = null;
    for (let tries = 0; tries < 12 && !target; tries++) {
      const s = clamp(base.coords.s + Math.floor(Math.random() * 16) - 8, 1, systems);
      const cand = planetAt(w, { g: base.coords.g, s, p: 1 + Math.floor(Math.random() * positions) });
      if (cand && w.players[cand.ownerId]?.npc && cand.ownerId !== npc.id) target = cand;
    }
    if (!target) continue;
    const defOwner = w.players[target.ownerId];
    updatePlanet(w, target, now);
    const fleet: Fleet = {};
    for (const [id, n] of Object.entries(base.fleet)) { const send = Math.floor((n || 0) * 0.6); if (send > 0) fleet[id as keyof Fleet] = send; }
    if (!shipTotal(fleet)) continue;
    const res = simulateCombat([npcCombatant(npc, null, fleet, false)], [npcCombatant(defOwner, target, target.fleet, true)], makeRng(Math.floor(Math.random() * 2 ** 31)));
    // apply to both sides
    for (const [id, n] of Object.entries(fleet)) base.fleet[id as keyof Fleet] = Math.max(0, (base.fleet[id as keyof Fleet] || 0) - (n || 0) + (res.attackers[0].after[id as UnitId] || 0));
    target.fleet = onlyShips(res.defenders[0].after);
    target.defenses = onlyDefs(res.defenders[0].after);
    addDebris(w, target.coords, res.debris.metal, res.debris.crystal);
    let loot = 0;
    if (res.winner === 'attacker') for (const k of KEYS) { const take = target.resources[k] * 0.5; target.resources[k] -= take; base.resources[k] += take; loot += take; }
    const moon = maybeCreateMoon(w, target, res.debris, now);
    if (headlines > 0 && reportNews(w, npc, defOwner, target, res.winner, res.debris.metal + res.debris.crystal, loot, !!moon)) headlines--;
  }
}

function reportNews(w: World, npc: Player, defOwner: Player, target: Planet, winner: string, debris: number, loot: number, moon: boolean): boolean {
  const big = debris > 300_000;
  const near = humans(w).filter((p) => p.planetIds.some((id) => { const q = w.planets[id]; return q.coords.g === target.coords.g && Math.abs(q.coords.s - target.coords.s) <= 8; }));
  if (!(near.length || big) || Math.random() > 0.4) return false;
  const c = target.coords;
  const verb = winner === 'attacker' ? 'overran' : winner === 'draw' ? 'traded blows with' : 'was beaten back at';
  const body = `${npc.username} ${verb} ${defOwner.username}'s ${target.name} [${c.g}:${c.s}:${c.p}].` +
    (debris > 0 ? ` Debris left in orbit: ${Math.round(debris).toLocaleString('en-US')} - free for any recycler that gets there first.` : '') +
    (loot > 0 ? ` Plunder taken: ${Math.round(loot).toLocaleString('en-US')} resources.` : '') + (moon ? ' The wreckage condensed into a new moon.' : '');
  for (const p of big ? humans(w) : near) notifyPlayer(w, p.id, 'news', `${npc.username} raided ${defOwner.username} [${c.g}:${c.s}:${c.p}]`, body);
  return true;
}

/** Active empires occasionally settle an empty slot next door. */
export function npcExpansion(w: World, now: number) {
  const { galaxies, systems, positions } = w.config;
  if (Object.keys(w.planets).filter((id) => !w.planets[id].isMoon).length > galaxies * systems * positions * 0.55) return;
  for (const npc of empireList(w).filter((n) => n.npc!.status !== 'inactive' && colonyCount(w, n) < 4)) {
    if (Math.random() > 0.02) continue;
    const home = w.planets[npc.planetIds[0]];
    if (!home) continue;
    const c = { g: home.coords.g, s: clamp(home.coords.s + Math.floor(Math.random() * 7) - 3, 1, systems), p: 1 + Math.floor(Math.random() * positions) };
    if (planetAt(w, c)) continue;
    const pl = createPlanet(w, npc, c, { name: pick(Math.random, PLANET_NAMES), now });
    pl.resources = { metal: 500, crystal: 500, deuterium: 0 };
    developNpcPlanet(w, pl, { ...npc, npc: { ...npc.npc!, seedPoints: npc.npc!.seedPoints * 0.35 } }, Math.random);
  }
}

/** Your faction ships you supplies now and then. */
export function factionAid(w: World, now: number) {
  for (const p of awake(w)) {
    if (!p.faction || Math.random() > 0.08) continue;
    const worlds = p.planetIds.map((id) => w.planets[id]).filter((x) => x && !x.isMoon);
    const planet = worlds[Math.floor(Math.random() * worlds.length)];
    if (!planet) continue;
    updatePlanet(w, planet, now);
    const base = Math.max(20_000, playerPoints(w, p).total * 120);
    const gift = { metal: Math.round(base * (0.4 + Math.random() * 0.4)), crystal: Math.round(base * (0.2 + Math.random() * 0.3)), deuterium: Math.round(base * (0.05 + Math.random() * 0.15)) };
    for (const k of KEYS) planet.resources[k] += gift[k];
    notifyPlayer(w, p.id, 'news', 'Your faction sent supplies', `A convoy unloaded at ${planet.name}: ${gift.metal.toLocaleString('en-US')} metal, ${gift.crystal.toLocaleString('en-US')} crystal, ${gift.deuterium.toLocaleString('en-US')} deuterium.`);
  }
}

/** A snapshot of every commander each tick so the Standing screen can draw real history. */
export function recordHistory(w: World, now: number) {
  const rows = rankings(w, true);
  for (const p of humans(w)) {
    let fleet = 0;
    for (const id of p.planetIds) fleet += valueOf(w.planets[id]?.fleet ?? {});
    for (const m of Object.values(w.movements) as Movement[]) if (m.ownerId === p.id) fleet += valueOf(m.ships);
    const me = rows.find((r) => r.id === p.id);
    p.history.push({ t: now, points: me?.total ?? 0, rank: me?.rank ?? 0, fleet: Math.round(fleet) });
    if (p.history.length > 400) p.history.shift();
  }
}

// ---------------------------------------------------------------- tribute demands

const HOUR = 3_600_000;
const sec = (w: World) => Math.sqrt(Math.max(1, w.config.economySpeed));
export const scheduleTribute = (w: World, p: Player, now: number) => { p.nextTribute = now + ((24 + Math.random() * 36) * HOUR) / sec(w); };

/** A strong hostile empire offers to leave you alone for a while - for a price. */
export function demandTribute(w: World, p: Player, now: number) {
  scheduleTribute(w, p, now);
  if (p.vacation) return null;
  const pts = playerPoints(w, p).total;
  if (pts < 3000 || p.tributes.some((t) => !t.answered)) return null;
  const pool = empireList(w).filter((n) => n.npc!.status === 'aggressive' && n.planetIds.length && (p.truces[n.id] ?? 0) < now && !(p.faction && n.npc!.faction === p.faction)
    && playerPoints(w, n).total > pts * 0.6);
  if (!pool.length) return null;
  const npc = pool[Math.floor(Math.random() * pool.length)];
  const owned = p.planetIds.map((id) => w.planets[id]).filter((x) => x && !x.isMoon);
  owned.forEach((pl) => updatePlanet(w, pl, now));
  const want = Object.fromEntries(KEYS.map((k) => [k, Math.floor(owned.reduce((a, pl) => a + pl.resources[k], 0) * (0.08 + Math.random() * 0.08))])) as Res;
  if (totalRes(want) < 10_000) return null;
  const rec = { id: uid(), npc: npc.id, want, deadline: now + (2 * HOUR) / sec(w), answered: false as const };
  p.tributes.push(rec);
  notifyPlayer(w, p.id, 'news', `${npc.username} demands tribute`,
    `${npc.username} will keep their fleets away from your systems for a while in exchange for ${want.metal.toLocaleString('en-US')} metal, ${want.crystal.toLocaleString('en-US')} crystal and ${want.deuterium.toLocaleString('en-US')} deuterium. Answer in the Command screen before ${new Date(rec.deadline).toLocaleTimeString()} - silence counts as a refusal.`,
    { tribute: rec });
  return rec;
}

export function answerTribute(w: World, p: Player, id: string, answer: 'pay' | 'refuse', now: number, raid?: (npcId: string) => void) {
  const rec = p.tributes.find((t) => t.id === id);
  if (!rec || rec.answered) throw new GameError('That demand has already been settled');
  const npc = w.players[rec.npc];
  if (answer === 'pay') {
    const owned = p.planetIds.map((pid) => w.planets[pid]).filter((x) => x && !x.isMoon);
    owned.forEach((pl) => updatePlanet(w, pl, now));
    // verify first so a failed payment takes nothing
    for (const k of KEYS) if (owned.reduce((a, pl) => a + pl.resources[k], 0) < rec.want[k] - 1) throw new GameError(`Not enough ${k} across your planets to pay this`);
    for (const k of KEYS) {
      let left = rec.want[k];
      for (const pl of [...owned].sort((a, b) => b.resources[k] - a.resources[k])) { const take = Math.min(pl.resources[k], left); pl.resources[k] -= take; left -= take; if (left <= 0) break; }
    }
    rec.answered = 'paid';
    p.truces[npc.id] = now + (24 * HOUR) / sec(w);
    delete p.heat[npc.id];
    notifyPlayer(w, p.id, 'news', `Tribute paid to ${npc.username}`, `The convoy left. ${npc.username} will leave your systems alone until ${new Date(p.truces[npc.id]).toLocaleString()}.`);
  } else {
    rec.answered = 'refused';
    p.heat[npc.id] = (p.heat[npc.id] || 0) + 30_000;
    notifyPlayer(w, p.id, 'news', `You refused ${npc.username}`, 'Their envoy left without an answer worth hearing. Their fleet is being prepared - check your defenses.');
    raid?.(npc.id);
  }
}

/** Expire unanswered demands and schedule the next ones. Cheap: call every tick. */
export function processTributes(w: World, now: number) {
  for (const p of awake(w)) {
    if (!p.nextTribute) scheduleTribute(w, p, now);
    for (const rec of p.tributes) {
      if (!rec.answered && rec.deadline <= now) {
        rec.answered = 'ignored';
        p.heat[rec.npc] = (p.heat[rec.npc] || 0) + 20_000;
        notifyPlayer(w, p.id, 'news', `${w.players[rec.npc]?.username ?? 'They'} got no answer`, 'The deadline passed in silence. They have taken that as a refusal.');
      }
    }
    if (p.tributes.length > 20) p.tributes.splice(0, p.tributes.length - 20);
    if (now >= p.nextTribute) demandTribute(w, p, now);
  }
}
