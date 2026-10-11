import { useMemo, useRef, useState } from 'react';
import { lvl } from '../../../shared/formulas';
import { BUILDINGS } from '../../../shared/data';
import { FLOWS, ITEM_EDGES, TREE, VISIBLE_EDGES, ancestors, columns, descendants, levelsShown, nodeOf, pathTo } from '../../../shared/techtree';
import type { BuildingId, TechId, UnitId } from '../../../shared/types';
import { useGame } from '../game';
import { Card, ItemLink, Page } from '../ui';

const PIP = 16, CARD_H = 76, GAP_Y = 12, GAP_X = 96, PAD = 14, MIN_W = 140;
const KIND_LABEL: Record<string, string> = { building: 'building', tech: 'research', ship: 'ship', defense: 'defense' };

export function TechTree() {
  const { planet, me, openItem } = useGame();
  const [view, setView] = useState<'tree' | 'flows'>('tree');
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);

  const have = (id: string): number => {
    const n = nodeOf(id)!;
    return n.kind === 'building' ? lvl(planet.buildings, id as BuildingId) : n.kind === 'tech' ? lvl(me.techs, id as TechId) : n.kind === 'ship' ? planet.fleet[id as UnitId] || 0 : planet.defenses[id as UnitId] || 0;
  };
  const haveReq = (id: string) => (id in BUILDINGS ? lvl(planet.buildings, id as BuildingId) : lvl(me.techs, id as TechId));
  const ready = (id: string) => nodeOf(id)!.requires.every((r) => haveReq(r.id) >= r.level);
  const count = (id: string) => { const n = nodeOf(id)!; return n.kind === 'ship' || n.kind === 'defense' ? `×${have(id)}` : String(have(id)); };

  // geometry: one column per step, cards stacked inside it
  const layout = useMemo(() => {
    const cols = columns();
    const pos = new Map<string, { x: number; y: number; w: number }>();
    let x = PAD;
    for (const c of cols) {
      const widths = c.map((id) => Math.max(MIN_W, 18 + levelsShown(id) * PIP));
      const w = Math.max(...widths, MIN_W);
      c.forEach((id, i) => pos.set(id, { x, y: PAD + 22 + i * (CARD_H + GAP_Y), w: widths[i] }));
      x += w + GAP_X;
    }
    return { pos, cols, width: x - GAP_X + PAD, height: PAD + 22 + Math.max(...cols.map((c) => c.length)) * (CARD_H + GAP_Y) };
  }, []);

  // where each arrow leaves and enters a card: spread along the edge so arrows from one card do not sit on top of each other
  const anchors = useMemo(() => {
    const out = new Map<string, number>(), inn = new Map<string, number>();
    const centre = (id: string) => layout.pos.get(id)!.y + CARD_H / 2;
    const spread = (list: typeof VISIBLE_EDGES, key: (e: (typeof VISIBLE_EDGES)[number]) => string, other: (e: (typeof VISIBLE_EDGES)[number]) => string, into: Map<string, number>) => {
      const groups = new Map<string, typeof VISIBLE_EDGES>();
      for (const e of list) (groups.get(key(e)) ?? groups.set(key(e), []).get(key(e))!).push(e);
      for (const g of groups.values()) {
        g.sort((a, b) => centre(other(a)) - centre(other(b)));
        const step = Math.min(7, (CARD_H - 24) / Math.max(1, g.length - 1));
        g.forEach((e, i) => into.set(e.from + '>' + e.to, (i - (g.length - 1) / 2) * step));
      }
    };
    spread(VISIBLE_EDGES, (e) => e.from, (e) => e.to, out);
    spread(VISIBLE_EDGES, (e) => e.to, (e) => e.from, inn);
    return { out, inn };
  }, [layout]);

  const active = sel ?? hover;
  const back = useMemo(() => (active ? ancestors(active) : new Map<string, number>()), [active]);
  const fwd = useMemo(() => (active ? descendants(active) : new Set<string>()), [active]);
  const lit = (id: string) => active === id || back.has(id) || fwd.has(id);
  const litEdges = useMemo(() => ITEM_EDGES.filter((e) => active && lit(e.from) && lit(e.to)), [active, back, fwd]); // eslint-disable-line react-hooks/exhaustive-deps
  const needed = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const e of litEdges) (m.get(e.from) ?? m.set(e.from, new Set()).get(e.from)!).add(e.level);
    return m;
  }, [litEdges]);

  const centre = (id: string) => {
    const p = layout.pos.get(id)!, el = box.current;
    if (el) el.scrollTo({ left: Math.max(0, (p.x + p.w / 2) * zoom - el.clientWidth / 2), top: Math.max(0, (p.y + CARD_H / 2) * zoom - el.clientHeight / 2), behavior: 'smooth' });
  };
  const jump = (id: string) => { if (!id) return; setSel(id); centre(id); };
  const pick = (id: string) => { if (id === sel) setSel(null); else jump(id); };

  const selNode = sel ? nodeOf(sel) : undefined;
  const path = sel ? pathTo(sel) : [];
  const leads = sel ? ITEM_EDGES.filter((e) => e.from === sel).sort((a, b) => a.level - b.level) : [];

  return (
    <Page title="Tech tree">
      <div className="row wrap">
        <button className={view === 'tree' ? 'primary' : ''} onClick={() => setView('tree')}>Progression</button>
        <button className={view === 'flows' ? 'primary' : ''} onClick={() => setView('flows')}>Production and effects</button>
      </div>

      {view === 'tree' && (
        <>
          <p className="muted small">
            Each card is a building, research, ship or defense, and its squares are its levels. Cards flow left to right: whatever a card needs is to its left. Arrows join each card to what it needs; faint arrows come from items that feed many others, such as the Shipyard. Point at or click a card to light its whole chain: <span className="tlegend anc">what leads to it</span>, <span className="tlegend desc">what it opens</span>, with the level each arrow needs.
            Squares: <span className="tlegend done">have</span> <span className="tlegend next">next</span> <span className="tlegend locked">locked</span>
          </p>
          <div className="row wrap">
            <select value="" onChange={(e) => jump(e.target.value)} aria-label="Jump to an item">
              <option value="">Jump to…</option>
              {[...TREE].sort((a, b) => a.name.localeCompare(b.name)).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <span className="muted small">Zoom</span>
            {[0.6, 0.8, 1].map((z) => <button key={z} className={zoom === z ? 'primary' : ''} onClick={() => setZoom(z)}>{Math.round(z * 100)}%</button>)}
            {sel && <button onClick={() => setSel(null)}>Clear</button>}
          </div>

          {selNode && (
            <Card title={<>{selNode.name} <span className="muted small">{KIND_LABEL[selNode.kind]}</span></>} right={<button onClick={() => openItem(selNode.id)}>Details</button>}>
              <div className="treeinfo">
                <div>
                  <b>Path to get there</b>
                  {path.length === 0 && <div className="muted small">Nothing needed: it is available from the start.</div>}
                  <ol className="steps">
                    {path.map((s) => {
                      const ok = haveReq(s.id) >= s.level;
                      return <li key={s.id} className={ok ? 'good' : 'bad'}><a className="itemlink" onClick={() => jump(s.id)}>{nodeOf(s.id)!.name}</a> to level {s.level} <span className="muted small">{ok ? 'done' : `you: ${haveReq(s.id)}`}</span></li>;
                    })}
                    <li><b>{selNode.name}</b>{ready(selNode.id) ? <span className="good small"> ready to start</span> : null}</li>
                  </ol>
                </div>
                <div>
                  <b>Opens up</b>
                  {leads.length === 0 && <div className="muted small">Nothing else needs it.</div>}
                  {leads.map((e) => <div key={e.to}><a className="itemlink" onClick={() => jump(e.to)}>{nodeOf(e.to)!.name}</a> <span className="muted small">needs it at level {e.level}</span></div>)}
                </div>
              </div>
            </Card>
          )}

          <div className="graphbox" ref={box}>
            <div style={{ width: layout.width * zoom, height: layout.height * zoom }}>
              <div className="graph" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
                {layout.cols.map((c, t) => {
                  const first = layout.pos.get(c[0]);
                  return first ? <div key={t} className="colhead" style={{ left: first.x, top: PAD }}>{t === 0 ? 'Start' : `Step ${t}`}</div> : null;
                })}
                <svg width={layout.width} height={layout.height} className="edges" aria-hidden="true">
                  {VISIBLE_EDGES.map((e) => {
                    const A = layout.pos.get(e.from)!, B = layout.pos.get(e.to)!;
                    const k = e.from + '>' + e.to;
                    const x1 = A.x + A.w, y1 = A.y + CARD_H / 2 + (anchors.out.get(k) ?? 0), x2 = B.x, y2 = B.y + CARD_H / 2 + (anchors.inn.get(k) ?? 0);
                    const dx = Math.max(36, (x2 - x1) / 2);
                    const onPath = !!active && lit(e.from) && lit(e.to);
                    const forward = e.from === active || fwd.has(e.from);
                    const cls = `bedge ${nodeOf(e.from)!.kind} ${e.hub ? 'hub' : ''} ${active ? (onPath ? (forward ? 'fwd' : 'back') : 'off') : ''}`;
                    return (
                      <g key={k} className={cls}>
                        <path d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`} />
                        <circle cx={x2} cy={y2} r={2.6} />
                        {onPath && <text x={x2 - 20} y={y2 - 5}>{e.level}</text>}
                      </g>
                    );
                  })}
                </svg>
                {TREE.map((n) => {
                  const p = layout.pos.get(n.id)!;
                  const total = levelsShown(n.id), h = have(n.id), isUnit = n.kind === 'ship' || n.kind === 'defense';
                  const need = needed.get(n.id);
                  const cls = ['gcard', n.kind, sel === n.id ? 'sel' : '', back.has(n.id) ? 'anc' : '', fwd.has(n.id) ? 'desc' : '', sel && !lit(n.id) ? 'dim' : '', !sel && active && lit(n.id) ? 'peek' : ''].filter(Boolean).join(' ');
                  return (
                    <div key={n.id} className={cls} style={{ left: p.x, top: p.y, width: p.w, height: CARD_H }} onClick={() => pick(n.id)} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(n.id); } }}>
                      <div className="gname" title={n.name}>{n.name}{n.moonOnly ? ' 🌙' : ''}{isUnit && h > 0 ? <span className="lvl"> ×{h}</span> : null}</div>
                      <div className="needs" title={n.requires.map((r) => `${nodeOf(r.id)!.name} ${r.level}`).join(', ')}>{n.requires.length ? `Needs ${n.requires.map((r) => `${nodeOf(r.id)!.name.replace(' Technology', '')} ${r.level}`).join(', ')}` : 'No requirements'}</div>
                      <div className="pips">
                        {Array.from({ length: total }, (_, i) => i + 1).map((l) => {
                          const st = isUnit ? (h > 0 ? 'done' : ready(n.id) ? 'next' : 'locked') : l <= h ? 'done' : l === h + 1 && ready(n.id) ? 'next' : 'locked';
                          return <span key={l} className={`pip ${st} ${need?.has(l) ? 'need' : ''}`} title={isUnit ? n.name : `${n.name} ${l}`}>{isUnit ? '' : l}</span>;
                        })}
                      </div>
                    </div>
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
