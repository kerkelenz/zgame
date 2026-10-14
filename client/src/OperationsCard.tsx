import { useCallback, useEffect, useState } from 'react';
import { UNITS } from '../../shared/data';
import type { Mission, ShipId } from '../../shared/types';
import { get, post } from './api';
import { useGame } from './game';
import { NumInput } from './NumInput';
import { Card, CoordLink, Countdown, Linkify, PlayerLink, fmt } from './ui';

interface Signup { playerId: string; playerName: string; planetId: string; planetName: string; ships: Record<string, number>; secs: number; departAt: number | null }
interface Op {
  id: string; createdBy: string; createdByName: string; kind: 'attack' | 'defend'; name: string; note: string;
  target: { g: number; s: number; p: number }; toMoon: boolean; arriveAt: number | null; signups: Signup[]; mine: string[]; totalShips: number;
}
const when = (at: number) => new Date(at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const shipLine = (s: Record<string, number>) => Object.entries(s).map(([id, n]) => `${fmt(n)}× ${UNITS[id as ShipId]?.name ?? id}`).join(', ');

/** Alliance page: the shared target board. Plan a strike or a defense, sign up with a planet's ships, see when everyone has to leave to land together. */
export function OperationsCard({ officer }: { officer: boolean }) {
  const { me, planets, act, selectPlanet, setPage, setTarget } = useGame();
  const [ops, setOps] = useState<Op[]>([]);
  const [form, setForm] = useState({ name: '', kind: 'attack', g: 1, s: 1, p: 1, at: '', note: '' });
  const [pick, setPick] = useState<Record<string, { planet: string; mode: string }>>({});
  const load = useCallback(async () => { try { setOps(await get('/alliance/operations')); } catch { /* not in an alliance */ } }, []);
  useEffect(() => { void load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  const run = async (fn: () => Promise<Op[]>, ok: string) => { const r = await act(fn, ok); if (r) setOps(r); };
  const withShips = planets.filter((p) => Object.values(p.fleet as Record<string, number>).some((n) => n > 0));

  const create = () => run(() => post('/alliance/operations', {
    kind: form.kind, name: form.name, note: form.note, target: { g: form.g, s: form.s, p: form.p }, arriveAt: form.at ? new Date(form.at).getTime() : null,
  }), 'Operation planned').then(() => setForm({ ...form, name: '', note: '' }));

  const prepare = (op: Op, s: Signup) => {
    selectPlanet(s.planetId);
    setTarget({ coords: op.target, mission: (op.kind === 'attack' ? 'attack' : 'hold') as Mission, toMoon: op.toMoon, ships: s.ships });
    setPage('fleet');
  };

  return (
    <Card title="Operations">
      <p className="muted small">Plan a strike or a defense on a target, sign up with the ships of one of your planets, and the game works out when each of you must leave to land together. It reminds you ten minutes before. Nothing is launched for you.</p>
      {ops.length === 0 && <p className="muted">No operations planned.</p>}
      {ops.map((op) => {
        const mineHere = op.signups.filter((s) => s.playerId === me.player.id);
        const p = pick[op.id] ?? { planet: withShips[0]?.id ?? '', mode: 'warships' };
        return (
          <div key={op.id} className="op">
            <div className="row between">
              <span><b>{op.name}</b> <span className={`tag ${op.kind === 'attack' ? 'aggressive' : 'active'}`}>{op.kind === 'attack' ? 'attack' : 'defend'}</span> on <CoordLink c={op.target} />{op.toMoon ? ' (moon)' : ''}
                {op.arriveAt ? <> · lands {when(op.arriveAt)} (<Countdown to={op.arriveAt} />)</> : ' · no fixed time'}</span>
              {(op.createdBy === me.player.id || officer) && <button className="link" onClick={() => confirm(`Close ${op.name}?`) && void run(() => post('/alliance/operations/close', { id: op.id }), 'Closed')}>Close</button>}
            </div>
            <div className="muted small">Planned by <PlayerLink id={op.createdBy} name={op.createdByName} />{op.note ? <> · <Linkify text={op.note} /></> : null} · {op.signups.length} signed up, {fmt(op.totalShips)} ships</div>
            {op.signups.map((s) => (
              <div key={s.playerId + s.planetId} className="row between small">
                <span><PlayerLink id={s.playerId} name={s.playerName} /> from {s.planetName}: {shipLine(s.ships)} <span className="muted">· flight {Math.round(s.secs / 60)} min{s.departAt ? <> · leave {when(s.departAt)} (<Countdown to={s.departAt} />)</> : ''}</span></span>
                {s.playerId === me.player.id && <button onClick={() => prepare(op, s)}>Prepare launch</button>}
              </div>
            ))}
            <div className="row">
              {withShips.length > 0 ? (
                <>
                  <select value={p.planet} onChange={(e) => setPick({ ...pick, [op.id]: { ...p, planet: e.target.value } })} aria-label="Planet to send from">
                    {withShips.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <select value={p.mode} onChange={(e) => setPick({ ...pick, [op.id]: { ...p, mode: e.target.value } })} aria-label="Which ships">
                    <option value="warships">Warships</option><option value="all">Every ship</option>
                  </select>
                  <button className="primary" disabled={!p.planet} onClick={() => void run(() => post('/alliance/operations/signup', { id: op.id, planetId: p.planet, mode: p.mode }), 'Signed up')}>Sign up</button>
                </>
              ) : <span className="muted small">You have no ships to sign up with.</span>}
              {mineHere.length > 0 && <button className="link" onClick={() => void run(() => post('/alliance/operations/withdraw', { id: op.id }), 'Withdrawn')}>Withdraw</button>}
            </div>
          </div>
        );
      })}
      <h4>Plan an operation</h4>
      <div className="row">
        <input placeholder="Name" value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Operation name" />
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Kind"><option value="attack">Attack</option><option value="defend">Defend (hold fleet)</option></select>
        <NumInput min={1} max={9} value={form.g} onChange={(g) => setForm({ ...form, g })} /> : <NumInput min={1} max={999} value={form.s} onChange={(s) => setForm({ ...form, s })} /> : <NumInput min={1} max={16} value={form.p} onChange={(pp) => setForm({ ...form, p: pp })} />
      </div>
      <div className="row">
        <label className="small muted">Lands at (optional) <input type="datetime-local" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} /></label>
        <input placeholder="Note" value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} aria-label="Note" />
        <button className="primary" disabled={form.name.trim().length < 3} onClick={() => void create()}>Plan it</button>
      </div>
    </Card>
  );
}
