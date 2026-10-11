import { useEffect, useState } from 'react';
import { get } from '../api';
import { when } from '../ui';
import { BattleReport } from './Messages';

/** Public page behind a shared battle-report link (no login needed). */
export function SharedReport({ id }: { id: string }) {
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => { get(`/shared/${encodeURIComponent(id)}`).then(setR).catch((e) => setErr(String(e.message || e))); }, [id]);
  return (
    <div className="login">
      <div className="card" style={{ maxWidth: 760 }}>
        <h1>Zgame</h1>
        {err && <div className="error">{err}</div>}
        {!r && !err && <p className="muted">Loading…</p>}
        {r && <>
          <h3>{r.subject}</h3>
          <p className="muted small">Shared {when(r.at)}</p>
          <BattleReport d={r.report} />
        </>}
        <p><a href={location.pathname}>Open the game</a></p>
      </div>
    </div>
  );
}
