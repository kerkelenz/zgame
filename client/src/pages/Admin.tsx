import { useCallback, useEffect, useState } from 'react';
import { resName } from '../../../shared/data';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, Page, fmt, when } from '../ui';

export function Admin() {
  const { act, me } = useGame();
  const [d, setD] = useState<any>(null);
  const [text, setText] = useState('');
  const [gift, setGift] = useState({ metal: 0, crystal: 0, deuterium: 0 });
  const [sel, setSel] = useState('');
  const [reports, setReports] = useState<any[]>([]);
  const [inspect, setInspect] = useState<any>(null);
  const load = useCallback(async () => { setD(await get('/admin/overview')); setReports(await get('/admin/reports')); }, []);
  useEffect(() => { void load(); }, [load]);
  if (!me.player.admin) return <Page title="Admin"><p className="muted">Admins only.</p></Page>;
  if (!d) return <Page title="Admin"><p className="muted">Loading…</p></Page>;
  const run = async (fn: () => Promise<unknown>, ok: string) => { if (await act(fn, ok)) await load(); };
  const reason = () => prompt('Reason (shown to the player)') ?? '';
  const hours = () => { const h = prompt('Hours (blank = permanent)'); return h ? Number(h) : null; };
  return (
    <Page title="Admin">
      <Card title="World">
        <div className="chips">{Object.entries(d.world).map(([k, v]) => <span key={k} className="tag">{k}: {fmt(v as number)}</span>)}</div>
      </Card>
      <Card title="Season">
        <div className="row wrap">
          <button className="danger" onClick={() => confirm('End the current season now? The champion is crowned immediately.') && void run(() => post('/admin/season/end'), 'Season ended')}>End season</button>
          <button className="danger" onClick={() => confirm('Reset the universe? Everyone starts over on a new homeworld (accounts, credits, officers and achievements stay).') && void run(() => post('/admin/season/reset'), 'Universe reset')}>Reset universe</button>
          <span className="muted small">Reset only works after the season has ended. Automatic timing: OGAME_SEASON_DAYS, OGAME_SEASON_RESET_HOURS, OGAME_VICTORY_POINTS.</span>
        </div>
      </Card>
      <Card title="Announcement">
        <div className="row"><input className="grow" value={text} maxLength={500} placeholder="Message to every commander" onChange={(e) => setText(e.target.value)} />
          <button className="primary" disabled={!text.trim()} onClick={() => void run(() => post('/admin/announce', { text }), 'Announcement sent').then(() => setText(''))}>Send</button></div>
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
                <td>{p.username}{p.admin && <span className="tag you">admin</span>}</td><td>{p.alliance ? `[${p.alliance}]` : ''}</td><td>{p.planets}</td><td>{fmt(p.points)}</td><td>{when(p.lastSeen)}</td>
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
      {inspect && (
        <Card title={`Inspect ${inspect.player.username}`} right={<button onClick={() => setInspect(null)}>Close</button>}>
          <pre className="inspect">{JSON.stringify(inspect, null, 1)}</pre>
        </Card>
      )}
      {sel && (
        <Card title={`Gift resources to ${d.players.find((p: any) => p.id === sel)?.username ?? ''}`}>
          <div className="row wrap">
            {(['metal', 'crystal', 'deuterium'] as const).map((k) => <label key={k}>{resName(k)}<input type="number" min={0} value={gift[k]} onChange={(e) => setGift({ ...gift, [k]: Number(e.target.value) })} /></label>)}
            <button className="primary" onClick={() => void run(() => post('/admin/gift', { id: sel, ...gift }), 'Gift delivered')}>Send to homeworld</button>
          </div>
        </Card>
      )}
    </Page>
  );
}
