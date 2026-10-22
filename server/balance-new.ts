/**
 * Balance review of the systems added after the base economy: crawlers, orbit bonuses, classes, the merchant deal,
 * the credit shop and expedition ships. Prints payback times so a change in a constant can be judged at a glance.
 *   npx tsx server/balance-new.ts [economySpeed]
 */
import { CRAWLER, POSITION_BONUS, TRADE_VALUE, UNITS, crawlerBonus } from '../shared/data';
import { DEFAULT_CONFIG } from '../shared/config';
import { buildingCost, production, type Levels } from '../shared/formulas';
import type { BuildingId, TechId } from '../shared/types';
import { SHOP } from './shop';

const speed = Number(process.argv[2] || DEFAULT_CONFIG.economySpeed);
const prodSpeed = speed * DEFAULT_CONFIG.productionBoost;
const val = (r: { metal: number; crystal: number; deuterium: number }) => r.metal * TRADE_VALUE.metal + r.crystal * TRADE_VALUE.crystal + r.deuterium * TRADE_VALUE.deuterium;

function state(L: number) {
  const b: Levels<BuildingId> = { metalMine: L, crystalMine: Math.round(L * 0.85), deuteriumSynthesizer: Math.round(L * 0.6), solarPlant: 1, fusionReactor: 0 };
  const techs: Levels<TechId> = { energy: 8 };
  // enough solar plants that the mines never starve: this isolates the payback of the thing being compared
  while (production({ buildings: b, techs, maxTemp: 40, satellites: 0, speed: prodSpeed }).efficiency < 1 && (b.solarPlant ?? 0) < 60) b.solarPlant = (b.solarPlant ?? 0) + 1;
  return { b, techs };
}
const rate = (b: Levels<BuildingId>, techs: Levels<TechId>, extra: object = {}) => production({ buildings: b, techs, maxTemp: 40, satellites: 0, speed: prodSpeed, ...extra });
const hourly = (p: { metal: number; crystal: number; deuterium: number }) => val(p);
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const ratio = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));

console.log(`economy x${speed} (production multiplier ${prodSpeed}); values weighted metal 1 : crystal 1.5 : deuterium 3\n`);

console.log('1. CRAWLER vs MINE UPGRADE - hours until the purchase has paid for itself');
console.log('   L = metal mine level (crystal 0.85 L, deuterium 0.6 L); crawlers cost', fmt(val(UNITS.crawler.cost)), 'value each; cap', CRAWLER.perMineLevel, 'per mine level and +' + CRAWLER.cap * 100 + '%');
console.log('   L    income/h    best mine upgrade        crawler (first)   crawlers at cap   net bonus   cost incl. power');
for (const L of [10, 15, 20, 25, 30, 35]) {
  const { b, techs } = state(L);
  const base = rate(b, techs);
  const baseV = hourly(base);
  let best = { id: '', pay: Infinity };
  for (const id of ['metalMine', 'crystalMine', 'deuteriumSynthesizer'] as BuildingId[]) {
    const nb = { ...b, [id]: (b[id] ?? 0) + 1 };
    // keep energy supplied so the comparison is about the mine itself
    while (rate(nb, techs).efficiency < 1 && (nb.solarPlant ?? 0) < 80) nb.solarPlant = (nb.solarPlant ?? 0) + 1;
    const gain = hourly(rate(nb, techs)) - baseV;
    const cost = val(buildingCost(id, (b[id] ?? 0) + 1)) + val(buildingCost('solarPlant', (nb.solarPlant ?? 0))) * (nb.solarPlant! > b.solarPlant! ? 1 : 0);
    const pay = cost / gain;
    if (pay < best.pay) best = { id, pay };
  }
  const mineSum = (b.metalMine ?? 0) + (b.crystalMine ?? 0) + (b.deuteriumSynthesizer ?? 0);
  // crawlers draw power: price the solar plants needed to keep the mines fully supplied
  const powered = (count: number) => {
    const nb = { ...b };
    while (rate(nb, techs, { crawlers: count }).efficiency < 1 && (nb.solarPlant ?? 0) < 90) nb.solarPlant = (nb.solarPlant ?? 0) + 1;
    let plantCost = 0;
    for (let l = (b.solarPlant ?? 0) + 1; l <= (nb.solarPlant ?? 0); l++) plantCost += val(buildingCost('solarPlant', l));
    return { nb, plantCost };
  };
  const n = CRAWLER.perMineLevel * mineSum;
  const one = powered(1), full = powered(n);
  const gainOne = hourly(rate(one.nb, techs, { crawlers: 1 })) - baseV;
  const gainFull = hourly(rate(full.nb, techs, { crawlers: n })) - baseV;
  const fillCost = n * val(UNITS.crawler.cost) + full.plantCost;
  console.log(`  ${String(L).padStart(3)}  ${fmt(baseV).padStart(10)}   ${best.id.padEnd(22)} ${ratio(best.pay).padStart(5)}h   ${ratio((val(UNITS.crawler.cost) + one.plantCost) / gainOne).padStart(8)}h        ${String(n).padStart(6)}      +${ratio((gainFull / baseV) * 100)}%      ${fmt(fillCost).padStart(12)}  (pays back in ${ratio(fillCost / gainFull)}h)`);
}

console.log('\n2. CLASSES - what each does to income (L = 25 economy, crawlers at cap)');
{
  const { b, techs } = state(25);
  const plain = hourly(rate(b, techs));
  const mineSum = (b.metalMine ?? 0) + (b.crystalMine ?? 0) + (b.deuteriumSynthesizer ?? 0);
  const n = CRAWLER.perMineLevel * mineSum;
  const row = (name: string, extra: object) => { const v = hourly(rate(b, techs, extra)); return `  ${name.padEnd(24)} ${fmt(v).padStart(10)}/h  x${(v / plain).toFixed(3)}`; };
  console.log(row('no class', {}));
  console.log(row('Collector (mines+energy)', { boost: 1.15, energyBoost: 1.1 }));
  console.log(row('no class + crawlers cap', { crawlers: n }));
  console.log(row('Collector + crawlers cap', { boost: 1.15, energyBoost: 1.1, crawlers: n, crawlerMul: 1.25 }));
  console.log('  (these two rows ignore the energy the crawlers draw; section 1 prices it in)');
  console.log('  (General and Discoverer do not touch mine output; their value is in fleets and expeditions)');
}

console.log('\n3. ORBIT BONUS - income at L = 25 by position');
{
  const { b, techs } = state(25);
  const base = hourly(rate(b, techs, { position: 4 }));
  for (const p of [1, 2, 3, 4, 6, 7, 8, 9, 10]) {
    const v = hourly(rate(b, techs, { position: p }));
    console.log(`  position ${String(p).padStart(2)}  x${(v / base).toFixed(3)}  ${Object.entries(POSITION_BONUS[p] ?? {}).map(([k, x]) => `+${x * 100}% ${k}`).join(' ')}`);
  }
}

console.log('\n4. MERCHANT DAILY DEAL - what the allowance is worth against a day of production');
for (const L of [15, 25, 35]) {
  const { b, techs } = state(L);
  const day = hourly(rate(b, techs)) * 24;
  const cap = 500_000 * speed;
  // saving = allowance converted at 2% instead of 12%, in value terms of the traded resource (metal -> crystal pair as the typical case)
  const saved = cap * 0.10 * TRADE_VALUE.metal;
  console.log(`  L ${String(L).padStart(2)}  a day of income ${fmt(day).padStart(13)}   allowance ${fmt(cap)}   saves at most ${fmt(saved)} (${ratio((saved / day) * 100)}% of a day)`);
}

console.log('\n5. SUPPLY DEPOT - credits vs what they buy (L = 25)');
{
  const { b, techs } = state(25);
  const h = hourly(rate(b, techs));
  for (const it of SHOP.filter((i) => i.id.startsWith('crate'))) {
    const hours = it.id === 'crate_small' ? 4 : 24;
    console.log(`  ${it.name.padEnd(16)} ${String(it.price).padStart(4)} credits -> ${fmt(h * hours)} value (${fmt((h * hours) / it.price)} per credit)`);
  }
  console.log('  credits are earned from objectives, achievements and ~15% of expeditions (about 20-60 each):');
  console.log('  one cargo container costs roughly', Math.round(700 / (0.15 * 45)), 'expeditions of income');
}

console.log('\n6. EXPEDITION SHIPS - cost against the find bonus they give');
{
  const pf = UNITS.pathfinder, rec = UNITS.recycler, probe = UNITS.espionageProbe;
  console.log(`  Pathfinder  cost ${fmt(val(pf.cost))}   +10% finds each (max 5 = +50% for ${fmt(5 * val(pf.cost))}), 20% black-hole save each`);
  console.log(`  Recycler    cost ${fmt(val(rec.cost))}   +25% resource finds once (any number), salvage events`);
  console.log(`  Probe       cost ${fmt(val(probe.cost))}   -25% pirate fleet once (any number)`);
  const fleet = 20 * val(UNITS.largeCargo.cost);
  const base = 3000 + fleet * 0.04;
  console.log(`  A ${fmt(fleet)} value expedition fleet finds about ${fmt(base * Math.sqrt(speed))} per resource find at x${speed}; five Pathfinders add ${fmt(base * Math.sqrt(speed) * 0.5)} per find`);
}

// ------------------------------------------------------------------ added after the first review: invasion, credits, territory
import { makeRng, simulateCombat, type Combatant } from '../shared/combat';
import { CHAR_CLASSES, OFFICERS } from '../shared/data';
import { ALL_BONUS, KINDS, STREAK_CAP, STREAK_STEP, DAILY_COUNT, WEEKLY_COUNT } from './contracts';
import { REWARD, buildBoss } from './invasion';
import { SECTOR } from './sectors';
import { fleetValue } from './npc';
import type { Fleet } from '../shared/types';
void CHAR_CLASSES;

console.log('\n7. VOID INVASION - how decisive is one engagement? (6 rounds, Monte Carlo, 30 fights per row)');
{
  const boss = buildBoss(50_000_000);
  const bossValue = fleetValue(boss);
  const mixFor = (value: number): Fleet => {
    // a typical player fleet: cruisers and battleships in a 2:1 value split
    const c = UNITS.cruiser.cost.metal + UNITS.cruiser.cost.crystal, b = UNITS.battleship.cost.metal + UNITS.battleship.cost.crystal;
    return { cruiser: Math.floor((value * 0.67) / c), battleship: Math.floor((value * 0.33) / b) };
  };
  console.log(`  Armada: ${fmt(bossValue)} of ships at technology level 3. Player fleets are cruisers and battleships.`);
  for (const techs of [3, 6, 10]) {
    console.log(`  player weapons/shield/armour ${techs}:`);
    console.log('    force / Armada   Armada destroyed   Armada lost   force lost');
    for (const ratio of [0.5, 0.8, 1.0, 1.2, 1.5, 2, 3]) {
      let wins = 0, bossLost = 0, ownLost = 0;
      const runs = 30;
      for (let i = 0; i < runs; i++) {
        const mine = mixFor(bossValue * ratio);
        const att: Combatant = { owner: 'a', name: 'force', weapons: techs, shielding: techs, armour: techs, fleet: mine };
        const def: Combatant = { owner: null, name: 'Armada', weapons: 3, shielding: 3, armour: 3, fleet: { ...boss } };
        const r = simulateCombat([att], [def], makeRng(1000 + i));
        const left = fleetValue(Object.fromEntries(Object.entries(r.defenders[0].after).filter(([k]) => k in UNITS && UNITS[k as keyof typeof UNITS].kind === 'ship')) as Fleet);
        if (left === 0) wins++;
        bossLost += 1 - left / bossValue;
        ownLost += (r.attackers[0].lost.metal + r.attackers[0].lost.crystal) / fleetValue(mine);
      }
      console.log(`    ${String(ratio).padStart(5)}x            ${String(Math.round((wins / runs) * 100)).padStart(3)}%             ${String(Math.round((bossLost / runs) * 100)).padStart(3)}%         ${String(Math.round((ownLost / runs) * 100)).padStart(3)}%`);
    }
  }
  console.log('  A fleet worth the Armada is wiped out for roughly its own size in damage; the Armada only falls to a clearly larger combined force. That is the intended rule: lone fleets feed it, coalitions beat it.');
  console.log('  Damage carries over (the Armada only rebuilds 5% of its fleet per engagement), so a 1x wave that dies still leaves the Armada about half gone for the next one.');
  console.log("  The Armada is 35% of the server's combat fleets when announced: roughly 42% of all fleets together (1.2x) are needed to destroy it in one engagement, so one big player cannot do it alone and no single fleet ever can.");
}

console.log('\n8. COMMAND CREDITS - what a dedicated commander earns in a week, against what credits buy');
{
  const dailyCredits = (Object.values(KINDS).map((k) => k.credits[0]).filter((x) => x > 0).sort((a, b) => b - a));
  const typicalDaily = dailyCredits.slice(0, DAILY_COUNT).reduce((a, b) => a + b, 0) / 1; // the best three, an upper-ish bound
  const lowDaily = [...dailyCredits].reverse().slice(0, DAILY_COUNT).reduce((a, b) => a + b, 0);
  const avgDaily = Object.values(KINDS).filter((k) => k.credits[0] > 0).reduce((s, k) => s + k.credits[0], 0) / Object.values(KINDS).filter((k) => k.credits[0] > 0).length * DAILY_COUNT;
  const streakMax = STREAK_CAP * STREAK_STEP * DAILY_COUNT;
  const weeklyAvg = Object.values(KINDS).reduce((s, k) => s + k.credits[1], 0) / Object.values(KINDS).length * WEEKLY_COUNT;
  console.log(`  a day of contracts: ${fmt(lowDaily)}-${fmt(typicalDaily)} credits (average ${fmt(avgDaily)}), plus up to ${streakMax} streak bonus and ${ALL_BONUS} for all three`);
  const week = (avgDaily + streakMax + ALL_BONUS) * 7 + weeklyAvg;
  console.log(`  a perfect week of contracts: about ${fmt(week)} credits (weeklies ${fmt(weeklyAvg)})`);
  console.log(`  invasions: a victory pool is ${REWARD.base}-${REWARD.cap} credits shared by everyone who fought (a retreat pays a third); one wave every ~3 days at most`);
  console.log('  what credits buy:');
  for (const o of OFFICERS) console.log(`    ${o.name.padEnd(14)} ranks cost ${o.cost.join(' / ')}  -> permanent`);
  console.log('    class change 2,000   cargo container 700 (one day of production, once)   supply crate 150   rushes 250-350');
  const officersTotal = OFFICERS.reduce((s, o) => s + o.cost.reduce((a, b) => a + b, 0), 0);
  console.log(`  the officers alone cost ${fmt(officersTotal)} credits: about ${(officersTotal / week).toFixed(0)} perfect weeks, so credits stay scarce and permanent upgrades remain the real goal`);
}

console.log('\n9. TERRITORY - how easy is it to hold systems, and what is it worth?');
{
  console.log(`  a system needs ${SECTOR.claimMin} influence: a planet is worth ${SECTOR.planetBase} plus its points, so three bare planets or one developed homeworld hold a quiet system`);
  console.log(`  bonus: +${SECTOR.bonusPerSector * 100}% mine output per held system, capped at +${SECTOR.bonusCap * 100}% (${SECTOR.bonusCap / SECTOR.bonusPerSector} systems)`);
  const { b, techs } = state(25);
  const base = hourly(rate(b, techs));
  const full = hourly(rate(b, techs, { allianceBonus: SECTOR.bonusCap }));
  console.log(`  at mine level 25 the full +${SECTOR.bonusCap * 100}% is worth ${fmt(full - base)} value per hour (${ratio(((full - base) / base) * 100)}% of income); the alliance mining network upgrade alone reaches +20%`);
  console.log('  an alliance whose members live in different systems holds one system per member for free: contested systems (two alliances present) are where the fighting is');
}
