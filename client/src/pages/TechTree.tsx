import { useEffect, useMemo, useRef, useState } from 'react';
import { lvl } from '../../../shared/formulas';
import { BUILDINGS } from '../../../shared/data';
import { FLOWS, TREE, levelGraph, levelKey, nodeOf, reach, type LevelNode } from '../../../shared/techtree';
import type { BuildingId, TechId, UnitId } from '../../../shared/types';
import { useGame } from '../game';
import { Card, ItemLink, Page } from '../ui';

const COL_W = 118, ROW_H = 34, NODE_W = 106, NODE_H = 26, PAD = 12;
const ZOOMS = [0.5, 0.75, 1];

export function TechTree() {
  const { planet, me, openItem } = useGame();
  const [view, setView] = useState<'tree' | 'flows'>('tree');
  const [sel, setSel] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);

  const g = useMemo(() => levelGraph(), []);
  const byKey = useMemo(() => new Map(g.nodes.map((n) => [n.key, n])), [g]);

  const have = (id: string): number => {
    const n = nodeOf(id)!;
    return n.kind === 'building' ? lvl(planet.buildings, id as BuildingId) : n.kind === 'tech' ? lvl(me.techs, id as TechId) : n.kind === 'ship' ? planet.fleet[id as UnitId] || 0 : planet.defenses[id as UnitId] || 0;
  };
  const haveReq = (id: string) => (id in BUILDINGS ? lvl(planet.buildings, id as BuildingId) : lvl(me.techs, id as TechId));
  const ready = (id: string) => nodeOf(id)!.requires.every((r) => haveReq(r.id) >= r.level);
  const count = (id: string) => { const n = nodeOf(id)!; return n.kind === 'ship' || n.kind === 'defense' ? `×${have(id)}` : String(have(id)); };

  const status = (n: LevelNode): 'done' | 'next' | 'locked' => {
    const h = have(n.id);
    if (h >= n.level) return 'done';
    return h === n.level - 1 && ready(n.id) ? 'next' : 'locked';
  };

  const back = useMemo(() => (sel ? reach(g, sel, true) : new Set<string>()), [g, sel]);
  const fwd = useMemo(() => (sel ? reach(g, sel, false) : new Set<string>()), [g, sel]);
  const lit = (k: string) => sel === k || back.has(k) || fwd.has(k);

  const pos = (n: LevelNode) => ({ x: PAD + n.layer * COL_W, y: PAD + n.lane * ROW_H });
  const width = PAD * 2 + g.layers * COL_W, height = PAD * 2 + g.lanes.length * ROW_H;

  const pickItem = (id: string) => {
    if (!id) return;
    const k = levelKey(id, Math.min(have(id) + 1, g.nodes.filter((n) => n.id === id).length) || 1);
    setSel(k);
    const n = byKey.get(k)!;
    const el = box.current;
    if (el) el.scrollTo({ left: Math.max(0, (PAD + n.layer * COL_W) * zoom - 120), top: Math.max(0, (PAD + n.lane * ROW_H) * zoom - 120), behavior: 'smooth' });
  };
  useEffect(() => { if (view === 'tree' && box.current && sel === null) box.current.scrollTo({ left: 0, top: 0 }); }, [view, sel]);

  const selNode = sel ? byKey.get(sel) : undefined;
  const needs = selNode ? g.preds.get(selNode.key)!.map((k) => byKey.get(k)!) : [];
  const leads = selNode ? g.succs.get(selNode.key)!.map((k) => byKey.get(k)!) : [];
  const label = (n: LevelNode) => (n.kind === 'building' || n.kind === 'tech' ? `${n.name} ${n.level}` : n.name);

  return (
    <Page title="Tech tree">
      <div className="row wrap">
        <button className={view === 'tree' ? 'primary' : ''} onClick={() => setView('tree')}>Progression graph</button>
        <button className={view === 'flows' ? 'primary' : ''} onClick={() => setView('flows')}>Production and effects</button>
      </div>

      {view === 'tree' && (
        <>
          <p className="muted small">
            Every level of every building and research is a box; arrows run from what you need to what it opens, from left to right. A level needs the one before it, and an item&apos;s first level needs the levels shown on the arrows pointing at it. Click a box to light up the whole path leading to it (<span className="tlegend anc">needed first</span>) and everything it leads to (<span className="tlegend desc">unlocks</span>). <span className="tlegend done">have it</span> <span className="tlegend next">next to start</span> <span className="tlegend locked">locked</span> Levels continue beyond those shown; nothing else needs them.
          </p>
          <div className="row wrap">
            <select value="" onChange={(e) => pickItem(e.target.value)} aria-label="Jump to an item">
              <option value="">Jump to…</option>
              {TREE.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <span className="muted small">Zoom</span>
            {ZOOMS.map((z) => <button key={z} className={zoom === z ? 'primary' : ''} onClick={() => setZoom(z)}>{Math.round(z * 100)}%</button>)}
            {sel && <button onClick={() => setSel(null)}>Clear</button>}
          </div>

          {selNode && (
            <Card title={<>{label(selNode)} <span className="muted small">{selNode.kind === 'tech' ? 'research' : selNode.kind}</span></>} right={<button onClick={() => openItem(selNode.id)}>Details</button>}>
              <div className="treeinfo">
                <div>
                  <b>Needs directly</b>
                  {needs.length === 0 && <div className="muted small">Nothing: available from the start.</div>}
                  {needs.map((n) => {
                    const ok = status(n) === 'done';
                    return <div key={n.key} className={ok ? 'good' : 'bad'}><a className="itemlink" onClick={() => setSel(n.key)}>{label(n)}</a> <span className="muted small">(you: {count(n.id)})</span></div>;
                  })}
                  {back.size > needs.length && <div className="muted small">{back.size} steps lead here in all.</div>}
                </div>
                <div>
                  <b>Leads to</b>
                  {leads.length === 0 && <div className="muted small">Nothing else needs it.</div>}
                  {leads.map((n) => <div key={n.key}><a className="itemlink" onClick={() => setSel(n.key)}>{label(n)}</a></div>)}
                  {fwd.size > leads.length && <div className="muted small">{fwd.size} steps follow from it in all.</div>}
                </div>
              </div>
            </Card>
          )}

          <div className="graphbox" ref={box}>
            <div style={{ width: width * zoom, height: height * zoom }}>
              <div className="graph" style={{ width, height, transform: `scale(${zoom})` }}>
                <svg width={width} height={height} className="edges" aria-hidden="true">
                  <defs>
                    <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="currentColor" /></marker>
                  </defs>
                  {g.edges.map((e) => {
                    const a = byKey.get(e.from)!, b = byKey.get(e.to)!;
                    const p = pos(a), q = pos(b);
                    const x1 = p.x + NODE_W, y1 = p.y + NODE_H / 2, x2 = q.x, y2 = q.y + NODE_H / 2;
                    const dx = Math.max(24, (x2 - x1) / 2);
                    const on = !sel || (lit(e.from) && lit(e.to));
                    return <path key={e.from + e.to} className={`edge ${e.kind} ${sel ? (on ? 'on' : 'off') : ''}`} d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`} markerEnd="url(#arr)" />;
                  })}
                </svg>
                {g.nodes.map((n) => {
                  const p = pos(n);
                  const cls = ['gnode', n.kind, status(n), sel === n.key ? 'sel' : '', back.has(n.key) ? 'anc' : '', fwd.has(n.key) ? 'desc' : '', sel && !lit(n.key) ? 'dim' : ''].filter(Boolean).join(' ');
                  return (
                    <button key={n.key} className={cls} style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }} title={label(n)} onClick={() => setSel(sel === n.key ? null : n.key)}>
                      {n.kind === 'building' || n.kind === 'tech' ? <><b>{n.level}</b>{n.level === 1 ? ` ${n.name}` : ''}</> : n.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {view === 'flows' && (
        <>
          <p className="muted small">How the pieces feed each other: what raises each output, and what holds it back. Your level on the selected planet is shown next to each item.</p>
          <div className="items">
            {FLOWS.map((f) => (
              <Card key={f.id} title={f.title}>
                <p className="muted">{f.summary}</p>
                <b className="small">Raised by</b>
                <ul className="flow">{f.boosts.map((b, i) => <li key={i}>{b.id && <><ItemLink id={b.id} /> <span className="lvl">{count(b.id)}</span> - </>}{b.text}</li>)}</ul>
                {f.limits && (
                  <>
                    <b className="small">Limited by</b>
                    <ul className="flow">{f.limits.map((b, i) => <li key={i}>{b.id && <><ItemLink id={b.id} /> <span className="lvl">{count(b.id)}</span> - </>}{b.text}</li>)}</ul>
                  </>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
