import { useEffect, useState } from 'react';
import { SHIP_IDS, UNITS, isStationary } from '../../../shared/data';
import { cargoCapacity } from '../../../shared/formulas';
import type { Mission, ShipId } from '../../../shared/types';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, Countdown, Page, coordStr, fmt, fmtDur } from '../ui';

const MISSIONS: [Mission, string][] = [
  ['attack', 'Attack'], ['destroy', 'Destroy moon (Deathstars)'], ['transport', 'Transport'], ['deploy', 'Deploy'], ['hold', 'Defend ally (hold)'],
  ['espionage', 'Espionage'], ['colonize', 'Colonize'], ['recycle', 'Recycle debris'], ['expedition', 'Expedition'],
];

export function FleetPage() {
  const { me, planet, planets, fleets, act, target, setTarget, now } = useGame();
  const [ships, setShips] = useState<Partial<Record<ShipId, number>>>({});
  const [to, setTo] = useState({ g: planet.coords.g, s: planet.coords.s, p: planet.coords.p === 1 ? 2 : 1 });
  const [mission, setMission] = useState<Mission>('transport');
  const [speedPct, setSpeedPct] = useState(100);
  const [cargo, setCargo] = useState({ metal: 0, crystal: 0, deuterium: 0 });
  const [holdHours, setHoldHours] = useState(1);
  const [joinId, setJoinId] = useState('');
  const [presets, setPresets] = useState<{ id: string; name: string; ships: Partial<Record<ShipId, number>> }[]>([]);
  // presets live on the server so they follow you between devices; any saved in this browser before are uploaded once
  useEffect(() => {
    (async () => {
      let s = await get('/social');
      try {
        const old = JSON.parse(localStorage.getItem('sf.presets') || '[]') as { name: string; ships: Record<string, number> }[];
        for (const p of old) if (!s.presets.some((x: any) => x.name.toLowerCase() === p.name.toLowerCase())) s = await post('/presets', p);
        if (old.length) localStorage.removeItem('sf.presets');
      } catch { /* ignore */ }
      setPresets(s.presets);
    })().catch(() => undefined);
  }, []);
  const savePreset = async (name: string, ships: object) => { const r = await act(() => post('/presets', { name, ships }), 'Preset saved'); if (r) setPresets(r.presets); };
  const removePreset = async (id: string) => { const r = await act(() => post('/presets/remove', { id })); if (r) setPresets(r.presets); };
  const [toMoon, setToMoon] = useState(false);
  const [scanTo, setScanTo] = useState({ g: planet.coords.g, s: planet.coords.s, p: 1 });
  const [scan, setScan] = useState<any>(null);
  const [jumpTo, setJumpTo] = useState('');
  const [mTo, setMTo] = useState({ g: planet.coords.g, s: planet.coords.s, p: 1 });
  const [mCount, setMCount] = useState(1);
  const [plan, setPlan] = useState<{ dist: number; secs: number; fuel: number } | null>(null);
  const [quick, setQuick] = useState<{ bookmarks: any[]; recent: any[] }>({ bookmarks: [], recent: [] });
  useEffect(() => { void get('/social').then((s) => setQuick({ bookmarks: s.bookmarks, recent: s.recent })).catch(() => undefined); }, []);

  useEffect(() => {
    if (target) { setTo(target.coords); if (target.mission) setMission(target.mission); setToMoon(!!target.toMoon); setTarget(null); }
  }, [target, setTarget]);

  const available = SHIP_IDS.filter((id) => !isStationary(id) && (planet.fleet[id] || 0) > 0);
  const chosen: Partial<Record<ShipId, number>> = {};
  for (const [id, n] of Object.entries(ships)) if (n && n > 0) chosen[id as ShipId] = Math.min(n, planet.fleet[id] || 0);
  const count = Object.values(chosen).reduce((a, b) => a + (b || 0), 0);
  const cap = cargoCapacity(chosen);

  useEffect(() => {
    if (!count) { setPlan(null); return; }
    const t = setTimeout(async () => {
      try { setPlan(await post('/fleets/plan', { fromPlanetId: planet.id, to, ships: chosen, speedPct })); } catch { setPlan(null); }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(chosen), to.g, to.s, to.p, speedPct, planet.id]);

  const send = async () => {
    const r = await act(() => post('/fleets/send', { fromPlanetId: planet.id, to, ships: chosen, mission, speedPct, cargo, holdHours, toMoon: toMoon || mission === 'destroy', joinFleetId: mission === 'attack' && joinId ? joinId : undefined }), 'Fleet dispatched');
    setJoinId('');
    if (r) { setShips({}); setCargo({ metal: 0, crystal: 0, deuterium: 0 }); }
  };

  const phaseTime = (m: any) => (m.phase === 'outbound' ? m.arriveAt : m.phase === 'holding' ? m.holdUntil : m.returnAt);
  const shipList = (s: Record<string, number>) => Object.entries(s).filter(([, n]) => n).map(([id, n]) => `${fmt(n)}× ${UNITS[id as ShipId]?.name ?? id}`).join(', ');

  return (
    <Page title="Fleet">
      {fleets.incoming.length > 0 && (
        <Card title="⚠ Hostile fleets inbound">
          {fleets.incoming.map((f) => (
            <div key={f.id} className="bad">
              {f.ownerName}{f.ownerAlliance ? ` [${f.ownerAlliance}]` : ''} from {f.fromName ? `${f.fromMoon ? '🌙 ' : ''}${f.fromName} ` : ''}{coordStr(f.from)} → {f.target} at {coordStr(f.to)} · arrives in <Countdown to={f.arriveAt} />
              {f.ally && <span className="muted"> — send a "Defend ally" fleet to help!</span>}
            </div>
          ))}
        </Card>
      )}

      <Card title={`Active fleets (${me.slots.used}/${me.slots.max} slots · expeditions ${me.slots.expUsed}/${me.slots.expMax})`}>
        {fleets.mine.length === 0 && <p className="muted">No fleets in flight.</p>}
        {fleets.mine.map((m) => (
          <div className="row between fleetrow" key={m.id}>
            <div>
              <b>{m.mission}</b> {coordStr(m.from)} → {coordStr(m.to)} <span className="muted">({m.phase})</span> · <Countdown to={phaseTime(m)} />
              <div className="muted small">{m.missiles ? `${m.missiles} interplanetary missile(s)` : shipList(m.ships)}{m.cargo && m.cargo.metal + m.cargo.crystal + m.cargo.deuterium > 0 ? ` · cargo ${fmt(m.cargo.metal)}M ${fmt(m.cargo.crystal)}C ${fmt(m.cargo.deuterium)}D` : ''}</div>
            </div>
            {m.phase !== 'returning' && m.mission !== 'missile' && <button onClick={() => void act(() => post(`/fleets/${m.id}/recall`), 'Recalled')}>Recall</button>}
          </div>
        ))}
      </Card>

      {fleets.stationed.length > 0 && (
        <Card title="Allied fleets defending your planets">
          {fleets.stationed.map((m) => <div key={m.id}>{m.ownerName}: {shipList(m.ships)} at {coordStr(m.to)} · leaves in <Countdown to={m.holdUntil} /></div>)}
        </Card>
      )}

      {planet.isMoon && (planet.buildings.sensorPhalanx || 0) > 0 && (
        <Card title={`Sensor Phalanx (level ${planet.buildings.sensorPhalanx}, range ${planet.buildings.sensorPhalanx ** 2 - 1} systems)`}>
          <div className="row wrap">
            <input type="number" className="sm" value={scanTo.g} onChange={(e) => setScanTo({ ...scanTo, g: Number(e.target.value) })} />
            <input type="number" className="sm" value={scanTo.s} onChange={(e) => setScanTo({ ...scanTo, s: Number(e.target.value) })} />
            <input type="number" className="sm" value={scanTo.p} onChange={(e) => setScanTo({ ...scanTo, p: Number(e.target.value) })} />
            <button onClick={async () => { const r = await act(() => post(`/planets/${planet.id}/phalanx`, { to: scanTo })); if (r) setScan(r); }}>Scan (5,000 deuterium)</button>
          </div>
          {scan && (
            <div>
              <p className="muted">{scan.planet} ({scan.owner}) {coordStr(scan.coords)}</p>
              {scan.movements.length === 0 && <p className="muted">No fleet movements.</p>}
              {scan.movements.map((m: any, i: number) => <div key={i}>{m.ownerName}: {m.mission} {coordStr(m.from)} → {coordStr(m.to)} · {fmt(m.ships)} ships · <Countdown to={m.at} /></div>)}
            </div>
          )}
        </Card>
      )}

      {planet.isMoon && (planet.buildings.jumpGate || 0) > 0 && (
        <Card title="Jump Gate">
          <div className="row wrap">
            <select value={jumpTo} onChange={(e) => setJumpTo(e.target.value)}>
              <option value="">destination moon…</option>
              {planets.filter((p: any) => p.isMoon && p.id !== planet.id).map((p: any) => <option key={p.id} value={p.id}>{p.name} {coordStr(p.coords)}</option>)}
            </select>
            <button className="primary" disabled={!count || !jumpTo || planet.jumpReadyAt > now} onClick={() => void act(() => post(`/planets/${planet.id}/jump`, { toPlanetId: jumpTo, ships: chosen }), 'Fleet jumped')}>Jump selected ships</button>
            {planet.jumpReadyAt > now && <span className="muted">recharging <Countdown to={planet.jumpReadyAt} /></span>}
          </div>
          <p className="muted small">Select ships in the form below, then jump. Both gates recharge afterwards.</p>
        </Card>
      )}

      {(planet.defenses.interplanetaryMissile || 0) > 0 && (
        <Card title={`Missile strike (${planet.defenses.interplanetaryMissile} ready, range ${Math.max(0, 5 * (planet.buildings.missileSilo || 0) - 1)} systems)`}>
          <div className="row wrap">
            <label>Target
              <span className="row">
                <input type="number" className="sm" value={mTo.g} onChange={(e) => setMTo({ ...mTo, g: Number(e.target.value) })} />
                <input type="number" className="sm" value={mTo.s} onChange={(e) => setMTo({ ...mTo, s: Number(e.target.value) })} />
                <input type="number" className="sm" value={mTo.p} onChange={(e) => setMTo({ ...mTo, p: Number(e.target.value) })} />
              </span>
            </label>
            <label>Missiles<input type="number" className="sm" min={1} max={planet.defenses.interplanetaryMissile} value={mCount} onChange={(e) => setMCount(Number(e.target.value))} /></label>
            <button className="danger" onClick={() => void act(() => post('/fleets/missile', { fromPlanetId: planet.id, to: mTo, count: mCount }), 'Missiles launched')}>Fire</button>
          </div>
          <p className="muted small">Each missile destroys defenses (not ships). The target's anti-ballistic missiles intercept one each.</p>
        </Card>
      )}

      <Card title={`Send fleet from ${planet.name} ${coordStr(planet.coords)}`}>
        {available.length === 0 ? <p className="muted">No ships at this planet. Build some in the shipyard.</p> : (
          <>
            <table className="ships">
              <tbody>
                {available.map((id) => (
                  <tr key={id}>
                    <td>{UNITS[id].name}</td>
                    <td className="muted">{fmt(planet.fleet[id])}</td>
                    <td><input type="number" min={0} max={planet.fleet[id]} value={ships[id] ?? 0} onChange={(e) => setShips({ ...ships, [id]: Number(e.target.value) })} /></td>
                    <td><button onClick={() => setShips({ ...ships, [id]: planet.fleet[id] })}>all</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="chips">
              <button onClick={() => { const name = prompt('Name this fleet preset'); if (name && count) void savePreset(name, chosen); }} disabled={!count}>+ save selection as preset</button>
              {presets.map((p) => (
                <span key={p.id} className="preset">
                  <button onClick={() => { const s: typeof ships = {}; for (const [id, n] of Object.entries(p.ships)) { const have = planet.fleet[id] || 0; if (have) s[id as ShipId] = Math.min(n as number, have); } setShips(s); }}>{p.name}</button>
                  <button className="link" title="Delete preset" onClick={() => void removePreset(p.id)}>×</button>
                </span>
              ))}
            </div>
            {(quick.bookmarks.length > 0 || quick.recent.length > 0) && (
              <div className="chips">
                {quick.bookmarks.map((b: any) => <button key={b.id} title="Bookmark" onClick={() => setTo(b.coords)}>★ {b.name}</button>)}
                {quick.recent.map((c: any, i: number) => <button key={i} className="muted" title="Recent target" onClick={() => setTo(c)}>⟲ {coordStr(c)}</button>)}
              </div>
            )}
            <div className="row wrap">
              <label>Target
                <span className="row">
                  <input type="number" className="sm" value={to.g} onChange={(e) => setTo({ ...to, g: Number(e.target.value) })} />
                  <input type="number" className="sm" value={to.s} onChange={(e) => setTo({ ...to, s: Number(e.target.value) })} />
                  <input type="number" className="sm" value={to.p} onChange={(e) => setTo({ ...to, p: Number(e.target.value) })} />
                </span>
              </label>
              <label>Mission
                <select value={mission} onChange={(e) => setMission(e.target.value as Mission)}>
                  {MISSIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <label>Speed
                <select value={speedPct} onChange={(e) => setSpeedPct(Number(e.target.value))}>
                  {[100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map((v) => <option key={v} value={v}>{v}%</option>)}
                </select>
              </label>
              {mission === 'attack' && fleets.joinable.length > 0 && (
                <label>Joint attack
                  <select value={joinId} onChange={(e) => { setJoinId(e.target.value); const j = fleets.joinable.find((x) => x.id === e.target.value); if (j) setTo(j.to); }}>
                    <option value="">attack separately</option>
                    {fleets.joinable.map((j) => <option key={j.id} value={j.id}>join {j.ownerName} → {j.targetName} {coordStr(j.to)} ({fmtDur(j.arriveAt - now)} left)</option>)}
                  </select>
                </label>
              )}
              {mission === 'expedition' && (
                <label>Stay out
                  <select value={Math.min(4, Math.max(1, Math.round(holdHours)))} onChange={(e) => setHoldHours(Number(e.target.value))} title="Longer trips find +30% per extra hour but risk the black hole more. Recyclers help salvage, probes scout for pirates.">
                    {[1, 2, 3, 4].map((h) => <option key={h} value={h}>{h} h</option>)}
                  </select>
                </label>
              )}
              {mission === 'hold' && <label>Hold (hours)<input type="number" className="sm" min={0.1} max={48} step={0.5} value={holdHours} onChange={(e) => setHoldHours(Number(e.target.value))} /></label>}
              <label className="row"><input type="checkbox" checked={toMoon} onChange={(e) => setToMoon(e.target.checked)} /> target the moon</label>
              {mission === 'expedition' && <button type="button" onClick={() => setTo({ ...to, p: me.config.positions + 1 })}>Set deep space slot</button>}
            </div>
            {(mission === 'transport' || mission === 'deploy' || mission === 'hold' || mission === 'colonize' || mission === 'expedition') && (
              <div className="row wrap">
                <span className="muted">Cargo (capacity {fmt(cap)}):</span>
                {(['metal', 'crystal', 'deuterium'] as const).map((k) => (
                  <label key={k} className={k === 'deuterium' ? 'deut' : k}>{k}
                    <input type="number" min={0} value={cargo[k]} onChange={(e) => setCargo({ ...cargo, [k]: Math.max(0, Number(e.target.value)) })} />
                  </label>
                ))}
                <button type="button" onClick={() => setCargo({ metal: Math.min(Math.floor(planet.resources.metal), cap), crystal: 0, deuterium: 0 })}>max metal</button>
              </div>
            )}
            <div className="row between">
              <div className="muted">
                {plan ? <>Distance {fmt(plan.dist)} · duration {fmtDur(plan.secs * 1000)} · fuel {fmt(plan.fuel)} deuterium</> : 'Select ships to see the flight plan.'}
              </div>
              <button className="primary" disabled={!count} onClick={send}>Send {count ? `${fmt(count)} ships` : ''}</button>
            </div>
          </>
        )}
      </Card>
    </Page>
  );
}
