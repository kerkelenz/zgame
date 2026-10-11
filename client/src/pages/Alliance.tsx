import { useCallback, useEffect, useState } from 'react';
import { ResIcon } from '../ResIcon';
import { resName } from '../../../shared/data';
import { get, post } from '../api';
import { post as post_ } from '../api';
import { useGame } from '../game';
import { Card, Cost, Page, coordStr, fmt, when } from '../ui';

export function Alliance() {
  const { me, act, planet, setPage, openProfile, showInGalaxy } = useGame();
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
  return a ? <Mine a={a} run={run} planetId={planet.id} me={me} setPage={setPage} openProfile={openProfile} showInGalaxy={showInGalaxy} /> : <Browse list={list} run={run} />;
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

function Mine({ a, run, planetId, me, setPage, openProfile, showInGalaxy }: { a: any; run: (f: () => Promise<any>, ok?: string) => Promise<any>; planetId: string; me: any; setPage: (p: string) => void; openProfile: (id: string) => void; showInGalaxy: (c: { g: number; s: number }) => void }) {
  const has = (perm: string) => (a.myPerms as string[]).includes(perm);
  const officer = has('edit');
  const founder = a.myRole === 'founder';
  const [others, setOthers] = useState<any[]>([]);
  const [draft, setDraft] = useState(''); const [pinned, setPinned] = useState(false);
  const [msg, setMsg] = useState({ subject: '', text: '' });
  const [rankName, setRankName] = useState(''); const [rankPerms, setRankPerms] = useState<string[]>([]);
  const [target, setTarget] = useState('');
  useEffect(() => { if (has('diplomacy')) void get('/alliances').then((l) => setOthers(l.filter((x: any) => x.id !== a.id))); }, [a.id, a.diplomacy.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const PERM_LABEL: Record<string, string> = { applications: 'Review applications', kick: 'Remove members', bank: 'Grant from bank', upgrades: 'Buy upgrades', edit: 'Edit description', message: 'Mass message', bulletin: 'Bulletin board', diplomacy: 'Diplomacy' };
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
          <div className="bankline"><span className="metal"><ResIcon k="metal" size={18} /> {fmt(a.bank.metal)}</span><span className="crystal"><ResIcon k="crystal" size={18} /> {fmt(a.bank.crystal)}</span><span className="deut"><ResIcon k="deuterium" size={18} /> {fmt(a.bank.deuterium)}</span></div>
          <h4>Donate from current planet</h4>
          <div className="row wrap">
            {(['metal', 'crystal', 'deuterium'] as const).map((k) => <input key={k} type="number" min={0} className="md" placeholder={resName(k)} value={don[k] || ''} onChange={(e) => setDon({ ...don, [k]: Number(e.target.value) })} />)}
            <button className="primary" onClick={() => void run(() => post('/alliance/donate', { planetId, amount: don }), 'Donated').then(() => setDon({ metal: 0, crystal: 0, deuterium: 0 }))}>Donate</button>
          </div>
          {has('bank') && (
            <>
              <h4>Grant to a member</h4>
              <div className="row wrap">
                <select value={grant.playerId} onChange={(e) => setGrant({ ...grant, playerId: e.target.value })}>
                  <option value="">member…</option>
                  {a.members.map((m: any) => <option key={m.id} value={m.id}>{m.username}</option>)}
                </select>
                {(['metal', 'crystal', 'deuterium'] as const).map((k) => <input key={k} type="number" min={0} className="md" placeholder={resName(k)} value={grant[k] || ''} onChange={(e) => setGrant({ ...grant, [k]: Number(e.target.value) })} />)}
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
                <button disabled={!has('upgrades')} onClick={() => void run(() => post('/alliance/upgrade', { key: u.id }), `${u.name} upgraded`)}>Upgrade</button></> : <span className="muted">max</span>}
            </div>
          </div>
        ))}
      </Card>

      {has('applications') && a.applications.length > 0 && (
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
          <thead><tr><th>Commander</th><th>Rank</th><th>Home</th><th>Points</th><th>Last seen</th><th></th></tr></thead>
          <tbody>
            {a.members.map((m: any) => (
              <tr key={m.id}>
                <td><a className="plink" onClick={() => openProfile(m.id)}>{m.username}</a>{m.id === me.player.id && ' (you)'}</td><td>{m.rank ?? m.role}</td><td>{m.home ? <a className="plink" title="Show in the galaxy" onClick={() => showInGalaxy(m.home)}>{coordStr(m.home)}</a> : '-'}</td><td>{fmt(m.points)}</td>
                <td className="muted">{Date.now() - m.lastSeen < 120000 ? 'online' : when(m.lastSeen)}</td>
                <td className="actions">
                  {founder && m.id !== me.player.id && a.ranks.length > 0 && m.role !== 'founder' && (
                    <select value={m.rankId ?? ''} onChange={(e) => void run(() => post('/alliance/rank/assign', { playerId: m.id, rankId: e.target.value || null }))}>
                      <option value="">no rank</option>{a.ranks.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  )}
                  {founder && m.id !== me.player.id && <>
                    <button onClick={() => void run(() => post('/alliance/role', { playerId: m.id, role: m.role === 'officer' ? 'member' : 'officer' }))}>{m.role === 'officer' ? 'Demote' : 'Promote'}</button>
                    <button onClick={() => confirm(`Hand leadership to ${m.username}?`) && void run(() => post('/alliance/role', { playerId: m.id, role: 'founder' }))}>Make founder</button>
                  </>}
                  {has('kick') && m.id !== me.player.id && m.role !== 'founder' && (founder || (m.role === 'member' && !m.rankId)) && <button onClick={() => confirm(`Remove ${m.username}?`) && void run(() => post('/alliance/kick', { playerId: m.id }))}>Kick</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Bulletin board">
        {a.bulletin.length === 0 && <p className="muted">Nothing posted yet.</p>}
        {a.bulletin.map((b: any) => (
          <div key={b.id} className="row between bulletin">
            <div>{b.pinned && <span className="tag you">pinned</span>} <b>{b.author}</b> <span className="muted small">{when(b.at)}</span><div>{b.text}</div></div>
            <span className="row">
              {has('bulletin') && <button onClick={() => void run(() => post('/alliance/bulletin/pin', { id: b.id, pinned: !b.pinned }))}>{b.pinned ? 'Unpin' : 'Pin'}</button>}
              {(has('bulletin') || b.authorId === me.player.id || b.author === me.player.username) && <button onClick={() => void run(() => post('/alliance/bulletin/remove', { id: b.id }))}>Delete</button>}
            </span>
          </div>
        ))}
        {has('bulletin') && (
          <div className="row wrap">
            <input className="grow" maxLength={600} placeholder="Post to the board" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <label className="row"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> pin</label>
            <button className="primary" disabled={!draft.trim()} onClick={() => void run(() => post('/alliance/bulletin', { text: draft, pinned }), 'Posted').then(() => setDraft(''))}>Post</button>
          </div>
        )}
      </Card>

      {has('message') && (
        <Card title="Message all members">
          <div className="row wrap">
            <input placeholder="Subject" maxLength={60} value={msg.subject} onChange={(e) => setMsg({ ...msg, subject: e.target.value })} />
            <input className="grow" placeholder="Message" maxLength={1000} value={msg.text} onChange={(e) => setMsg({ ...msg, text: e.target.value })} />
            <button className="primary" disabled={!msg.text.trim()} onClick={() => void run(() => post('/alliance/message', msg), 'Sent to every member').then(() => setMsg({ subject: '', text: '' }))}>Send</button>
          </div>
        </Card>
      )}

      <WarCard war={a.war} has={has} run={run} />

      <Card title="Diplomacy">
        {a.proposals.map((x: any) => (
          <div key={x.id} className="row between"><span>[{x.tag}] {x.name} <span className="muted">offers a non-aggression pact</span></span>
            {has('diplomacy') && <span className="row"><button className="primary" onClick={() => void run(() => post('/alliance/pact/respond', { id: x.id, accept: true }), 'Pact signed')}>Accept</button><button onClick={() => void run(() => post('/alliance/pact/respond', { id: x.id, accept: false }))}>Decline</button></span>}</div>
        ))}
        {a.diplomacy.length === 0 && a.proposals.length === 0 && <p className="muted">No treaties. Pacts stop both alliances attacking each other. A war is a scored contest that runs for {a.war.rules.hours} hours.</p>}
        {a.diplomacy.filter((x: any) => x.kind === 'pact').map((x: any) => (
          <div key={x.id} className="row between"><span><span className={`tag ${x.kind === 'war' ? 'bad' : 'you'}`}>{x.kind}</span> [{x.tag}] {x.name} <span className="muted small">since {when(x.since)}</span></span>
            {has('diplomacy') && <button onClick={() => confirm(`End the pact with [${x.tag}]?`) && void run(() => post('/alliance/treaty/end', { id: x.id }), 'Treaty ended')}>End</button>}</div>
        ))}
        {has('diplomacy') && (
          <div className="row wrap">
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">alliance…</option>
              {others.map((o) => <option key={o.id} value={o.id}>[{o.tag}] {o.name}</option>)}
            </select>
            <button disabled={!target || a.offered.includes(target)} onClick={() => void run(() => post('/alliance/pact', { id: target }), 'Pact offered')}>{a.offered.includes(target) ? 'Offer pending' : 'Propose pact'}</button>
            <button className="danger" disabled={!target || !!a.war.current} onClick={() => confirm(`Declare a ${a.war.rules.hours}-hour war? The higher score wins; ending it early is a surrender.`) && void run(() => post('/alliance/war', { id: target }), 'War declared')}>Declare war</button>
          </div>
        )}
      </Card>

      {founder && (
        <Card title="Ranks">
          <p className="muted small">Ranks give members individual permissions. Plain officers keep every permission; founders always have all of them.</p>
          {a.ranks.map((r: any) => (
            <div key={r.id} className="row between">
              <span><b>{r.name}</b> <span className="muted small">{r.perms.map((x: string) => PERM_LABEL[x]).join(', ') || 'no permissions'}</span></span>
              <button onClick={() => confirm(`Delete the rank ${r.name}?`) && void run(() => post('/alliance/rank/delete', { id: r.id }))}>Delete</button>
            </div>
          ))}
          <div className="row wrap">
            <input placeholder="Rank name" maxLength={20} value={rankName} onChange={(e) => setRankName(e.target.value)} />
            {a.allPerms.map((x: string) => <label key={x} className="row small"><input type="checkbox" checked={rankPerms.includes(x)} onChange={(e) => setRankPerms(e.target.checked ? [...rankPerms, x] : rankPerms.filter((y) => y !== x))} /> {PERM_LABEL[x]}</label>)}
            <button className="primary" disabled={rankName.trim().length < 2} onClick={() => void run(() => post('/alliance/rank', { name: rankName, perms: rankPerms }), 'Rank created').then(() => { setRankName(''); setRankPerms([]); })}>Create rank</button>
          </div>
        </Card>
      )}

      <Card title="Activity log">
        {a.log.map((l: any, i: number) => <div key={i} className="muted small">{when(l.at)} – {l.text}</div>)}
      </Card>
    </Page>
  );
}

function Side({ s, mine }: { s: any; mine?: boolean }) {
  return (
    <div className={`warside ${mine ? 'mine' : ''}`}>
      <div className="small muted">[{s.tag}]{mine ? ' (us)' : ''}</div>
      <div className="warscore">{s.total.toLocaleString('en-US')}</div>
      <div className="small muted">{s.kills.toLocaleString('en-US')} from battles · {s.held.toLocaleString('en-US')} from systems</div>
    </div>
  );
}

function WarCard({ war, has, run }: { war: any; has: (p: string) => boolean; run: (f: () => Promise<any>, ok?: string) => Promise<any> }) {
  const c = war.current;
  const last = war.history[0];
  if (!c && !last) return null;
  const verdict = (x: any) => x.winner === 'draw' ? 'Draw' : x.winner === 'us' ? 'Victory' : 'Defeat';
  return (
    <Card title="War">
      {c && (
        <>
          <div className="row between wrap"><b>[{c.us.tag}] against [{c.them.tag}]</b><span className="muted small">ends {when(c.endsAt)}</span></div>
          <div className="warboard"><Side s={c.us} mine /><span className="muted">vs</span><Side s={c.them} /></div>
          <p className="muted small">Points come from the value of enemy units destroyed ({war.rules.valuePerPoint.toLocaleString('en-US')} resources = 1 point) and from systems held ({war.rules.heldPerHour} points per system per hour).</p>
          {c.top.length > 0 && <p className="small">Top fighters: {c.top.map((t: any) => `${t.username} ${t.points}`).join(', ')}</p>}
          {has('diplomacy') && <button className="danger" onClick={() => confirm(`Concede the war? [${c.them.tag}] wins at once.`) && void run(() => post('/alliance/treaty/end', { id: c.them.id }), 'War conceded')}>Concede</button>}
        </>
      )}
      {!c && last && (
        <div className="row between wrap">
          <span><span className={`tag ${last.winner === 'us' ? 'you' : last.winner === 'them' ? 'bad' : ''}`}>{verdict(last)}</span> [{last.us.tag}] {last.us.total} - {last.them.total} [{last.them.tag}] <span className="muted small">{last.how === 'conceded' ? 'conceded' : ''} {when(last.endedAt)}</span></span>
          {last.reward && last.winner === 'us' && <span className="small">+{last.reward.loot.toLocaleString('en-US')} resources to the bank, {last.reward.credits} credits shared</span>}
        </div>
      )}
      {war.history.length > (c ? 0 : 1) && (
        <div className="small muted">Earlier: {war.history.slice(c ? 0 : 1).map((x: any) => `${verdict(x)} vs [${x.them.tag}] ${x.us.total}-${x.them.total}`).join(' · ')}</div>
      )}
    </Card>
  );
}
