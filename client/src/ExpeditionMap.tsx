import { useEffect, useState } from 'react';
import { EXPEDITION_HOURS, UNITS } from '../../shared/data';
import { Art } from './art';
import { get, post } from './api';
import { angles, flightState, legs, polar, shares, stageLabel, type Flight } from './flights';
import { useGame } from './game';
import { Card, CoordLink, Countdown, ItemIcon, fmt, fmtDur } from './ui';
import { ResIcon } from './ResIcon';

const W = 560, H = 430, CX = 280, CY = 220, R0 = 46, R1 = 150;
const STAGE_COLOR = { out: '#ffb347', exploring: '#a88bff', back: '#5fd28a' } as const;

interface Mission extends Flight {
  from: { g: number; s: number; p: number }; to: { g: number; s: number; p: number };
  ships: Record<string, number>; cargo?: { metal: number; crystal: number; deuterium: number }; fromId?: string; fromName?: string;
}
interface Result { id: string; subject: string; at: number }

const shipCount = (s: Record<string, number>) => Object.values(s).reduce((a, n) => a + (n || 0), 0);

/** Fleet page: every expedition that is out, as a chart (home in the middle, one spoke out to deep space for each fleet, the ship riding along it) with a timeline per fleet and the latest results. */
export function ExpeditionMap() {
  const { me, planets, fleets, now, act } = useGame();
  const list = (fleets.mine as Mission[]).filter((m) => m.mission === 'expedition');
  const [results, setResults] = useState<Result[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => get('/messages').then((r: any[]) => { if (alive) setResults(r.filter((x) => x.kind === 'expedition').slice(0, 5).map((x) => ({ id: x.id, subject: x.subject, at: x.at }))); }).catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [list.length]);

  const slots = me.slots;
  const spokes = angles(list.length);
  const home = list.length ? planets.find((p) => p.id === list[0].fromId) ?? planets.find((p) => !p.isMoon) : planets.find((p) => !p.isMoon);

  return (
    <Card title={`Expeditions (${slots.expUsed}/${slots.expMax} out)`}>
      {list.length === 0 && (
        <p className="muted">No expedition is out. {slots.expMax < 1 ? 'Research Astrophysics to send one.' : `Send a fleet to deep space from the form below: it flies out, looks around for ${EXPEDITION_HOURS.min} to ${EXPEDITION_HOURS.max} hours and comes back with what it found.`}</p>
      )}
      {list.length > 0 && (
        <div className="expmap">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chart of ${list.length} active expedition${list.length === 1 ? '' : 's'}`}>
            <defs>
              <radialGradient id="expglow"><stop offset="0" stopColor="#4a63c9" stopOpacity=".35" /><stop offset="1" stopColor="#4a63c9" stopOpacity="0" /></radialGradient>
              <clipPath id="exphome"><circle cx={CX} cy={CY} r={R0 - 8} /></clipPath>
            </defs>
            <rect width={W} height={H} rx="12" fill="#070b18" />
            <circle cx={CX} cy={CY} r={R1 + 24} fill="url(#expglow)" />
            {[0.34, 0.67, 1].map((k, i) => <circle key={i} cx={CX} cy={CY} r={R0 + (R1 - R0) * k} fill="none" stroke="#2a3558" strokeDasharray={i === 2 ? '' : '3 6'} strokeWidth={i === 2 ? 1.5 : 1} />)}
            <text x={W - 10} y={H - 10} textAnchor="end" fill="#7d879f" fontSize="11">outer ring = deep space</text>
            {home && <image href={Art.planet(home.id, home.maxTemp, !!home.isMoon)} x={CX - R0 + 8} y={CY - R0 + 8} width={(R0 - 8) * 2} height={(R0 - 8) * 2} clipPath="url(#exphome)" />}
            <circle cx={CX} cy={CY} r={R0 - 8} fill="none" stroke="#ffb347" strokeWidth="1.5" />
            {list.map((m, i) => {
              const s = flightState(m, now);
              const a = spokes[i];
              const tip = polar(CX, CY, R1, a), root = polar(CX, CY, R0, a);
              const pos = polar(CX, CY, R0 + (R1 - R0) * s.distance, a);
              const trail = polar(CX, CY, R0 + (R1 - R0) * Math.max(0, s.distance + (s.stage === 'back' ? 0.18 : -0.18)), a);
              const color = STAGE_COLOR[s.stage];
              const heading = (a * 180) / Math.PI + (s.stage === 'back' ? 180 : 0);
              return (
                <g key={m.id}>
                  <line x1={root.x} y1={root.y} x2={tip.x} y2={tip.y} stroke="#2a3558" strokeDasharray="2 5" />
                  <line x1={trail.x} y1={trail.y} x2={pos.x} y2={pos.y} stroke={color} strokeWidth="3" strokeLinecap="round" opacity=".55" />
                  <circle cx={tip.x} cy={tip.y} r="6" fill="#0d1430" stroke={s.stage === 'exploring' ? color : '#55638f'} strokeWidth="2" />
                  {s.stage === 'exploring' && <circle cx={tip.x} cy={tip.y} r="12" fill="none" stroke={color} strokeWidth="1.5" opacity=".7"><animate attributeName="r" values="8;22" dur="2s" repeatCount="indefinite" /><animate attributeName="opacity" values=".8;0" dur="2s" repeatCount="indefinite" /></circle>}
                  <g transform={`translate(${pos.x} ${pos.y}) rotate(${heading})`}>
                    <path d="M 9 0 L -6 -5.5 L -3 0 L -6 5.5 Z" fill={color} stroke="#fff" strokeWidth="1" />
                  </g>
                  <foreignObject x={Math.min(W - 124, Math.max(4, polar(CX, CY, R1 + 14, a).x - (Math.cos(a) < -0.2 ? 118 : Math.cos(a) > 0.2 ? 0 : 59)))} y={polar(CX, CY, R1 + 14, a).y - (Math.sin(a) < -0.5 ? 36 : Math.sin(a) > 0.5 ? 0 : 16)} width="120" height="38">
                    <div className="expcap"><b style={{ color }}>#{i + 1}</b> <CoordLink c={m.to} /><br /><span className="muted">{stageLabel[s.stage]}</span></div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>
          <div className="explist">
            {list.map((m, i) => {
              const s = flightState(m, now), sh = shares(m), l = legs(m);
              const color = STAGE_COLOR[s.stage];
              return (
                <div key={m.id} className="expfleet">
                  <div className="row between">
                    <span><b style={{ color }}>#{i + 1}</b> {stageLabel[s.stage]} · {s.stage === 'out' ? 'arrives' : s.stage === 'exploring' ? 'leaves' : 'home'} in <Countdown to={now + s.stageLeftMs} /></span>
                    {m.phase !== 'returning' && <button className="link" onClick={() => confirm('Recall this expedition? It turns around at once.') && void act(() => post(`/fleets/${m.id}/recall`), 'Recalled')}>Recall</button>}
                  </div>
                  <div className="exptime" role="img" aria-label={`Journey ${Math.round(s.journey * 100)}% done`}>
                    <span className="seg out" style={{ width: `${sh.out * 100}%` }}>out</span>
                    <span className="seg stay" style={{ width: `${sh.stay * 100}%` }}>{sh.stay > 0.08 ? (l.stayPlanned ? 'exploring (up to)' : 'exploring') : ''}</span>
                    <span className="seg back" style={{ width: `${sh.back * 100}%` }}>back</span>
                    <i className="nowmark" style={{ left: `${s.journey * 100}%` }} />
                  </div>
                  <div className="muted small">
                    Home in about {fmtDur(s.homeInMs)}{l.stayPlanned ? ' (if it stays the full time)' : ''} ·{' '}
                    {Object.entries(m.ships).filter(([, n]) => n).map(([id, n]) => <span key={id}><ItemIcon id={id} size={14} /> {fmt(n)}× {UNITS[id as keyof typeof UNITS]?.name ?? id} </span>)}
                    {m.cargo && (m.cargo.metal + m.cargo.crystal + m.cargo.deuterium) > 0 && <> · carrying {(['metal', 'crystal', 'deuterium'] as const).filter((k) => m.cargo![k] > 0).map((k) => <span key={k}><ResIcon k={k} size={13} /> {fmt(m.cargo![k])} </span>)}</>}
                    · {fmt(shipCount(m.ships))} ships
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {results.length > 0 && (
        <>
          <h4>Latest results</h4>
          <ul className="expresults">{results.map((r) => <li key={r.id}>{r.subject} <span className="muted small">· {new Date(r.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span></li>)}</ul>
        </>
      )}
    </Card>
  );
}
