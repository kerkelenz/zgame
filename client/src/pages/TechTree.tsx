import { useEffect, useMemo, useRef, useState } from 'react';
import { lvl } from '../../../shared/formulas';
import { BUILDINGS } from '../../../shared/data';
import { FLOWS, TREE, levelGraph, levelKey, nodeOf, pathTo, reach, type LevelEdge, type LevelNode } from '../../../shared/techtree';
import type { BuildingId, TechId, UnitId } from '../../../shared/types';
import { useGame } from '../game';
import { Card, ItemLink, Page } from '../ui';

const COL_W = 128, ROW_H = 34, NODE_W = 116, NODE_H = 26, PAD = 16;
const MIN_K = 0.18, MAX_K = 1.6;
const KIND_LABEL: Record<string, string> = { building: 'building', tech: 'research', ship: 'ship', defense: 'defense' };

export function TechTree() {
  const { planet, me, openItem } = useGame();
  const [view, setView] = useState<'tree' | 'flows'>('tree');
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  // the map is panned with the mouse or a finger and zoomed with the wheel, a pinch or the buttons; there are no scroll bars
  const [cam, setCam] = useState({ x: 12, y: 8, k: 0.8 });
  const [gliding, setGliding] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, pinch: 0 });

  const g = useMemo(() => levelGraph(), []);
  const byKey = useMemo(() => new Map(g.nodes.map((n) => [n.key, n])), [g]);
  const width = PAD * 2 + g.layers * COL_W, height = PAD * 2 + g.lanes.length * ROW_H;
  const pos = (n: LevelNode) => ({ x: PAD + n.layer * COL_W, y: PAD + n.lane * ROW_H });

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
  const label = (n: LevelNode) => (n.kind === 'building' || n.kind === 'tech' ? `${n.name} ${n.level}` : n.name);

  // arrows leave and enter a node spread along its side so they do not sit on top of each other
  const anchors = useMemo(() => {
    const out = new Map<string, number>(), inn = new Map<string, number>();
    const mid = (k: string) => pos(byKey.get(k)!).y;
    const spread = (key: (e: LevelEdge) => string, other: (e: LevelEdge) => string, into: Map<string, number>) => {
      const groups = new Map<string, LevelEdge[]>();
      for (const e of g.edges) (groups.get(key(e)) ?? groups.set(key(e), []).get(key(e))!).push(e);
      for (const list of groups.values()) {
        list.sort((a, b) => mid(other(a)) - mid(other(b)));
        const step = Math.min(4, (NODE_H - 8) / Math.max(1, list.length - 1));
        list.forEach((e, i) => into.set(e.from + '>' + e.to, (i - (list.length - 1) / 2) * step));
      }
    };
    spread((e) => e.from, (e) => e.to, out);
    spread((e) => e.to, (e) => e.from, inn);
    return { out, inn };
  }, [g, byKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = sel ?? hover;
  const back = useMemo(() => (active ? reach(g, active, true) : new Set<string>()), [g, active]);
  const fwd = useMemo(() => (active ? reach(g, active, false) : new Set<string>()), [g, active]);
  const lit = (k: string) => active === k || back.has(k) || fwd.has(k);

  const clampCam = (c: { x: number; y: number; k: number }) => {
    const el = box.current;
    if (!el) return c;
    const keep = 120;
    return { k: c.k, x: Math.min(el.clientWidth - keep, Math.max(keep - width * c.k, c.x)), y: Math.min(el.clientHeight - keep, Math.max(keep - height * c.k, c.y)) };
  };
  /** zoom by a factor around a point of the viewport */
  const zoomAt = (factor: number, px: number, py: number) => setCam((c) => {
    const k = Math.min(MAX_K, Math.max(MIN_K, c.k * factor));
    const f = k / c.k;
    return clampCam({ k, x: px - (px - c.x) * f, y: py - (py - c.y) * f });
  });
  const zoomCentre = (factor: number) => { const el = box.current; setGliding(true); zoomAt(factor, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2); };
  const fit = (glide = true) => {
    const el = box.current;
    if (!el) return;
    setGliding(glide);
    const k = Math.min(MAX_K, Math.max(MIN_K, Math.min(el.clientWidth / width, el.clientHeight / height)));
    setCam({ k, x: (el.clientWidth - width * k) / 2, y: (el.clientHeight - height * k) / 2 });
  };
  const centre = (key: string) => {
    const el = box.current, p = pos(byKey.get(key)!);
    if (!el) return;
    setGliding(true);
    setCam((c) => { const k = Math.max(c.k, 0.7); return clampCam({ k, x: el.clientWidth / 2 - (p.x + NODE_W / 2) * k, y: el.clientHeight / 2 - (p.y + NODE_H / 2) * k }); });
  };
  const jump = (key: string) => { if (!key) return; setSel(key); centre(key); };
  const pick = (key: string) => { if (key === sel) setSel(null); else jump(key); };
  const jumpItem = (id: string) => { if (id) jump(levelKey(id, Math.min(Math.max(1, have(id) + 1), g.nodes.filter((n) => n.id === id).length))); };

  useEffect(() => { if (view === 'tree') fit(false); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  // the wheel must be a non-passive listener to stop the page scrolling while the pointer is over the map
  useEffect(() => {
    const el = box.current;
    if (!el || view !== 'tree') return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setGliding(false);
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const onDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { moved: 0, pinch: 0 };
    setGliding(false);
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    const el = box.current!;
    const r = el.getBoundingClientRect();
    if (pointers.current.size === 1) {
      const dx = now.x - prev.x, dy = now.y - prev.y;
      gesture.current.moved += Math.abs(dx) + Math.abs(dy);
      if (gesture.current.moved > 6) { try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } setCam((c) => clampCam({ ...c, x: c.x + dx, y: c.y + dy })); }
    } else if (pointers.current.size === 2) {
      const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)![1];
      const dist = Math.hypot(now.x - other.x, now.y - other.y), before = gesture.current.pinch;
      gesture.current.moved += 10;
      if (before > 0 && dist > 0) zoomAt(dist / before, (now.x + other.x) / 2 - r.left, (now.y + other.y) / 2 - r.top);
      gesture.current.pinch = dist;
    }
    pointers.current.set(e.pointerId, now);
  };
  const onUp = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); gesture.current.pinch = 0; };

  const selNode = sel ? byKey.get(sel) : undefined;
  const needs = selNode ? g.preds.get(selNode.key)!.map((k) => byKey.get(k)!) : [];
  const leads = selNode ? g.succs.get(selNode.key)!.map((k) => byKey.get(k)!) : [];
  const path = selNode ? pathTo(selNode.id) : [];

  return (
    <Page title="Tech tree">
      <div className="row wrap">
        <button className={view === 'tree' ? 'primary' : ''} onClick={() => setView('tree')}>Progression</button>
        <button className={view === 'flows' ? 'primary' : ''} onClick={() => setView('flows')}>Production and effects</button>
      </div>

      {view === 'tree' && (
        <>
          <p className="muted small">
            Every level of every building and research is its own node, chained to the one before it; ships and defenses are single nodes. Arrows run left to right from what a node needs to what it opens, and an item&apos;s first level is joined to the levels it requires (faint arrows come from items that feed many others, such as the Shipyard). Point at a node, or click it to keep it selected, to light its whole chain: <span className="tlegend anc">what leads to it</span>, <span className="tlegend desc">what it opens</span>.
            <span className="tlegend done">have</span> <span className="tlegend next">next</span> <span className="tlegend locked">locked</span>
          </p>
          <div className="row wrap">
            <select value="" onChange={(e) => jumpItem(e.target.value)} aria-label="Jump to an item">
              <option value="">Jump to…</option>
              {[...TREE].sort((a, b) => a.name.localeCompare(b.name)).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <span className="muted small">Drag to pan, wheel or pinch to zoom</span>
            <button onClick={() => zoomCentre(1 / 1.25)} aria-label="Zoom out">−</button>
            <button onClick={() => zoomCentre(1.25)} aria-label="Zoom in">+</button>
            <button onClick={() => fit()}>Fit all</button>
            {sel && <button onClick={() => setSel(null)}>Clear</button>}
          </div>

          {selNode && (
            <Card title={<>{label(selNode)} <span className="muted small">{KIND_LABEL[selNode.kind]}</span></>} right={<button onClick={() => openItem(selNode.id)}>Details</button>}>
              <div className="treeinfo">
                <div>
                  <b>Path to get there</b>
                  {path.length === 0 && selNode.level === 1 && <div className="muted small">Nothing needed: it is available from the start.</div>}
                  <ol className="steps">
                    {path.map((s) => {
                      const ok = haveReq(s.id) >= s.level;
                      return <li key={s.id} className={ok ? 'good' : 'bad'}><a className="itemlink" onClick={() => jump(levelKey(s.id, s.level))}>{nodeOf(s.id)!.name}</a> to level {s.level} <span className="muted small">{ok ? 'done' : `you: ${haveReq(s.id)}`}</span></li>;
                    })}
                    <li><b>{selNode.name}</b>{selNode.level > 1 ? ` to level ${selNode.level}` : ''}{status(selNode) === 'done' ? <span className="good small"> you have it</span> : status(selNode) === 'next' ? <span className="good small"> ready to start</span> : null}</li>
                  </ol>
                </div>
                <div>
                  <b>Needs directly</b>
                  {needs.length === 0 && <div className="muted small">Nothing.</div>}
                  {needs.map((n) => <div key={n.key} className={status(n) === 'done' ? 'good' : 'bad'}><a className="itemlink" onClick={() => jump(n.key)}>{label(n)}</a> <span className="muted small">(you: {count(n.id)})</span></div>)}
                  <b>Opens up</b>
                  {leads.length === 0 && <div className="muted small">Nothing else needs it.</div>}
                  {leads.map((n) => <div key={n.key}><a className="itemlink" onClick={() => jump(n.key)}>{label(n)}</a></div>)}
                </div>
              </div>
            </Card>
          )}

          <div className="graphbox" ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <div className={`graph ${gliding ? 'glide' : ''}`} style={{ width, height, transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
              <svg width={width} height={height} className="edges" aria-hidden="true">
                {g.edges.map((e) => {
                  const A = byKey.get(e.from)!, B = byKey.get(e.to)!;
                  const pa = pos(A), pb = pos(B), k = e.from + '>' + e.to;
                  const x1 = pa.x + NODE_W, y1 = pa.y + NODE_H / 2 + (anchors.out.get(k) ?? 0), x2 = pb.x, y2 = pb.y + NODE_H / 2 + (anchors.inn.get(k) ?? 0);
                  const dx = Math.max(14, (x2 - x1) / 2);
                  const onPath = !!active && lit(e.from) && lit(e.to);
                  const forward = e.from === active || fwd.has(e.from);
                  const cls = `bedge ${A.kind} ${e.kind} ${e.hub ? 'hub' : ''} ${active ? (onPath ? (forward ? 'fwd' : 'back') : 'off') : ''}`;
                  return (
                    <g key={k} className={cls}>
                      <path d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`} />
                      <circle cx={x2} cy={y2} r={2.4} />
                    </g>
                  );
                })}
              </svg>
              {g.nodes.map((n) => {
                const p = pos(n);
                const cls = ['gnode', n.kind, status(n), sel === n.key ? 'sel' : '', back.has(n.key) ? 'anc' : '', fwd.has(n.key) ? 'desc' : '', sel && !lit(n.key) ? 'dim' : '', !sel && active && lit(n.key) ? 'peek' : ''].filter(Boolean).join(' ');
                const isUnit = n.kind === 'ship' || n.kind === 'defense';
                return (
                  <div key={n.key} className={cls} style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }} title={label(n)} role="button" tabIndex={0}
                    onClick={() => { if (gesture.current.moved <= 6) pick(n.key); }} onMouseEnter={() => setHover(n.key)} onMouseLeave={() => setHover(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(n.key); } }}>
                    {isUnit ? <>{n.name}{have(n.id) > 0 ? <span className="lvl"> ×{have(n.id)}</span> : null}</> : <><b>{n.level}</b> {n.name}</>}
                  </div>
                );
              })}
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
