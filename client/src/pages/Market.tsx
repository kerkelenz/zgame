import { useCallback, useEffect, useState } from 'react';
import { TRADE_VALUE, resName } from '../../../shared/data';
import { get, post } from '../api';
import { useGame } from '../game';
import { NumInput } from '../NumInput';
import { ResIcon, type ResKey } from '../ResIcon';
import { Card, Countdown, Empty, Loading, Page, PlayerLink, fmt } from '../ui';

const KEYS: ResKey[] = ['metal', 'crystal', 'deuterium'];
const Amount = ({ k, n }: { k: ResKey; n: number }) => <span className={k === 'deuterium' ? 'deut' : k}><ResIcon k={k} size={14} /> {fmt(n)}</span>;
/** the fair amount of `want` for `give`: what the merchant would swap at no fee */
const fair = (give: ResKey, amount: number, want: ResKey) => Math.round((amount * TRADE_VALUE[give]) / TRADE_VALUE[want]);

export function Market() {
  const { planet, live, act, now } = useGame();
  const [d, setD] = useState<any>(null);
  const [give, setGive] = useState<ResKey>('metal');
  const [want, setWant] = useState<ResKey>('crystal');
  const [giveAmount, setGiveAmount] = useState(10_000);
  const [wantAmount, setWantAmount] = useState(fair('metal', 10_000, 'crystal'));
  const [scope, setScope] = useState<'all' | 'alliance'>('all');
  const load = useCallback(async () => setD(await get('/market')), []);
  useEffect(() => { void load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);
  if (!d) return <Page title="Market"><Loading /></Page>;
  if (!d.enabled) return <Page title="Market"><Empty>The market is switched off on this server.</Empty></Page>;
  const rate = giveAmount > 0 ? (wantAmount * TRADE_VALUE[want]) / (giveAmount * TRADE_VALUE[give]) : 0;
  const inBand = rate >= d.band.min && rate <= d.band.max;
  const setPair = (g: ResKey, w: ResKey) => { setGive(g); setWant(w); setWantAmount(fair(g, giveAmount, w)); };
  const offer = async () => {
    const r = await act(() => post('/market/offer', { planetId: planet.id, give, giveAmount, want, wantAmount, scope }), 'Offer listed');
    if (r) setD(r);
  };
  const buy = async (o: any) => {
    const r = await act(() => post('/market/buy', { planetId: planet.id, id: o.id }), `Bought ${fmt(o.receive)} ${resName(o.give)}`);
    if (r) setD(r.market); else void load();
  };
  const cancel = async (id: string) => { const r = await act(() => post('/market/cancel', { id }), 'Offer cancelled, goods returned'); if (r) setD(r); };

  return (
    <Page title="Market">
      <p className="muted">Swap resources with other commanders. An offer holds your goods back until someone takes it or it runs out ({d.hours} hours), and prices stay within {Math.round(d.band.min * 100)}% to {Math.round(d.band.max * 100)}% of the fair rate. The market keeps {d.feePercent}% of what a buyer receives, except on offers to your own alliance. Goods are taken from and delivered to the planet selected above.</p>
      <Card title="Make an offer">
        <div className="row wrap">
          <span className="muted">I give</span>
          <NumInput min={d.minAmount} value={giveAmount} onChange={(n) => { setGiveAmount(n); setWantAmount(fair(give, n, want)); }} aria-label="Amount to give" />
          <select value={give} onChange={(e) => setPair(e.target.value as ResKey, want === e.target.value ? KEYS.find((k) => k !== e.target.value)! : want)} aria-label="Resource to give">
            {KEYS.map((k) => <option key={k} value={k}>{resName(k)}</option>)}
          </select>
          <span className="muted">and ask</span>
          <NumInput min={1} value={wantAmount} onChange={setWantAmount} aria-label="Amount to ask for" />
          <select value={want} onChange={(e) => setPair(give === e.target.value ? KEYS.find((k) => k !== e.target.value)! : give, e.target.value as ResKey)} aria-label="Resource to ask for">
            {KEYS.map((k) => <option key={k} value={k}>{resName(k)}</option>)}
          </select>
        </div>
        <div className="row wrap small">
          <button onClick={() => setWantAmount(fair(give, giveAmount, want))}>Use the fair price</button>
          <span className={inBand ? 'muted' : 'bad'}>Your price is {Math.round(rate * 100)}% of fair {inBand ? '' : `(allowed: ${Math.round(d.band.min * 100)}% to ${Math.round(d.band.max * 100)}%)`}</span>
          <span className="muted">· on {planet.name} you have <Amount k={give} n={live[give]} /></span>
        </div>
        <div className="row wrap">
          {d.inAlliance && (
            <select value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'alliance')} aria-label="Who may take it">
              <option value="all">Offer to everyone</option>
              <option value="alliance">Offer to my alliance only (no fee)</option>
            </select>
          )}
          <button className="primary" disabled={!inBand || giveAmount < d.minAmount || live[give] < giveAmount || mineFull(d)} onClick={() => void offer()}>Offer</button>
          {mineFull(d) && <span className="muted small">You have {d.maxOffers} open offers: cancel one first.</span>}
        </div>
      </Card>
      <Card title={`Open offers (${d.offers.length})`}>
        {d.offers.length === 0 ? <Empty>No offers from other commanders right now. Yours will show up here for them.</Empty> : (
          <table className="kv">
            <thead><tr><th>Seller</th><th>Gets you</th><th>Costs you</th><th>Price</th><th>Left</th><th /></tr></thead>
            <tbody>
              {d.offers.map((o: any) => (
                <tr key={o.id}>
                  <td><PlayerLink id={o.sellerId} name={o.seller} />{o.scope === 'alliance' && <span className="tag you">alliance</span>}</td>
                  <td><Amount k={o.give} n={o.receive} /></td>
                  <td><Amount k={o.want} n={o.wantAmount} /></td>
                  <td className={o.rate <= 1 ? 'good' : 'muted'} title="Against the fair rate of the merchant">{Math.round(o.rate * 100)}%</td>
                  <td><Countdown to={o.expiresAt} /></td>
                  <td className="actions"><button className="primary" disabled={live[o.want as ResKey] < o.wantAmount} title={live[o.want as ResKey] < o.wantAmount ? `Not enough ${resName(o.want)} on ${planet.name}` : ''} onClick={() => void buy(o)}>Take</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title={`Your offers (${d.mine.length})`}>
        {d.mine.length === 0 ? <Empty>You have no open offers.</Empty> : d.mine.map((o: any) => (
          <div key={o.id} className="row between">
            <span><Amount k={o.give} n={o.giveAmount} /> for <Amount k={o.want} n={o.wantAmount} /> {o.scope === 'alliance' && <span className="tag you">alliance</span>} <span className="muted small">· {o.expiresAt > now ? <>runs out in <Countdown to={o.expiresAt} /></> : 'expired'}</span></span>
            <button onClick={() => void cancel(o.id)}>Cancel</button>
          </div>
        ))}
      </Card>
    </Page>
  );
}

const mineFull = (d: any) => d.mine.length >= d.maxOffers;
