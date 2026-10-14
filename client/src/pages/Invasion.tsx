import { useCallback, useEffect, useState } from 'react';
import { UNITS } from '../../../shared/data';
import { get, post } from '../api';
import { ReplayToggle } from '../BattleReplay';
import { useGame } from '../game';
import { canReplay } from '../replay';
import { ResIcon } from '../ResIcon';
import { Card, CoordLink, Countdown, ItemIcon, fmt, Page, PlayerLink, when, Loading } from '../ui';

const fleetText = (f: Record<string, number>) => Object.entries(f).filter(([, n]) => n).map(([id, n]) => `${fmt(n)} ${(UNITS as any)[id]?.name ?? id}`).join(', ') || 'none';
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const STATUS = { cleared: ['✔', 'good', 'destroyed'], active: ['⚔', 'bad', 'on the field'], pending: ['…', 'muted', 'to come'] } as const;

function Board({ title, unit, b }: { title: string; unit: string; b: { total: number; rows: any[] } }) {
  return (
    <Card title={title}>
      {b.rows.length === 0 ? <p className="muted small">Nobody yet.</p> : (
        <table className="table"><tbody>{b.rows.map((r) => <tr key={r.id} className={r.you ? 'mine' : ''}><td>{r.rank}</td><td><PlayerLink id={r.id} name={r.name} />{r.you && ' (you)'}</td><td>{fmt(r.value)}{unit}</td><td className="muted">{pct(r.share)}</td></tr>)}</tbody></table>
      )}
    </Card>
  );
}

/** The Void invasion: waves of aliens at a rift, strike teams at planets, scouts, supply convoys, and what everybody has done. */
export function Invasion() {
  const { act, setTarget, setPage, now, me } = useGame();
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => setD(await get('/invasion')), []);
  useEffect(() => { void load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);
  if (!d) return <Page title="Invasion"><Loading /></Page>;
  const inv = d.active;
  // a server that has not been restarted since the update still answers in the old shape (no waves): say so instead of crashing
  if (inv && !Array.isArray(inv.waves)) {
    return <Page title="Void invasion"><Card title="This server needs a restart"><p>An invasion is under way, but this server is still running an older version that does not describe it in the way this page needs. Ask whoever runs the server to restart it: the invasion carries on as a single wave afterwards.</p></Card></Page>;
  }
  const fly = (mission: 'invade' | 'scout' | 'supply', ships?: Record<string, number>) => { setTarget({ coords: inv.rift, mission, ships }); setPage('fleet'); };
  const wave = inv ? inv.waves[inv.waveIndex] : null;
  const next = inv ? inv.waves.find((x: any) => x.status === 'pending') : null;
  const intel = next ?? wave;

  return (
    <Page title="Void invasion">
      <p className="muted">Now and then the <b>Void</b> tears open a rift in deep space and sends <b>waves</b> of aliens through it. It takes everyone: <b>fleets</b> fight at the rift together, <b>planets</b> beat off strike teams, <b>scouts</b> find out what is coming and <b>convoys</b> keep the front supplied. Every job counts toward the rewards.</p>

      {!inv && (
        <Card title="No invasion right now">
          <p>{d.next ? <>The next invasion is expected around <b>{when(d.next)}</b> (in <Countdown to={d.next} />).</> : 'Invasions are switched off on this server.'} You get hours of warning before the rift opens: time to scout, build and gather your alliance.</p>
        </Card>
      )}

      {inv && (
        <>
          <Card title={`Invasion ${inv.number}: ${inv.phase === 'announced' ? 'the rift opens soon' : `wave ${inv.waveIndex + 1} of ${inv.waveCount}`}`}
            right={<span className="row">
              {inv.phase === 'active' && <button className="primary" onClick={() => fly('invade')}>Send a fleet to the front</button>}
              <button onClick={() => fly('scout', { espionageProbe: 10 })}>Scout the rift</button>
              <button onClick={() => fly('supply')}>Send supplies</button>
            </span>}>
            <p>The rift is at <b><CoordLink c={inv.rift} /></b> (deep space). {inv.phase === 'announced'
              ? <>It opens in <b><Countdown to={inv.startsAt} /></b>. Scout it now, build defenses, gather your alliance and agree when to arrive.</>
              : <>Next engagement in <b><Countdown to={inv.nextEngageAt} /></b>; the aliens leave in <Countdown to={inv.endsAt} />.{inv.nextWaveAt && <> The next wave arrives by <b>{when(inv.nextWaveAt)}</b>, sooner if you clear this one.</>}</>}</p>
            <ol className="waves">
              {inv.waves.map((x: any) => {
                const [icon, cls, word] = STATUS[x.status as keyof typeof STATUS];
                return (
                  <li key={x.index} className={`wave ${x.status}`}>
                    <span className={cls}>{icon}</span> <b>{x.name}</b> <span className="muted small">{x.label}{x.value != null ? ` · ${x.exact ? '' : 'about '}${fmt(x.value)}` : ''} · {word}</span>
                  </li>
                );
              })}
            </ol>
            {inv.kind && inv.boss.onField && (
              <>
                <div className="bar" title="Strength of what is on the field"><div style={{ width: `${Math.min(100, (inv.boss.value / Math.max(1, inv.boss.startValue)) * 100)}%`, background: 'var(--bad, #e8685d)' }} /></div>
                <p className="small"><b>{inv.kind.label} on the field:</b> {fmt(inv.boss.value)} of {fmt(inv.boss.startValue)} resources of ships ({pct(inv.boss.value / Math.max(1, inv.boss.startValue))}), technology level {inv.level}.<br /><span className="muted">{inv.kind.hint}</span><br /><span className="muted">{fleetText(inv.boss.fleet)}</span></p>
              </>
            )}
            {inv.phase === 'active' && !inv.boss.onField && <p className="small good">The field is clear. Repair, resupply and regroup before the next wave.</p>}
            {inv.phase === 'active' && (
              <p className="small">
                <b>At the front now:</b> {inv.combined.fleets} fleet{inv.combined.fleets === 1 ? '' : 's'} from {inv.combined.commanders} commander{inv.combined.commanders === 1 ? '' : 's'}, worth {fmt(inv.combined.value)}.{' '}
                {inv.boss.onField && (inv.combined.value >= inv.boss.value * 1.2 ? <span className="good">That is enough to destroy it in one engagement.</span> : inv.combined.value >= inv.boss.value * 0.5 ? <span className="bad">That will hurt it but not finish it: bring more, together.</span> : <span className="bad">Far too weak: a fleet this small only dies.</span>)}
              </p>
            )}
          </Card>

          {intel && (
            <Card title={`Intelligence: ${intel.name}`}>
              {intel.kind
                ? <>
                  <p><b>{intel.label}</b>{intel.value != null && <> · {intel.exact ? '' : 'about '}{fmt(intel.value)} resources of ships</>}. {intel.hint}</p>
                  {intel.fleet && <p className="small muted">{fleetText(intel.fleet)}</p>}
                  {intel.scoutedBy && <p className="small muted">Scouted by <PlayerLink id={intel.scoutedBy.id} name={intel.scoutedBy.name} /> {when(intel.scoutedBy.at)}{intel.exact ? '' : '. Ten or more probes show the exact fleet.'}</p>}
                </>
                : <p className="muted">Unknown. Send Espionage Probes to the rift to find out what the next wave is made of; everybody can read what you learn. Ten or more probes show the exact fleet. <button className="link" onClick={() => fly('scout', { espionageProbe: 10 })}>Scout now</button></p>}
            </Card>
          )}

          <div className="grid2">
            <Card title="Strike teams at your planets">
              {inv.strikes.onTheWay.length === 0
                ? <p className="muted small">None on the way. {inv.strikes.sent} strike team{inv.strikes.sent === 1 ? ' has' : 's have'} been sent at planets so far. Each wave sends new ones, sized to what defends the target, so build defenses and keep an ally ready to hold a planet.</p>
                : inv.strikes.onTheWay.map((s: any) => (
                  <div key={s.id} className="row between"><span className="bad">⚠ A strike team ({fmt(s.value)}) hits <CoordLink c={s.to} /> in <Countdown to={s.arriveAt} /></span></div>
                ))}
              <p className="muted small">Aliens you destroy at home count as your work; allies who hold the planet share the credit. Ask for help on the Fleet page.</p>
            </Card>
            <Card title="Supplies at the front">
              <p className="row">
                <span><ResIcon k="metal" size={16} /> {fmt(inv.supply.metal)}</span><span><ResIcon k="crystal" size={16} /> {fmt(inv.supply.crystal)}</span><span><ResIcon k="deuterium" size={16} /> {fmt(inv.supply.deuterium)}</span>
              </p>
              <p className="small muted">Before every engagement the supplies rebuild ships lost in the last one, at {Math.round(d.supply.repairShare * 100)}% of their price, biggest losses first. So far they have rebuilt {fmt(inv.supply.repaired)} resources of ships. A convoy of cargo ships can be caught by an alien patrol ({Math.round(d.supply.riskBase * 100)}% at first, more with each wave, less with warships along).</p>
            </Card>
          </div>

          {canReplay(inv.last) && (
            <Card title={`The last engagement (${inv.waves[inv.last.wave]?.name ?? 'wave'}, ${inv.last.rounds} rounds)`}>
              <ReplayToggle d={inv.last} />
            </Card>
          )}

          {inv.front.length > 0 && (
            <Card title="Your fleets at the rift">
              {inv.front.map((f: any) => (
                <div key={f.id} className="row between">
                  <span>{Object.entries(f.ships).filter(([, n]) => n).map(([id, n]) => <span key={id}><ItemIcon id={id} size={16} /> {fmt(n as number)} </span>)} <span className="muted small">{f.phase === 'outbound' ? <>arrives in <Countdown to={f.arriveAt} /></> : 'at the front'}</span></span>
                  <button onClick={() => confirm('Recall this fleet from the front?') && void act(() => post(`/fleets/${f.id}/recall`), 'Recalled')}>Recall</button>
                </div>
              ))}
              <p className="muted small">Recall before an engagement if you would rather save your ships.</p>
            </Card>
          )}

          {inv.mine && (
            <Card title="Your work">
              <p>
                At the front: <b>{fmt(inv.mine.damage)}</b> damage ({pct(inv.mine.share)}) in {inv.mine.battles} engagement{inv.mine.battles === 1 ? '' : 's'}, {fmt(inv.mine.lost)} of ships lost. At home: <b>{fmt(inv.mine.home)}</b> of aliens destroyed.
                Supplies: <b>{fmt(inv.mine.supplied)}</b> in {inv.mine.convoys} convoy{inv.mine.convoys === 1 ? '' : 's'}. Scouting: <b>{inv.mine.scouts}</b> report{inv.mine.scouts === 1 ? '' : 's'}.
                Your share of the rewards so far: <b>{pct(inv.mine.reward)}</b>.
              </p>
            </Card>
          )}

          <div className="grid2">
            <Board title="At the front (damage)" unit="" b={inv.boards.damage} />
            <Board title="At home (aliens destroyed)" unit="" b={inv.boards.home} />
            <Board title="Supplies delivered" unit="" b={inv.boards.supply} />
            <Board title="Scouting reports" unit="" b={inv.boards.scout} />
          </div>
          <Card title="Top alliances (damage)">
            {inv.alliances.length === 0 && <p className="muted small">No alliance has fought yet.</p>}
            <table className="table"><tbody>{inv.alliances.map((a: any) => <tr key={a.tag}><td>{a.rank}</td><td>[{a.tag}]</td><td>{fmt(a.damage)}</td><td className="muted">{pct(a.share)}</td></tr>)}</tbody></table>
          </Card>

          <Card title="Rewards">
            <p className="small">If the last wave is <b>destroyed</b>, a pool of {Math.min(d.reward.cap, d.reward.base + d.reward.perParticipant * Math.max(1, inv.participants))} Command Credits is split by everyone&apos;s work: {Math.round(d.reward.weights.damage * 100)}% by damage at the front, {Math.round(d.reward.weights.home * 100)}% by aliens destroyed at home, {Math.round(d.reward.weights.supply * 100)}% by supplies delivered and {Math.round(d.reward.weights.scout * 100)}% by scouting (a job nobody did does not count). Anyone who helped gets at least {d.reward.floor}. A share of the ships you lost at the front comes back as resources ({Math.round(d.reward.relief * 100)}%). If the aliens withdraw first, a third of the pool is shared and half the ship relief is paid.</p>
          </Card>
        </>
      )}

      {d.history.length > 0 && (
        <Card title="Earlier invasions">
          <table className="table">
            <thead><tr><th>#</th><th>Result</th><th>Size</th><th>Waves</th><th>Rounds</th><th>Top damage</th><th>Top alliance</th></tr></thead>
            <tbody>{d.history.map((h: any) => (
              <tr key={h.number}><td>{h.number}</td><td className={h.result === 'won' ? 'good' : 'bad'}>{h.result === 'won' ? 'destroyed' : 'withdrew'}</td><td>{fmt(h.startValue)}</td><td>{h.wavesCleared != null ? `${h.wavesCleared} of ${h.waves}` : '-'}</td><td>{h.rounds}</td>
                <td>{h.top.slice(0, 3).map((t: any) => `${t.name} ${fmt(t.damage)}`).join(', ') || '-'}</td><td>{h.topAlliance ? `[${h.topAlliance.tag}] ${fmt(h.topAlliance.damage)}` : '-'}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
      <span hidden>{now}{me?.invasion?.phase}</span>
    </Page>
  );
}
