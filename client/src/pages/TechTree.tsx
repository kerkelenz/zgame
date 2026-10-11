import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { lvl } from '../../../shared/formulas';
import { BUILDINGS } from '../../../shared/data';
import { FLOWS, TREE, levelGraph, levelKey, nodeOf, pathTo, reach, type LevelNode } from '../../../shared/techtree';
import type { BuildingId, TechId, UnitId } from '../../../shared/types';
import { useGame } from '../game';
import { createSim, settle } from '../physics';
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
  const [live, setLive] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, pinch: 0 });
  const grab = useRef<{ key: string; id: number } | null>(null);

  const g = useMemo(() => levelGraph(), []);
  const byKey = useMemo(() => new Map(g.nodes.map((n) => [n.key, n])), [g]);

  // the physics: nodes are bodies, arrows are springs. It opens already relaxed and moves again when a node is dragged.
  const sim = useMemo(() => {
    const s = createSim(
      g.nodes.map((n) => ({ key: n.key, x: PAD + n.layer * COL_W, y: PAD + n.lane * ROW_H, w: NODE_W, h: NODE_H })),
      g.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
    );
    settle(s);
    return s;
  }, [g]);
  const nodeEls = useRef(new Map<string, HTMLElement>());
  const edgeEls = useRef(new Map<string, { path: SVGPathElement; dot: SVGCircleElement; from: string; to: string }>());
  const frame = useRef(0);
  const running = useRef(false);

  /** write every body's position into the page (nodes and arrows); React never touches these attributes */
  const paint = useCallback(() => {
    for (const b of sim.bodies) {
      const el = nodeEls.current.get(b.key);
      if (el) el.style.transform = `translate(${b.x}px, ${b.y}px)`;
    }
    for (const e of edgeEls.current.values()) {
      const a = sim.byKey.get(e.from)!, b = sim.byKey.get(e.to)!;
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
      const dx = Math.max(14, Math.abs(x2 - x1) / 2);
      e.path.setAttribute('d', `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
      e.dot.setAttribute('cx', String(x2)); e.dot.setAttribute('cy', String(y2));
    }
  }, [sim]);
  const kick = useCallback((alpha = 0.6) => {
    sim.reheat(alpha);
    if (running.current) return;
    running.current = true;
    const tick = () => {
      sim.step(); sim.step();
      paint();
      if (!sim.settled() || grab.current) frame.current = requestAnimationFrame(tick);
      else { running.current = false; setLive(false); }
    };
    setLive(true);
    frame.current = requestAnimationFrame(tick);
  }, [sim, paint]);
  useLayoutEffect(() => { paint(); });
  useEffect(() => () => { cancelAnimationFrame(frame.current); running.current = false; }, []);

  const bounds = () => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of sim.bodies) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  };

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

  const active = sel ?? hover;
  const back = useMemo(() => (active ? reach(g, active, true) : new Set<string>()), [g, active]);
  const fwd = useMemo(() => (active ? reach(g, active, false) : new Set<string>()), [g, active]);
  const lit = (k: string) => active === k || back.has(k) || fwd.has(k);

  const clampCam = (c: { x: number; y: number; k: number }) => {
    const el = box.current;
    if (!el) return c;
    const keep = 120, b = bounds();
    return { k: c.k, x: Math.min(el.clientWidth - keep - b.x0 * c.k, Math.max(keep - b.x1 * c.k, c.x)), y: Math.min(el.clientHeight - keep - b.y0 * c.k, Math.max(keep - b.y1 * c.k, c.y)) };
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
    const b = bounds();
    const k = Math.min(MAX_K, Math.max(MIN_K, Math.min(el.clientWidth / (b.w + 2 * PAD), el.clientHeight / (b.h + 2 * PAD))));
    setCam({ k, x: (el.clientWidth - b.w * k) / 2 - b.x0 * k, y: (el.clientHeight - b.h * k) / 2 - b.y0 * k });
  };
  const centre = (key: string) => {
    const el = box.current, b = sim.byKey.get(key);
    if (!el || !b) return;
    setGliding(true);
    setCam((c) => { const k = Math.max(c.k, 0.7); return clampCam({ k, x: el.clientWidth / 2 - (b.x + b.w / 2) * k, y: el.clientHeight / 2 - (b.y + b.h / 2) * k }); });
  };
  const jump = (key: string) => { if (!key) return; setSel(key); centre(key); };
  const pick = (key: string) => { if (key === sel) setSel(null); else jump(key); };
  const jumpItem = (id: string) => { if (id) jump(levelKey(id, Math.min(Math.max(1, have(id) + 1), g.nodes.filter((n) => n.id === id).length))); };
  const shake = () => { for (const b of sim.bodies) { b.vx += (Math.random() - 0.5) * 12; b.vy += (Math.random() - 0.5) * 12; } kick(0.9); };

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
    const key = (e.target as HTMLElement).closest?.('[data-key]')?.getAttribute('data-key');
    grab.current = key && pointers.current.size === 1 ? { key, id: e.pointerId } : null;
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
      if (gesture.current.moved > 6) {
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        if (grab.current && grab.current.id === e.pointerId) {
          // a node is being dragged: pin it under the pointer and let the springs pull the rest along
          const b = sim.byKey.get(grab.current.key)!;
          b.pinned = true;
          b.x = (now.x - r.left - cam.x) / cam.k - b.w / 2;
          b.y = (now.y - r.top - cam.y) / cam.k - b.h / 2;
          kick(0.7);
        } else setCam((c) => clampCam({ ...c, x: c.x + dx, y: c.y + dy }));
      }
    } else if (pointers.current.size === 2) {
      const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)![1];
      const dist = Math.hypot(now.x - other.x, now.y - other.y), before = gesture.current.pinch;
      gesture.current.moved += 10;
      grab.current = null;
      if (before > 0 && dist > 0) zoomAt(dist / before, (now.x + other.x) / 2 - r.left, (now.y + other.y) / 2 - r.top);
      gesture.current.pinch = dist;
    }
    pointers.current.set(e.pointerId, now);
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    gesture.current.pinch = 0;
    if (grab.current) { const b = sim.byKey.get(grab.current.key); if (b) b.pinned = false; grab.current = null; kick(0.5); }
  };

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
            Every level of every building and research is its own node, chained to the one before it; ships and defenses are single nodes. The map is a live physics simulation: arrows are springs, nodes push each other apart, and everything flows left to right from what a node needs to what it opens. <b>Drag a node</b> to pull its neighbours along; let go and it springs back. An item&apos;s first level is joined to the levels it requires (faint arrows come from items that feed many others, such as the Shipyard). Point at a node, or click it to keep it selected, to light its whole chain: <span className="tlegend anc">what leads to it</span>, <span className="tlegend desc">what it opens</span>.
            <span className="tlegend done">have</span> <span className="tlegend next">next</span> <span className="tlegend locked">locked</span>
          </p>
          <div className="row wrap">
            <select value="" onChange={(e) => jumpItem(e.target.value)} aria-label="Jump to an item">
              <option value="">Jump to…</option>
              {[...TREE].sort((a, b) => a.name.localeCompare(b.name)).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <span className="muted small">Drag the background to pan, wheel or pinch to zoom</span>
            <button onClick={() => zoomCentre(1 / 1.25)} aria-label="Zoom out">−</button>
            <button onClick={() => zoomCentre(1.25)} aria-label="Zoom in">+</button>
            <button onClick={() => fit()}>Fit all</button>
            <button onClick={shake} title="Jostle the map and let it settle again">Shake</button>
            {sel && <button onClick={() => setSel(null)}>Clear</button>}
            <span className="muted small" data-testid="physics-state">{live ? 'moving' : 'settled'}</span>
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
            <div className={`graph ${gliding ? 'glide' : ''}`} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
              <svg className="edges" width="1" height="1" aria-hidden="true">
                {g.edges.map((e) => {
                  const A = byKey.get(e.from)!;
                  const k = e.from + '>' + e.to;
                  const onPath = !!active && lit(e.from) && lit(e.to);
                  const forward = e.from === active || fwd.has(e.from);
                  const cls = `bedge ${A.kind} ${e.kind} ${e.hub ? 'hub' : ''} ${active ? (onPath ? (forward ? 'fwd' : 'back') : 'off') : ''}`;
                  return (
                    <g key={k} className={cls} ref={(el) => { if (el) edgeEls.current.set(k, { path: el.children[0] as SVGPathElement, dot: el.children[1] as SVGCircleElement, from: e.from, to: e.to }); else edgeEls.current.delete(k); }}>
                      <path />
                      <circle r={2.4} />
                    </g>
                  );
                })}
              </svg>
              {g.nodes.map((n) => {
                const cls = ['gnode', n.kind, status(n), sel === n.key ? 'sel' : '', back.has(n.key) ? 'anc' : '', fwd.has(n.key) ? 'desc' : '', sel && !lit(n.key) ? 'dim' : '', !sel && active && lit(n.key) ? 'peek' : ''].filter(Boolean).join(' ');
                const isUnit = n.kind === 'ship' || n.kind === 'defense';
                return (
                  <div key={n.key} data-key={n.key} className={cls} style={{ width: NODE_W, height: NODE_H }} title={label(n)} role="button" tabIndex={0}
                    ref={(el) => { if (el) nodeEls.current.set(n.key, el); else nodeEls.current.delete(n.key); }}
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
