import { useEffect, useRef, useState } from 'react';
import { get } from './api';
import { useGame } from './game';
import { fmt } from './ui';

interface Hit { id: string; username: string; alliance: string | null; points: number; npc: string | null }

/** The search box in the top bar: type part of a commander's name, pick a result (mouse or keys) and their profile opens. */
export function PlayerSearch() {
  const { openProfile } = useGame();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setBusy(false); return; }
    setBusy(true);
    const id = ++seq.current;
    const timer = setTimeout(() => {
      get(`/search/players?q=${encodeURIComponent(term)}`).then((r: Hit[]) => { if (id === seq.current) { setHits(r); setCur(0); setBusy(false); } }).catch(() => { if (id === seq.current) { setHits([]); setBusy(false); } });
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (h: Hit) => { setOpen(false); setQ(''); setHits([]); openProfile(h.id); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCur((c) => Math.min(hits.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Enter' && hits[cur]) { e.preventDefault(); go(hits[cur]); }
    else if (e.key === 'Escape') { setOpen(false); (e.target as HTMLElement).blur(); }
  };
  const showList = open && q.trim().length >= 2;

  return (
    <div className="psearch" ref={box}>
      <input type="search" value={q} placeholder="Search players" aria-label="Search players" autoComplete="off" maxLength={40}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} />
      {showList && (
        <ul className="psresults" role="listbox">
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === cur} className={i === cur ? 'on' : ''} onMouseEnter={() => setCur(i)} onMouseDown={(e) => { e.preventDefault(); go(h); }}>
              <span>{h.alliance && <span className="muted">[{h.alliance}] </span>}<b>{h.username}</b>{h.npc && <span className="tag">{h.npc}</span>}</span>
              <span className="muted small">{fmt(h.points)} pts</span>
            </li>
          ))}
          {!hits.length && <li className="muted">{busy ? 'Searching…' : 'No commander found'}</li>}
        </ul>
      )}
    </div>
  );
}
