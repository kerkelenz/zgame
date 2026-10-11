import { useState } from 'react';
import { useGame } from '../game';
import { Card, Countdown, coordStr } from '../ui';

const MISSION: Record<string, string> = {
  attack: 'Attack', transport: 'Transport', deploy: 'Deploy', espionage: 'Espionage', colonize: 'Colonize', recycle: 'Recycle debris',
  expedition: 'Expedition', hold: 'Defend ally', missile: 'Missile strike', destroy: 'Moon destruction', invade: 'Void invasion',
};
const KEY = 'zg.eventsHidden';
const SHOWN = 12;

const clock = (at: number) => {
  const d = new Date(at), today = new Date();
  const time = d.toLocaleTimeString([], { hour12: false });
  return d.toDateString() === today.toDateString() ? time : `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
};

/** Every fleet movement that concerns you in the order it will happen: your own (out, back and the return still to come), hostile fleets coming for you or your allies, and friendly deliveries. */
export function FleetEvents() {
  const { fleets, showInGalaxy, openProfile, setPage } = useGame();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  const [all, setAll] = useState(false);
  const events: any[] = fleets.events ?? [];
  const toggle = () => { const v = !hidden; setHidden(v); try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* ignore */ } };

  const Place = ({ p, fallback }: { p: any; fallback?: string }) => (
    <a className="plink" onClick={() => showInGalaxy(p.coords)}>{p.moon ? '🌙 ' : ''}{p.name ?? fallback ?? ''} {coordStr(p.coords)}</a>
  );
  const Owner = ({ e }: { e: any }) => (e.owner.id ? <a className="plink" onClick={() => openProfile(e.owner.id)}>{e.owner.name}</a> : <>{e.owner.name}</>);
  const who = (e: any) => <><Owner e={e} />{e.owner.alliance ? ` [${e.owner.alliance}]` : ''}</>;
  const target = (e: any) => (e.mission === 'expedition' ? <>deep space {coordStr(e.to.coords)}</> : e.mission === 'recycle' ? <>the debris field at <Place p={e.to} /></> : e.mission === 'colonize' ? <>the position <Place p={e.to} /></> : <Place p={e.to} />);

  const text = (e: any) => {
    const mission = <span className="evmission">Mission: {MISSION[e.mission] ?? e.mission}</span>;
    const n = e.ships != null ? ` (${e.ships} ship${e.ships === 1 ? '' : 's'})` : '';
    if (e.kind === 'own') {
      if (e.step === 'arrive') return <>Your fleet{n} from <Place p={e.from} /> reaches {target(e)}. {mission}</>;
      if (e.step === 'end') return <>Your fleet{n} leaves <Place p={e.to} /> after holding there and heads home. {mission}</>;
      return <>Your fleet{n} returns from <Place p={e.from} fallback="deep space" /> to <Place p={e.to} />. {mission}</>;
    }
    if (e.kind === 'hostile') return <>Hostile fleet of {who(e)} from <Place p={e.from} fallback="deep space" /> reaches {e.targetOwner ? <><a className="plink" onClick={() => openProfile(e.targetOwner.id)}>{e.targetOwner.name}</a>&apos;s planet </> : 'your planet '}<Place p={e.to} />. {mission}</>;
    return <>Fleet of {who(e)}{n} from <Place p={e.from} /> reaches <Place p={e.to} />. {mission}</>;
  };

  const rows = all ? events : events.slice(0, SHOWN);
  return (
    <Card title={`Events${events.length ? ` (${events.length})` : ''}`} right={<span className="row"><button onClick={toggle}>{hidden ? 'Show' : 'Hide'}</button><button onClick={() => setPage('fleet')}>Fleet</button></span>}>
      {!hidden && (
        <>
          {events.length === 0 && <p className="muted">Nothing is moving: all ships are home and no fleets are heading your way.</p>}
          <div className="events">
            {rows.map((e) => (
              <div key={e.id} className={`event ev-${e.kind} ${e.projected ? 'projected' : ''}`}>
                <span className="evtime">{clock(e.at)}</span>
                <span className="evleft"><Countdown to={e.at} /></span>
                <span className="evtext">{text(e)}</span>
              </div>
            ))}
          </div>
          {events.length > SHOWN && <button className="link" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${events.length}`}</button>}
        </>
      )}
    </Card>
  );
}
