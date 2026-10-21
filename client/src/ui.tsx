import { useMemo, type ReactNode } from 'react';
import { ResIcon } from './ResIcon';
import { nameOf } from '../../shared/effects';
import { lvl } from '../../shared/formulas';
import { BUILDINGS, TECHS, isDefense, isShip } from '../../shared/data';
import { Art } from './art';
import type { Requirement, Res } from '../../shared/types';
import { usePlayerDirectory } from './directory';
import { useGame } from './game';
import { hasTutorial, startTutorial } from './tutorialSteps';
import { tokenize } from './linkify';

import { fmt, fmtDur } from '../../shared/format';
import { QuickStart } from './QuickStart';
export { fmt, fmtDur };

/** make a link for a shared card: copies it, or shows it to copy by hand */
export async function copyLink(id: string, toast: (t: string) => void) {
  const url = `${location.origin}${location.pathname}?report=${id}`;
  try { await navigator.clipboard.writeText(url); toast('Link copied: ' + url); } catch { prompt('Share this link', url); }
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
      {cost.metal > 0 && <span className={bad('metal') ? 'bad' : 'metal'}><ResIcon k="metal" size={14} />{fmt(cost.metal)}</span>}
      {cost.crystal > 0 && <span className={bad('crystal') ? 'bad' : 'crystal'}><ResIcon k="crystal" size={14} />{fmt(cost.crystal)}</span>}
      {cost.deuterium > 0 && <span className={bad('deuterium') ? 'bad' : 'deut'}><ResIcon k="deuterium" size={14} />{fmt(cost.deuterium)}</span>}
    </span>
  );
}

export function unmet(reqs: Requirement[], buildings: Record<string, number | undefined>, techs: Record<string, number | undefined>) {
  return reqs.filter((r) => (r.id in BUILDINGS ? lvl(buildings, r.id) : lvl(techs, r.id)) < r.level);
}
/** The small picture of a building, research, ship or defense (the drawn placeholder until it has one), for rows and lists. */
export function ItemIcon({ id, size = 20 }: { id: string; size?: number }) {
  const kind = id in BUILDINGS ? 'building' : id in TECHS ? 'tech' : isShip(id) ? 'ship' : isDefense(id) ? 'defense' : null;
  if (!kind) return null;
  return <img className="itemicon" src={Art.icon(kind, id, nameOf(id))} width={size} height={size} alt="" />;
}
/** An item name that opens its details page. */
export function ItemLink({ id, children }: { id: string; children?: ReactNode }) {
  const { openItem } = useGame();
  return <a className="itemlink" data-tour={`link-${id}`} title="Show details" onClick={(e) => { e.preventDefault(); openItem(id); }}>{children ?? nameOf(id)}</a>;
}

export function ReqList({ reqs }: { reqs: Requirement[] }) {
  return (
    <span className="reqs">
      Needs: {reqs.map((r, i) => <span key={r.id}>{i ? ', ' : ''}<ItemLink id={r.id} /> {r.level} <QuickStart id={r.id} onlyIfReady /></span>)}
    </span>
  );
}

export function Card({ title, children, right, tour }: { title?: ReactNode; children: ReactNode; right?: ReactNode; /** what the tutorial can point at */ tour?: string }) {
  return (
    <section className="card" data-tour={tour}>
      {(title || right) && <header><h3>{title}</h3><div>{right}</div></header>}
      {children}
    </section>
  );
}

/** What a page shows while its data is on the way: soft placeholder bars, announced to screen readers */
export function Loading() {
  return <div className="skeleton" role="status" aria-busy="true" aria-label="Loading"><i /><i /><i /></div>;
}

/** A calm "nothing here yet" with a line on what will appear and, if useful, a button to get started */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><p>{children}</p>{action}</div>;
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  const { page, me } = useGame();
  const help = !!me && hasTutorial(page);
  return <div className="page"><h2 data-tour="page-title">{title}{help && <button className="link tuthelp" title="A short tour of this page" onClick={() => startTutorial(me.player.id, page)}>? Tutorial</button>}</h2>{children}</div>;
}

/** Coordinates that open the galaxy at that system when clicked. */
export function CoordLink({ c, children }: { c: { g: number; s: number; p: number }; children?: ReactNode }) {
  const { showInGalaxy } = useGame();
  return <a className="plink" title="Show in the galaxy" onClick={(e) => { e.preventDefault(); e.stopPropagation(); showInGalaxy(c); }}>{children ?? coordStr(c)}</a>;
}

/** A word that shows more when you point at it (no click needed): `label` is always visible, `children` appear on hover or keyboard focus. */
export function Tip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <span className="hovertip" tabIndex={0}>
      {label}
      <span className="tip" role="tooltip">{children}</span>
    </span>
  );
}

/** A commander's name that opens their profile. */
export function PlayerLink({ id, name, children }: { id: string | null | undefined; name: string; children?: ReactNode }) {
  const { openProfile } = useGame();
  if (!id) return <>{children ?? name}</>;
  return <a className="plink" title="Open the profile" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openProfile(id); }}>{children ?? name}</a>;
}

/** A planet or moon name that shows it in the galaxy. */
export function PlanetLink({ name, coords, moon, children }: { name: string; coords: { g: number; s: number; p: number }; moon?: boolean; children?: ReactNode }) {
  const { showInGalaxy } = useGame();
  return <a className="plink" title="Show in the galaxy" onClick={(e) => { e.preventDefault(); e.stopPropagation(); showInGalaxy(coords); }}>{moon ? '🌙 ' : ''}{children ?? name}</a>;
}

/** Plain text with its bracketed coordinates, commander names and your own planet names turned into working links. */
export function Linkify({ text }: { text: string }) {
  const { planets, showInGalaxy, openProfile } = useGame();
  const players = usePlayerDirectory();
  const dir = useMemo(() => ({ players, planets: planets.map((p: any) => ({ name: p.name, g: p.coords.g, s: p.coords.s, p: p.coords.p })) }), [players, planets]);
  return (
    <>
      {tokenize(text, dir).map((t, i) => {
        if (t.type === 'text') return t.text;
        const click = (e: { preventDefault: () => void; stopPropagation: () => void }, go: () => void) => { e.preventDefault(); e.stopPropagation(); go(); };
        if (t.type === 'player') return <a key={i} className="plink" onClick={(e) => click(e, () => openProfile(t.id))}>{t.text}</a>;
        return <a key={i} className="plink" onClick={(e) => click(e, () => showInGalaxy({ g: t.g, s: t.s }))}>{t.text}</a>;
      })}
    </>
  );
}
