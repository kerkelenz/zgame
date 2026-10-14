import { useCallback, useEffect, useState } from 'react';
import type { Res } from '../../../shared/types';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, Cost, Countdown, Loading, Page } from '../ui';

interface Lvl { id: string; name: string; desc: string; level: number; max: number; now: string | null; next: { cost: Res; effect: string; affordable: boolean } | null }

/** Things to spend on, again and again: empire upgrades, projects on the selected planet, boosts for a few hours and monuments for the standing. */
export function Upgrades() {
  const { planet, live, act, now } = useGame();
  const [v, setV] = useState<any>(null);
  const load = useCallback(async () => setV(await get(`/upgrades?planetId=${planet.id}`)), [planet.id]);
  useEffect(() => { void load(); }, [load, planet.updatedAt]);
  if (!v || v.planetId !== planet.id) return <Page title="Upgrades"><Loading /></Page>;
  const buy = async (kind: string, id: string, ok: string) => {
    const r = await act(() => post('/upgrades/buy', { kind, id, planetId: planet.id }), ok);
    if (r) setV(r.view);
  };
  const levelCard = (kind: 'empire' | 'project', o: Lvl) => (
    <Card key={o.id} title={<>{o.name} <span className="lvl">{o.level}/{o.max}</span></>}>
      <p className="muted small">{o.desc}</p>
      {o.now && <div className="good small">Now: {o.now}</div>}
      {o.next ? (
        <>
          <div>Next: {o.next.effect}</div>
          <div><Cost cost={o.next.cost} have={live} /></div>
          <button className="primary" disabled={!o.next.affordable} onClick={() => void buy(kind, o.id, `${o.name} ${o.level + 1}`)}>Raise to {o.level + 1}</button>
        </>
      ) : <div className="muted small">Highest level reached.</div>}
    </Card>
  );
  return (
    <Page title="Upgrades">
      <p className="muted">Everything here is paid from <b>{planet.name}</b> (pick another planet above to pay from it). Empire upgrades help your whole empire, projects only this planet. {v.points > 0 && <>They have added <b>{v.points}</b> points to your standing.</>}</p>
      <h3>Empire upgrades</h3>
      <div className="items">{v.empire.map((o: Lvl) => levelCard('empire', o))}</div>
      <h3>Projects on {planet.name}</h3>
      {v.isMoon ? <p className="muted">Projects are for planets. Pick a planet above to see them.</p> : <div className="items">{v.projects.map((o: Lvl) => levelCard('project', o))}</div>}
      <h3>Boosts</h3>
      <p className="muted small">A few hours of an effect for the whole empire. Buying one that is running adds its hours (up to 24 in all).</p>
      <div className="items">
        {v.boosts.map((b: any) => (
          <Card key={b.id} title={b.name}>
            <p className="muted small">{b.desc}</p>
            <div>{b.hours} hours: <Cost cost={b.cost} have={live} /></div>
            {b.until && <div className="good small">Running, {b.until > now ? <><Countdown to={b.until} /> left</> : 'ending'}</div>}
            <button className="primary" disabled={!b.affordable} onClick={() => void buy('boost', b.id, `${b.name} started`)}>{b.until ? `Add ${b.hours} hours` : `Start (${b.hours} h)`}</button>
          </Card>
        ))}
      </div>
      <h3>Monuments</h3>
      <p className="muted small">Raised one after the other, once each. They do nothing for production: they are for the standing, and other commanders see them on your profile.</p>
      <div className="items">
        {v.monuments.map((m: any) => (
          <Card key={m.id} title={<>{m.name} {m.built && <span className="tag you">built</span>}</>}>
            <p className="muted small">{m.desc}</p>
            {m.built ? <div className="good small">Standing on your capital.</div> : (
              <>
                <div><Cost cost={m.cost} have={live} /></div>
                <button className="primary" disabled={!m.affordable || m.locked} title={m.locked ? 'Build the one before it first' : ''} onClick={() => void buy('monument', m.id, `${m.name} raised`)}>Raise the {m.name}</button>
              </>
            )}
          </Card>
        ))}
      </div>
    </Page>
  );
}
