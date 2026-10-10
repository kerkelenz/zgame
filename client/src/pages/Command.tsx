import { useCallback, useEffect, useState } from 'react';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, Countdown, Page, fmt, when } from '../ui';

export function Command() {
  const { act, refresh } = useGame();
  const [d, setD] = useState<any | null>(null);
  const load = useCallback(async () => setD(await get('/command')), []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<any>, ok?: string) => {
    const r = await act(fn, ok);
    if (r) setD(r.officers ? r : await get('/command'));
    await refresh();
  };

  if (!d) return <Page title="Command"><p className="muted">Loading…</p></Page>;
  const done = d.achievements.filter((a: any) => a.doneAt).length;
  const mine = d.factions.find((f: any) => f.joined);

  return (
    <Page title="Command">
      <p className="muted"><b className="energy">{fmt(d.credits)}</b> Command Credits · {mine ? mine.name : 'Unaligned'} · {done}/{d.achievements.length} achievements</p>

      {d.tributes.length > 0 && (
        <Card title="⚠ Tribute demands">
          {d.tributes.map((t: any) => (
            <div key={t.id} className="tribute">
              <p><b>{t.npc}</b> will keep its fleets away for a while in exchange for{' '}
                <span className="metal">{fmt(t.want.metal)} M</span> <span className="crystal">{fmt(t.want.crystal)} C</span> <span className="deut">{fmt(t.want.deuterium)} D</span>.
                Silence counts as a refusal - answer within <Countdown to={t.deadline} />.</p>
              <div className="row">
                <button className="primary" onClick={() => void run(() => post(`/tribute/${t.id}`, { answer: 'pay' }), 'Tribute paid')}>Pay the tribute</button>
                <button onClick={() => void run(() => post(`/tribute/${t.id}`, { answer: 'refuse' }), 'Refused')}>Refuse</button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card title="Objectives">
        <ol className="objectives">
          {d.objectives.map((o: any) => (
            <li key={o.id} className={o.doneAt ? 'done' : o.current ? 'current' : ''}>
              <b>{o.name}</b>{' '}
              <span className="muted small">{o.doneAt ? `done ${when(o.doneAt)}` : o.current ? o.hint : ''}</span>
              {!o.doneAt && <span className="reward small">{[o.reward.metal && `${fmt(o.reward.metal)} M`, o.reward.crystal && `${fmt(o.reward.crystal)} C`, o.reward.deuterium && `${fmt(o.reward.deuterium)} D`, o.reward.credits && `${fmt(o.reward.credits)} credits`].filter(Boolean).join(' · ')}</span>}
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Officers">
        <p className="muted small">Credits come from expeditions, objectives and achievements. Promotions are permanent and apply across your whole empire.</p>
        <div className="items">
          {d.officers.map((o: any) => (
            <section key={o.id} className="card officer">
              <div className="rank-dots">{Array.from({ length: o.max }, (_, i) => <i key={i} className={i < o.rank ? 'on' : ''} />)}</div>
              <h3>{o.name} <span className="lvl">rank {o.rank}/{o.max}</span></h3>
              <p className="muted small">{o.desc}</p>
              {o.nextCost == null ? <p className="good small">Top rank reached.</p>
                : <button className="primary" disabled={d.credits < o.nextCost} onClick={() => void run(() => post('/officers/hire', { id: o.id }), `${o.name} promoted`)}>Promote · {fmt(o.nextCost)} credits</button>}
            </section>
          ))}
        </div>
      </Card>

      <Card title="Factions">
        <p className="muted small">Raiding a faction's empires costs standing with them and earns half as much with their rival. Join at {d.factions[0]?.joinRep} standing: members stop raiding you, send supplies now and then, and you get the perk. Attack your own and you are out.</p>
        <div className="items">
          {d.factions.map((f: any) => (
            <section key={f.id} className={`card faction${f.joined ? ' joined' : ''}`}>
              <h3>{f.name} {f.joined && <span className="tag you">your faction</span>}</h3>
              <p className="muted small">{f.tag} · {f.empires} empires · rival: {f.rivalName}</p>
              <p className="small"><b>Perk:</b> {f.perk}</p>
              <div className="rep-bar" title={`Standing ${f.rep}`}><i className={f.rep >= f.joinRep ? 'ok' : f.rep < 0 ? 'bad' : ''} style={{ width: `${(Math.max(-100, Math.min(100, f.rep)) + 100) / 2}%` }} /></div>
              <p className="small">Standing {f.rep} / {f.joinRep} needed</p>
              {f.joined
                ? <button onClick={() => void run(() => post('/faction/leave'), 'Left the faction')}>Leave</button>
                : <button className="primary" disabled={f.rep < f.joinRep || !!mine} onClick={() => void run(() => post('/faction/join', { id: f.id }), `You now fly with ${f.name}`)}>Join</button>}
            </section>
          ))}
        </div>
      </Card>

      <Card title="Achievements">
        <ul className="ach">
          {d.achievements.map((a: any) => (
            <li key={a.id} className={a.doneAt ? 'done' : ''}>
              <span><b>{a.name}</b> - {a.desc}</span>
              <span className="muted small">{a.doneAt ? `claimed ${when(a.doneAt)}` : `${fmt(a.reward)} credits`}</span>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
