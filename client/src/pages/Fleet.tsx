import { useEffect, useState } from 'react';
import { SHIP_IDS, UNITS } from '../../../shared/data';
import { cargoCapacity } from '../../../shared/formulas';
import type { Mission, ShipId } from '../../../shared/types';
import { post } from '../api';
import { useGame } from '../game';
import { Card, Countdown, Page, coordStr, fmt, fmtDur } from '../ui';

const MISSIONS: [Mission, string][] = [
  ['attack', 'Attack'], ['transport', 'Transport'], ['deploy', 'Deploy'], ['hold', 'Defend ally (hold)'],
  ['espionage', 'Espionage'], ['colonize', 'Colonize'], ['recycle', 'Recycle debris'], ['expedition', 'Expedition'],
];

export function FleetPage() {
  const { me, planet, fleets, act, target, setTarget, now } = useGame();
  const [ships, setShips] = useState<Partial<Record<ShipId, number>>>({});
  const [to, setTo] = useState({ g: planet.coords.g, s: planet.coords.s, p: planet.coords.p === 1 ? 2 : 1 });
  const [mission, setMission] = useState<Mission>('transport');
  const [speedPct, setSpeedPct] = useState(100);
  const [cargo, setCargo] = useState({ metal: 0, crystal: 0, deuterium: 0 });
  const [holdHours, setHoldHours] = useState(1);
  const [joinId, setJoinId] = useState('');
  const [plan, setPlan] = useState<{ dist: number; secs: number; fuel: number } | null>(null);

  useEffect(() => {
    if (target) { setTo(target.coords); if (target.mission) setMission(target.mission); setTarget(null); }
  }, [target, setTarget]);

  const available = SHIP_IDS.filter((id) => id !== 'solarSatellite' && (planet.fleet[id] || 0) > 0);
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
    const r = await act(() => post('/fleets/send', { fromPlanetId: planet.id, to, ships: chosen, mission, speedPct, cargo, holdHours, joinFleetId: mission === 'attack' && joinId ? joinId : undefined }), 'Fleet dispatched');
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
              {f.ownerName} → {f.target} at {coordStr(f.to)} · arrives in <Countdown to={f.arriveAt} />
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
              <div className="muted small">{shipList(m.ships)}{m.cargo && m.cargo.metal + m.cargo.crystal + m.cargo.deuterium > 0 ? ` · cargo ${fmt(m.cargo.metal)}M ${fmt(m.cargo.crystal)}C ${fmt(m.cargo.deuterium)}D` : ''}</div>
            </div>
            {m.phase !== 'returning' && <button onClick={() => void act(() => post(`/fleets/${m.id}/recall`), 'Recalled')}>Recall</button>}
          </div>
        ))}
      </Card>

      {fleets.stationed.length > 0 && (
        <Card title="Allied fleets defending your planets">
          {fleets.stationed.map((m) => <div key={m.id}>{m.ownerName}: {shipList(m.ships)} at {coordStr(m.to)} · leaves in <Countdown to={m.holdUntil} /></div>)}
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
              {mission === 'hold' && <label>Hold (hours)<input type="number" className="sm" min={0.1} max={48} step={0.5} value={holdHours} onChange={(e) => setHoldHours(Number(e.target.value))} /></label>}
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
