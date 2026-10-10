import { useState } from 'react';
import { BUILDINGS, TECHS, UNITS } from '../../../shared/data';
import { post } from '../api';
import { useGame } from '../game';
import { Card, Countdown, Page, Progress, coordStr, fmt } from '../ui';

export function Overview() {
  const { me, planet, planets, fleets, act, setPage, selectPlanet } = useGame();
  const [name, setName] = useState('');
  const pts = me.player.points;
  const b = planet.buildQueue;
  const r = me.player.research;
  const q = planet.shipyardQueue[0];
  return (
    <Page title={`${planet.name} ${coordStr(planet.coords)}`}>
      <div className="grid2">
        <Card title="Planet">
          <table className="kv">
            <tbody>
              <tr><td>Fields</td><td>{planet.usedFields} / {planet.fields}</td></tr>
              <tr><td>Max temperature</td><td>{planet.maxTemp} °C</td></tr>
              <tr><td>Position</td><td>{coordStr(planet.coords)}</td></tr>
              <tr><td>Production / h</td><td><span className="metal">{fmt(planet.production.metal)}</span> · <span className="crystal">{fmt(planet.production.crystal)}</span> · <span className="deut">{fmt(planet.production.deuterium)}</span></td></tr>
              <tr><td>Energy</td><td>{fmt(planet.production.energyProduced)} / {fmt(planet.production.energyUsed)} ({Math.round(planet.production.efficiency * 100)}%)</td></tr>
            </tbody>
          </table>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void act(() => post(`/planets/${planet.id}/rename`, { name }), 'Renamed').then(() => setName('')); }}>
            <input placeholder="Rename planet" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
            <button>Rename</button>
          </form>
        </Card>

        <Card title="Commander">
          <table className="kv">
            <tbody>
              <tr><td>Points</td><td><b>{fmt(pts.total)}</b> (B {fmt(pts.buildings)} · R {fmt(pts.research)} · F {fmt(pts.fleet)} · D {fmt(pts.defense)})</td></tr>
              <tr><td>Colonies</td><td>{planets.length} / {me.maxPlanets}</td></tr>
              <tr><td>Fleet slots</td><td>{me.slots.used} / {me.slots.max} · expeditions {me.slots.expUsed} / {me.slots.expMax}</td></tr>
              <tr><td>Battles</td><td>{me.player.stats.battlesWon}W / {me.player.stats.battlesLost}L · raids repelled {me.player.stats.raidsRepelled}</td></tr>
              <tr><td>Alliance</td><td>{me.alliance ? `[${me.alliance.tag}] ${me.alliance.name}` : <a onClick={() => setPage('alliance')}>none – find one</a>}</td></tr>
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="In progress">
        {!b && !r && !q && <p className="muted">Nothing is being built. Head to Buildings or Research.</p>}
        {b && <div className="job"><div>Building: <b>{BUILDINGS[b.id as keyof typeof BUILDINGS].name}</b> → level {b.level} <Countdown to={b.end} /></div><Progress from={b.start} to={b.end} /></div>}
        {r && <div className="job"><div>Research: <b>{TECHS[r.id as keyof typeof TECHS].name}</b> → level {r.level} <Countdown to={r.end} /></div><Progress from={r.start} to={r.end} /></div>}
        {q && <div className="job"><div>Shipyard: <b>{q.remaining}× {UNITS[q.id as keyof typeof UNITS].name}</b> remaining</div></div>}
      </Card>

      <Card title="Fleet movements" right={<button onClick={() => setPage('fleet')}>Fleet</button>}>
        {fleets.mine.length === 0 ? <p className="muted">All ships are home.</p> : fleets.mine.slice(0, 5).map((m) => (
          <div key={m.id}>{m.mission} → {coordStr(m.to)} <span className="muted">({m.phase})</span> <Countdown to={m.phase === 'outbound' ? m.arriveAt : m.phase === 'holding' ? m.holdUntil : m.returnAt} /></div>
        ))}
      </Card>

      {planets.length > 1 && (
        <Card title="Your planets">
          <div className="chips">{planets.map((p) => <button key={p.id} className={p.id === planet.id ? 'active' : ''} onClick={() => selectPlanet(p.id)}>{p.name} {coordStr(p.coords)}</button>)}</div>
        </Card>
      )}
    </Page>
  );
}
