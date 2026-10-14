import { useState } from 'react';
import { DEFENSE_IDS, SHIP_IDS, UNITS } from '../../shared/data';
import { canAfford } from '../../shared/formulas';
import { planFleet } from '../../shared/planner';
import type { UnitId } from '../../shared/types';
import { post } from './api';
import { affordWait } from './afford';
import { useGame } from './game';
import { NumInput } from './NumInput';
import { Card, Cost, fmtDur, ItemIcon, ItemLink } from './ui';

/** Shipyard / Defense: "I want this many of that": the price, what must be built or researched first, whether you can pay and when. */
export function PlannerCard({ kind }: { kind: 'ship' | 'defense' }) {
  const { me, planet, live, act } = useGame();
  const ids = (kind === 'ship' ? SHIP_IDS : DEFENSE_IDS) as UnitId[];
  const [unit, setUnit] = useState<UnitId>(ids[ids.length > 5 ? 5 : 0]);
  const [count, setCount] = useState(10);
  const cfg = me.config;
  const plan = planFleet({
    unit, count, buildings: planet.buildings, techs: me.player.techs, stock: live,
    speed: cfg.economySpeed * cfg.shipyardBoost, timeFactor: planet.detail.timeFactor,
  });
  const wait = affordWait(plan.total, live, planet.production, planet.capacity);
  const payable = canAfford(live, plan.total);
  const queuePrereqs = async () => {
    let queued = 0;
    for (const s of plan.steps) {
      try {
        await post(s.kind === 'building' ? `/planets/${planet.id}/build` : `/planets/${planet.id}/research`, { id: s.id });
        queued++;
      } catch { break; }                                          // the queue is full or the next step cannot start yet
    }
    await act(async () => undefined, queued ? `Queued ${queued} of ${plan.steps.length} steps` : 'Nothing could be queued yet: a queue is full or a step needs the one before it');
  };
  return (
    <Card title="Planner">
      <div className="row">
        <select value={unit} onChange={(e) => setUnit(e.target.value as UnitId)} aria-label="What to plan">
          {ids.map((id) => <option key={id} value={id}>{UNITS[id].name}</option>)}
        </select>
        <NumInput min={1} max={UNITS[unit].max ?? 1_000_000} value={count} onChange={setCount} />
        <ItemIcon id={unit} size={28} />
      </div>
      <table className="kv plan">
        <tbody>
          <tr><td>{plan.count}× {UNITS[unit].name}</td><td><Cost cost={plan.cost} have={live} /></td></tr>
          {plan.steps.length > 0 && (
            <tr><td>Needed first</td><td>
              {plan.steps.map((s) => <div key={s.id}><ItemLink id={s.id} /> {s.from} → {s.to} <span className="muted small">(<Cost cost={s.cost} />)</span></div>)}
            </td></tr>
          )}
          <tr><td>In all</td><td><Cost cost={plan.total} have={live} /></td></tr>
          <tr><td>Building time</td><td>{fmtDur(plan.buildMs)} <span className="muted small">({fmtDur(plan.unitMs)} each at this Shipyard)</span></td></tr>
          <tr><td>Can you pay?</td><td className={payable ? 'good' : 'bad'}>
            {payable ? 'Yes, right now.' : wait.ms === null ? (wait.why === 'storage' ? 'Not with this storage: build more first.' : 'A missing resource has no income here.') : <>At this planet's production in about {fmtDur(wait.ms)}.</>}
          </td></tr>
        </tbody>
      </table>
      <div className="row">
        {plan.steps.length > 0 && <button onClick={() => void queuePrereqs()}>Queue the missing steps</button>}
        <button className="primary" disabled={plan.steps.length > 0 || !payable || (planet.buildings.shipyard ?? 0) < 1} onClick={() => void act(() => post(`/planets/${planet.id}/produce`, { id: unit, count: plan.count }), `Queued ${plan.count}× ${UNITS[unit].name}`)}>
          Build {plan.count}
        </button>
      </div>
    </Card>
  );
}
