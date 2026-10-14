import { useCallback, useEffect, useState } from 'react';
import type { Res } from '../../../shared/types';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, Cost, Loading, Page } from '../ui';

interface Peoples { id: string; name: string; tagline: string; desc: string; structures: string[] }
interface Structure { id: string; name: string; desc: string; level: number; max: number; now: string | null; next: { cost: Res; effect: string; affordable: boolean } | null }

/** The people of the selected planet: pick one, raise their structures, or start over with another at a price. */
export function Lifeform() {
  const { planet, live, act } = useGame();
  const [v, setV] = useState<any>(null);
  const load = useCallback(async () => setV(await get(`/lifeform?planetId=${planet.id}`)), [planet.id]);
  useEffect(() => { void load(); }, [load, planet.updatedAt]);
  if (!v || v.planetId !== planet.id) return <Page title="Lifeform"><Loading /></Page>;
  if (v.isMoon) return <Page title="Lifeform"><p className="muted">Peoples settle planets, not moons. Pick a planet above.</p></Page>;
  const choose = async (id: string, name: string) => {
    if (v.current && !confirm(`Start over on ${planet.name} with the ${name}? The current people leave and their structures are lost.`)) return;
    const r = await act(() => post('/lifeform/choose', { planetId: planet.id, id }), `${name} settle ${planet.name}`);
    if (r) setV(r);
  };
  const buy = async (st: Structure) => {
    const r = await act(() => post('/lifeform/buy', { planetId: planet.id, id: st.id }), `${st.name} ${st.level + 1}`);
    if (r) setV(r.view);
  };
  const current = v.peoples.find((p: Peoples) => p.id === v.current);
  return (
    <Page title="Lifeform">
      <p className="muted">Each planet is settled by one people. Their structures are raised with resources from <b>{planet.name}</b> and lean the planet one way. The first choice on a planet is free; starting over with another people costs a great deal and loses the structures.</p>
      {current ? (
        <>
          <Card title={<>{current.name} <span className="muted small">· {current.tagline}</span></>}><p className="small">{current.desc}</p></Card>
          <div className="items">
            {v.structures.map((st: Structure) => (
              <Card key={st.id} title={<>{st.name} <span className="lvl">{st.level}/{st.max}</span></>}>
                <p className="muted small">{st.desc}</p>
                {st.now && <div className="good small">Now: {st.now}</div>}
                {st.next ? (
                  <>
                    <div>Next: {st.next.effect}</div>
                    <div><Cost cost={st.next.cost} have={live} /></div>
                    <button className="primary" disabled={!st.next.affordable} onClick={() => void buy(st)}>Raise to {st.level + 1}</button>
                  </>
                ) : <div className="muted small">Highest level reached.</div>}
              </Card>
            ))}
          </div>
          <h3>Start over</h3>
          <p className="muted small">Costs <Cost cost={v.switchCost} have={live} /> and the structures above are lost.</p>
        </>
      ) : <h3>Choose a people</h3>}
      <div className="items">
        {v.peoples.filter((p: Peoples) => p.id !== v.current).map((p: Peoples) => (
          <Card key={p.id} title={<>{p.name} <span className="muted small">· {p.tagline}</span></>}>
            <p className="small">{p.desc}</p>
            <div className="muted small">Structures: {p.structures.join(', ')}.</div>
            <button className={current ? '' : 'primary'} disabled={!!current && !v.switchAffordable} onClick={() => void choose(p.id, p.name)}>{current ? `Start over with the ${p.name}` : `Settle the ${p.name}`}</button>
          </Card>
        ))}
      </div>
    </Page>
  );
}
