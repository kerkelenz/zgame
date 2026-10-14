import { useState } from 'react';
import { EnergyIcon, ResIcon } from '../ResIcon';
import { post } from '../api';
import { TRADE_FEE, TRADE_FEE_COLLECTOR, resName, tradeQuote } from '../../../shared/data';
import { useGame } from '../game';
import { Card, Countdown, Page, fmt } from '../ui';
import { NumInput } from '../NumInput';

const SOURCES: [string, string][] = [
  ['metalMine', 'Metal Mine'], ['crystalMine', 'Crystal Mine'], ['deuteriumSynthesizer', 'Vespene Extractor'],
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
  const [gather, setGather] = useState({ pct: 90, res: ['metal', 'crystal'] as string[] });
  const [gatherRes, setGatherRes] = useState<any>(null);
  const fee = me.player.charClass === 'collector' ? TRADE_FEE_COLLECTOR : TRADE_FEE;
  const deal = me.player.deal;
  const cheap = give === me.player.deal.give && get === me.player.deal.get ? Math.min(amount, me.player.deal.left) : 0;
  const quote = give === get ? 0 : (cheap ? tradeQuote(give, get, cheap, me.player.deal.fee) : 0) + (amount - cheap > 0 ? tradeQuote(give, get, amount - cheap, fee) : 0);
  return (
    <Page title="Resources">
      <Card title="Hourly production">
        <table className="kv">
          <tbody>
            <tr><td className="metal"><ResIcon k="metal" size={20} /> Metal</td><td>{fmt(p.metal)} / h</td><td className="muted">stored {fmt(planet.resources.metal)} of {fmt(planet.capacity.metal)}</td></tr>
            <tr><td className="crystal"><ResIcon k="crystal" size={20} /> Crystal</td><td>{fmt(p.crystal)} / h</td><td className="muted">stored {fmt(planet.resources.crystal)} of {fmt(planet.capacity.crystal)}</td></tr>
            <tr><td className="deut"><ResIcon k="deuterium" size={20} /> Vespene Gas</td><td>{fmt(p.deuterium)} / h</td><td className="muted">stored {fmt(planet.resources.deuterium)} of {fmt(planet.capacity.deuterium)}</td></tr>
            <tr><td className="energy"><EnergyIcon size={20} /> Energy</td><td>{fmt(p.energyProduced)} produced / {fmt(p.energyUsed)} used</td><td className={p.efficiency < 1 ? 'bad' : 'muted'}>efficiency {Math.round(p.efficiency * 100)}%</td></tr>
          </tbody>
        </table>
        {ab > 0 && <p className="muted">Alliance mining network bonus: +{Math.round(ab * 100)}% on mine output.</p>}
        {p.efficiency < 1 && <p className="bad">Energy shortage! Build more solar plants or satellites – mines are running at {Math.round(p.efficiency * 100)}%.</p>}
      </Card>
      <Card title="Travelling merchant">
        <p className="muted small">Swaps resources at 3 metal : 2 crystal : 1 vespene gas and keeps a {Math.round(fee * 100)}% cut{fee < TRADE_FEE ? ' (Collector rate)' : ''}. Works on {planet.name}'s stock.</p>
        <p className="small"><b>Today's deal:</b> <span className="good"><ResIcon k={deal.give} /> {resName(deal.give)} → <ResIcon k={deal.get} /> {resName(deal.get)}</span> at just {Math.round(deal.fee * 100)}% for up to {fmt(deal.left)} {resName(deal.give)} more today (resets <Countdown to={deal.resetsAt} />).{give === deal.give && get === deal.get ? ' ✔ selected' : ''}
          <button className="link" onClick={() => { setGive(deal.give); setGet(deal.get); setAmount(Math.min(Math.floor(planet.resources[deal.give]), deal.left)); }}>use it</button></p>
        <div className="row wrap">
          <label>Give<select value={give} onChange={(e) => setGive(e.target.value as typeof give)}>{(['metal', 'crystal', 'deuterium'] as const).map((k) => <option key={k} value={k}>{resName(k)}</option>)}</select></label>
          <NumInput value={amount} onChange={setAmount} />
          <button onClick={() => setAmount(Math.floor(planet.resources[give]))}>all</button>
          <label>Get<select value={get} onChange={(e) => setGet(e.target.value as typeof get)}>{(['metal', 'crystal', 'deuterium'] as const).map((k) => <option key={k} value={k}>{resName(k)}</option>)}</select></label>
          <b>{give === get ? '-' : fmt(quote)}</b>
          <button className="primary" disabled={give === get || amount <= 0} onClick={() => void act(() => post(`/planets/${planet.id}/trade`, { give, get, amount }), 'Trade done')}>Trade</button>
        </div>
      </Card>
      {me.planets.filter((x: any) => x.id !== planet.id).length > 0 && (
        <Card title="Gather from the rest of your empire">
          <p className="muted small">Every other planet with cargo ships loads them with this share of its stock (keeping fuel) and flies it to {planet.name} as a normal transport mission.</p>
          <div className="row wrap">
            {(['metal', 'crystal', 'deuterium'] as const).map((k) => <label key={k} className="row"><input type="checkbox" checked={gather.res.includes(k)} onChange={(e) => setGather({ ...gather, res: e.target.checked ? [...gather.res, k] : gather.res.filter((x) => x !== k) })} /> <ResIcon k={k} /> {resName(k)}</label>)}
            <select value={gather.pct} onChange={(e) => setGather({ ...gather, pct: Number(e.target.value) })}>{[100, 90, 75, 50, 25].map((v) => <option key={v} value={v}>{v}%</option>)}</select>
            <button className="primary" disabled={!gather.res.length} onClick={async () => { const r = await act(() => post('/empire/gather', { toPlanetId: planet.id, percent: gather.pct, resources: gather.res })); if (r) setGatherRes(r); }}>Send transports</button>
          </div>
          {gatherRes && (
            <div className="small">
              {gatherRes.sent.map((s: any) => <div key={s.fromPlanetId} className="good">{s.from}: {fmt(s.cargo.metal)} M · {fmt(s.cargo.crystal)} C · {fmt(s.cargo.deuterium)} D on the way</div>)}
              {gatherRes.skipped.map((s: any) => <div key={s.fromPlanetId} className="muted">{s.from}: skipped ({s.reason})</div>)}
            </div>
          )}
        </Card>
      )}
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
