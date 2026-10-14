import { useCallback, useEffect, useState } from 'react';
import { BUILDINGS, TECHS, UNITS } from '../../../shared/data';
import { del, get, post } from '../api';
import { useGame } from '../game';
import type { Mission } from '../../../shared/types';
import { ReplayToggle } from '../BattleReplay';
import { canReplay } from '../replay';
import { WorldBanner } from '../WorldBanner';
import { OutpostTag } from './Galaxy';
import { Card, CoordLink, Linkify, PlanetLink, Page, PlayerLink, fmt, when, ItemIcon, copyLink, Empty } from '../ui';

const KINDS = ['all', 'combat', 'espionage', 'raid', 'news', 'expedition', 'transport', 'alliance', 'player', 'system'];

const name = (id: string) => (UNITS as any)[id]?.name ?? (BUILDINGS as any)[id]?.name ?? (TECHS as any)[id]?.name ?? id;
const List = ({ data }: { data?: Record<string, number> }) => {
  const e = Object.entries(data || {}).filter(([, n]) => n);
  return e.length ? <>{e.map(([k, n]) => <div key={k}><ItemIcon id={k} size={16} /> {name(k)}: {fmt(n)}</div>)}</> : <span className="muted">–</span>;
};

function SpyReport({ d }: { d: any }) {
  const { setTarget, setPage } = useGame();
  // start a mission against the spied planet straight from the report: the Fleet page opens with the target and mission filled in
  const send = (mission: Mission) => { setTarget({ coords: d.coords, mission, toMoon: !!d.moon }); setPage('fleet'); };
  return (
    <>
      {d.look && <WorldBanner look={d.look} isMoon={!!d.moon}><b>{d.planet}</b>{d.coords && <CoordLink c={d.coords} />}{d.owner && <PlayerLink id={d.ownerId} name={d.owner} />}</WorldBanner>}
      {d.coords && (
        <div className="row wrap spyhead">
          <span><PlanetLink name={d.planet} coords={d.coords} moon={d.moon}><b>{d.planet}</b></PlanetLink> <CoordLink c={d.coords} />{d.owner ? <span className="muted"> · <PlayerLink id={d.ownerId} name={d.owner} /></span> : null}{d.outpost && <OutpostTag o={d.outpost} />}</span>
          <span className="row">
            <button onClick={() => send('attack')}>Attack</button>
            <button onClick={() => send('espionage')}>Spy again</button>
            <button onClick={() => send('transport')}>Transport</button>
          </span>
        </div>
      )}
      <SpyDetails d={d} />
    </>
  );
}

function SpyDetails({ d }: { d: any }) {
  return (
    <div className="grid2">
      <div><h4>Resources</h4><List data={d.resources} /></div>
      {d.fleet && <div><h4>Fleet</h4><List data={d.fleet} /></div>}
      {d.defenses && <div><h4>Defense</h4><List data={d.defenses} /></div>}
      {d.buildings && <div><h4>Buildings</h4><List data={d.buildings} /></div>}
      {d.techs && <div><h4>Research</h4><List data={d.techs} /></div>}
    </div>
  );
}

/** a round-by-round table: for each side what it fired, what the enemy shields took, what reached hulls, what it destroyed and what is left */
export function Rounds({ log, stats }: { log?: { a: Record<string, number>; d: Record<string, number> }[]; stats?: { attackers: any; defenders: any }[] }) {
  if (!log || log.length < 2) return null;
  const line = (bag: Record<string, number>) => Object.entries(bag).filter(([, n]) => n).map(([k, n]) => `${fmt(n)} ${name(k)}`).join(', ') || 'wiped out';
  const sum = (key: 'attackers' | 'defenders', f: string) => (stats ?? []).reduce((a, r) => a + (r[key]?.[f] ?? 0), 0);
  return (
    <div className="dwrap">
      <table className="table rounds">
        <thead>
          <tr><th rowSpan={2}>Round</th><th colSpan={5}>Attackers fire</th><th colSpan={5}>Defenders fire</th></tr>
          <tr>{['Shots', 'Damage', 'Absorbed by shields', 'To hulls', 'Destroyed'].map((h) => <th key={'a' + h}>{h}</th>)}{['Shots', 'Damage', 'Absorbed by shields', 'To hulls', 'Destroyed'].map((h) => <th key={'d' + h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(stats ?? []).map((r, i) => (
            <tr key={i}>
              <td><b>{i + 1}</b></td>
              {(['attackers', 'defenders'] as const).flatMap((side) => (['shots', 'damage', 'absorbed', 'hullDamage', 'destroyed'] as const).map((f) => <td key={side + f} className={f === 'absorbed' ? 'crystal' : f === 'hullDamage' ? 'bad' : ''}>{fmt(r[side]?.[f] ?? 0)}</td>))}
            </tr>
          ))}
          {stats && stats.length > 1 && (
            <tr className="total">
              <td><b>All</b></td>
              {(['attackers', 'defenders'] as const).flatMap((side) => (['shots', 'damage', 'absorbed', 'hullDamage', 'destroyed'] as const).map((f) => <td key={side + f}><b>{fmt(sum(side, f))}</b></td>))}
            </tr>
          )}
        </tbody>
      </table>
      <table className="table rounds">
        <thead><tr><th>After round</th><th>Attackers left</th><th>Defenders left</th></tr></thead>
        <tbody>{log.map((r, i) => <tr key={i}><td>{i === 0 ? 'Start' : i}</td><td>{line(r.a)}</td><td>{line(r.d)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

const moonLine = (m: any) => (m ? (m.formed ? `A moon formed above this planet (the chance was ${Math.round(m.chance * 100)}%).` : `No moon formed. The chance from the ${fmt(m.field)} of debris above this planet was ${Math.round(m.chance * 100)}%.`) : null);

/** the result of a battle at a glance: who won, the losses on each side, loot, debris and the moon; the round-by-round detail is behind a link */
export function BattleReport({ d, full, onOpen, replay }: { d: any; /** show the round-by-round detail here too (the public page) */ full?: boolean; onOpen?: (replay?: boolean) => void; /** open the replay at once */ replay?: boolean }) {
  const side = (title: string, list: any[]) => (
    <div>
      <h4>{title}</h4>
      {list.map((s, i) => (
        <div key={i} className="muted">
          <b><PlayerLink id={s.owner} name={s.name} /></b>
          {Object.keys(s.before || {}).map((k) => <div key={k}><ItemIcon id={k} size={16} /> {name(k)}: {fmt(s.before[k])} → {fmt(s.after?.[k] ?? 0)}</div>)}
        </div>
      ))}
    </div>
  );
  const moon = moonLine(d.moon);
  return (
    <>
      {d.look && <WorldBanner look={d.look} isMoon={!!d.isMoon}><b>{d.planet}</b><CoordLink c={d.coords} /></WorldBanner>}
      <p>{d.winner === 'attacker' ? 'Attacker won' : d.winner === 'defender' ? 'Defender won' : 'Draw'} after {d.rounds} rounds at {d.planet ? <><PlanetLink name={d.planet} coords={d.coords} /> </> : null}<CoordLink c={d.coords} />.</p>
      <div className="grid2">{side('Attackers', d.attackers)}{side('Defenders', d.defenders)}</div>
      {(d.loot?.metal || d.loot?.crystal || d.loot?.deuterium) ? <p>Loot: {fmt(d.loot.metal)} M, {fmt(d.loot.crystal)} C, {fmt(d.loot.deuterium)} D</p> : null}
      {(d.debris?.metal || d.debris?.crystal) ? <p>Debris: {fmt(d.debris.metal)} M, {fmt(d.debris.crystal)} C</p> : null}
      {moon && <p className={d.moon.formed ? 'good' : 'muted'}>{d.moon.formed ? '🌙 ' : ''}{moon}</p>}
      {d.bounty ? <p className="metal">Raider bounty: {fmt(d.bounty)}</p> : null}
      {!full && onOpen && d.roundStats && <button className="primary" onClick={() => onOpen()}>Full battle report</button>}
      {!full && onOpen && canReplay(d) && <> <button onClick={() => onOpen(true)}>▶ Watch the replay</button></>}
      {full && canReplay(d) && <><h4>Replay</h4><ReplayToggle d={d} startOpen={replay} /></>}
      {full && <><h4>Round by round</h4><Rounds log={d.roundLog} stats={d.roundStats} /></>}
    </>
  );
}

/** the full report in a popup window; Escape or a click outside closes it */
export function BattlePopup({ d, subject, onClose, replay }: { d: any; subject: string; onClose: () => void; replay?: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="modalback" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-label="Full battle report" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h3>{subject}</h3><button onClick={onClose} aria-label="Close">✕</button></div>
        <BattleReport d={d} full replay={replay} />
      </div>
    </div>
  );
}

export function Messages() {
  const { refresh, act, toast } = useGame();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [kind, setKind] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const [popup, setPopup] = useState<{ d: any; subject: string; replay?: boolean } | null>(null);
  const [to, setTo] = useState('');
  const [text, setText] = useState('');

  const load = useCallback(async () => setMsgs(await get('/messages')), []);
  useEffect(() => { void load(); }, [load]);

  const show = (m: any) => {
    setOpen(open === m.id ? null : m.id);
    if (!m.read) void post('/messages/read', { id: m.id }).then(() => { void load(); void refresh(); });
  };
  const list = msgs.filter((m) => kind === 'all' || m.kind === kind);

  return (
    <Page title="Messages">
      <Card title="Compose">
        <form className="row wrap" onSubmit={async (e) => {
          e.preventDefault();
          const r = await act(() => post('/messages/send', { to, text }), 'Message sent');
          if (r) { setText(''); }
        }}>
          <input placeholder="Commander name" value={to} onChange={(e) => setTo(e.target.value)} />
          <input className="grow" placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          <button className="primary">Send</button>
        </form>
      </Card>
      <Card title="Inbox" right={<>
        <button onClick={async () => { await post('/messages/read'); await load(); await refresh(); }}>Mark all read</button>{' '}
        <button onClick={async () => { if (confirm('Delete all messages?')) { await post('/messages/clear'); await load(); await refresh(); toast('Inbox cleared'); } }}>Clear</button>
      </>}>
        <div className="chips">{KINDS.map((k) => <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{k}</button>)}</div>
        {list.length === 0 && <Empty>No messages here. Spy reports, battle reports, news and notes from other commanders arrive in this list.</Empty>}
        {list.map((m) => (
          <div key={m.id} className={`msg ${m.read ? '' : 'unread'}`}>
            <div className="msghead" onClick={() => show(m)}>
              <span className={`kind ${m.kind}`}>{m.kind}</span> <b><Linkify text={m.subject} /></b>{m.from && <span className="muted"> from <Linkify text={m.from} /></span>}
              <span className="muted right">{when(m.at)}</span>
            </div>
            {open === m.id && (
              <div className="msgbody">
                {m.kind === 'espionage' && m.data?.resources ? <SpyReport d={m.data} /> : null}
                {(m.kind === 'combat' || m.kind === 'raid') && m.data?.attackers ? <BattleReport d={m.data} onOpen={(replay) => setPopup({ d: m.data, subject: m.subject, replay })} /> : <p style={{ whiteSpace: 'pre-wrap' }}><Linkify text={m.body} /></p>}
                {(m.kind === 'combat' || m.kind === 'raid') && m.data?.attackers && (
                  <button onClick={async () => {
                    const r = await act(() => post(`/messages/${m.id}/share`));
                    if (!r) return;
                    await copyLink(r.id, toast);
                  }}>Share link</button>
                )}
                <button onClick={async () => { await del(`/messages/${m.id}`); setOpen(null); await load(); }}>Delete</button>
                {m.kind === 'player' && m.from && <button onClick={() => setTo(m.from)}>Reply</button>}
              </div>
            )}
          </div>
        ))}
      </Card>
      {popup && <BattlePopup d={popup.d} subject={popup.subject} replay={popup.replay} onClose={() => setPopup(null)} />}
    </Page>
  );
}
