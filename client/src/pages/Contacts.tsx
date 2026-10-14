import { useCallback, useEffect, useState } from 'react';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, CoordLink, Page, PlanetLink, PlayerLink, coordStr, fmt, when, Loading } from '../ui';

const ACT: Record<string, string> = { online: 'online', active: 'active', inactive: 'inactive 7d+', longInactive: 'inactive 28d+' };

export function Contacts() {
  const { act, openProfile, showInGalaxy, setTarget, setPage } = useGame();
  const [d, setD] = useState<any>(null);
  const [spy, setSpy] = useState<any[]>([]);
  const [open, setOpen] = useState('');
  const load = useCallback(async () => { setD(await get('/social')); setSpy(await get('/spy-archive')); }, []);
  useEffect(() => { void load(); }, [load]);
  const run = async (fn: () => Promise<any>, ok?: string) => { const r = await act(fn, ok); if (r) setD(r.buddies ? r : await get('/social')); };
  if (!d) return <Page title="Contacts"><Loading /></Page>;
  const noteTargets = Object.entries(d.notes as Record<string, string>);

  return (
    <Page title="Contacts">
      <Card title={`Buddies (${d.buddies.length})`}>
        {d.buddies.length === 0 && <p className="muted">Add buddies from a commander's profile (click a name in Standing or the Galaxy).</p>}
        {d.buddies.map((b: any) => (
          <div key={b.id} className="row between">
            <span><a className="plink" onClick={() => openProfile(b.id)}>{b.username}</a>{b.alliance && ` [${b.alliance}]`} <span className={b.activity === 'online' ? 'good' : 'muted'}>{ACT[b.activity]}</span>{b.vacation && <span className="tag vac">v</span>} <span className="muted small">{fmt(b.points)} points</span></span>
            <span className="row">
              {b.home && <button onClick={() => showInGalaxy(b.home)}>{coordStr(b.home)}</button>}
              <button onClick={() => void run(() => post('/social/buddy/remove', { id: b.id }))}>Remove</button>
            </span>
          </div>
        ))}
      </Card>

      <Card title="Bookmarks">
        {d.bookmarks.length === 0 && <p className="muted">Bookmark a system from the Galaxy page.</p>}
        {d.bookmarks.map((b: any) => (
          <div key={b.id} className="row between">
            <span><b>{b.name}</b> <span className="muted"><CoordLink c={b.coords} /></span></span>
            <span className="row">
              <button onClick={() => showInGalaxy(b.coords)}>Galaxy</button>
              <button onClick={() => { setTarget({ coords: b.coords }); setPage('fleet'); }}>Fleet</button>
              <button onClick={() => void run(() => post('/social/bookmark/remove', { id: b.id }))}>Delete</button>
            </span>
          </div>
        ))}
      </Card>

      <Card title={`Notes (${noteTargets.length})`}>
        {noteTargets.length === 0 && <p className="muted">Add notes on a profile or from the Galaxy page (the 📝 button).</p>}
        {noteTargets.map(([key, text]) => (
          <div key={key} className="row between">
            <span><b>{key.startsWith('p:') ? <PlayerLink id={key.slice(2)} name="Commander" /> : (() => { const [g, s, p] = key.slice(2).split(':').map(Number); return <CoordLink c={{ g, s, p }} />; })()}</b> {text}</span>
            <span className="row">
              {key.startsWith('p:') ? <button onClick={() => openProfile(key.slice(2))}>Profile</button> : <button onClick={() => { const [g, s, p] = key.slice(2).split(':').map(Number); showInGalaxy({ g, s, p } as never); }}>Galaxy</button>}
              <button onClick={() => void run(() => post('/social/note', { key, text: '' }))}>Delete</button>
            </span>
          </div>
        ))}
      </Card>

      <Card title="Spy report archive" right={<span className="muted small">latest report per planet</span>}>
        {spy.length === 0 && <p className="muted">Send probes to a planet and the latest report is kept here.</p>}
        {spy.map((e) => {
          const r = e.report;
          return (
            <div key={e.planetId} className="spyentry">
              <div className="row between">
                <span><b><PlanetLink name={r.planet} coords={r.coords} moon={r.moon} /></b> <span className="muted">{r.ownerId ? <PlayerLink id={r.ownerId} name={r.owner} /> : r.owner} · <CoordLink c={r.coords} /> · {when(e.at)}</span></span>
                <span className="row"><span className="small"><span className="metal">{fmt(r.resources.metal)}</span> · <span className="crystal">{fmt(r.resources.crystal)}</span> · <span className="deut">{fmt(r.resources.deuterium)}</span></span>
                  <button onClick={() => setOpen(open === e.planetId ? '' : e.planetId)}>{open === e.planetId ? 'Hide' : 'Details'}</button>
                  <button onClick={() => { setTarget({ coords: r.coords, mission: 'attack', toMoon: !!r.moon }); setPage('fleet'); }}>Attack</button></span>
              </div>
              {open === e.planetId && (
                <div className="muted small">
                  {r.fleet && <div>Fleet: {Object.entries(r.fleet).filter(([, n]) => n).map(([id, n]) => `${fmt(n as number)} ${id}`).join(', ') || 'none'}</div>}
                  {r.defenses && <div>Defenses: {Object.entries(r.defenses).filter(([, n]) => n).map(([id, n]) => `${fmt(n as number)} ${id}`).join(', ') || 'none'}</div>}
                  {r.buildings && <div>Buildings: {Object.entries(r.buildings).filter(([, n]) => n).map(([id, n]) => `${id} ${n}`).join(', ')}</div>}
                  {r.techs && <div>Research: {Object.entries(r.techs).filter(([, n]) => n).map(([id, n]) => `${id} ${n}`).join(', ')}</div>}
                  {!r.fleet && <div>Bring more probes for fleet, defense and building details.</div>}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Card title={`Blocked (${d.blocked.length})`}>
        {d.blocked.length === 0 && <p className="muted">Blocked commanders cannot message you and their chat lines are hidden.</p>}
        {d.blocked.map((b: any) => (
          <div key={b.id} className="row between"><span><PlayerLink id={b.id} name={b.username} /></span><button onClick={() => void run(() => post('/social/unblock', { id: b.id }))}>Unblock</button></div>
        ))}
      </Card>
    </Page>
  );
}
