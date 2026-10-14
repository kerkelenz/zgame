import { useCallback, useEffect, useState } from 'react';
import { resName } from '../../../shared/data';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, fmt, Page, PlayerLink, when, Loading } from '../ui';
import { NumInput } from '../NumInput';
import { HealthCard } from '../HealthCard';

export function Admin() {
  const { act, me } = useGame();
  const [d, setD] = useState<any>(null);
  const [text, setText] = useState('');
  const [gift, setGift] = useState({ metal: 0, crystal: 0, deuterium: 0 });
  const [sel, setSel] = useState('');
  const [reports, setReports] = useState<any[]>([]);
  const [inspect, setInspect] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [sched, setSched] = useState<any[]>([]);
  const [plan, setPlan] = useState({ text: '', minutes: 60, repeatHours: 0 });
  const load = useCallback(async () => {
    setD(await get('/admin/overview')); setReports(await get('/admin/reports'));
    setAudit(await get('/admin/audit?limit=60')); setStats(await get('/admin/stats?days=14')); setSched(await get('/admin/schedule'));
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!me.player.admin) return <Page title="Admin"><p className="muted">Admins only.</p></Page>;
  if (!d) return <Page title="Admin"><Loading /></Page>;
  const run = async (fn: () => Promise<unknown>, ok: string) => { if (await act(fn, ok)) await load(); };
  const reason = () => prompt('Reason (shown to the player)') ?? '';
  const hours = () => { const h = prompt('Hours (blank = permanent)'); return h ? Number(h) : null; };
  return (
    <Page title="Admin">
      <HealthCard />
      <Card title="World">
        <div className="chips">{Object.entries(d.world).map(([k, v]) => <span key={k} className="tag">{k}: {fmt(v as number)}</span>)}</div>
      </Card>
      <Card title="Season">
        <div className="row wrap">
          <button className="danger" onClick={() => confirm('End the current season now? The champion is crowned immediately.') && void run(() => post('/admin/season/end'), 'Season ended')}>End season</button>
          <button className="danger" onClick={() => confirm('Reset the universe? Everyone starts over on a new homeworld (accounts, credits, officers and achievements stay).') && void run(() => post('/admin/season/reset'), 'Universe reset')}>Reset universe</button>
          <span className="muted small">Reset only works after the season has ended. Automatic timing: ZGAME_SEASON_DAYS, ZGAME_SEASON_RESET_HOURS, ZGAME_VICTORY_POINTS.</span>
        </div>
      </Card>
      <Card title="Void invasion">
        <div className="row wrap">
          <button className="danger" onClick={() => { const m = prompt('Open the rift in how many minutes?', '10'); if (m !== null) void run(() => post('/admin/invasion/start', { delayMinutes: Number(m) }), 'Invasion announced'); }}>Start an invasion</button>
          <button onClick={() => confirm('End the current invasion now? The Armada withdraws and consolation rewards are paid.') && void run(() => post('/admin/invasion/end'), 'Invasion ended')}>End the current invasion</button>
          <span className="muted small">Automatic timing: ZGAME_INVASION_INTERVAL_HOURS (0 turns them off), ZGAME_INVASION_ANNOUNCE_HOURS, ZGAME_INVASION_DURATION_HOURS, ZGAME_INVASION_STRENGTH (share of the server's combat fleets).</span>
        </div>
      </Card>
      <Card title="Announcement">
        <div className="row"><input className="grow" value={text} maxLength={500} placeholder="Message to every commander" onChange={(e) => setText(e.target.value)} />
          <button className="primary" disabled={!text.trim()} onClick={() => void run(() => post('/admin/announce', { text }), 'Announcement sent').then(() => setText(''))}>Send</button></div>
      </Card>
      <Card title={`Scheduled announcements (${sched.length})`}>
        <div className="row wrap">
          <input className="grow" value={plan.text} maxLength={500} placeholder="Message to send later" onChange={(e) => setPlan({ ...plan, text: e.target.value })} aria-label="Scheduled message" />
          <label className="row small">in <NumInput min={1} value={plan.minutes} onChange={(n) => setPlan({ ...plan, minutes: n })} aria-label="Minutes from now" /> minutes</label>
          <label className="row small">repeat every <NumInput min={0} value={plan.repeatHours} onChange={(n) => setPlan({ ...plan, repeatHours: n })} aria-label="Repeat every hours" /> hours (0 = once)</label>
          <button className="primary" disabled={!plan.text.trim()} onClick={() => void run(() => post('/admin/schedule', plan), 'Announcement scheduled').then(() => setPlan({ ...plan, text: '' }))}>Schedule</button>
        </div>
        {sched.length === 0 ? <p className="muted small">Nothing is scheduled.</p> : sched.map((a) => (
          <div key={a.id} className="row between"><span><b>{new Date(a.at).toLocaleString()}</b>{a.repeatHours > 0 && <span className="muted small"> · every {a.repeatHours} h</span>}<div>{a.text}</div></span>
            <button onClick={() => void run(() => post('/admin/schedule/cancel', { id: a.id }), 'Cancelled')}>Cancel</button></div>
        ))}
      </Card>
      {(() => {
        const held = d.players.filter((p: any) => p.banned || p.muted);
        return (
          <Card title={`Moderation (${held.length})`}>
            {held.length === 0 ? <p className="muted small">Nobody is banned or muted.</p> : held.map((p: any) => (
              <div key={p.id} className="row between">
                <span><PlayerLink id={p.id} name={p.username} />{' '}
                  {p.banned && <span className="tag bad">banned {p.banned.until ? `until ${new Date(p.banned.until).toLocaleString()}` : 'for good'}</span>}
                  {p.muted && <span className="tag">muted {p.muted.until ? `until ${new Date(p.muted.until).toLocaleString()}` : 'for good'}</span>}
                  <span className="muted small"> {p.banned?.reason || p.muted?.reason}</span></span>
                <span className="row">
                  {p.banned && <button onClick={() => void run(() => post('/admin/unban', { id: p.id }), 'Unbanned')}>Unban</button>}
                  {p.muted && <button onClick={() => void run(() => post('/admin/unmute', { id: p.id }), 'Unmuted')}>Unmute</button>}
                </span>
              </div>
            ))}
          </Card>
        );
      })()}
      <Card title="Commanders per day">
        {stats.length === 0 ? <p className="muted small">The first numbers appear within a minute.</p> : (
          <table className="table">
            <thead><tr><th>Day (UTC)</th><th>New accounts</th><th>Seen</th><th>Came back</th><th /></tr></thead>
            <tbody>{[...stats].reverse().map((r) => (
              <tr key={r.day}><td>{r.day}</td><td>{r.registered}</td><td>{r.active}</td><td>{r.returning}</td>
                <td style={{ width: '40%' }}><div className="bar" title={`${r.active} seen`}><div style={{ width: `${Math.round((r.active / Math.max(1, ...stats.map((x) => x.active))) * 100)}%` }} /></div></td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      {reports.length > 0 && (
        <Card title={`Player reports (${reports.length})`}>
          {reports.map((r) => (
            <div key={r.id} className="row between"><span><b>{r.byName}</b> reported <b>{r.targetName}</b> <span className="muted small">{when(r.at)}</span><div>{r.reason}</div></span>
              <button onClick={() => void run(() => post('/admin/reports/resolve', { id: r.id }), 'Resolved')}>Resolve</button></div>
          ))}
        </Card>
      )}
      <Card title="Commanders">
        <table className="table">
          <thead><tr><th>Name</th><th>Alliance</th><th>Planets</th><th>Points</th><th>Last seen</th><th>State</th><th /></tr></thead>
          <tbody>
            {d.players.map((p: any) => (
              <tr key={p.id} className={sel === p.id ? 'mine' : ''} onClick={() => setSel(p.id)}>
                <td><PlayerLink id={p.id} name={p.username} />{p.admin && <span className="tag you">admin</span>}</td><td>{p.alliance ? `[${p.alliance}]` : ''}</td><td>{p.planets}</td><td>{fmt(p.points)}</td><td>{when(p.lastSeen)}</td>
                <td>{p.banned && <span className="tag bad" title={p.banned.reason}>banned</span>}{p.muted && <span className="tag" title={p.muted.reason}>muted</span>}{p.vacation && <span className="tag vac">vacation</span>}</td>
                <td className="actions">{!p.admin && <>
                  {p.banned ? <button onClick={() => void run(() => post('/admin/unban', { id: p.id }), 'Unbanned')}>Unban</button>
                    : <button onClick={() => { const r = reason(); const h = hours(); void run(() => post('/admin/ban', { id: p.id, hours: h, reason: r }), 'Banned'); }}>Ban</button>}
                  {p.muted ? <button onClick={() => void run(() => post('/admin/unmute', { id: p.id }), 'Unmuted')}>Unmute</button>
                    : <button onClick={() => { const r = reason(); const h = hours(); void run(() => post('/admin/mute', { id: p.id, hours: h, reason: r }), 'Muted'); }}>Mute</button>}
                  <button onClick={async () => setInspect(await get(`/admin/player/${p.id}`))}>Inspect</button>
                  <button onClick={() => void run(() => post('/admin/raid', { id: p.id }), 'Raid sent')}>Raid</button>
                  <button className="danger" onClick={() => { if (confirm(`Permanently remove ${p.username} and everything they own?`)) void run(() => post('/admin/delete', { id: p.id }), 'Removed'); }}>Remove</button>
                </>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title={`Audit log (${audit.length})`}>
        {audit.length === 0 ? <p className="muted small">Nothing has been done yet.</p> : (
          <table className="table">
            <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Commander</th><th>Details</th></tr></thead>
            <tbody>{audit.map((e) => (
              <tr key={e.id}><td>{when(e.at)}</td><td>{e.admin}</td><td>{e.action}</td><td>{e.targetId ? <PlayerLink id={e.targetId} name={e.targetName ?? '?'} /> : ''}</td><td className="muted small">{e.detail}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      {inspect && (
        <Card title={`Inspect ${inspect.player.username}`} right={<button onClick={() => setInspect(null)}>Close</button>}>
          <pre className="inspect">{JSON.stringify(inspect, null, 1)}</pre>
        </Card>
      )}
      {sel && (
        <Card title={`Gift resources to ${d.players.find((p: any) => p.id === sel)?.username ?? ''}`}>
          <div className="row wrap">
            {(['metal', 'crystal', 'deuterium'] as const).map((k) => <label key={k}>{resName(k)}<NumInput value={gift[k]} onChange={(n) => setGift({ ...gift, [k]: n })} /></label>)}
            <button className="primary" onClick={() => void run(() => post('/admin/gift', { id: sel, ...gift }), 'Gift delivered')}>Send to homeworld</button>
          </div>
        </Card>
      )}
    </Page>
  );
}
