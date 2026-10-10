import { useState } from 'react';
import { post } from '../api';
import { TRADE_FEE, tradeQuote } from '../../../shared/data';
import { useGame } from '../game';
import { Card, Page, fmt } from '../ui';

const SOURCES: [string, string][] = [
  ['metalMine', 'Metal Mine'], ['crystalMine', 'Crystal Mine'], ['deuteriumSynthesizer', 'Deuterium Synthesizer'],
  ['solarPlant', 'Solar Plant'], ['fusionReactor', 'Fusion Reactor'], ['solarSatellite', 'Solar Satellites'],
];

export function Resources() {
  const { planet, act, me } = useGame();
  const p = planet.production;
  const lvl = (id: string) => planet.buildings[id] ?? planet.fleet[id] ?? 0;
  const ab = me.allianceBonuses.production;
  const [give, setGive] = useState<'metal' | 'crystal' | 'deuterium'>('metal');
  const [get, setGet] = useState<'metal' | 'crystal' | 'deuterium'>('crystal');
  const [amount, setAmount] = useState(10000);
  return (
    <Page title="Resources">
      <Card title="Hourly production">
        <table className="kv">
          <tbody>
            <tr><td className="metal">Metal</td><td>{fmt(p.metal)} / h</td><td className="muted">stored {fmt(planet.resources.metal)} of {fmt(planet.capacity.metal)}</td></tr>
            <tr><td className="crystal">Crystal</td><td>{fmt(p.crystal)} / h</td><td className="muted">stored {fmt(planet.resources.crystal)} of {fmt(planet.capacity.crystal)}</td></tr>
            <tr><td className="deut">Deuterium</td><td>{fmt(p.deuterium)} / h</td><td className="muted">stored {fmt(planet.resources.deuterium)} of {fmt(planet.capacity.deuterium)}</td></tr>
            <tr><td className="energy">Energy</td><td>{fmt(p.energyProduced)} produced / {fmt(p.energyUsed)} used</td><td className={p.efficiency < 1 ? 'bad' : 'muted'}>efficiency {Math.round(p.efficiency * 100)}%</td></tr>
          </tbody>
        </table>
        {ab > 0 && <p className="muted">Alliance mining network bonus: +{Math.round(ab * 100)}% on mine output.</p>}
        {p.efficiency < 1 && <p className="bad">Energy shortage! Build more solar plants or satellites – mines are running at {Math.round(p.efficiency * 100)}%.</p>}
      </Card>
      <Card title="Travelling merchant">
        <p className="muted small">Swaps resources at 3 metal : 2 crystal : 1 deuterium and keeps a {Math.round(TRADE_FEE * 100)}% cut. Works on {planet.name}'s stock.</p>
        <div className="row wrap">
          <label>Give<select value={give} onChange={(e) => setGive(e.target.value as typeof give)}>{(['metal', 'crystal', 'deuterium'] as const).map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} />
          <button onClick={() => setAmount(Math.floor(planet.resources[give]))}>all</button>
          <label>Get<select value={get} onChange={(e) => setGet(e.target.value as typeof get)}>{(['metal', 'crystal', 'deuterium'] as const).map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          <b>{give === get ? '–' : fmt(tradeQuote(give, get, amount))}</b>
          <button className="primary" disabled={give === get || amount <= 0} onClick={() => void act(() => post(`/planets/${planet.id}/trade`, { give, get, amount }), 'Trade done')}>Trade</button>
        </div>
      </Card>
      <Card title="Production settings">
        <table className="kv">
          <tbody>
            {SOURCES.filter(([id]) => lvl(id) > 0).map(([id, label]) => (
              <tr key={id}>
                <td>{label} <span className="muted">({lvl(id)})</span></td>
                <td>
                  <select value={planet.settings[id] ?? 1} onChange={(e) => void act(() => post(`/planets/${planet.id}/settings`, { [id]: Number(e.target.value) }))}>
                    {[1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0].map((v) => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}
