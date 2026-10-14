import { BUILDINGS, TECHS, UNITS } from '../../../shared/data';
import type { BuildingId, TechId, UnitId } from '../../../shared/types';
import { post } from '../api';
import { Card, Cost, Countdown, ItemIcon, Progress, fmtDur } from '../ui';
import type { ItemsData, Kind } from './useItems';

/** the running job, the waiting list and the totals above the cards: buildings, research and the shipyard each have their own */
export function Queues({ kind, d }: { kind: Kind; d: ItemsData }) {
  const { me, planet, act, live, now, toast, withUndo, cfg, techs, have, hint, timeFactor, lfBuild, lfShip, researchFactor, robotics, nanite, shipyard, lab, buildQ, researchQ, bBacklog, rBacklog, MAXB, MAXR, bTimes, bTotal, rTimes, rTotal, rowTimes, yardTotal } = d;
  return (
    <>
      {kind === 'building' && buildQ && (
        <Card tour="queue" title={buildQ.down ? 'Being demolished' : 'Under construction'} right={<button onClick={() => void withUndo(() => post(`/planets/${planet.id}/build/cancel`), 'Cancelled', () => post(buildQ.down ? `/planets/${planet.id}/demolish` : `/planets/${planet.id}/build`, { id: buildQ.id }))}>Cancel</button>}>
          <div className="job"><div><ItemIcon id={buildQ.id} size={24} /> {buildQ.down ? 'Demolishing' : ''} {BUILDINGS[buildQ.id as BuildingId].name} → level {buildQ.level} · <Countdown to={buildQ.end} /></div><Progress from={buildQ.start} to={buildQ.end} />
            {buildQ.down && buildQ.refund && <div className="muted small">Returns <Cost cost={buildQ.refund} /> when it is done.</div>}</div>
        </Card>
      )}
      {kind === 'building' && bBacklog.length > 0 && (
        <Card title={`Queue (${bBacklog.length}/${MAXB})`}>
          {bBacklog.map((id, i) => (
            <div className="row between" key={i}>
              <span>{i + 1}. <ItemIcon id={id} size={20} /> {BUILDINGS[id as BuildingId].name} <span className="muted small">· {fmtDur(bTimes[i])}</span></span>
              <span className="row">
                <button disabled={i === 0} title="Earlier" onClick={() => void act(() => post(`/planets/${planet.id}/build/move`, { index: i, dir: -1 }))}>↑</button>
                <button disabled={i === bBacklog.length - 1} title="Later" onClick={() => void act(() => post(`/planets/${planet.id}/build/move`, { index: i, dir: 1 }))}>↓</button>
                <button onClick={() => void withUndo(() => post(`/planets/${planet.id}/build/unqueue`, { index: i }), `Removed ${BUILDINGS[id as BuildingId].name} from the queue`, () => post(`/planets/${planet.id}/build`, { id }))}>Remove</button>
              </span>
            </div>
          ))}
          <p className="muted small qtotal">Whole queue, including the running job: about <b>{fmtDur(bTotal)}</b></p>
        </Card>
      )}
      {kind === 'tech' && rBacklog.length > 0 && (
        <Card title={`Queue (${rBacklog.length}/${MAXR})`}>
          {rBacklog.map((q, i) => (
            <div className="row between" key={i}>
              <span>{i + 1}. <ItemIcon id={q.id} size={20} /> {TECHS[q.id as TechId].name} <span className="muted small">· {fmtDur(rTimes[i])}</span></span>
              <span className="row">
                <button disabled={i === 0} title="Earlier" onClick={() => void act(() => post('/research/move', { index: i, dir: -1 }))}>↑</button>
                <button disabled={i === rBacklog.length - 1} title="Later" onClick={() => void act(() => post('/research/move', { index: i, dir: 1 }))}>↓</button>
                <button onClick={() => void withUndo(() => post('/research/unqueue', { index: i }), `Removed ${TECHS[q.id as TechId].name} from the queue`, () => post(`/planets/${planet.id}/research`, { id: q.id }))}>Remove</button>
              </span>
            </div>
          ))}
          <p className="muted small qtotal">Whole queue, including the running research: about <b>{fmtDur(rTotal)}</b></p>
        </Card>
      )}
      {kind === 'tech' && researchQ && (
        <Card title="Researching" right={<button onClick={() => void withUndo(() => post('/research/cancel'), 'Cancelled', () => post(`/planets/${planet.id}/research`, { id: researchQ.id }))}>Cancel</button>}>
          <div className="job"><div><ItemIcon id={researchQ.id} size={24} /> {TECHS[researchQ.id as TechId].name} → level {researchQ.level} · <Countdown to={researchQ.end} /></div><Progress from={researchQ.start} to={researchQ.end} /></div>
        </Card>
      )}
      {(kind === 'ship' || kind === 'defense') && planet.shipyardQueue.length > 0 && (
        <Card title="Production queue">
          {planet.shipyardQueue.map((j: any, i: number) => (
            <div className="row between" key={i}>
              <span><ItemIcon id={j.id} size={20} /> {j.remaining} / {j.total}× {UNITS[j.id as UnitId].name} {i === 0 && <span className="muted">· next unit in <Countdown to={j.start + j.unitMs} /></span>} <span className="muted small">· row done in {fmtDur(rowTimes[i])}</span></span>
              <button onClick={() => void withUndo(() => post(`/planets/${planet.id}/produce/cancel`, { index: i }), `Cancelled ${j.remaining}× ${UNITS[j.id as UnitId].name}`, () => post(`/planets/${planet.id}/produce`, { id: j.id, count: j.remaining }))}>Cancel</button>
            </div>
          ))}
          <p className="muted small qtotal">All rows together: <b>{fmtDur(yardTotal)}</b></p>
        </Card>
      )}
    </>
  );
}
