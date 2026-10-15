import { UNITS } from '../../../shared/data';
import type { Mission } from '../../../shared/types';
import { Art } from '../art';
import { useGame } from '../game';
import { Card, CoordLink, Loading, fmt, fmtDur } from '../ui';
import { VIEW, shortNum } from './geometry';
import { RoundClip, useMapData, type Layers, type MoveView } from './parts';

type Units = Record<string, number | undefined>;
const worth = (u: Units | null | undefined) => Object.entries(u ?? {}).reduce((t, [id, n]) => t + (n || 0) * ((UNITS as any)[id]?.cost.metal + (UNITS as any)[id]?.cost.crystal || 0), 0);
const byStrength = (u: Units | null | undefined) => Object.entries(u ?? {}).filter(([id, n]) => n && (UNITS as any)[id]).sort((a, b) => (UNITS as any)[b[0]].attack * (b[1] as number) - (UNITS as any)[a[0]].attack * (a[1] as number)) as [string, number][];

/**
 * One planet from above: the world in the middle, its defenses on a ring round it, the fleet in a row below and whoever holds there beside it.
 * Your own world is drawn from the facts; another one from your latest spy report (its age on top), or as a question mark when you have none.
 */
export function PlanetView({ planetId, layers, open, again }: { planetId: string; layers: Layers; open: (planetId: string, name: string) => void; again: () => void }) {
  const { now, setTarget, setPage, selectPlanet, showInGalaxy } = useGame();
  const d = useMapData<any>(`/map/planet/${planetId}`);
  if (!d) return <Loading />;
  const mine = d.mine;
  const defenses = byStrength(mine ? d.defenses : d.intel?.defenses), fleet = byStrength(mine ? d.fleet : d.intel?.fleet);
  const known = mine || !!d.intel;
  const cx = VIEW.w / 2, cy = 232;
  const sprite = Art.spriteOfLook(d.look, d.isMoon) ?? Art.planet(d.id, 40, d.isMoon);
  const ring = (i: number, n: number) => { const a = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2; return { x: cx + Math.cos(a) * 190, y: cy + Math.sin(a) * 150 }; };
  const row = (i: number, n: number, y: number) => ({ x: n === 1 ? cx : 130 + (i * (VIEW.w - 260)) / (n - 1), y });
  const send = (mission: Mission) => { setTarget({ coords: d.coords, mission, toMoon: d.isMoon }); setPage('fleet'); };
  const age = d.intel ? now - d.intel.at : 0;
  const moves: MoveView[] = d.moves;
  return (
    <>
      <RoundClip />
      <svg className="mapsvg" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="group" aria-label={`${d.name}: defenses and fleets`}>
        <ellipse className="mp-orbit" cx={cx} cy={cy} rx={190} ry={150} />
        <ellipse className="mp-orbit inner" cx={cx} cy={cy} rx={128} ry={102} />
        {layers.alerts && moves.some((m) => m.kind === 'hostile' && m.phase === 'outbound' && m.to.p === d.coords.p && m.to.s === d.coords.s && m.to.g === d.coords.g) && <circle className="mp-alert" cx={cx} cy={cy} r={118} />}
        <image className="mp-planetbig" href={sprite} x={cx - 92} y={cy - 92} width={184} height={184} clipPath="url(#mp-round)" opacity={known ? 1 : 0.7} />
        {!known && <text className="mp-question" x={cx} y={cy + 24} textAnchor="middle">?</text>}
        {d.sibling && <image className="mp-sibling" href={Art.spriteOfLook(d.sibling.look, d.sibling.isMoon) ?? Art.planet(d.sibling.id, 0, d.sibling.isMoon)} x={cx + 98} y={cy - 98} width={46} height={46} clipPath="url(#mp-round)" onClick={() => open(d.sibling.id, d.sibling.name)} role="button" tabIndex={0} aria-label={`Show ${d.sibling.name}`}><title>{`Show the ${d.sibling.isMoon ? 'moon' : 'planet'} ${d.sibling.name}`}</title></image>}
        <text className="mp-title" x={cx} y={cy + 118} textAnchor="middle">{d.name} · {d.coords.g}:{d.coords.s}:{d.coords.p}</text>
        {defenses.length === 0 && <text className="mp-sub" x={cx} y={cy - 130} textAnchor="middle">{known ? 'No defenses' : 'Defenses unknown'}</text>}
        {defenses.map(([id, n], i) => { const p = ring(i, defenses.length); const u = (UNITS as any)[id]; return (
          <g key={id} className="mp-unit def" transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
            <title>{`${n.toLocaleString('en-US')}× ${u.name}`}</title>
            <image href={Art.icon('defense', id, u.name)} x={-21} y={-21} width={42} height={42} clipPath="url(#mp-round)" />
            <text className="mp-count" y={34} textAnchor="middle">{shortNum(n)}</text>
          </g>
        ); })}
        <text className="mp-label" x={64} y={452}>{mine ? 'Fleet at home' : known ? 'Fleet in the report' : 'Fleet unknown'}</text>
        {fleet.length === 0 && <text className="mp-sub" x={cx} y={490} textAnchor="middle">{known ? 'No ships' : 'Send probes to find out'}</text>}
        {fleet.slice(0, 11).map(([id, n], i, all) => { const p = row(i, all.length, 492); const u = (UNITS as any)[id]; return (
          <g key={id} className="mp-unit ship" transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`} style={{ animationDelay: `${i * 0.25}s` }}>
            <title>{`${n.toLocaleString('en-US')}× ${u.name}`}</title>
            <image href={Art.icon('ship', id, u.name)} x={-23} y={-23} width={46} height={46} clipPath="url(#mp-round)" />
            <text className="mp-count" y={38} textAnchor="middle">{shortNum(n)}</text>
          </g>
        ); })}
        {d.holders.length > 0 && <text className="mp-label" x={64} y={548}>Allies holding here</text>}
        {d.holders.slice(0, 6).map((h: any, i: number) => (
          <g key={i} className="mp-unit hold" transform={`translate(${300 + i * 110} 560)`}>
            <title>{`${h.owner}${h.mine ? ' (you)' : ''}: ${byStrength(h.ships).map(([id, n]) => `${n}× ${(UNITS as any)[id].name}`).join(', ')}${h.until ? `, leaves in ${fmtDur(h.until - now)}` : ''}`}</title>
            <text className="mp-mark" y={4}>🛡</text><text className="mp-count" x={16} y={4}>{h.owner.length > 9 ? `${h.owner.slice(0, 8)}…` : h.owner}</text>
          </g>
        ))}
      </svg>
      <Card title={d.name} right={<span className="row">{d.sibling && <button onClick={() => open(d.sibling.id, d.sibling.name)}>Show the {d.sibling.isMoon ? 'moon' : 'planet'}</button>}<button onClick={again}>Back to the system</button></span>}>
        <p className="small">
          <CoordLink c={d.coords} /> · {d.mine ? 'your world' : <>{d.owner.name}{d.owner.alliance ? ` [${d.owner.alliance}]` : ''}{d.owner.npc ? ` (computer empire, ${d.owner.npc})` : ''}</>}{d.outpost ? ` · ${d.outpost.name}, strength ${d.outpost.tier}${d.outpost.state === 'cleared' ? ', cleared' : ''}` : ''}{d.diameter ? ` · ${fmt(d.diameter)} km` : ''}
        </p>
        <p className="small">
          Defenses {known ? <b>{fmt(Math.round(worth(mine ? d.defenses : d.intel?.defenses)))}</b> : <b>?</b>} · fleet {known ? <b>{fmt(Math.round(worth(mine ? d.fleet : d.intel?.fleet)))}</b> : <b>?</b>} <span className="muted">(resources of units)</span>
          {!mine && d.intel && <span className={age > 86_400_000 ? 'bad' : 'muted'}> · from your spy report {fmtDur(age)} ago{d.intel.level != null ? ` (detail level ${d.intel.level})` : ''}: it may be out of date</span>}
          {!mine && !d.intel && <span className="muted"> · you have no spy report on this world</span>}
        </p>
        <div className="row wrap">
          {mine ? <button onClick={() => { selectPlanet(d.id); setPage('overview'); }}>Open its Overview</button> : (
            <>
              <button className="primary" onClick={() => send('espionage')}>{d.intel ? 'Spy again' : 'Send probes'}</button>
              <button onClick={() => send('attack')}>Attack</button>
              <button onClick={() => send('transport')}>Transport</button>
              <button onClick={() => send('hold')}>Defend</button>
            </>
          )}
          <button className="link" onClick={() => showInGalaxy(d.coords)}>Show in the galaxy list</button>
        </div>
      </Card>
    </>
  );
}
