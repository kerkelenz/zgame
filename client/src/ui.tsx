import type { ReactNode } from 'react';
import { BUILDINGS, TECHS } from '../../shared/data';
import { lvl } from '../../shared/formulas';
import type { Requirement, Res } from '../../shared/types';
import { useGame } from './game';

export const fmt = (n: number) => {
  n = Math.floor(n);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e7) return (n / 1e6).toFixed(1) + 'M';
  return n.toLocaleString('en-US');
};

export function fmtDur(ms: number) {
  let s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return (d ? `${d}d ` : '') + (h || d ? `${h}h ` : '') + (m || h || d ? `${m}m ` : '') + `${s}s`;
}

export const coordStr = (c: { g: number; s: number; p: number }) => `[${c.g}:${c.s}:${c.p}]`;
export const when = (t: number) => new Date(t).toLocaleString();

export function Countdown({ to }: { to: number }) {
  const { now } = useGame();
  return <span className="mono">{fmtDur(to - now)}</span>;
}

export function Progress({ from, to }: { from: number; to: number }) {
  const { now } = useGame();
  const pct = Math.min(100, Math.max(0, ((now - from) / Math.max(1, to - from)) * 100));
  return <div className="bar"><div style={{ width: pct + '%' }} /></div>;
}

export function Cost({ cost, have }: { cost: Res; have?: Res }) {
  const bad = (k: keyof Res) => have && have[k] < cost[k];
  return (
    <span className="cost">
      {cost.metal > 0 && <span className={bad('metal') ? 'bad' : 'metal'}>{fmt(cost.metal)} M</span>}
      {cost.crystal > 0 && <span className={bad('crystal') ? 'bad' : 'crystal'}>{fmt(cost.crystal)} C</span>}
      {cost.deuterium > 0 && <span className={bad('deuterium') ? 'bad' : 'deut'}>{fmt(cost.deuterium)} D</span>}
    </span>
  );
}

export function unmet(reqs: Requirement[], buildings: Record<string, number | undefined>, techs: Record<string, number | undefined>) {
  return reqs.filter((r) => (r.id in BUILDINGS ? lvl(buildings, r.id) : lvl(techs, r.id)) < r.level);
}
export function ReqList({ reqs }: { reqs: Requirement[] }) {
  return (
    <span className="reqs">
      Needs: {reqs.map((r, i) => <span key={r.id}>{i ? ', ' : ''}{(BUILDINGS as any)[r.id]?.name ?? (TECHS as any)[r.id]?.name} {r.level}</span>)}
    </span>
  );
}

export function Card({ title, children, right }: { title?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      {(title || right) && <header><h3>{title}</h3><div>{right}</div></header>}
      {children}
    </section>
  );
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  return <div className="page"><h2>{title}</h2>{children}</div>;
}
