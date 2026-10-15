import { tint } from '../pages/Territory';
import { Loading } from '../ui';
import { VIEW, spiralPoint, type Pt } from './geometry';
import { MovingShip, Route, useMapData, type Layers, type MoveView } from './parts';

/** Every galaxy as a disc of stars with what is known of it written beside it; click one to look into it. */
export function UniverseView({ layers, open }: { layers: Layers; open: (g: number) => void }) {
  const d = useMapData<{ galaxies: any[]; moves: MoveView[] }>('/map/universe');
  if (!d) return <Loading />;
  const n = d.galaxies.length;
  const cols = Math.min(n, 3), rows = Math.ceil(n / cols);
  const cell = { w: VIEW.w / cols, h: VIEW.h / rows };
  const centre = (i: number): Pt => ({ x: (i % cols) * cell.w + cell.w / 2, y: Math.floor(i / cols) * cell.h + cell.h / 2 - 8 });
  const radius = Math.min(cell.w, cell.h) * 0.36;
  return (
    <svg className="mapsvg" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="group" aria-label="The universe: every galaxy">
      {layers.fleets && d.moves.filter((m) => m.from.g !== m.to.g).map((m) => <g key={m.id}><Route a={centre(m.from.g - 1)} b={centre(m.to.g - 1)} kind={m.kind} /><MovingShip a={centre(m.from.g - 1)} b={centre(m.to.g - 1)} m={m} /></g>)}
      {d.galaxies.map((g, i) => {
        const c = centre(i), top = g.holders[0];
        const stars = Math.min(70, g.systems);
        return (
          <g key={g.g} className="mp-galaxy" onClick={() => open(g.g)} role="button" tabIndex={0} aria-label={`Galaxy ${g.g}`} onKeyDown={(e) => { if (e.key === 'Enter') open(g.g); }}>
            <title>{`Galaxy ${g.g}: ${g.planets} planets in ${g.occupied} of ${g.systems} systems${g.mine ? `, ${g.mine} yours` : ''}${g.outposts ? `, ${g.outposts} outposts` : ''}`}</title>
            <circle className="mp-disc" cx={c.x} cy={c.y} r={radius + 16} style={layers.territory && top ? { stroke: tint(top.tag, top.mine) } : undefined} />
            {Array.from({ length: stars }, (_, k) => { const p = spiralPoint(k, stars, radius * 2, radius * 2); return <circle key={k} className={`mp-star${k < Math.round((g.occupied / g.systems) * stars) ? ' lit' : ''}`} cx={c.x - radius + p.x} cy={c.y - radius + p.y} r={1.6} />; })}
            {g.mine > 0 && <circle className="mp-mine" cx={c.x} cy={c.y} r={6} />}
            {layers.markers && g.rift && <circle className="mp-rift" cx={c.x + radius * 0.55} cy={c.y - radius * 0.55} r={12}><title>The Void rift is here</title></circle>}
            {layers.alerts && g.alert && <circle className="mp-alert" cx={c.x} cy={c.y} r={radius + 22} />}
            <text className="mp-title" x={c.x} y={c.y + radius + 42} textAnchor="middle">Galaxy {g.g}</text>
            <text className="mp-sub" x={c.x} y={c.y + radius + 58} textAnchor="middle">{g.planets} planets · {g.occupied}/{g.systems} systems{g.mine ? ` · ${g.mine} yours` : ''}</text>
            {layers.territory && g.holders.length > 0 && <text className="mp-sub" x={c.x} y={c.y + radius + 73} textAnchor="middle">{g.holders.map((h: any) => `[${h.tag}] ${h.count}`).join('  ')}</text>}
          </g>
        );
      })}
    </svg>
  );
}
