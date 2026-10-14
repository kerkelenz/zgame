import { useEffect, useMemo, useRef, useState } from 'react';
import { lvl } from '../../../shared/formulas';
import { BUILDINGS } from '../../../shared/data';
import { FLOWS, ITEM_EDGES, TREE, VISIBLE_EDGES, ancestors, descendants, levelsShown, mapLayout, nodeOf, pathSet, pathTo } from '../../../shared/techtree';
import type { BuildingId, TechId, UnitId } from '../../../shared/types';
import { GEOM, geometry, routeEdges } from '../../../shared/techroute';
import { useGame } from '../game';
import { QuickStart } from '../QuickStart';
import { Card, ItemLink, Page, ItemIcon } from '../ui';

const { cardW: CARD_W, cardH: CARD_H, rowGap: ROW_GAP, bandGap: BAND_GAP, bandLabel: BAND_LABEL } = GEOM;
const LADDER = 24;
const MIN_K = 0.2, MAX_K = 1.6;
const KIND_LABEL: Record<string, string> = { building: 'building', tech: 'research', ship: 'ship', defense: 'defense' };

export function TechTree() {
  const { planet, me, openItem } = useGame();
  const [view, setView] = useState<'tree' | 'flows'>('tree');
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  /** when set, only this goal and everything leading to it is shown */
  const [goal, setGoal] = useState<string | null>(null);
  // the map is panned with the mouse or a finger and zoomed with the wheel, a pinch or the buttons; there are no scroll bars
  const [cam, setCam] = useState({ x: 12, y: 8, k: 0.7 });
  const [gliding, setGliding] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, pinch: 0 });

  const only = useMemo(() => (goal ? pathSet(goal) : undefined), [goal]);
  const layout = useMemo(() => {
    const m = mapLayout(only);
    const geo = geometry(m);
    return { m, geo, bandTop: geo.bandTop, pos: geo.pos, width: geo.width, height: geo.height };
  }, [only]);
  const shown = (id: string) => !only || only.has(id);

  const have = (id: string): number => {
    const n = nodeOf(id)!;
    return n.kind === 'building' ? lvl(planet.buildings, id as BuildingId) : n.kind === 'tech' ? lvl(me.techs, id as TechId) : n.kind === 'ship' ? planet.fleet[id as UnitId] || 0 : planet.defenses[id as UnitId] || 0;
  };
  const haveReq = (id: string) => (id in BUILDINGS ? lvl(planet.buildings, id as BuildingId) : lvl(me.techs, id as TechId));
  const ready = (id: string) => nodeOf(id)!.requires.every((r) => haveReq(r.id) >= r.level);
  const count = (id: string) => { const n = nodeOf(id)!; return n.kind === 'ship' || n.kind === 'defense' ? `×${have(id)}` : String(have(id)); };
  /** the level of each item the chosen goal needs (the goal itself needs one) */
  const needLevel = useMemo(() => (goal ? new Map<string, number>([...ancestors(goal), [goal, 1]]) : null), [goal]);
  const status = (id: string): 'done' | 'ready' | 'locked' => {
    const need = needLevel?.get(id);
    if (need !== undefined) return have(id) >= need ? 'done' : ready(id) ? 'ready' : 'locked';
    return have(id) > 0 ? 'done' : ready(id) ? 'ready' : 'locked';
  };
  /** in path mode: the steps that can be started right now */
  const nextUp = goal ? [...(only ?? [])].filter((id) => status(id) === 'ready').sort((a, b) => nodeOf(a)!.tier - nodeOf(b)!.tier) : [];

  const active = sel ?? hover;
  const back = useMemo(() => (active ? ancestors(active) : new Map<string, number>()), [active]);
  const fwd = useMemo(() => (active ? descendants(active) : new Set<string>()), [active]);
  const lit = (id: string) => active === id || back.has(id) || fwd.has(id);
  const edges = useMemo(() => (goal ? ITEM_EDGES.filter((e) => only!.has(e.from) && only!.has(e.to)).map((e) => ({ ...e, hub: false })) : VISIBLE_EDGES), [goal, only]);
  const routes = useMemo(() => routeEdges(layout.geo, edges), [layout, edges]);
  const litEdges = useMemo(() => edges.filter((e) => active && lit(e.from) && lit(e.to)), [edges, active, back, fwd]); // eslint-disable-line react-hooks/exhaustive-deps
  const needed = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const e of litEdges) (m.get(e.from) ?? m.set(e.from, new Set()).get(e.from)!).add(e.level);
    return m;
  }, [litEdges]);

  const clampCam = (c: { x: number; y: number; k: number }) => {
    const el = box.current;
    if (!el) return c;
    const keep = 120;
    return { k: c.k, x: Math.min(el.clientWidth - keep, Math.max(keep - layout.width * c.k, c.x)), y: Math.min(el.clientHeight - keep, Math.max(keep - layout.height * c.k, c.y)) };
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
    const k = Math.min(1, Math.max(MIN_K, Math.min(el.clientWidth / layout.width, el.clientHeight / layout.height)));
    setCam({ k, x: (el.clientWidth - layout.width * k) / 2, y: 8 });
  };
  const centre = (id: string) => {
    const el = box.current, p = layout.pos.get(id);
    if (!el || !p) return;
    setGliding(true);
    setCam((c) => { const k = Math.max(c.k, 0.7); return clampCam({ k, x: el.clientWidth / 2 - (p.x + CARD_W / 2) * k, y: el.clientHeight / 2 - (p.y + CARD_H / 2) * k }); });
  };
  const jump = (id: string) => { if (!id) return; if (!shown(id)) setGoal(null); setSel(id); setTimeout(() => centre(id), 0); };
  const pick = (id: string) => { if (id === sel) setSel(null); else { setSel(id); centre(id); } };
  const showPath = (id: string) => { setGoal(id); setSel(id); };
  const showAll = () => { setGoal(null); };

  useEffect(() => { if (view === 'tree') fit(false); }, [view, goal]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const selNode = sel ? nodeOf(sel) : undefined;
  const path = sel ? pathTo(sel) : [];
  const leads = sel ? ITEM_EDGES.filter((e) => e.from === sel).sort((a, b) => a.level - b.level) : [];
  const badge = (id: string) => {
    const n = nodeOf(id)!, h = have(id);
    if (n.kind === 'ship' || n.kind === 'defense') return h > 0 ? `×${h}` : 'none yet';
    return `Level ${h} / ${levelsShown(id)}`;
  };

  return (
    <Page title="Tech tree">
      <div className="row wrap">
        <button className={view === 'tree' ? 'primary' : ''} onClick={() => setView('tree')}>Progression</button>
        <button className={view === 'flows' ? 'primary' : ''} onClick={() => setView('flows')}>Production and effects</button>
      </div>

      {view === 'tree' && (
        <>
          <p className="muted small">
            One card for every building, research, ship and defense. Rows group them by purpose and columns are steps: whatever a card needs is in a column to its left, joined by an arrow (faint arrows come from items that feed many others, such as the Shipyard). Click a card to light its chain and open its levels.
            <span className="tlegend done">have it</span> <span className="tlegend ready">you can start it now</span> <span className="tlegend locked">locked</span>
          </p>
          <div className="row wrap">
            <select value="" onChange={(e) => jump(e.target.value)} aria-label="Jump to an item">
              <option value="">Jump to…</option>
              {[...TREE].sort((a, b) => a.name.localeCompare(b.name)).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            <select value="" onChange={(e) => e.target.value && showPath(e.target.value)} aria-label="Show only the path to an item">
              <option value="">Show only the path to…</option>
              {[...TREE].filter((n) => n.requires.length > 0).sort((a, b) => a.name.localeCompare(b.name)).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
            {goal && <button className="primary" onClick={showAll}>Show everything</button>}
            <button onClick={() => zoomCentre(1 / 1.25)} aria-label="Zoom out">−</button>
            <button onClick={() => zoomCentre(1.25)} aria-label="Zoom in">+</button>
            <button onClick={() => fit()}>Fit all</button>
            {sel && <button onClick={() => setSel(null)}>Clear</button>}
            <span className="muted small">Drag to pan, wheel or pinch to zoom</span>
          </div>

          {goal && (
            <div className="goalbar">
              Showing only the path to <b>{nodeOf(goal)!.name}</b>.{' '}
              {status(goal) === 'done' ? <span className="good">You have it.</span>
                : nextUp.length ? <>Next you can start: {nextUp.map((id, i) => <span key={id}>{i ? ', ' : ''}<a className="itemlink" onClick={() => jump(id)}>{nodeOf(id)!.name}{needLevel!.get(id)! > 1 ? ` to level ${needLevel!.get(id)}` : ''}</a></span>)}.</>
                  : <span className="muted">Nothing on this path can be started yet.</span>}
            </div>
          )}

          {selNode && (
            <Card title={<>{selNode.name} <span className="muted small">{KIND_LABEL[selNode.kind]}</span></>} right={<span className="row"><button onClick={() => showPath(selNode.id)} disabled={!selNode.requires.length || goal === selNode.id}>Show only its path</button><button onClick={() => openItem(selNode.id)}>Details</button>{status(selNode.id) !== 'locked' && <QuickStart id={selNode.id} />}</span>}>
              <div className="treeinfo">
                <div>
                  <b>Path to get there</b>
                  {path.length === 0 && <div className="muted small">Nothing needed: it is available from the start.</div>}
                  <ol className="steps">
                    {path.map((s) => {
                      const ok = haveReq(s.id) >= s.level;
                      return <li key={s.id} className={ok ? 'good' : 'bad'}><a className="itemlink" onClick={() => jump(s.id)}>{nodeOf(s.id)!.name}</a> to level {s.level} <span className="muted small">{ok ? 'done' : `you: ${haveReq(s.id)}`}</span>{!ok && <> <QuickStart id={s.id} onlyIfReady /></>}</li>;
                    })}
                    <li><b>{selNode.name}</b>{status(selNode.id) === 'done' && !goal ? <span className="good small"> you have it</span> : ready(selNode.id) ? <span className="good small"> ready to start</span> : null}</li>
                  </ol>
                </div>
                <div>
                  <b>Needs directly</b>
                  {selNode.requires.length === 0 && <div className="muted small">Nothing.</div>}
                  {selNode.requires.map((r) => <div key={r.id} className={haveReq(r.id) >= r.level ? 'good' : 'bad'}><a className="itemlink" onClick={() => jump(r.id)}>{nodeOf(r.id)!.name}</a> level {r.level} <span className="muted small">(you: {count(r.id)})</span></div>)}
                  <b>Opens up</b>
                  {leads.length === 0 && <div className="muted small">Nothing else needs it.</div>}
                  {leads.map((e) => <div key={e.to}><a className="itemlink" onClick={() => jump(e.to)}>{nodeOf(e.to)!.name}</a> <span className="muted small">needs it at level {e.level}</span></div>)}
                </div>
              </div>
            </Card>
          )}

          <div className="graphbox" ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <div className={`graph ${gliding ? 'glide' : ''}`} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
              {layout.m.bands.map((b, i) => (
                <div key={b.id} className="band" style={{ top: layout.bandTop[i] - BAND_LABEL, height: BAND_LABEL + b.slots * (CARD_H + ROW_GAP) + BAND_GAP / 2, width: layout.width }}><span>{b.label}</span></div>
              ))}
              <svg className="edges" width="1" height="1" aria-hidden="true">
                {edges.map((e) => {
                  const pts = routes.get(e.from + '>' + e.to);
                  if (!pts) return null;
                  const end = pts[pts.length - 1];
                  const onPath = !!active && lit(e.from) && lit(e.to);
                  const forward = e.from === active || fwd.has(e.from);
                  const cls = `bedge ${nodeOf(e.from)!.kind} ${e.hub ? 'hub' : ''} ${active ? (onPath ? (forward ? 'fwd' : 'back') : 'off') : ''}`;
                  const label = onPath || (goal && !active);
                  return (
                    <g key={e.from + '>' + e.to} className={cls}>
                      <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} />
                      <circle cx={end.x} cy={end.y} r={2.8} />
                      {label && e.level > 0 && <text x={end.x - 52} y={end.y - 4}>needs {e.level}</text>}
                    </g>
                  );
                })}
              </svg>
              {layout.m.cells.map((c) => {
                const p = layout.pos.get(c.id)!, n = nodeOf(c.id)!;
                const st = status(c.id);
                const isNext = !!goal && st === 'ready';
                const cls = ['icard', n.kind, st, isNext ? 'next' : '', sel === c.id ? 'sel' : '', back.has(c.id) ? 'anc' : '', fwd.has(c.id) ? 'desc' : '', sel && !lit(c.id) ? 'dim' : '', !sel && active && lit(c.id) ? 'peek' : ''].filter(Boolean).join(' ');
                const total = levelsShown(c.id), h = have(c.id), need = needed.get(c.id);
                const ladder = sel === c.id && total > 1;
                return (
                  <div key={c.id} className={cls} style={{ left: p.x, top: p.y, width: CARD_W, height: CARD_H }} role="button" tabIndex={0} title={n.name}
                    onClick={() => { if (gesture.current.moved <= 6) pick(c.id); }} onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(c.id); } }}>
                    <div className="iname"><ItemIcon id={c.id} size={16} /> {n.name}{st === 'done' && !isNext ? <span className="tick"> ✓</span> : null}</div>
                    <div className="ibadge">{badge(c.id)}{needLevel?.get(c.id) && needLevel.get(c.id)! > 1 ? ` · need ${needLevel.get(c.id)}` : ''}</div>
                    {ladder && (
                      <div className="ladder" style={{ width: Math.min(total, 12) * LADDER + 12 }} onClick={(e) => e.stopPropagation()}>
                        {Array.from({ length: total }, (_, i) => i + 1).map((l) => (
                          <span key={l} className={`pip ${l <= h ? 'done' : l === h + 1 && ready(c.id) ? 'next' : 'locked'} ${need?.has(l) ? 'need' : ''}`} title={`${n.name} ${l}`}>{l}</span>
                        ))}
                      </div>
                    )}
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
