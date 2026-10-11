import type { ReactNode } from 'react';
import { ResIcon } from './ResIcon';
import { nameOf } from '../../shared/effects';
import { lvl } from '../../shared/formulas';
import { BUILDINGS } from '../../shared/data';
import type { Requirement, Res } from '../../shared/types';
import { useGame } from './game';

import { fmt, fmtDur } from '../../shared/format';
export { fmt, fmtDur };

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
      {cost.metal > 0 && <span className={bad('metal') ? 'bad' : 'metal'}><ResIcon k="metal" size={14} />{fmt(cost.metal)}</span>}
      {cost.crystal > 0 && <span className={bad('crystal') ? 'bad' : 'crystal'}><ResIcon k="crystal" size={14} />{fmt(cost.crystal)}</span>}
      {cost.deuterium > 0 && <span className={bad('deuterium') ? 'bad' : 'deut'}><ResIcon k="deuterium" size={14} />{fmt(cost.deuterium)}</span>}
    </span>
  );
}

export function unmet(reqs: Requirement[], buildings: Record<string, number | undefined>, techs: Record<string, number | undefined>) {
  return reqs.filter((r) => (r.id in BUILDINGS ? lvl(buildings, r.id) : lvl(techs, r.id)) < r.level);
}
/** An item name that opens its details page. */
export function ItemLink({ id, children }: { id: string; children?: ReactNode }) {
  const { openItem } = useGame();
  return <a className="itemlink" title="Show details" onClick={(e) => { e.preventDefault(); openItem(id); }}>{children ?? nameOf(id)}</a>;
}

export function ReqList({ reqs }: { reqs: Requirement[] }) {
  return (
    <span className="reqs">
      Needs: {reqs.map((r, i) => <span key={r.id}>{i ? ', ' : ''}<ItemLink id={r.id} /> {r.level}</span>)}
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
