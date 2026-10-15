import { tint } from '../pages/Territory';
import { useGame } from '../game';
import { Loading, fmtDur } from '../ui';
import { VIEW, spiralPoint, type Pt } from './geometry';
import { MovingShip, Route, useMapData, type Layers, type MoveView } from './parts';

/** The systems of one galaxy on a spiral: who is where, who holds what, and where the fleets, alerts, outposts and debris are. Click a system to look into it. */
export function GalaxyView({ g, layers, open }: { g: number; layers: Layers; open: (s: number) => void }) {
  const { now } = useGame();
  const d = useMapData<{ systemCount: number; systems: any[]; moves: MoveView[] }>(`/map/galaxy/${g}`);
  if (!d) return <Loading />;
  const pt = (s: number): Pt => spiralPoint(s - 1, d.systemCount);
  const by = new Map<number, any>(d.systems.map((s) => [s.s, s]));
  return (
    <svg className="mapsvg" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="group" aria-label={`Galaxy ${g}: its systems`}>
      {layers.fleets && d.moves.map((m) => {
        const a = m.from.g === g ? pt(m.from.s) : null, b = m.to.g === g ? pt(m.to.s) : null;
        if (a && b && (m.from.s !== m.to.s)) return <g key={m.id}><Route a={a} b={b} kind={m.kind} /><MovingShip a={a} b={b} m={m} /></g>;
        const here = a ?? b;
        if (!here) return null;
        const out = { x: here.x + (here.x < VIEW.w / 2 ? -26 : 26), y: here.y - 18 };       // a fleet that crosses the edge of the galaxy leaves a stub pointing out
        return <g key={m.id}><Route a={here} b={out} kind={m.kind} /><MovingShip a={a ? here : out} b={a ? out : here} m={m} /></g>;
      })}
      {Array.from({ length: d.systemCount }, (_, i) => i + 1).map((s) => {
        const p = pt(s), sys = by.get(s);
        const r = sys ? 5 + Math.min(6, sys.planets) : 2.5;
        const cls = !sys ? 'empty' : sys.mine ? 'mine' : sys.allies ? 'ally' : sys.others ? 'other' : 'npc';
        return (
          <g key={s} className={`mp-sys ${cls}`} onClick={() => open(s)} role="button" tabIndex={0} aria-label={`System ${g}:${s}`} onKeyDown={(e) => { if (e.key === 'Enter') open(s); }}>
            <title>{sys ? `System ${g}:${s}: ${sys.planets} planet${sys.planets === 1 ? '' : 's'}${sys.mine ? `, ${sys.mine} yours` : ''}${sys.holder ? `, held by [${sys.holder.tag}]` : ''}${sys.outposts ? `, ${sys.outposts} outpost${sys.outposts === 1 ? '' : 's'}` : ''}${sys.alert ? `, ATTACK in ${fmtDur(sys.alert.arriveAt - now)}` : ''}` : `System ${g}:${s}: empty`}</title>
            {layers.territory && sys?.holder && <circle className="mp-hold" cx={p.x} cy={p.y} r={r + 5} style={{ stroke: tint(sys.holder.tag, sys.holder.mine) }} />}
            {layers.alerts && sys?.alert && <circle className="mp-alert" cx={p.x} cy={p.y} r={r + 8} />}
            <circle className="mp-dot" cx={p.x} cy={p.y} r={r} />
            {layers.markers && sys?.rift && <circle className="mp-rift" cx={p.x} cy={p.y} r={r + 9} />}
            {layers.markers && sys?.outposts > 0 && <text className="mp-mark" x={p.x + r + 3} y={p.y - r}>☠</text>}
            {layers.markers && sys?.debris > 0 && <text className="mp-mark deb" x={p.x - r - 11} y={p.y - r}>✦</text>}
            {(sys?.mine || s % 5 === 0 || (sys && d.systemCount <= 60)) && <text className="mp-num" x={p.x} y={p.y + r + 11} textAnchor="middle">{s}</text>}
          </g>
        );
      })}
    </svg>
  );
}
