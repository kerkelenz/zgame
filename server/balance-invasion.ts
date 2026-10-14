/**
 * Dry run of the Void invasion: simulated commanders join the front with part of their combat fleet and fight the waves with the real combat
 * engine, the real wave plan and the real regeneration, without supplies or repairs (so it is the harsh case). Prints how far each setup gets,
 * so a change to invasionStrength, the wave shares or the alien tech can be judged at a glance.
 *   npx tsx server/balance-invasion.ts [invasionNumber]
 */
import { DEFAULT_CONFIG } from '../shared/config';
import { runInvasion, type Setup } from './invasionSim';

const number = Number(process.argv[2] || 1);
const cfg = DEFAULT_CONFIG;
const SEEDS = 12;
const setups: Setup[] = [];
const POP = 20;
for (const joining of [1, 3, 6, 10, 20]) for (const sent of [0.5, 1]) for (const mix of ['balanced', 'cruisers', 'heavy', 'light']) setups.push({ players: POP, joining, fleet: 40_000_000, sent, tech: 6, mix });
for (const tech of [3, 10]) setups.push({ players: POP, joining: 10, fleet: 40_000_000, sent: 1, tech, mix: 'balanced' });

console.log(`invasion #${number}: alien level ${Math.min(15, 3 + 2 * (number - 1))}, strength ${cfg.invasionStrength} of the server's combat fleets, ${cfg.invasionWaves} waves, no supplies (harsh case); ${SEEDS} runs each\n`);
console.log('server of '+POP+'. joining  sent  tech  mix        alien budget   win%   waves cleared   fleet lost   rounds');
for (const s of setups) {
  const rs = Array.from({ length: SEEDS }, (_, i) => runInvasion(s, 1000 + i * 77, number));
  const avg = (f: (r: (typeof rs)[number]) => number) => rs.reduce((t, r) => t + f(r), 0) / rs.length;
  console.log(`${String(s.joining).padStart(5)} (${Math.round(s.joining * s.sent / s.players * 100)}% of fleets)  ${(s.sent * 100).toFixed(0).padStart(4)}%  ${String(s.tech).padStart(4)}  ${s.mix.padEnd(9)}  ${Math.round(rs[0].budget / 1e6).toString().padStart(9)}M  ${(avg((r) => (r.won ? 1 : 0)) * 100).toFixed(0).padStart(5)}  ${avg((r) => r.cleared).toFixed(1).padStart(8)} / ${cfg.invasionWaves}  ${(avg((r) => r.lostShare) * 100).toFixed(0).padStart(8)}%  ${avg((r) => r.rounds).toFixed(0).padStart(7)}`);
}
