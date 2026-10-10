import { useCallback, useEffect, useState } from 'react';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, Cost, Page, fmt, when } from '../ui';

export function Alliance() {
  const { me, act, planet, setPage } = useGame();
  const [a, setA] = useState<any | null | undefined>(undefined);
  const [list, setList] = useState<any[]>([]);

  const load = useCallback(async () => {
    const mine = await get('/alliance');
    setA(mine);
    if (!mine) setList(await get('/alliances'));
  }, []);
  useEffect(() => { void load(); }, [load, me.alliance?.id]);

  const run = async (fn: () => Promise<any>, ok?: string) => { const r = await act(fn, ok); await load(); return r; };

  if (a === undefined) return <Page title="Alliance"><p className="muted">Loading…</p></Page>;
  return a ? <Mine a={a} run={run} planetId={planet.id} me={me} setPage={setPage} /> : <Browse list={list} run={run} />;
}

function Browse({ list, run }: { list: any[]; run: (f: () => Promise<any>, ok?: string) => Promise<any> }) {
  const [tag, setTag] = useState('');
  const [name, setName] = useState('');
  return (
    <Page title="Alliance">
      <p className="muted">Alliances share a bank, buy bonuses for every member, defend each other's planets with stationed fleets, and chat privately.</p>
      <Card title="Found an alliance">
        <form className="row wrap" onSubmit={(e) => { e.preventDefault(); void run(() => post('/alliance/create', { tag, name }), 'Alliance founded'); }}>
          <input placeholder="TAG (3-8)" value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} maxLength={8} className="sm" />
          <input placeholder="Alliance name" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
          <button className="primary">Create</button>
        </form>
      </Card>
      <Card title="Join an alliance">
        {list.length === 0 && <p className="muted">No alliances exist yet - found the first one!</p>}
        {list.map((x) => (
          <div className="row between" key={x.id}>
            <div><b>[{x.tag}] {x.name}</b> <span className="muted">· {x.members} members · {x.open ? 'open' : 'applications'}</span><div className="muted small">{x.description}</div></div>
            <button onClick={() => void run(() => post('/alliance/join', { id: x.id, text: 'Hello!' }), x.open ? 'Joined' : 'Application sent')}>{x.open ? 'Join' : 'Apply'}</button>
          </div>
        ))}
      </Card>
    </Page>
  );
}

function Mine({ a, run, planetId, me, setPage }: { a: any; run: (f: () => Promise<any>, ok?: string) => Promise<any>; planetId: string; me: any; setPage: (p: string) => void }) {
  const officer = a.myRole === 'founder' || a.myRole === 'officer';
  const founder = a.myRole === 'founder';
  const [don, setDon] = useState({ metal: 0, crystal: 0, deuterium: 0 });
  const [grant, setGrant] = useState({ playerId: '', metal: 0, crystal: 0, deuterium: 0 });
  const [desc, setDesc] = useState(a.description);

  return (
    <Page title={`[${a.tag}] ${a.name}`}>
      <div className="grid2">
        <Card title="About" right={officer && <button onClick={() => void run(() => post('/alliance/update', { open: !a.open }), a.open ? 'Now application-only' : 'Now open')}>{a.open ? 'Open (click to close)' : 'Closed (click to open)'}</button>}>
          {officer ? (
            <div className="row"><input className="grow" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} /><button onClick={() => void run(() => post('/alliance/update', { description: desc }), 'Saved')}>Save</button></div>
          ) : <p>{a.description || <span className="muted">No description.</span>}</p>}
          <p className="muted">Founded {when(a.createdAt)} · your rank: {a.myRole}</p>
          <div className="row">
            <button onClick={() => setPage('chat')}>Alliance chat</button>
            {!founder && <button onClick={() => confirm('Leave the alliance?') && void run(() => post('/alliance/leave'), 'Left')}>Leave</button>}
            {founder && <button className="danger" onClick={() => confirm('Disband the alliance for everyone?') && void run(() => post('/alliance/disband'), 'Disbanded')}>Disband</button>}
          </div>
        </Card>

        <Card title="Alliance bank">
          <div className="bankline"><span className="metal">{fmt(a.bank.metal)} M</span><span className="crystal">{fmt(a.bank.crystal)} C</span><span className="deut">{fmt(a.bank.deuterium)} D</span></div>
          <h4>Donate from current planet</h4>
          <div className="row wrap">
            {(['metal', 'crystal', 'deuterium'] as const).map((k) => <input key={k} type="number" min={0} className="md" placeholder={k} value={don[k] || ''} onChange={(e) => setDon({ ...don, [k]: Number(e.target.value) })} />)}
            <button className="primary" onClick={() => void run(() => post('/alliance/donate', { planetId, amount: don }), 'Donated').then(() => setDon({ metal: 0, crystal: 0, deuterium: 0 }))}>Donate</button>
          </div>
          {officer && (
            <>
              <h4>Grant to a member</h4>
              <div className="row wrap">
                <select value={grant.playerId} onChange={(e) => setGrant({ ...grant, playerId: e.target.value })}>
                  <option value="">member…</option>
                  {a.members.map((m: any) => <option key={m.id} value={m.id}>{m.username}</option>)}
                </select>
                {(['metal', 'crystal', 'deuterium'] as const).map((k) => <input key={k} type="number" min={0} className="md" placeholder={k} value={grant[k] || ''} onChange={(e) => setGrant({ ...grant, [k]: Number(e.target.value) })} />)}
                <button onClick={() => void run(() => post('/alliance/withdraw', { playerId: grant.playerId, amount: grant }), 'Granted')}>Send</button>
              </div>
            </>
          )}
        </Card>
      </div>

      <Card title="Alliance upgrades (apply to every member)">
        {a.upgradeInfo.map((u: any) => (
          <div className="row between" key={u.id}>
            <div><b>{u.name}</b> <span className="lvl">{u.level}</span><div className="muted small">{u.desc}</div></div>
            <div className="row">
              {u.level < 10 ? <><Cost cost={u.next} have={a.bank} />
                <button disabled={!officer} onClick={() => void run(() => post('/alliance/upgrade', { key: u.id }), `${u.name} upgraded`)}>Upgrade</button></> : <span className="muted">max</span>}
            </div>
          </div>
        ))}
      </Card>

      {officer && a.applications.length > 0 && (
        <Card title="Applications">
          {a.applications.map((x: any) => (
            <div className="row between" key={x.playerId}>
              <span><b>{x.username}</b> <span className="muted">{x.text}</span></span>
              <span className="row"><button className="primary" onClick={() => void run(() => post('/alliance/review', { playerId: x.playerId, accept: true }), 'Accepted')}>Accept</button><button onClick={() => void run(() => post('/alliance/review', { playerId: x.playerId, accept: false }))}>Decline</button></span>
            </div>
          ))}
        </Card>
      )}

      <Card title={`Members (${a.members.length})`}>
        <table className="table">
          <thead><tr><th>Commander</th><th>Rank</th><th>Points</th><th>Last seen</th><th></th></tr></thead>
          <tbody>
            {a.members.map((m: any) => (
              <tr key={m.id}>
                <td>{m.username}{m.id === me.player.id && ' (you)'}</td><td>{m.role}</td><td>{fmt(m.points)}</td>
                <td className="muted">{Date.now() - m.lastSeen < 120000 ? 'online' : when(m.lastSeen)}</td>
                <td className="actions">
                  {founder && m.id !== me.player.id && <>
                    <button onClick={() => void run(() => post('/alliance/role', { playerId: m.id, role: m.role === 'officer' ? 'member' : 'officer' }))}>{m.role === 'officer' ? 'Demote' : 'Promote'}</button>
                    <button onClick={() => confirm(`Hand leadership to ${m.username}?`) && void run(() => post('/alliance/role', { playerId: m.id, role: 'founder' }))}>Make founder</button>
                  </>}
                  {officer && m.id !== me.player.id && m.role !== 'founder' && (founder || m.role === 'member') && <button onClick={() => confirm(`Remove ${m.username}?`) && void run(() => post('/alliance/kick', { playerId: m.id }))}>Kick</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Activity log">
        {a.log.map((l: any, i: number) => <div key={i} className="muted small">{when(l.at)} – {l.text}</div>)}
      </Card>
    </Page>
  );
}
