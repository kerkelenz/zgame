import { useEffect, useState } from 'react';
import type { Mission } from '../../../shared/types';
import { get } from '../api';
import { useGame } from '../game';
import { Card, Page, fmt } from '../ui';

export function Galaxy() {
  const { me, planet, setPage, setTarget, now } = useGame();
  const cfg = me.config;
  const [g, setG] = useState(planet.coords.g);
  const [s, setS] = useState(planet.coords.s);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

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
        </div>
      </Card>
      {error && <div className="error">{error}</div>}
      <table className="galaxy">
        <thead><tr><th>#</th><th>Planet</th><th>Commander</th><th>Alliance</th><th>Debris</th><th>Actions</th></tr></thead>
        <tbody>
          {data?.slots.map((sl: any) => {
            const pl = sl.planet;
            return (
              <tr key={sl.p} className={pl?.mine ? 'mine' : ''}>
                <td>{sl.p}</td>
                <td>{pl ? pl.name : <span className="muted">empty</span>}{sl.moon && <span title={sl.moon.name}> 🌙</span>}</td>
                <td>{pl ? <>{pl.owner}{pl.protectedFor && <span title="Under protection" className="muted"> (p)</span>}</> : ''}</td>
                <td>{pl?.alliance ? `[${pl.alliance}]` : ''}</td>
                <td>{sl.debris ? <a onClick={() => go(sl.p, 'recycle')} className="crystal">{fmt(sl.debris.metal)} M / {fmt(sl.debris.crystal)} C</a> : ''}</td>
                <td className="actions">
                  {!pl && <button onClick={() => go(sl.p, 'colonize')}>Colonize</button>}
                  {pl && !pl.mine && <>
                    <button onClick={() => go(sl.p, 'espionage')}>Spy</button>
                    <button onClick={() => go(sl.p, 'attack')}>Attack</button>
                    <button onClick={() => go(sl.p, 'transport')}>Transport</button>
                    <button onClick={() => go(sl.p, 'hold')}>Defend</button>
                    {sl.moon && <button onClick={() => go(sl.p, 'attack', true)} title="Target the moon">🌙 Attack</button>}
                  </>}
                  {pl?.mine && <button onClick={() => go(sl.p, 'deploy')}>Deploy</button>}
                  {pl?.mine && sl.moon && <button onClick={() => go(sl.p, 'deploy', true)}>🌙 Deploy</button>}
                </td>
              </tr>
            );
          })}
          <tr><td>{cfg.positions + 1}</td><td colSpan={4} className="muted">Deep space (expeditions)</td><td className="actions"><button onClick={() => go(cfg.positions + 1, 'expedition')}>Expedition</button></td></tr>
        </tbody>
      </table>
    </Page>
  );
}
