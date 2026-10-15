import { Art } from '../art';
import { useGame } from '../game';
import { Loading, fmtDur } from '../ui';
import { VIEW, bodyPoint, bodySize, orbitRadius, shortNum, type Pt } from './geometry';
import { MovingShip, Route, RoundClip, useMapData, type Layers, type MoveView } from './parts';

const cx = VIEW.w / 2, cy = VIEW.h / 2, squash = 0.8;
const word = (v: any) => `${v.name} (${v.owner}${v.alliance ? ` [${v.alliance}]` : ''})`;

/** One system from above: the star, an orbit for each position and a body on it with its owner, size, what is known of its strength and what is coming at it. */
export function SystemView({ g, s, layers, open }: { g: number; s: number; layers: Layers; open: (planet: any) => void }) {
  const { now } = useGame();
  const d = useMapData<{ positions: any[]; positionCount: number; sector: any; rift: any; moves: MoveView[] }>(`/map/system/${g}/${s}`);
  if (!d) return <Loading />;
  const at = (p: number): Pt => bodyPoint(g, s, p, d.positionCount, cx, cy, squash);
  const edge = (p: Pt, k: number): Pt => { const a = Math.atan2(p.y - cy, p.x - cx); return { x: p.x + Math.cos(a) * k, y: p.y + Math.sin(a) * k }; };
  return (
    <>
      <RoundClip />
      <svg className="mapsvg" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="group" aria-label={`System ${g}:${s}`}>
        <defs><radialGradient id="mp-star"><stop offset="0" stopColor="#fff6c8" /><stop offset=".35" stopColor="#ffcf6b" stopOpacity=".9" /><stop offset="1" stopColor="#ff9a2e" stopOpacity="0" /></radialGradient></defs>
        {layers.territory && d.sector?.owner && <ellipse className="mp-sector" cx={cx} cy={cy} rx={orbitRadius(d.positionCount, d.positionCount) + 28} ry={(orbitRadius(d.positionCount, d.positionCount) + 28) * squash} style={{ stroke: `hsl(${[...d.sector.owner.tag].reduce((h: number, c: string) => h + c.charCodeAt(0) * 37, 0) % 360} 60% 50%)` }}><title>{`Held by [${d.sector.owner.tag}] ${d.sector.owner.name}`}</title></ellipse>}
        {Array.from({ length: d.positionCount }, (_, i) => i + 1).map((p) => <ellipse key={p} className="mp-orbit" cx={cx} cy={cy} rx={orbitRadius(p, d.positionCount)} ry={orbitRadius(p, d.positionCount) * squash} />)}
        <circle className="mp-sun" cx={cx} cy={cy} r={46} fill="url(#mp-star)" />
        {layers.markers && d.rift && <g className="mp-riftbig"><circle cx={cx} cy={cy} r={20} /><text x={cx} y={cy + 4} textAnchor="middle">☄</text><title>The Void rift opens here</title></g>}
        {layers.fleets && d.moves.map((m) => {
          const a = m.from.g === g && m.from.s === s ? at(m.from.p) : null, b = m.to.g === g && m.to.s === s ? at(m.to.p) : null;
          if (a && b && m.from.p !== m.to.p) return <g key={m.id}><Route a={a} b={b} kind={m.kind} /><MovingShip a={a} b={b} m={m} /></g>;
          const here = a ?? b;
          if (!here) return null;
          const out = edge(here, 70);
          return <g key={m.id}><Route a={here} b={out} kind={m.kind} /><MovingShip a={a ? here : out} b={a ? out : here} m={m} /><text className="mp-sub" x={out.x} y={out.y - 4} textAnchor="middle">{m.kind === 'hostile' ? '⚠ ' : ''}{a ? `→ ${m.to.g}:${m.to.s}:${m.to.p}` : `from ${m.from.g}:${m.from.s}:${m.from.p}`}</text></g>;
        })}
        {d.positions.map((pos) => {
          const c = at(pos.p), pl = pos.planet;
          if (!pl) return (
            <g key={pos.p} className="mp-empty"><title>{`Position ${pos.p}: empty${pos.debris ? ` (debris ${shortNum(pos.debris.metal + pos.debris.crystal)})` : ''}`}</title>
              <circle cx={c.x} cy={c.y} r={3} />
              {layers.markers && pos.debris && <text className="mp-mark deb" x={c.x + 6} y={c.y + 4}>✦ {shortNum(pos.debris.metal + pos.debris.crystal)}</text>}
            </g>
          );
          const size = bodySize(pl.diameter), r = size / 2;
          const sprite = Art.spriteOfLook(pl.look, false) ?? Art.planet(pl.id, 40, false);
          const known = pl.strength ?? pl.intel;
          const def = pl.strength ? pl.strength.defenseValue : pl.intel?.defenseValue, fl = pl.strength ? pl.strength.fleetValue : pl.intel?.fleetValue;
          const age = pl.intel ? now - pl.intel.at : 0;
          return (
            <g key={pos.p} className={`mp-body${pl.mine ? ' mine' : ''}${pl.relation === 'ally' ? ' ally' : ''}${pl.relation === 'war' ? ' war' : ''}`} onClick={() => open(pl)} role="button" tabIndex={0} aria-label={`Position ${pos.p}: ${pl.name}`} onKeyDown={(e) => { if (e.key === 'Enter') open(pl); }}>
              <title>{`${g}:${s}:${pos.p} ${word(pl)}${pl.outpost ? ` · ${pl.outpost.name} ${pl.outpost.tier}${pl.outpost.state === 'cleared' ? ' (cleared)' : ''}` : ''}${pl.status?.vacation ? ' · on vacation' : ''}${pl.status?.protection ? ' · protected' : ''}${pl.holders ? ` · ${pl.holders} fleet${pl.holders === 1 ? '' : 's'} holding` : ''}${pl.intel ? ` · report ${fmtDur(age)} old` : pl.mine ? '' : ' · no report'}`}</title>
              {layers.alerts && pl.alert && <circle className="mp-alert" cx={c.x} cy={c.y} r={r + 12} />}
              {pl.mine && <circle className="mp-ring" cx={c.x} cy={c.y} r={r + 5} />}
              {layers.territory && pl.alliance && !pl.mine && <circle className="mp-allyring" cx={c.x} cy={c.y} r={r + 4} />}
              <image href={sprite} x={c.x - r} y={c.y - r} width={size} height={size} clipPath="url(#mp-round)" />
              {pl.moon && <image className="mp-moon" href={Art.spriteOfLook(pl.moon.look, true) ?? Art.planet(pl.moon.id, 0, true)} x={c.x + r - 2} y={c.y - r - 4} width={14} height={14} clipPath="url(#mp-round)" />}
              {layers.markers && pl.outpost && <text className="mp-mark skull" x={c.x - r - 12} y={c.y - r + 2}>☠</text>}
              {layers.markers && pos.debris && <text className="mp-mark deb" x={c.x + r + 4} y={c.y + r + 2}>✦</text>}
              {pl.holders > 0 && <text className="mp-mark" x={c.x - r - 12} y={c.y + r}>🛡</text>}
              <text className="mp-name" x={c.x} y={c.y + r + 12} textAnchor="middle">{pl.alliance ? `[${pl.alliance}] ` : ''}{pl.name.length > 14 ? `${pl.name.slice(0, 13)}…` : pl.name}</text>
              <text className={`mp-str${pl.intel && age > 86_400_000 ? ' old' : ''}${known ? '' : ' none'}`} x={c.x} y={c.y + r + 24} textAnchor="middle">{known ? `${pl.intel ? '≈ ' : ''}🛡${shortNum(def ?? 0)} ⚔${shortNum(fl ?? 0)}` : pl.mine ? '' : '? no report'}</text>
            </g>
          );
        })}
      </svg>
    </>
  );
}
