import { nextForRole, ROLES, type PlanetRole } from '../../shared/roles';
import { timeToFull } from './afford';

/** What the player could usefully do right now, worked out from what the server already sends. Pure, so it can be tested. */
export interface Advice {
  id: string;
  /** idle = something that should be running is not; warn = something is about to be wasted; tip = an opportunity */
  level: 'idle' | 'warn' | 'tip';
  text: string;
  page: string;
  planetId?: string;
}

type Res3 = Record<'metal' | 'crystal' | 'deuterium', number>;
interface P {
  id: string; name: string; isMoon?: boolean; updatedAt: number; role?: PlanetRole | null;
  buildQueue: unknown; buildBacklog?: string[];
  buildings: Record<string, number | undefined>; fleet: Record<string, number | undefined>; defenses: Record<string, number | undefined>;
  resources: Res3; capacity: Res3; production: Record<string, number>;
}
export interface AdviceInput {
  me: { alliance?: unknown; recruiting?: number; accountAge?: number; player: { research: unknown; researchBacklog?: unknown[] }; slots?: { used: number; max: number; expUsed: number; expMax: number }; contractsClaimable?: number; vacation?: unknown };
  planets: P[];
  now: number;
}

const NAMES = { metal: 'Metal', crystal: 'Crystal', deuterium: 'Vespene Gas' } as const;
const ORDER = { idle: 0, warn: 1, tip: 2 } as const;
const fmtMin = (ms: number) => (ms < 60_000 ? 'under a minute' : `${Math.round(ms / 60_000)} min`);

export function advise({ me, planets, now }: AdviceInput): Advice[] {
  if (me.vacation) return [];
  const out: Advice[] = [];

  for (const p of planets) {
    if (!p.buildQueue && !p.buildBacklog?.length) {
      const next = p.role && !p.isMoon ? nextForRole(p.role, p.buildings) : null;
      const label = ROLES.find((r) => r.id === p.role)?.label.toLowerCase();
      out.push({ id: `idle-build:${p.id}`, level: 'idle', page: 'buildings', planetId: p.id, text: `Nothing is being built on ${p.name}.${next ? ` Suggested next for a ${label} planet: ${next.name} to level ${next.level}.` : ''}` });
    }
  }
  const hasLab = planets.some((p) => (p.buildings.researchLab ?? 0) > 0);
  if (hasLab && !me.player.research && !me.player.researchBacklog?.length) out.push({ id: 'idle-research', level: 'idle', text: 'No research is running.', page: 'research' });

  for (const p of planets) {
    for (const k of ['metal', 'crystal', 'deuterium'] as const) {
      const dt = Math.max(0, now - p.updatedAt) / 3_600_000;
      const rate = p.production[k] ?? 0;
      if (rate <= 0) continue;
      const cur = Math.min(p.capacity[k], p.resources[k] + rate * dt);
      const left = timeToFull(cur, rate, p.capacity[k]);
      if (left === null || left > 30 * 60_000) continue;
      out.push({
        id: `full:${p.id}:${k}`, level: 'warn', page: 'buildings', planetId: p.id,
        text: left === 0 ? `${NAMES[k]} storage on ${p.name} is full: production is being wasted.` : `${NAMES[k]} storage on ${p.name} fills in ${fmtMin(left)}.`,
      });
    }
    const eff = p.production.efficiency;
    if (eff != null && eff < 1) out.push({ id: `energy:${p.id}`, level: 'warn', page: 'resources', planetId: p.id, text: `Energy is short on ${p.name}: the mines run at ${Math.round(eff * 100)}%.` });
  }

  if ((me.contractsClaimable ?? 0) > 0) {
    out.push({ id: 'contracts', level: 'tip', page: 'contracts', text: `${me.contractsClaimable} contract reward${me.contractsClaimable === 1 ? ' is' : 's are'} ready to claim.` });
  }

  if (!me.alliance && (me.recruiting ?? 0) > 0 && (me.accountAge ?? 0) > 3_600_000) {
    out.push({ id: 'alliance', level: 'tip', page: 'alliance', text: `${me.recruiting} alliance${me.recruiting === 1 ? ' is' : 's are'} open to new members. Playing together shares a bank, bonuses and help when you are attacked.` });
  }

  const s = me.slots;
  const shipsHome = planets.some((p) => Object.entries(p.fleet).some(([id, n]) => (n ?? 0) > 0 && id !== 'solarSatellite' && id !== 'crawler'));
  if (s && s.expMax > s.expUsed && s.max > s.used && shipsHome) out.push({ id: 'expedition', level: 'tip', page: 'fleet', text: 'An expedition slot is free and you have ships at home.' });

  for (const p of planets.filter((x) => !x.isMoon)) {
    const noDefense = !Object.values(p.defenses).some((n) => (n ?? 0) > 0);
    const noShips = !Object.values(p.fleet).some((n) => (n ?? 0) > 0);
    if (noDefense && noShips && (p.buildings.shipyard ?? 0) > 0) out.push({ id: `undefended:${p.id}`, level: p.role === 'defense' ? 'warn' : 'tip', page: 'defense', planetId: p.id, text: `${p.name} has no defenses and no ships.` });
  }
  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

export const idleCount = (a: Advice[]) => a.filter((x) => x.level === 'idle').length;
