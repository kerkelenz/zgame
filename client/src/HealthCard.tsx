import { useEffect, useState } from 'react';
import { get } from './api';
import { Card, fmt, fmtDur, when, Loading } from './ui';

const bytes = (n: number | null) => (n == null ? 'unknown' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/** Admin page: how the running server is doing, refreshed every five seconds. */
export function HealthCard() {
  const [h, setH] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () => get('/admin/health').then((r) => { if (alive) { setH(r); setErr(''); } }).catch((e) => { if (alive) setErr((e as Error).message); });
    void load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (err) return <Card title="Server health"><p className="bad">{err}</p></Card>;
  if (!h) return <Card title="Server health"><Loading /></Card>;
  const slow = h.tick.p95Ms > 250;
  return (
    <Card title="Server health">
      <table className="kv">
        <tbody>
          <tr><td>Up for</td><td>{fmtDur(h.uptimeMs)}</td></tr>
          <tr><td>Tick (last {h.tick.samples})</td><td className={slow ? 'bad' : 'good'}>average {h.tick.avgMs.toFixed(1)} ms · 95% under {h.tick.p95Ms.toFixed(1)} ms · slowest {h.tick.maxMs.toFixed(1)} ms{slow ? ' - slow: the server is struggling' : ''}</td></tr>
          <tr><td>Last save</td><td>{h.save ? <>{when(h.save.at)} · {h.save.ms.toFixed(0)} ms · {bytes(h.save.bytes)}</> : 'none yet'}<div className="muted small">{h.saveFile}</div></td></tr>
          <tr><td>Memory</td><td>{h.memoryMb.rss} MB in use ({h.memoryMb.heap} MB heap)</td></tr>
          <tr><td>Commanders</td><td>{fmt(h.players.total)} · online now {h.players.online} · today {h.players.day} · this week {h.players.week} · live connections {h.players.sockets}</td></tr>
          <tr><td>World</td><td>{Object.entries(h.world).map(([k, v]) => `${k} ${fmt(v as number)}`).join(' · ')}</td></tr>
        </tbody>
      </table>
      <h4>Recent errors</h4>
      {h.errors.length === 0 ? <p className="muted small">None since the server started.</p> : h.errors.map((e: any, i: number) => <div key={i} className="small bad">{when(e.at)} – {e.text}</div>)}
    </Card>
  );
}
