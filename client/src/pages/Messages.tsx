import { useCallback, useEffect, useState } from 'react';
import { BUILDINGS, TECHS, UNITS } from '../../../shared/data';
import { del, get, post } from '../api';
import { useGame } from '../game';
import type { Mission } from '../../../shared/types';
import { Card, CoordLink, Page, coordStr, fmt, when } from '../ui';

const KINDS = ['all', 'combat', 'espionage', 'raid', 'news', 'expedition', 'transport', 'alliance', 'player', 'system'];

const name = (id: string) => (UNITS as any)[id]?.name ?? (BUILDINGS as any)[id]?.name ?? (TECHS as any)[id]?.name ?? id;
const List = ({ data }: { data?: Record<string, number> }) => {
  const e = Object.entries(data || {}).filter(([, n]) => n);
  return e.length ? <>{e.map(([k, n]) => <div key={k}>{name(k)}: {fmt(n)}</div>)}</> : <span className="muted">–</span>;
};

function SpyReport({ d }: { d: any }) {
  const { setTarget, setPage } = useGame();
  // start a mission against the spied planet straight from the report: the Fleet page opens with the target and mission filled in
  const send = (mission: Mission) => { setTarget({ coords: d.coords, mission, toMoon: !!d.moon }); setPage('fleet'); };
  return (
    <>
      {d.coords && (
        <div className="row wrap spyhead">
          <span>{d.moon ? '🌙 ' : ''}<b>{d.planet}</b> <CoordLink c={d.coords} />{d.owner ? <span className="muted"> · {d.owner}</span> : null}</span>
          <span className="row">
            <button onClick={() => send('attack')}>Attack</button>
            <button onClick={() => send('espionage')}>Spy again</button>
            <button onClick={() => send('transport')}>Transport</button>
          </span>
        </div>
      )}
      <SpyDetails d={d} />
    </>
  );
}

function SpyDetails({ d }: { d: any }) {
  return (
    <div className="grid2">
      <div><h4>Resources</h4><List data={d.resources} /></div>
      {d.fleet && <div><h4>Fleet</h4><List data={d.fleet} /></div>}
      {d.defenses && <div><h4>Defense</h4><List data={d.defenses} /></div>}
      {d.buildings && <div><h4>Buildings</h4><List data={d.buildings} /></div>}
      {d.techs && <div><h4>Research</h4><List data={d.techs} /></div>}
    </div>
  );
}

export function Rounds({ log }: { log?: { a: Record<string, number>; d: Record<string, number> }[] }) {
  if (!log || log.length < 2) return null;
  const line = (bag: Record<string, number>) => Object.entries(bag).filter(([, n]) => n).map(([k, n]) => `${fmt(n)} ${name(k)}`).join(', ') || 'wiped out';
  return (
    <table className="table rounds">
      <thead><tr><th>Round</th><th>Attackers left</th><th>Defenders left</th></tr></thead>
      <tbody>{log.map((r, i) => <tr key={i}><td>{i === 0 ? 'Start' : i}</td><td>{line(r.a)}</td><td>{line(r.d)}</td></tr>)}</tbody>
    </table>
  );
}

export function BattleReport({ d }: { d: any }) {
  const side = (title: string, list: any[]) => (
    <div>
      <h4>{title}</h4>
      {list.map((s, i) => (
        <div key={i} className="muted">
          <b>{s.name}</b>
          {Object.keys(s.before || {}).map((k) => <div key={k}>{name(k)}: {fmt(s.before[k])} → {fmt(s.after?.[k] ?? 0)}</div>)}
        </div>
      ))}
    </div>
  );
  return (
    <>
      <p>{d.winner === 'attacker' ? 'Attacker won' : d.winner === 'defender' ? 'Defender won' : 'Draw'} after {d.rounds} rounds at {coordStr(d.coords)}.</p>
      <div className="grid2">{side('Attackers', d.attackers)}{side('Defenders', d.defenders)}</div>
      <Rounds log={d.roundLog} />
      {(d.loot?.metal || d.loot?.crystal || d.loot?.deuterium) ? <p>Loot: {fmt(d.loot.metal)} M, {fmt(d.loot.crystal)} C, {fmt(d.loot.deuterium)} D</p> : null}
      {(d.debris?.metal || d.debris?.crystal) ? <p>Debris: {fmt(d.debris.metal)} M, {fmt(d.debris.crystal)} C</p> : null}
      {d.bounty ? <p className="metal">Raider bounty: {fmt(d.bounty)}</p> : null}
    </>
  );
}

export function Messages() {
  const { refresh, act, toast } = useGame();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [kind, setKind] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [text, setText] = useState('');

  const load = useCallback(async () => setMsgs(await get('/messages')), []);
  useEffect(() => { void load(); }, [load]);

  const show = (m: any) => {
    setOpen(open === m.id ? null : m.id);
    if (!m.read) void post('/messages/read', { id: m.id }).then(() => { void load(); void refresh(); });
  };
  const list = msgs.filter((m) => kind === 'all' || m.kind === kind);

  return (
    <Page title="Messages">
      <Card title="Compose">
        <form className="row" onSubmit={async (e) => {
          e.preventDefault();
          const r = await act(() => post('/messages/send', { to, text }), 'Message sent');
          if (r) { setText(''); }
        }}>
          <input placeholder="Commander name" value={to} onChange={(e) => setTo(e.target.value)} />
          <input className="grow" placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          <button className="primary">Send</button>
        </form>
      </Card>
      <Card title="Inbox" right={<>
        <button onClick={async () => { await post('/messages/read'); await load(); await refresh(); }}>Mark all read</button>{' '}
        <button onClick={async () => { if (confirm('Delete all messages?')) { await post('/messages/clear'); await load(); await refresh(); toast('Inbox cleared'); } }}>Clear</button>
      </>}>
        <div className="chips">{KINDS.map((k) => <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{k}</button>)}</div>
        {list.length === 0 && <p className="muted">No messages.</p>}
        {list.map((m) => (
          <div key={m.id} className={`msg ${m.read ? '' : 'unread'}`}>
            <div className="msghead" onClick={() => show(m)}>
              <span className={`kind ${m.kind}`}>{m.kind}</span> <b>{m.subject}</b>{m.from && <span className="muted"> from {m.from}</span>}
              <span className="muted right">{when(m.at)}</span>
            </div>
            {open === m.id && (
              <div className="msgbody">
                {m.kind === 'espionage' && m.data?.resources ? <SpyReport d={m.data} /> : null}
                {(m.kind === 'combat' || m.kind === 'raid') && m.data?.attackers ? <BattleReport d={m.data} /> : <p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p>}
                {(m.kind === 'combat' || m.kind === 'raid') && m.data?.attackers && (
                  <button onClick={async () => {
                    const r = await act(() => post(`/messages/${m.id}/share`));
                    if (!r) return;
                    const url = `${location.origin}${location.pathname}?report=${r.id}`;
                    try { await navigator.clipboard.writeText(url); toast('Link copied: ' + url); } catch { prompt('Share this link', url); }
                  }}>Share link</button>
                )}
                <button onClick={async () => { await del(`/messages/${m.id}`); setOpen(null); await load(); }}>Delete</button>
                {m.kind === 'player' && m.from && <button onClick={() => setTo(m.from)}>Reply</button>}
              </div>
            )}
          </div>
        ))}
      </Card>
    </Page>
  );
}
