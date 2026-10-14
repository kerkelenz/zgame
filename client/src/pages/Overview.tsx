import { useState } from 'react';
import { EnergyIcon, ResIcon } from '../ResIcon';
import { BUILDINGS, POSITION_BONUS, TECHS, UNITS, crawlerBonus } from '../../../shared/data';
import { post } from '../api';
import { Art } from '../art';
import { useGame } from '../game';
import { Card, CoordLink, coordStr, Cost, Countdown, fmt, Page, Progress } from '../ui';
import { FleetEvents } from './FleetEvents';

export function Overview() {
  const { me, planet, planets, fleets, act, setPage, selectPlanet } = useGame();
  const [name, setName] = useState('');
  const pts = me.player.points;
  const b = planet.buildQueue;
  const r = me.player.research;
  const q = planet.shipyardQueue[0];
  // a planet and its moon are shown together, whichever of the two is selected
  const parentPlanet = planet.isMoon ? planets.find((x) => x.id === planet.parentId) ?? planet : planet;
  const moon = planet.isMoon ? planet : planets.find((x) => x.parentId === planet.id);
  const ordered = planets.filter((x) => !x.isMoon).flatMap((x) => [x, ...planets.filter((y) => y.parentId === x.id)]);
  return (
    <Page title={`${planet.name} ${coordStr(planet.coords)}`}>
      <FleetEvents />

      <div className="grid2">
        <Card title="Planet">
          <div className="bodies">
            {[parentPlanet, moon].filter((b): b is typeof planet => !!b).map((b) => (
              <button key={b.id} className={`celestial ${b.isMoon ? 'moon' : ''} ${b.id === planet.id ? 'on' : ''}`} onClick={() => selectPlanet(b.id)} title={b.isMoon ? 'Show the moon' : 'Show the planet'}>
                <img src={Art.planet(b.id, b.maxTemp, !!b.isMoon)} alt="" />
                <span>{b.isMoon ? '🌙 ' : ''}{b.name}</span>
              </button>
            ))}
          </div>
          <table className="kv">
            <tbody>
              {planet.diameter && <tr><td>Diameter</td><td>{fmt(planet.diameter)} km</td></tr>}
              <tr><td>Fields</td><td>{planet.usedFields} / {planet.fields}</td></tr>
              <tr><td>Max temperature</td><td>{planet.maxTemp} °C</td></tr>
              <tr><td>Position</td><td><CoordLink c={planet.coords} /></td></tr>
              {!planet.isMoon && POSITION_BONUS[planet.coords.p] && <tr><td>Orbit bonus</td><td>{Object.entries(POSITION_BONUS[planet.coords.p]).map(([k, v]) => `+${Math.round((v as number) * 100)}% ${k}`).join(', ')}</td></tr>}
              {!planet.isMoon && (planet.fleet.crawler || 0) > 0 && <tr><td>Crawlers</td><td>{fmt(planet.fleet.crawler)} (+{(crawlerBonus(planet.fleet.crawler || 0, (planet.buildings.metalMine || 0) + (planet.buildings.crystalMine || 0) + (planet.buildings.deuteriumSynthesizer || 0), planet.detail.crawlerMul ?? 1) * 100).toFixed(1)}% mine output)</td></tr>}
              <tr><td>Production / h</td><td><span className="metal"><ResIcon k="metal" size={14} />{fmt(planet.production.metal)}</span> · <span className="crystal"><ResIcon k="crystal" size={14} />{fmt(planet.production.crystal)}</span> · <span className="deut"><ResIcon k="deuterium" size={14} />{fmt(planet.production.deuterium)}</span></td></tr>
              <tr><td><EnergyIcon size={16} /> Energy</td><td>{fmt(planet.production.energyProduced)} / {fmt(planet.production.energyUsed)} ({Math.round(planet.production.efficiency * 100)}%)</td></tr>
            </tbody>
          </table>
          <form className="row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void act(() => post(`/planets/${planet.id}/rename`, { name }), 'Renamed').then(() => setName('')); }}>
            <input placeholder="Rename planet" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
            <button>Rename</button>
          </form>
          {!planet.isHome && !planet.isMoon && (
            <button className="danger" onClick={() => {
              const n = prompt(`Type "${planet.name}" to abandon this colony forever`);
              if (n) void act(() => post(`/planets/${planet.id}/abandon`, { name: n }), 'Colony abandoned');
            }}>Abandon colony</button>
          )}
        </Card>

        <Card title="Commander">
          <table className="kv">
            <tbody>
              <tr><td>Points</td><td><b>{fmt(pts.total)}</b> (B {fmt(pts.buildings)} · R {fmt(pts.research)} · F {fmt(pts.fleet)} · D {fmt(pts.defense)})</td></tr>
              <tr><td>Class</td><td>{me.player.charClass ? <span style={{ textTransform: 'capitalize' }}>{me.player.charClass}</span> : <a onClick={() => setPage('command')}>none - choose one</a>}</td></tr>
              <tr><td>Colonies</td><td>{me.colonies} / {me.maxPlanets}</td></tr>
              <tr><td>Fleet slots</td><td>{me.slots.used} / {me.slots.max} · expeditions {me.slots.expUsed} / {me.slots.expMax}</td></tr>
              <tr><td>Battles</td><td>{me.player.stats.battlesWon}W / {me.player.stats.battlesLost}L · raids repelled {me.player.stats.raidsRepelled}</td></tr>
              <tr><td>Alliance</td><td>{me.alliance ? `[${me.alliance.tag}] ${me.alliance.name}` : <a onClick={() => setPage('alliance')}>none – find one</a>}</td></tr>
            </tbody>
          </table>
        </Card>
      </div>

      {me.objective && (
        <Card title={`Objective ${me.objective.step} of ${me.objective.of}: ${me.objective.name}`} right={<button onClick={() => setPage('command')}>All objectives</button>}>
          <p>{me.objective.hint}</p>
        </Card>
      )}

      {me.contractsClaimable > 0 && (
        <Card title="Contracts ready" right={<button className="primary" onClick={() => setPage('contracts')}>Collect</button>}>
          <p>{me.contractsClaimable} finished contract{me.contractsClaimable > 1 ? 's are' : ' is'} waiting for you to claim the reward.</p>
        </Card>
      )}
      {planet.forge?.relevant && !planet.isMoon && (
        <Card title="Moon Forge">
          {planet.forge.running ? (
            <>
              <div className="job">
                <div>Collapsing {fmt(planet.forge.running.debris.metal + planet.forge.running.debris.crystal)} of debris into a moon of {fmt(planet.forge.running.diameter)} km · <Countdown to={planet.forge.running.end} /></div>
                <Progress from={planet.forge.running.start} to={planet.forge.running.end} />
              </div>
              <p className="muted small">The debris is already used up. Cancelling gives back the resources you paid but not the debris.</p>
              <button className="danger" onClick={() => confirm('Cancel the forge? You get your resources back, but the debris is lost.') && void act(() => post(`/planets/${planet.id}/forge/cancel`), 'Forge cancelled')}>Cancel</button>
            </>
          ) : (
            <>
              <p className="muted small">Turn the debris field above this planet into a moon for certain. The field is used up, the forge takes {planet.forge.hours} hours, and a bigger field makes a bigger moon.</p>
              <ul className="reqlist">
                {planet.forge.requirements.map((r: { label: string; ok: boolean }) => <li key={r.label} className={r.ok ? 'good' : 'bad'}>{r.ok ? '✓' : '✗'} {r.label}</li>)}
              </ul>
              {planet.forge.cost && (
                <p>Price: <Cost cost={planet.forge.cost} have={planet.resources} /> · makes a moon of about <b>{fmt(planet.forge.diameter)} km</b></p>
              )}
              <button className="primary" disabled={planet.forge.requirements.some((r: { ok: boolean }) => !r.ok) || !planet.forge.cost || planet.resources.metal < planet.forge.cost.metal || planet.resources.crystal < planet.forge.cost.crystal || planet.resources.deuterium < planet.forge.cost.deuterium}
                onClick={() => void act(() => post(`/planets/${planet.id}/forge/start`), 'Moon Forge started')}>Forge a moon</button>
            </>
          )}
        </Card>
      )}

      <Card title="In progress">
        {!b && !r && !q && <p className="muted">Nothing is being built. Head to Buildings or Research.</p>}
        {b && <div className="job"><div>Building: <b>{BUILDINGS[b.id as keyof typeof BUILDINGS].name}</b> → level {b.level} <Countdown to={b.end} /></div><Progress from={b.start} to={b.end} /></div>}
        {r && <div className="job"><div>Research: <b>{TECHS[r.id as keyof typeof TECHS].name}</b> → level {r.level} <Countdown to={r.end} /></div><Progress from={r.start} to={r.end} /></div>}
        {q && <div className="job"><div>Shipyard: <b>{q.remaining}× {UNITS[q.id as keyof typeof UNITS].name}</b> remaining</div></div>}
      </Card>

      {planet.wreck && (
        <Card title="Wreck field">
          <p className="muted small">Ships lost defending this planet. {planet.wreck.dock ? `Your Space Dock (level ${planet.wreck.dock}) can rebuild ${Math.round(planet.wreck.share * 100)}% of them for free.` : 'Build a Space Dock to rebuild a share of them.'} Drifts away <Countdown to={planet.wreck.expiresAt} />.</p>
          <p>{Object.entries(planet.wreck.ships).map(([id, n]) => `${fmt(n as number)}× ${UNITS[id as keyof typeof UNITS].name}`).join(', ')}</p>
          {planet.wreck.repair
            ? <p>Repairing {Object.entries(planet.wreck.repair.ships).map(([id, n]) => `${fmt(n as number)}× ${UNITS[id as keyof typeof UNITS].name}`).join(', ')} - done <Countdown to={planet.wreck.repair.endsAt} /></p>
            : <button className="primary" disabled={!planet.wreck.dock} onClick={() => void act(() => post(`/planets/${planet.id}/wreck/repair`), 'Repairs started')}>Start repairs ({Math.round(planet.wreck.repairSeconds / 60)} min)</button>}
        </Card>
      )}


      {planets.length > 1 && (
        <Card title="Your planets">
          <div className="chips">{ordered.map((p) => <button key={p.id} className={p.id === planet.id ? 'active' : ''} onClick={() => selectPlanet(p.id)}>{p.isMoon ? '🌙 ' : ''}{p.name} {coordStr(p.coords)}</button>)}</div>
        </Card>
      )}
    </Page>
  );
}
