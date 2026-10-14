import { useEffect, useState } from 'react';
import { BUILDINGS, TECHS, UNITS } from '../../../shared/data';
import { missingSteps, type OrderStep } from '../../../shared/orders';
import { ROLES } from '../../../shared/roles';
import { get, getToken, post } from '../api';
import { fmt, when, Loading } from '../ui';
import { BattleReport } from './Messages';

const nameOf = (id: string) => (BUILDINGS as any)[id]?.name ?? (TECHS as any)[id]?.name ?? (UNITS as any)[id]?.name ?? id;
const list = (o: Record<string, number> | undefined) => Object.entries(o ?? {}).map(([id, n]) => `${nameOf(id)} ${fmt(n)}`).join(' · ') || 'none';

function PlanetCard({ c }: { c: any }) {
  return (
    <table className="kv">
      <tbody>
        <tr><td>{c.isMoon ? 'Moon' : 'Planet'}</td><td><b>{c.name}</b> of {c.owner} [{c.coords.g}:{c.coords.s}:{c.coords.p}]{c.role && <span className="tag">{ROLES.find((r) => r.id === c.role)?.label}</span>}</td></tr>
        <tr><td>Size</td><td>{c.diameter ? `${fmt(c.diameter)} km · ` : ''}{c.fields} fields · up to {c.maxTemp} °C</td></tr>
        <tr><td>Buildings</td><td>{list(c.buildings)}</td></tr>
        {!c.isMoon && <tr><td>Research</td><td>{list(c.techs)}</td></tr>}
        {c.fleet && <tr><td>Ships</td><td>{list(c.fleet)}</td></tr>}
        {c.defenses && <tr><td>Defenses</td><td>{list(c.defenses)}</td></tr>}
      </tbody>
    </table>
  );
}

/** the steps of a shared order, and (when you are logged in) a button that queues the ones you still lack on your selected planet */
function OrderCard({ c }: { c: any }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const loggedIn = !!getToken();
  const apply = async () => {
    setBusy(true); setMsg('');
    try {
      const planets: any[] = await get('/planets');
      const me = await get('/me');
      const saved = (() => { try { return localStorage.getItem('zg.planet'); } catch { return null; } })();
      const planet = planets.find((p) => p.id === saved && !p.isMoon) ?? planets.find((p) => !p.isMoon);
      if (!planet) throw new Error('You have no planet to build on');
      const todo = missingSteps(c.steps as OrderStep[], planet.buildings, me.player.techs);
      let queued = 0;
      for (const s of todo) {
        try { await post(s.kind === 'building' ? `/planets/${planet.id}/build` : `/planets/${planet.id}/research`, { id: s.id }); queued++; }
        catch (e) { setMsg(`Queued ${queued} of ${todo.length} steps on ${planet.name}. Stopped at ${nameOf(s.id)} ${s.level}: ${(e as Error).message}`); setBusy(false); return; }
      }
      setMsg(todo.length ? `Queued all ${queued} missing steps on ${planet.name}.` : 'You already have everything in this order.');
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  return (
    <>
      <p className="muted small">Build order of {c.owner} (from {c.planet})</p>
      <ol>{(c.steps as OrderStep[]).map((s, i) => <li key={i}>{nameOf(s.id)} to level {s.level} <span className="muted small">{s.kind === 'tech' ? 'research' : 'building'}</span></li>)}</ol>
      {loggedIn
        ? <p><button className="primary" disabled={busy} onClick={() => void apply()}>Queue the steps I still need</button> <span className="muted small">on your selected planet; stops when a queue is full</span></p>
        : <p className="muted small">Log in to queue these steps in your own game.</p>}
      {msg && <p>{msg}</p>}
    </>
  );
}

/** Public page behind a shared link (no login needed): a battle report, a planet card or a build order. */
export function SharedReport({ id }: { id: string }) {
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => { get(`/shared/${encodeURIComponent(id)}`).then(setR).catch((e) => setErr(String(e.message || e))); }, [id]);
  const kind = r?.report?.kind;
  return (
    <div className="login">
      <div className="card" style={{ maxWidth: 760 }}>
        <h1>Zgame</h1>
        {err && <div className="error">{err}</div>}
        {!r && !err && <Loading />}
        {r && <>
          <h3>{r.subject}</h3>
          <p className="muted small">Shared {when(r.at)}</p>
          {kind === 'planet' ? <PlanetCard c={r.report} /> : kind === 'order' ? <OrderCard c={r.report} /> : <BattleReport d={r.report} full />}
        </>}
        <p><a href={location.pathname}>Open the game</a></p>
      </div>
    </div>
  );
}
