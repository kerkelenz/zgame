import { useState } from 'react';
import { useGame } from '../game';
import { UNITS } from '../../../shared/data';
import type { UnitId } from '../../../shared/types';
import { ResIcon } from '../ResIcon';
import { Card, Countdown, coordStr, fmt } from '../ui';

const MISSION: Record<string, string> = {
  attack: 'Attack', transport: 'Transport', deploy: 'Deploy', espionage: 'Espionage', colonize: 'Colonize', recycle: 'Recycle debris',
  expedition: 'Expedition', hold: 'Defend ally', missile: 'Missile strike', destroy: 'Moon destruction', invade: 'Void invasion',
};
const KEY = 'zg.eventsHidden';
const unitName = (id: string) => UNITS[id as UnitId]?.name ?? id;

/** what you can tell about an enemy fleet, which depends on your Espionage Technology compared with theirs */
export function IntelText({ intel, count, types, fleet }: { intel?: string; count?: number | null; types?: string[] | null; fleet?: Record<string, number | undefined> | null }) {
  if (intel === 'exact' && fleet) {
    const parts = Object.entries(fleet).filter(([, n]) => n).map(([id, n]) => `${(n as number).toLocaleString('en-US')}× ${unitName(id)}`);
    return <span className="intel"> — {parts.join(', ')}</span>;
  }
  if (intel === 'types') return <span className="intel" title="More espionage levels than theirs would show the exact numbers"> — {count} ship{count === 1 ? '' : 's'}: {(types ?? []).map(unitName).join(', ')}</span>;
  if (intel === 'count') return <span className="intel" title="Two more espionage levels than theirs would show the ship types"> — {count} ship{count === 1 ? '' : 's'}</span>;
  if (intel === 'none') return <span className="intel muted" title="Your Espionage Technology is below theirs"> — fleet unknown</span>;
  return null;
}
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

  /** what the fleet is carrying: each resource with its picture, and the total */
  const carry = (e: any) => {
    if (!e.cargo) return null;
    const keys = (['metal', 'crystal', 'deuterium'] as const).filter((k) => e.cargo[k] > 0);
    const total = keys.reduce((s, k) => s + e.cargo[k], 0);
    return (
      <span className="cargo"> carrying {keys.map((k) => <span key={k} className={k === 'metal' ? 'metal' : k === 'crystal' ? 'crystal' : 'deut'}> <ResIcon k={k} size={13} />{fmt(e.cargo[k])}</span>)}{keys.length > 1 ? <span className="muted"> ({fmt(total)} in all)</span> : null}</span>
    );
  };

  const text = (e: any) => {
    const mission = <span className="evmission">Mission: {MISSION[e.mission] ?? e.mission}</span>;
    if (e.step === 'forge') return <>Your Moon Forge above <Place p={e.to} /> collapses the debris into a moon ({(e.moonKm ?? 0).toLocaleString('en-US')} km). <span className="evmission">Mission: Moon Forge</span></>;
    const n = e.ships != null ? ` (${e.ships} ship${e.ships === 1 ? '' : 's'})` : '';
    if (e.kind === 'own') {
      if (e.step === 'arrive') return <>Your fleet{n} from <Place p={e.from} /> reaches {target(e)}{carry(e)}. {mission}</>;
      if (e.step === 'end') return <>Your fleet{n} leaves <Place p={e.to} /> after holding there and heads home. {mission}</>;
      return <>Your fleet{n} returns from <Place p={e.from} fallback="deep space" /> to <Place p={e.to} />{carry(e)}. {mission}</>;
    }
    if (e.kind === 'hostile' || e.kind === 'allyAttack') return <>{e.kind === 'allyAttack' ? 'Attack on an ally by' : 'Hostile fleet of'} {who(e)} from <Place p={e.from} fallback="deep space" /> reaches {e.targetOwner ? <><a className="plink" onClick={() => openProfile(e.targetOwner.id)}>{e.targetOwner.name}</a>&apos;s planet </> : 'your planet '}<Place p={e.to} /><IntelText intel={e.intel} count={e.ships} types={e.shipTypes} fleet={e.fleet} />. {mission}</>;
    return <>Fleet of {who(e)}{n} from <Place p={e.from} /> reaches <Place p={e.to} />{carry(e)}. {mission}</>;
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
