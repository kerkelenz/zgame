import { useState } from 'react';
import { UNITS } from '../../shared/data';
import { get, post } from './api';
import { useGame } from './game';
import { Card, Cost, ItemIcon, ItemLink, fmt } from './ui';

interface Forecast { size: 'small' | 'large'; value: number; ships: Record<string, number>; verdict: 'holds' | 'close' | 'falls'; lossShare: number }
interface Report { defenseValue: number; forecasts: Forecast[]; recommendation: { unit: string; count: number; cost: { metal: number; crystal: number; deuterium: number } } | null }

const VERDICT = { holds: ['Holds', 'good'], close: ['Could go either way', 'warn'], falls: ['Falls', 'bad'] } as const;

/** Defense page: fights the raids this game can send (small and large) against the selected planet in the simulator and says what to add. */
export function AdvisorCard() {
  const { planet, act, live } = useGame();
  const [report, setReport] = useState<Report | null>(null);
  const [forPlanet, setForPlanet] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const check = async () => {
    setBusy(true); setError('');
    try { setReport(await get(`/planets/${planet.id}/defense-advice`)); setForPlanet(planet.id); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const r = report && forPlanet === planet.id ? report : null;
  const rec = r?.recommendation;
  const afford = rec && live.metal >= rec.cost.metal && live.crystal >= rec.cost.crystal && live.deuterium >= rec.cost.deuterium;
  return (
    <Card title="Defense advisor" right={<button onClick={() => void check()} disabled={busy}>{busy ? 'Fighting…' : r ? 'Check again' : `Check ${planet.name}`}</button>}>
      {!r && !error && <p className="muted small">Fights the raids this game can send at {planet.name}, the smallest and the largest, in the battle simulator, and says what to add. An estimate: real raids are randomised.</p>}
      {error && <p className="bad">{error}</p>}
      {r && (
        <>
          <p className="muted small">Defending value here: {fmt(r.defenseValue)} (ships and defenses, in metal and crystal).</p>
          <table className="kv">
            <tbody>
              {r.forecasts.map((f) => (
                <tr key={f.size}>
                  <td>{f.size === 'small' ? 'Small raid' : 'Large raid'}<div className="muted small">value {fmt(f.value)}</div></td>
                  <td className={VERDICT[f.verdict][1]}><b>{VERDICT[f.verdict][0]}</b><div className="muted small">you lose about {Math.round(f.lossShare * 100)}% of what stands here</div></td>
                  <td className="muted small">{Object.entries(f.ships).slice(0, 5).map(([id, n]) => <div key={id}><ItemIcon id={id} size={14} /> {fmt(n)}× {UNITS[id as keyof typeof UNITS].name}</div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rec ? (
            <div className="row between">
              <span>To hold the large raid, add about <b>{fmt(rec.count)}× <ItemLink id={rec.unit} /></b> (<Cost cost={rec.cost} have={live} />).</span>
              <button className="primary" disabled={!afford} title={afford ? '' : 'Not enough resources yet'}
                onClick={() => void act(() => post(`/planets/${planet.id}/produce`, { id: rec.unit, count: rec.count }), `Queued ${rec.count}× ${UNITS[rec.unit as keyof typeof UNITS].name}`)}>Queue them</button>
            </div>
          ) : r.forecasts[1].verdict === 'holds' ? <p className="good">The large raid fails against what stands here.</p> : <p className="muted">Build a Shipyard first to be able to add defenses.</p>}
        </>
      )}
    </Card>
  );
}
