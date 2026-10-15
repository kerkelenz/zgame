import { useState, type ReactNode } from 'react';
import { CHANGELOG, markChangelogSeen } from './changelog';
import { useGame } from './game';
import { setEncounterOpen } from './encounterUi';
import { Countdown, CoordLink, PlanetLink, PlayerLink } from './ui';

export interface Alert { id: string; level: 'danger' | 'warn' | 'info'; node: ReactNode; /** the page a click opens */ go?: string; /** informational ones can be hidden */ dismissible?: boolean; onOpen?: () => void }
const RANK = { danger: 0, warn: 1, info: 2 };

/** every notice about the game's state, most urgent first */
export function useAlerts(whatsNew: boolean): Alert[] {
  const { me, fleets, offline, openBattle } = useGame();
  const out: Alert[] = [];
  const enc = me.encounter;
  if (enc) out.push({ id: `enc-${enc.id}`, level: 'warn', onOpen: () => setEncounterOpen(true), node: <>📡 {enc.title}{enc.planet && <> at <PlanetLink name={enc.planet.name} coords={enc.planet.coords} /></>} · <Countdown to={enc.expiresAt} /></> });
  for (const b of fleets.engaged ?? []) out.push({ id: `battle-${b.id}`, level: 'danger', onOpen: () => openBattle(b.id), node: <>⚔ Your fleet is engaged at {b.outpost?.name ?? b.planet} <CoordLink c={b.coords} />: command the battle (it fights on its own in <Countdown to={b.deadline} />)</> });
  const inc = fleets.incoming;
  if (inc.length) out.push({ id: 'hostile', level: 'danger', go: 'fleet', node: <>⚠ {inc.length} hostile fleet{inc.length > 1 ? 's' : ''} inbound{inc.some((f) => f.ally) ? ' (also on allies)' : ''}{inc.length === 1 && <> · <PlayerLink id={inc[0].ownerId} name={inc[0].ownerName} /> from <CoordLink c={inc[0].from} /></>}</> });
  if (offline) out.push({ id: 'offline', level: 'danger', node: <>Connection to the server lost, retrying…</> });
  if (me.pendingTributes > 0) out.push({ id: 'tribute', level: 'danger', go: 'command', node: <>⚠ A hostile empire demands tribute: answer in Command before the deadline</> });
  const inv = me.invasion;
  if (inv) out.push(inv.phase === 'announced'
    ? { id: `inv-${inv.startsAt}`, level: 'warn', go: 'invasion', dismissible: true, node: <>☄ Void invasion: the rift at <CoordLink c={inv.rift} /> opens in <Countdown to={inv.startsAt} /></> }
    : { id: `inv-live-${inv.startsAt}`, level: 'danger', go: 'invasion', node: <>☄ Void invasion · wave {inv.wave} of {inv.waves} · the aliens leave in <Countdown to={inv.endsAt} /></> });
  const s = me.season;
  if (s?.ended) out.push({ id: `season-over-${s.number}`, level: 'info', go: 'highscore', dismissible: true, node: <>🏆 Season {s.number} is over · champion {s.ended.winnerName ?? 'nobody'}{s.ended.resetAt ? <> · reset in <Countdown to={s.ended.resetAt} /></> : ''}</> });
  else if (s?.endsAt && s.endsAt - Date.now() < 7 * 86_400_000) out.push({ id: `season-${s.number}`, level: 'warn', go: 'highscore', dismissible: true, node: <>🏁 Season {s.number} ends in <Countdown to={s.endsAt} /></> });
  if (me.vacation) out.push({ id: 'vacation', level: 'info', go: 'settings', node: <>🏖 Vacation mode: your empire is frozen and protected · you can leave after {new Date(me.vacation.minUntil).toLocaleString()}</> });
  if (whatsNew) out.push({ id: 'news', level: 'info', go: 'news', dismissible: true, onOpen: markChangelogSeen, node: <>✨ New: {CHANGELOG[0].title}</> });
  return out.sort((a, b) => RANK[a.level] - RANK[b.level]);
}

/** Pick what to show: hidden notices dropped, the rest in order. Pure, so it can be tested. */
export const visibleAlerts = (all: Alert[], hidden: ReadonlySet<string>) => all.filter((a) => !hidden.has(a.id));

/** One row of its own under the top bar: the most urgent notice, how many more there are (click to list them), and a close button where hiding is allowed */
export function AlertStrip({ whatsNew, onNewsSeen }: { whatsNew: boolean; onNewsSeen: () => void }) {
  const { setPage } = useGame();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState(false);
  const list = visibleAlerts(useAlerts(whatsNew), hidden);
  if (!list.length) return null;
  const hide = (a: Alert) => { setHidden(new Set([...hidden, a.id])); if (a.id === 'news') onNewsSeen(); };
  const click = (a: Alert) => { a.onOpen?.(); if (a.id === 'news') onNewsSeen(); if (a.go) setPage(a.go as never); };
  const row = (a: Alert) => (
    <div key={a.id} className={`alertrow ${a.level}${a.go || a.onOpen ? ' clickable' : ''}`}>
      <span className="alerttext" onClick={() => click(a)} title={a.go || a.onOpen ? 'Click for details' : undefined}>{a.node}</span>
      {a.dismissible && <button className="alertx" aria-label="Hide this notice" title="Hide" onClick={() => hide(a)}>✕</button>}
    </div>
  );
  return (
    <div className="alertstrip" role="status" aria-live="polite">
      {row(list[0])}
      {list.length > 1 && <button className="alertmore" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : `+${list.length - 1} more`}</button>}
      {open && list.length > 1 && <div className="alertlist">{list.slice(1).map(row)}</div>}
    </div>
  );
}
