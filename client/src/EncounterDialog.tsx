import { useEffect, useState } from 'react';
import { post } from './api';
import { setEncounterOpen, useEncounterOpen } from './encounterUi';
import { useGame } from './game';
import { Countdown, PlanetLink } from './ui';

/** The card for the encounter in front of you: what turned up, where, how long it waits, and what you can do about it. */
export function EncounterDialog() {
  const { me, act, refresh } = useGame();
  const open = useEncounterOpen();
  const e = me.encounter;
  const [result, setResult] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (!open) { setResult(null); setNote(null); } }, [open]);
  useEffect(() => { if (open && !e && result === null) setEncounterOpen(false); }, [open, e, result]);
  if (!open) return null;
  const close = () => setEncounterOpen(false);
  const choose = async (option: string) => {
    if (!e) return;
    const r = await act(() => post('/encounter/answer', { id: e.id, option }));
    if (!r) return;
    if (r.done) setResult(r.text); else setNote(r.text);
    await refresh();
  };
  return (
    <div className="modalback" role="presentation" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) close(); }}>
      <div className="modal encounter" role="dialog" aria-label="Event" aria-modal="true">
        {result !== null ? (
          <>
            <h3>Done</h3>
            <p>{result}</p>
            <div className="row"><span className="spacer" /><button className="primary" onClick={close}>Close</button></div>
          </>
        ) : e ? (
          <>
            <div className="muted small">📡 {e.planet && <PlanetLink name={e.planet.name} coords={e.planet.coords} />} · fades in <Countdown to={e.expiresAt} /></div>
            <h3>{e.title}</h3>
            <p>{e.text}</p>
            {note && <p className="good small">{note}</p>}
            <div className="encopts">
              {e.options.map((o: { id: string; label: string; hint: string }) => (
                <button key={o.id} className={o.id === e.options[0].id ? 'primary' : ''} onClick={() => void choose(o.id)} title={o.hint}>
                  <b>{o.label}</b><span className="muted small">{o.hint}</span>
                </button>
              ))}
            </div>
            <div className="row"><span className="spacer" /><button className="link" onClick={close}>Decide later</button></div>
          </>
        ) : null}
      </div>
    </div>
  );
}
