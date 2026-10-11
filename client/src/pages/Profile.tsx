import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, CoordLink, coordStr, fmt, Page, PlanetLink, when } from '../ui';
import { LineChart } from './Highscore';

const ACTIVITY: Record<string, string> = { online: 'online now', active: 'active', inactive: 'inactive for a week or more', longInactive: 'inactive for a month or more' };

export function Profile() {
  const { profileId, profileFrom, setPage, me, showInGalaxy, act } = useGame();
  const [p, setP] = useState<any>(null);
  const [soc, setSoc] = useState<any>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!profileId) return;
    setP(null); setErr('');
    get(`/players/${profileId}`).then(setP).catch((e) => setErr(String(e.message || e)));
    get('/social').then((s) => { setSoc(s); setNote(s.notes[`p:${profileId}`] ?? ''); }).catch(() => undefined);
  }, [profileId]);
  const back = <button onClick={() => setPage(profileFrom)}>← Back</button>;
  if (err) return <Page title="Commander"><div className="row">{back}</div><div className="error">{err}</div></Page>;
  if (!p) return <Page title="Commander"><p className="muted">Loading…</p></Page>;
  const mine = p.id === me.player.id;
  const s = p.stats;
  const isBuddy = !!soc?.buddies.some((b: any) => b.id === p.id);
  const isBlocked = !!soc?.blocked.some((b: any) => b.id === p.id);
  const social = async (path: string, body: unknown, ok: string) => { const r = await act(() => post(path, body), ok); if (r) setSoc(r); };
  return (
    <Page title={p.username}>
      <div className="row">{back}{p.home && !mine && <button onClick={() => showInGalaxy(p.home)}>Find in galaxy {coordStr(p.home)}</button>}</div>
      {!mine && !p.npc && soc && (
        <div className="row wrap">
          {isBuddy ? <button onClick={() => void social('/social/buddy/remove', { id: p.id }, 'Removed from buddies')}>Remove buddy</button> : <button onClick={() => void social('/social/buddy', { id: p.id }, 'Added to buddies')} disabled={isBlocked}>Add buddy</button>}
          {isBlocked ? <button onClick={() => void social('/social/unblock', { id: p.id }, 'Unblocked')}>Unblock</button> : <button onClick={() => confirm(`Block ${p.username}? They can no longer message you.`) && void social('/social/block', { id: p.id }, 'Blocked')}>Block</button>}
          <button onClick={() => { const reason = prompt(`Report ${p.username} to the admins. What happened?`); if (reason) void act(() => post('/report', { id: p.id, reason }), 'Report sent'); }}>Report</button>
        </div>
      )}
      <p className="muted">
        {p.npc ? `Computer empire (${p.npc})` : 'Commander'}
        {p.alliance && <> · [{p.alliance.tag}] {p.alliance.name}</>}
        {p.faction && <> · {p.faction}</>}
        {p.charClass && <> · {p.charClass}</>}
        {' · '}{p.planets} planet{p.planets === 1 ? '' : 's'}
        {p.activity && <> · {ACTIVITY[p.activity]}</>}{p.vacation && <> · on vacation</>}
        {' · '}joined {when(p.joinedAt)}
      </p>
      {!mine && soc && (
        <Card title="Your private note">
          <div className="row"><input className="grow" maxLength={500} placeholder="Only you can see this" value={note} onChange={(e) => setNote(e.target.value)} />
            <button onClick={() => void social('/social/note', { key: `p:${p.id}`, text: note }, note.trim() ? 'Note saved' : 'Note removed')}>Save</button></div>
        </Card>
      )}
      {p.locations?.length > 0 && (
        <Card title={`Planets (${p.locations.length})`}>
          {p.locations.map((l: any, i: number) => (
            <div key={i} className="row between">
              <span><PlanetLink name={l.name} coords={l.coords} moon={l.moon}><b>{l.name}</b></PlanetLink> <span className="muted"><CoordLink c={l.coords} /></span></span>
              <button onClick={() => showInGalaxy(l.coords)}>Galaxy</button>
            </div>
          ))}
        </Card>
      )}
      <Card title="Standing">
        <div className="rank-grid">
          {p.ranks.map((r: any) => (
            <div key={r.id} className="rank-tile">
              <span className="muted small">{r.label}</span>
              <b>{r.rank ? '#' + fmt(r.rank) : '-'}</b>
              <span className="muted small">{r.value ? `${fmt(r.value)} ${r.unit}` : 'no score yet'}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Points">
        <table className="kv"><tbody>
          <tr><td>Economy</td><td>{fmt(p.points.buildings)}</td></tr><tr><td>Research</td><td>{fmt(p.points.research)}</td></tr>
          <tr><td>Fleet</td><td>{fmt(p.points.fleet)}</td></tr><tr><td>Defense</td><td>{fmt(p.points.defense)}</td></tr>
          <tr><td><b>Total</b></td><td><b>{fmt(p.points.total)}</b></td></tr>
        </tbody></table>
      </Card>
      <Card title="Record">
        <table className="kv"><tbody>
          <tr><td>Battles won / lost</td><td>{fmt(s.battlesWon)} / {fmt(s.battlesLost)}</td></tr>
          <tr><td>Destroyed</td><td>{fmt(s.destroyed)} resources</td></tr><tr><td>Plundered</td><td>{fmt(s.plundered)}</td></tr>
          <tr><td>Recycled from debris</td><td>{fmt(s.harvested)}</td></tr><tr><td>Expeditions</td><td>{fmt(s.expeditions)}</td></tr>
          <tr><td>Raids repelled</td><td>{fmt(s.raidsRepelled)}</td></tr><tr><td>Moons destroyed</td><td>{fmt(s.moonsDestroyed)}</td></tr>
        </tbody></table>
      </Card>
      {p.history.length > 1 && (
        <Card title="Over time">
          <div className="charts">
            <LineChart series={p.history.map((h: any) => ({ t: h.t, v: h.points }))} label="Points" color="var(--accent)" />
            <LineChart series={p.history.map((h: any) => ({ t: h.t, v: h.rank }))} label="Rank (lower is better)" color="var(--good)" rank />
          </div>
        </Card>
      )}
      <Card title={`Achievements ${p.achievements.length} / ${p.achievementsTotal}`}>
        {p.achievements.length === 0 ? <p className="muted">None yet.</p> : (
          <ul className="ach">{p.achievements.map((a: any) => <li key={a.id} className="done"><span><b>{a.name}</b> - {a.desc}</span><span className="muted small">{when(a.doneAt)}</span></li>)}</ul>
        )}
      </Card>
    </Page>
  );
}
