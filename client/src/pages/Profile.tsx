import { useEffect, useState } from 'react';
import { get } from '../api';
import { useGame } from '../game';
import { Card, Page, coordStr, fmt, when } from '../ui';
import { LineChart } from './Highscore';

const ACTIVITY: Record<string, string> = { online: 'online now', active: 'active', inactive: 'inactive for a week or more', longInactive: 'inactive for a month or more' };

export function Profile() {
  const { profileId, setPage, me, showInGalaxy } = useGame();
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!profileId) return;
    setP(null); setErr('');
    get(`/players/${profileId}`).then(setP).catch((e) => setErr(String(e.message || e)));
  }, [profileId]);
  const back = <button onClick={() => setPage('highscore')}>← Standing</button>;
  if (err) return <Page title="Commander"><div className="row">{back}</div><div className="error">{err}</div></Page>;
  if (!p) return <Page title="Commander"><p className="muted">Loading…</p></Page>;
  const mine = p.id === me.player.id;
  const s = p.stats;
  return (
    <Page title={p.username}>
      <div className="row">{back}{p.home && !mine && <button onClick={() => showInGalaxy(p.home)}>Find in galaxy {coordStr(p.home)}</button>}</div>
      <p className="muted">
        {p.npc ? `Computer empire (${p.npc})` : 'Commander'}
        {p.alliance && <> · [{p.alliance.tag}] {p.alliance.name}</>}
        {p.faction && <> · {p.faction}</>}
        {p.charClass && <> · {p.charClass}</>}
        {' · '}{p.planets} planet{p.planets === 1 ? '' : 's'}
        {p.activity && <> · {ACTIVITY[p.activity]}</>}{p.vacation && <> · on vacation</>}
        {' · '}joined {when(p.joinedAt)}
      </p>
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
