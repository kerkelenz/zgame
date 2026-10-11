import { useCallback, useEffect, useState } from 'react';
import { UNITS } from '../../../shared/data';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, Countdown, Page, coordStr, fmt, when } from '../ui';

const fleetText = (f: Record<string, number>) => Object.entries(f).filter(([, n]) => n).map(([id, n]) => `${fmt(n)} ${(UNITS as any)[id]?.name ?? id}`).join(', ') || 'none';
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

export function Invasion() {
  const { act, setTarget, setPage, now } = useGame();
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => setD(await get('/invasion')), []);
  useEffect(() => { void load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);
  if (!d) return <Page title="Invasion"><p className="muted">Loading…</p></Page>;
  const inv = d.active;
  const send = () => { setTarget({ coords: inv.rift, mission: 'invade' }); setPage('fleet'); };

  return (
    <Page title="Void invasion">
      <p className="muted">Now and then a <b>Void Armada</b> tears open a rift in deep space. Every combat fleet that joins the front fights it <b>together</b>, every {d.engageMinutes} minutes, until the Armada is destroyed or retreats. Rewards are split by the damage each commander does, so alliances that arrive at the same time win; lone fleets are simply destroyed.</p>

      {!inv && (
        <Card title="No invasion right now">
          <p>{d.next ? <>The next wave is expected around <b>{when(d.next)}</b> (in <Countdown to={d.next} />).</> : 'Invasions are switched off on this server.'} You get hours of warning before the rift opens.</p>
        </Card>
      )}

      {inv && (
        <>
          <Card title={`Wave ${inv.number}: ${inv.phase === 'announced' ? 'the rift opens soon' : 'the rift is open'}`} right={inv.phase === 'active' ? <button className="primary" onClick={send}>Send a fleet to the front</button> : undefined}>
            <p>The rift is at <b>{coordStr(inv.rift)}</b> (deep space). {inv.phase === 'announced'
              ? <>It opens in <b><Countdown to={inv.startsAt} /></b>: build, gather your alliance and agree when to arrive.</>
              : <>Next engagement in <b><Countdown to={inv.nextEngageAt} /></b>; the Armada retreats in <Countdown to={inv.endsAt} />. Fleets that arrive before an engagement join it.</>}</p>
            <div className="bar" title="Armada strength left"><div style={{ width: `${Math.min(100, (inv.boss.value / Math.max(1, inv.boss.startValue)) * 100)}%`, background: 'var(--bad, #e8685d)' }} /></div>
            <p className="small"><b>Armada:</b> {fmt(inv.boss.value)} of {fmt(inv.boss.startValue)} resources of ships ({pct(inv.boss.value / Math.max(1, inv.boss.startValue))}), technology level {inv.level}.<br /><span className="muted">{fleetText(inv.boss.fleet)}</span></p>
            {inv.phase === 'active' && (
              <p className="small">
                <b>At the front now:</b> {inv.combined.fleets} fleet{inv.combined.fleets === 1 ? '' : 's'} from {inv.combined.commanders} commander{inv.combined.commanders === 1 ? '' : 's'}, worth {fmt(inv.combined.value)}.{' '}
                {inv.combined.value < inv.boss.value ? <span className="bad">That is less than the Armada: the next engagement will cost them dearly. Bring more, together.</span> : <span className="good">That is enough to hurt it.</span>}
                <br /><span className="muted">The Armada also rebuilds 5% of its starting fleet before every engagement, so a trickle of damage cannot win.</span>
              </p>
            )}
          </Card>

          {inv.front.length > 0 && (
            <Card title="Your fleets at the rift">
              {inv.front.map((f: any) => (
                <div key={f.id} className="row between">
                  <span>{fleetText(f.ships)} <span className="muted small">{f.phase === 'outbound' ? <>arrives in <Countdown to={f.arriveAt} /></> : 'at the front'}</span></span>
                  <button onClick={() => void act(() => post(`/fleets/${f.id}/recall`), 'Recalled')}>Recall</button>
                </div>
              ))}
              <p className="muted small">Recall before an engagement if you would rather save your ships.</p>
            </Card>
          )}

          {inv.mine && (
            <Card title="Your contribution">
              <p>You have dealt <b>{fmt(inv.mine.damage)}</b> damage ({pct(inv.mine.share)} of the total) in {inv.mine.battles} engagement{inv.mine.battles === 1 ? '' : 's'} and lost {fmt(inv.mine.lost)} of ships.</p>
            </Card>
          )}

          <div className="grid2">
            <Card title="Top commanders">
              {inv.players.length === 0 && <p className="muted small">Nobody has fought yet.</p>}
              <table className="table"><tbody>{inv.players.map((p: any) => <tr key={p.id} className={p.you ? 'mine' : ''}><td>{p.rank}</td><td>{p.name}{p.you && ' (you)'}</td><td>{fmt(p.damage)}</td><td className="muted">{pct(p.share)}</td></tr>)}</tbody></table>
            </Card>
            <Card title="Top alliances">
              {inv.alliances.length === 0 && <p className="muted small">No alliance has fought yet.</p>}
              <table className="table"><tbody>{inv.alliances.map((a: any) => <tr key={a.tag}><td>{a.rank}</td><td>[{a.tag}]</td><td>{fmt(a.damage)}</td><td className="muted">{pct(a.share)}</td></tr>)}</tbody></table>
            </Card>
          </div>

          <Card title="Rewards">
            <p className="small">If the Armada is <b>destroyed</b>, a pool of {Math.min(d.reward.cap, d.reward.base + d.reward.perParticipant * Math.max(1, inv.participants))} Command Credits is split by damage share (at least {d.reward.floor} for everyone who fought), and each commander with a real share earns the <b>Void Slayer</b> achievement. If it <b>retreats</b>, a third of that is shared out as a consolation. Time at the front is not wasted either way: ships that survive come home.</p>
          </Card>
        </>
      )}

      {d.history.length > 0 && (
        <Card title="Earlier waves">
          <table className="table">
            <thead><tr><th>Wave</th><th>Result</th><th>Armada</th><th>Rounds</th><th>Top damage</th><th>Top alliance</th></tr></thead>
            <tbody>{d.history.map((h: any) => (
              <tr key={h.number}><td>{h.number}</td><td className={h.result === 'won' ? 'good' : 'bad'}>{h.result === 'won' ? 'destroyed' : 'withdrew'}</td><td>{fmt(h.startValue)}</td><td>{h.rounds}</td>
                <td>{h.top.slice(0, 3).map((t: any) => `${t.name} ${fmt(t.damage)}`).join(', ') || '-'}</td><td>{h.topAlliance ? `[${h.topAlliance.tag}] ${fmt(h.topAlliance.damage)}` : '-'}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      <span hidden>{now}</span>
    </Page>
  );
}
