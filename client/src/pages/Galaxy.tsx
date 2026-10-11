import { useEffect, useState } from 'react';
import type { Mission } from '../../../shared/types';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, Page, coordStr, fmt } from '../ui';

export function Galaxy() {
  const { me, planet, setPage, openProfile, setTarget, now } = useGame();
  const cfg = me.config;
  const { galaxyAt } = useGame();
  const [g, setG] = useState(galaxyAt?.g ?? planet.coords.g);
  const [s, setS] = useState(galaxyAt?.s ?? planet.coords.s);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [soc, setSoc] = useState<any>(null);
  const [onlyInactive, setOnlyInactive] = useState(false);
  const [hideProtected, setHideProtected] = useState(false);
  const { act } = useGame();
  useEffect(() => { void get('/social').then(setSoc).catch(() => undefined); }, []);
  const bookmarked = soc?.bookmarks.find((b: any) => b.coords.g === g && b.coords.s === s && b.coords.p === 1);

  useEffect(() => {
    let live = true;
    get(`/galaxy/${g}/${s}`).then((d) => { if (live) { setData(d); setError(''); } }).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [g, s, now > 0 && Math.floor(now / 20000)]);

  const go = (p: number, mission: Mission, toMoon = false) => { setTarget({ coords: { g, s, p }, mission, toMoon }); setPage('fleet'); };
  const clampS = (v: number) => Math.min(cfg.systems, Math.max(1, v));

  return (
    <Page title="Galaxy">
      <Card>
        <div className="row">
          <button onClick={() => setG(Math.max(1, g - 1))}>◀ G</button>
          <b>Galaxy {g}</b>
          <button onClick={() => setG(Math.min(cfg.galaxies, g + 1))}>G ▶</button>
          <span className="spacer" />
          <button onClick={() => setS(clampS(s - 1))}>◀</button>
          <input type="number" className="sm" value={s} onChange={(e) => setS(clampS(Number(e.target.value)))} />
          <button onClick={() => setS(clampS(s + 1))}>▶</button>
          <button onClick={() => { setG(planet.coords.g); setS(planet.coords.s); }}>Home</button>
          {soc && (bookmarked
            ? <button title="Remove bookmark" onClick={async () => { const r = await act(() => post('/social/bookmark/remove', { id: bookmarked.id })); if (r) setSoc(r); }}>★</button>
            : <button title="Bookmark this system" onClick={async () => { const r = await act(() => post('/social/bookmark', { name: `System ${g}:${s}`, coords: { g, s, p: 1 } }), 'Bookmarked'); if (r) setSoc(r); }}>☆</button>)}
        </div>
        {soc && (soc.bookmarks.length > 0 || soc.recent.length > 0) && (
          <div className="chips">
            {soc.bookmarks.map((b: any) => <button key={b.id} title={coordStr(b.coords)} onClick={() => { setG(b.coords.g); setS(b.coords.s); }}>★ {b.name}</button>)}
            {soc.recent.map((c: any, i: number) => <button key={i} className="muted" title="Recent target" onClick={() => { setG(c.g); setS(c.s); }}>⟲ {coordStr(c)}</button>)}
          </div>
        )}
        <div className="row small">
          <label className="row"><input type="checkbox" checked={onlyInactive} onChange={(e) => setOnlyInactive(e.target.checked)} /> only inactive targets</label>
          <label className="row"><input type="checkbox" checked={hideProtected} onChange={(e) => setHideProtected(e.target.checked)} /> hide protected</label>
        </div>
      </Card>
      {error && <div className="error">{error}</div>}
      <table className="galaxy">
        <thead><tr><th>#</th><th>Planet</th><th>Commander</th><th>Alliance</th><th>Debris</th><th>Actions</th></tr></thead>
        <tbody>
          {data?.slots.filter((sl: any) => {
            const pl = sl.planet;
            if (!pl || pl.mine) return !(onlyInactive || hideProtected) || !!pl;
            if (onlyInactive && !(pl.status?.activity === 'inactive' || pl.status?.activity === 'longInactive' || pl.npc === 'inactive')) return false;
            if (hideProtected && pl.protectedFor) return false;
            return true;
          }).map((sl: any) => {
            const pl = sl.planet;
            const note = soc?.notes[`c:${g}:${s}:${sl.p}`] ?? (pl && soc?.notes[`p:${pl.ownerId}`]);
            return (
              <tr key={sl.p} className={pl?.mine ? 'mine' : ''}>
                <td>{sl.p}</td>
                <td>{pl ? pl.name : <span className="muted">empty</span>}{note && <span title={note}> 📝</span>}{sl.moon && <span title={sl.moon.name}> 🌙</span>}</td>
                <td>{pl ? <><a className="plink" onClick={() => openProfile(pl.ownerId)}>{pl.owner}</a>{pl.npc && <span className={`tag ${pl.npc}`}>{pl.npc}</span>}{pl.status?.vacation && <span className="tag vac" title="On vacation: cannot be attacked or spied on">v</span>}{pl.status?.activity === 'online' && <span className="online" title="Online now"> ●</span>}{pl.status?.activity === 'inactive' && <span className="tag inact" title="Inactive for a week or more">i</span>}{pl.status?.activity === 'longInactive' && <span className="tag inact" title="Inactive for a month or more">I</span>}{pl.status?.protection === 'weak' && <span className="tag" title="Newbie protection: too weak to attack">n</span>}{pl.status?.protection === 'strong' && <span className="tag" title="Too strong: protected from you">s</span>}</> : ''}</td>
                <td>{pl?.relation && <span className={`tag ${pl.relation === 'war' ? 'bad' : 'you'}`} title={pl.relation === 'war' ? 'Your alliances are at war' : pl.relation === 'pact' ? 'Pact partner: cannot be attacked' : 'Alliance member'}>{pl.relation}</span>} {pl?.alliance ? `[${pl.alliance}]` : pl?.faction ? <span className="muted small">{pl.faction}</span> : ''}</td>
                <td>{sl.debris ? <a onClick={() => go(sl.p, 'recycle')} className="crystal">{fmt(sl.debris.metal)} M / {fmt(sl.debris.crystal)} C</a> : ''}</td>
                <td className="actions">
                  {!pl && <button onClick={() => go(sl.p, 'colonize')}>Colonize</button>}
                  {pl && !pl.mine && <>
                    <button disabled={pl.protectedFor} title={pl.protectedFor ? 'Protected' : ''} onClick={() => go(sl.p, 'espionage')}>Spy</button>
                    <button disabled={pl.protectedFor} title={pl.protectedFor ? 'Protected' : ''} onClick={() => go(sl.p, 'attack')}>Attack</button>
                    <button onClick={() => go(sl.p, 'transport')}>Transport</button>
                    <button disabled={pl.status?.vacation} title={pl.status?.vacation ? 'On vacation' : ''} onClick={() => go(sl.p, 'hold')}>Defend</button>
                    {sl.moon && <button disabled={pl.protectedFor} onClick={() => go(sl.p, 'attack', true)} title="Target the moon">🌙 Attack</button>}
                    {sl.moon && <button className="danger" disabled={pl.protectedFor || pl.status?.vacation} onClick={() => go(sl.p, 'destroy', true)} title="Needs Deathstars. Bigger fleets raise the odds; the shock wave can destroy them.">🌙 Destroy</button>}
                  </>}
                  <button className="link" title={note ? `Note: ${note}` : 'Add a note on this position'} onClick={async () => { const t = prompt('Note for this position (blank removes it)', soc?.notes[`c:${g}:${s}:${sl.p}`] ?? ''); if (t === null) return; const r = await act(() => post('/social/note', { key: `c:${g}:${s}:${sl.p}`, text: t })); if (r) setSoc(r); }}>📝</button>
                  {pl?.mine && <button onClick={() => go(sl.p, 'deploy')}>Deploy</button>}
                  {pl?.mine && sl.moon && <button onClick={() => go(sl.p, 'deploy', true)}>🌙 Deploy</button>}
                </td>
              </tr>
            );
          })}
          <tr><td colSpan={6} className="muted small">Flags: <span className="tag vac">v</span> vacation · <span className="tag inact">i</span> inactive 7+ days · <span className="tag inact">I</span> long inactive 28+ days · <span className="tag">n</span> newbie protection · <span className="tag">s</span> too strong for you · <span className="online">●</span> online</td></tr>
          <tr><td>{cfg.positions + 1}</td><td colSpan={4} className="muted">Deep space (expeditions)</td><td className="actions"><button onClick={() => go(cfg.positions + 1, 'expedition')}>Expedition</button></td></tr>
        </tbody>
      </table>
    </Page>
  );
}
