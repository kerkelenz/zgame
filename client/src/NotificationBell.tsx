import { useEffect, useRef, useState } from 'react';
import { useGame } from './game';
import { unreadNotes } from './notes';
import { Linkify } from './ui';
import { useFlash } from './useFlash';

const ago = (at: number) => {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`;
};

/** A bell in the top bar: what happened while you were looking elsewhere, with Mark read and Clear. */
export function NotificationBell() {
  const { notes, markNotesRead, clearNotes } = useGame();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const unread = unreadNotes(notes);
  const ring = useFlash(unread);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className={`bell${ring ? ' ring' : ''}`} ref={box}>
      <button aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} title="Notifications" onClick={() => { setOpen(!open); if (open) markNotesRead(); }}>
        🔔{unread > 0 && <b className="badge">{unread}</b>}
      </button>
      {open && (
        <div className="bellpanel" role="dialog" aria-label="Notifications">
          <div className="row between">
            <b>Notifications</b>
            <span className="row"><button className="link" onClick={markNotesRead} disabled={!unread}>Mark all read</button><button className="link" onClick={() => { clearNotes(); setOpen(false); }} disabled={!notes.length}>Clear</button></span>
          </div>
          {notes.length === 0 && <p className="muted small">Nothing yet. Completed builds, arrivals and warnings are kept here.</p>}
          <ul>
            {notes.map((n) => <li key={n.id} className={`${n.kind}${n.read ? '' : ' unread'}`}><Linkify text={n.text} /><span className="muted small"> · {ago(n.at)}</span></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
