import { useEffect, useState } from 'react';
import { get } from '../api';
import { useGame } from '../game';
import { Card, Countdown, Page, fmt, when, Loading } from '../ui';

interface Pt { t: number; v: number }

/** One measure per chart. The SVG holds only geometry (stretched, constant stroke); every label is HTML so text stays crisp. */
export function LineChart({ series, label, color, rank }: { series: Pt[]; label: string; color: string; rank?: boolean }) {
  const pts = series.filter((p) => Number.isFinite(p.v));
  if (pts.length < 2) return <p className="muted small">{label}: not enough history yet - a snapshot is taken every 20 minutes of play.</p>;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (lo === hi) { lo -= Math.max(1, Math.abs(lo) * 0.02); hi += Math.max(1, Math.abs(hi) * 0.02); }
  if (rank) [lo, hi] = [hi, lo]; // lower rank number is better, so it climbs
  const px = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * 100;
  const py = (v: number) => (1 - (v - lo) / (hi - lo)) * 100;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${px(p.t).toFixed(2)} ${py(p.v).toFixed(2)}`).join(' ');
  const last = pts[pts.length - 1];
  const short = (v: number) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e4 ? Math.round(v / 1e3) + 'k' : fmt(v));
  const fmtv = (v: number) => (rank ? '#' + fmt(Math.round(v)) : short(v));
  const ticks = [hi, (lo + hi) / 2, lo];
  return (
    <figure className="chart">
      <div className="plot">
        {ticks.map((v, i) => <span key={i} className="y-tick" style={{ top: `${py(v)}%` }}>{fmtv(v)}</span>)}
        <div className="plot-area">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${label} over time`}>
            {ticks.map((v, i) => <line key={i} className="grid" x1="0" x2="100" y1={py(v)} y2={py(v)} vectorEffect="non-scaling-stroke" />)}
            <path fill={color} fillOpacity=".12" d={`${path} L100 100 L0 100 Z`} />
            <path className="line" stroke={color} d={path} vectorEffect="non-scaling-stroke" />
          </svg>
          <i className="end-dot" style={{ left: '100%', top: `${py(last.v)}%`, background: color }} />
        </div>
      </div>
      <div className="x-axis"><span>{when(t0)}</span><span>{when(t1)}</span></div>
      <figcaption>{label} · now <b>{fmtv(last.v)}</b></figcaption>
    </figure>
  );
}

export function Highscore() {
  const { me, openProfile } = useGame();
  const [cat, setCat] = useState('total');
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [season, setSeason] = useState<any>(null);
  useEffect(() => { void get('/history').then(setHistory); void get('/season').then(setSeason); }, []);
  useEffect(() => { void get(`/highscore?cat=${cat}`).then(setData); }, [cat]);
  if (!data) return <Page title="Standing"><Loading /></Page>;

  const rows: any[] = data.players;
  const meIdx = rows.findIndex((r) => r.id === me.player.id);
  const show = rows.filter((_, i) => i < 50 || Math.abs(i - meIdx) <= 5);
  const stats = me.player.stats;
  let last = -1;

  return (
    <Page title="Standing">
      <p className="muted">{fmt(rows.length)} empires · 1 point per 1,000 resources invested</p>
      {season && (
        <Card title={`Season ${season.number}`}>
          <p className="muted small">
            {season.ended ? `Over - champion ${season.ended.winnerName ?? 'nobody'}.` : season.endsAt ? <>Ends in <Countdown to={season.endsAt} />.</> : 'No time limit.'}
            {season.victoryPoints > 0 && !season.ended && ` First to ${fmt(season.victoryPoints)} points wins early.`}
            {' '}At the end the universe resets; you keep your account, credits, officers, class and achievements.
          </p>
          {season.hallOfFame.length > 0 && (
            <table className="table">
              <thead><tr><th>Season</th><th>Champion</th><th>Points</th><th>Runners-up</th><th>Top alliance</th></tr></thead>
              <tbody>{season.hallOfFame.map((s: any) => (
                <tr key={s.season}><td>{s.season}</td><td><b>{s.top[0]?.name ?? '-'}</b></td><td>{fmt(s.top[0]?.points ?? 0)}</td>
                  <td>{s.top.slice(1, 3).map((x: any) => x.name).join(', ')}</td><td>{s.topAlliance ? `[${s.topAlliance.tag}] ${fmt(s.topAlliance.points)}` : '-'}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      )}
      <Card title="Your empire over time">
        <div className="charts">
          <LineChart series={history.map((h) => ({ t: h.t, v: h.points }))} label="Points" color="var(--accent)" />
          <LineChart series={history.map((h) => ({ t: h.t, v: h.fleet }))} label="Fleet value (resources)" color="var(--crystal)" />
          <LineChart series={history.map((h) => ({ t: h.t, v: h.rank }))} label="Rank (lower is better)" color="var(--good)" rank />
        </div>
      </Card>
      <Card title="Record">
        <table className="kv"><tbody>
          <tr><td>Battles won / lost</td><td>{fmt(stats.battlesWon)} / {fmt(stats.battlesLost)}</td></tr>
          <tr><td>Units destroyed</td><td>{fmt(stats.destroyed)} resources</td></tr>
          <tr><td>Plundered</td><td>{fmt(stats.plundered)}</td></tr>
          <tr><td>Harvested from debris</td><td>{fmt(stats.harvested)}</td></tr>
          <tr><td>Expeditions</td><td>{fmt(stats.expeditions)}</td></tr>
          <tr><td>Raids repelled</td><td>{fmt(stats.raidsRepelled)}</td></tr>
          <tr><td>Missile strikes</td><td>{fmt(stats.ipmKills)}</td></tr>
        </tbody></table>
      </Card>
      <Card title="Commanders and empires">
        <div className="chips" role="tablist">{data.categories.map((c: any) => <button key={c.id} role="tab" aria-selected={c.id === cat} className={c.id === cat ? 'active' : ''} onClick={() => setCat(c.id)}>{c.label}</button>)}</div>
        <table className="table">
          <thead><tr><th>#</th><th>Name</th><th>Alliance</th><th>Planets</th><th>Buildings</th><th>Research</th><th>Fleet</th><th>Defense</th><th>{cat === 'total' ? 'Total' : data.categories.find((c: any) => c.id === cat)?.label}</th><th title="Change since the daily snapshot">24 h</th><th title="Places gained or lost since the daily snapshot">Place</th></tr></thead>
          <tbody>
            {show.map((p) => {
              const gap = last !== -1 && p.rank - last > 1 ? <tr className="gap" key={'gap' + p.rank}><td colSpan={11}>…</td></tr> : null;
              last = p.rank;
              return [gap, (
                <tr key={p.id} className={p.id === me.player.id ? 'mine' : ''}>
                  <td>{p.rank}</td>
                  <td><a className="plink" onClick={() => openProfile(p.id)}>{p.username}</a> {p.npc ? <span className={`tag ${p.npc}`}>{p.npc}</span> : p.id === me.player.id ? <span className="tag you">you</span> : null}</td>
                  <td>{p.alliance ? `[${p.alliance}]` : p.faction ? <span className="muted small">{p.faction}</span> : ''}</td>
                  <td>{p.planets}</td><td>{fmt(p.buildings)}</td><td>{fmt(p.research)}</td><td>{fmt(p.fleet)}</td><td>{fmt(p.defense)}</td><td><b>{fmt(p.value)}</b></td>
                  <td className={!p.change ? 'muted' : p.change.points > 0 ? 'good' : p.change.points < 0 ? 'bad' : 'muted'}>{!p.change ? 'new' : p.change.points === 0 ? '±0' : `${p.change.points > 0 ? '+' : '−'}${fmt(Math.abs(p.change.points))}`}</td>
                  <td className={!p.change ? 'muted' : p.change.places > 0 ? 'good' : p.change.places < 0 ? 'bad' : 'muted'}>{!p.change || p.change.places === 0 ? '–' : p.change.places > 0 ? `▲ ${p.change.places}` : `▼ ${-p.change.places}`}</td>
                </tr>
              )];
            })}
          </tbody>
        </table>
        {data.since && <p className="muted small">The 24 h and Place columns compare with the standing written down at {when(data.since)}; it is refreshed once every 24 hours.</p>}
      </Card>
      <Card title="Alliances">
        {data.alliances.length === 0 ? <p className="muted">No alliances yet.</p> : (
          <table className="table">
            <thead><tr><th>#</th><th>Tag</th><th>Name</th><th>Members</th><th>Systems held</th><th>Total</th></tr></thead>
            <tbody>{data.alliances.map((a: any) => <tr key={a.id}><td>{a.rank}</td><td>[{a.tag}]</td><td>{a.name}</td><td>{a.members}</td><td>{a.sectors}</td><td>{fmt(a.total)}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </Page>
  );
}
