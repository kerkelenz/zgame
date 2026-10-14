import { useEffect, useMemo, useRef, useState } from 'react';
import { get } from './api';
import { useGame } from './game';
import { itemEntries, pageEntries, parseCoord, rankEntries, SHORTCUT_HELP, type PaletteEntry } from './palette';
import { fmt } from './ui';

interface Hit { id: string; username: string; alliance: string | null; points: number; npc: string | null }
type Row = { key: string; label: React.ReactNode; hint: string; run: () => void };

/** Ctrl+K: one box to jump to any page, building, research, ship, defense, commander or coordinates. Opens empty with the shortcut list. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, setPage, openItem, openProfile, showInGalaxy } = useGame();
  const [q, setQ] = useState('');
  const [cur, setCur] = useState(0);
  const [players, setPlayers] = useState<Hit[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const entries = useMemo(() => [...pageEntries(!!me?.player.admin), ...itemEntries()], [me?.player.admin]);

  useEffect(() => { if (open) { setQ(''); setCur(0); setPlayers([]); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2 || parseCoord(term)) { setPlayers([]); return; }
    const id = ++seq.current;
    const timer = setTimeout(() => { get(`/search/players?q=${encodeURIComponent(term)}`).then((r: Hit[]) => { if (id === seq.current) setPlayers(r.slice(0, 5)); }).catch(() => { if (id === seq.current) setPlayers([]); }); }, 160);
    return () => clearTimeout(timer);
  }, [q, open]);

  const done = (f: () => void) => () => { onClose(); f(); };
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const c = parseCoord(q);
    if (c) out.push({ key: 'coord', label: <>Open the galaxy at <b>[{c.g}:{c.s}{c.p ? `:${c.p}` : ''}]</b></>, hint: 'Galaxy', run: done(() => showInGalaxy({ g: c.g, s: c.s })) });
    for (const e of rankEntries(entries, q) as PaletteEntry[]) out.push({ key: `${e.kind}:${e.id}`, label: e.label, hint: e.hint, run: done(() => (e.kind === 'page' ? setPage(e.id) : openItem(e.id))) });
    for (const h of players) out.push({ key: `p:${h.id}`, label: <>{h.alliance && <span className="muted">[{h.alliance}] </span>}<b>{h.username}</b></>, hint: `Commander · ${fmt(h.points)} pts`, run: done(() => openProfile(h.id)) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, entries, players]);

  if (!open) return null;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCur((x) => Math.min(rows.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((x) => Math.max(0, x - 1)); }
    else if (e.key === 'Enter' && rows[cur]) { e.preventDefault(); rows[cur].run(); }
  };
  return (
    <div className="modalback palback" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal palette" role="dialog" aria-label="Command palette">
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setCur(0); }} onKeyDown={onKey} placeholder="Jump to a page, item, commander or coordinates (1:34:7)" aria-label="Jump to" autoComplete="off" maxLength={60} />
        {q.trim() ? (
          <ul className="palresults">
            {rows.map((r, i) => (
              <li key={r.key} className={i === cur ? 'on' : ''} onMouseEnter={() => setCur(i)} onMouseDown={(e) => { e.preventDefault(); r.run(); }}>
                <span>{r.label}</span><span className="muted small">{r.hint}</span>
              </li>
            ))}
            {!rows.length && <li className="muted">Nothing found</li>}
          </ul>
        ) : (
          <table className="palhelp"><tbody>{SHORTCUT_HELP.map((s) => <tr key={s.keys}><td><kbd>{s.keys}</kbd></td><td className="muted small">{s.does}</td></tr>)}</tbody></table>
        )}
      </div>
    </div>
  );
}
