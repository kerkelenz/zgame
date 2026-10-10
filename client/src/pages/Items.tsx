import { useState } from 'react';
import {
  BUILDINGS, BUILDING_IDS, DEFENSE_IDS, SHIP_IDS, TECHS, TECH_IDS, UNITS,
} from '../../../shared/data';
import { buildingCost, buildingTime, canAfford, lvl, researchTime, scaleRes, techCost, unitTime } from '../../../shared/formulas';
import type { BuildingId, TechId, UnitId } from '../../../shared/types';
import { post } from '../api';
import { useGame } from '../game';
import { Card, Cost, Countdown, Page, Progress, ReqList, fmtDur, unmet, fmt } from '../ui';

type Kind = 'building' | 'tech' | 'ship' | 'defense';
const TITLES: Record<Kind, string> = { building: 'Buildings', tech: 'Research', ship: 'Shipyard', defense: 'Defense' };

export function Items({ kind }: { kind: Kind }) {
  const { me, planet, act, live, now } = useGame();
  const cfg = me.config;
  const techs = me.player.techs;
  const have = { metal: live.metal, crystal: live.crystal, deuterium: live.deuterium };
  const [counts, setCounts] = useState<Record<string, number>>({});

  const robotics = lvl(planet.buildings, 'roboticsFactory');
  const nanite = lvl(planet.buildings, 'naniteFactory');
  const shipyard = lvl(planet.buildings, 'shipyard');
  const lab = lvl(planet.buildings, 'researchLab');

  const buildQ = planet.buildQueue;
  const researchQ = me.player.research;

  return (
    <Page title={TITLES[kind]}>
      {kind === 'building' && buildQ && (
        <Card title="Under construction" right={<button onClick={() => void act(() => post(`/planets/${planet.id}/build/cancel`), 'Cancelled')}>Cancel</button>}>
          <div className="job"><div>{BUILDINGS[buildQ.id as BuildingId].name} → level {buildQ.level} · <Countdown to={buildQ.end} /></div><Progress from={buildQ.start} to={buildQ.end} /></div>
        </Card>
      )}
      {kind === 'tech' && researchQ && (
        <Card title="Researching" right={<button onClick={() => void act(() => post('/research/cancel'), 'Cancelled')}>Cancel</button>}>
          <div className="job"><div>{TECHS[researchQ.id as TechId].name} → level {researchQ.level} · <Countdown to={researchQ.end} /></div><Progress from={researchQ.start} to={researchQ.end} /></div>
        </Card>
      )}
      {(kind === 'ship' || kind === 'defense') && planet.shipyardQueue.length > 0 && (
        <Card title="Production queue">
          {planet.shipyardQueue.map((j: any, i: number) => (
            <div className="row between" key={i}>
              <span>{j.remaining} / {j.total}× {UNITS[j.id as UnitId].name} {i === 0 && <span className="muted">· next unit in <Countdown to={j.start + j.unitMs} /></span>}</span>
              <button onClick={() => void act(() => post(`/planets/${planet.id}/produce/cancel`, { index: i }), 'Cancelled')}>Cancel</button>
            </div>
          ))}
        </Card>
      )}

      <div className="items">
        {kind === 'building' && BUILDING_IDS.map((id) => {
          const d = BUILDINGS[id];
          const level = lvl(planet.buildings, id);
          const cost = buildingCost(id, level + 1);
          const secs = buildingTime(cost, robotics, nanite, cfg.economySpeed);
          const missing = unmet(d.requires, planet.buildings, techs);
          const ok = !missing.length && canAfford(have, cost) && !buildQ && planet.usedFields < planet.fields;
          return (
            <Card key={id} title={<>{d.name} <span className="lvl">{level}</span></>}>
              <p className="muted">{d.desc}</p>
              <div>Next: <Cost cost={cost} have={have} /> · {fmtDur(secs * 1000)}</div>
              {missing.length > 0 && <ReqList reqs={missing} />}
              <button className="primary" disabled={!ok} onClick={() => void act(() => post(`/planets/${planet.id}/build`, { id }), `${d.name} upgrade started`)}>
                {level === 0 ? 'Build' : `Upgrade to ${level + 1}`}
              </button>
            </Card>
          );
        })}

        {kind === 'tech' && TECH_IDS.map((id) => {
          const d = TECHS[id];
          const level = lvl(techs, id);
          const cost = techCost(id, level + 1);
          const secs = researchTime(cost, lab, cfg.economySpeed, me.allianceBonuses.research);
          const missing = unmet(d.requires, planet.buildings, techs);
          const ok = !missing.length && canAfford(have, cost) && !researchQ;
          return (
            <Card key={id} title={<>{d.name} <span className="lvl">{level}</span></>}>
              <p className="muted">{d.desc}</p>
              <div>Next: <Cost cost={cost} have={have} /> · {fmtDur(secs * 1000)}</div>
              {missing.length > 0 && <ReqList reqs={missing} />}
              <button className="primary" disabled={!ok} onClick={() => void act(() => post(`/planets/${planet.id}/research`, { id }), `Researching ${d.name}`)}>Research level {level + 1}</button>
            </Card>
          );
        })}

        {(kind === 'ship' ? SHIP_IDS : kind === 'defense' ? DEFENSE_IDS : []).map((id) => {
          const d = UNITS[id];
          const owned = (kind === 'ship' ? planet.fleet : planet.defenses)[id] || 0;
          const n = Math.max(1, counts[id] || 1);
          const missing = unmet(d.requires, planet.buildings, techs);
          const total = scaleRes(d.cost, n);
          const msUnit = unitTime(id, shipyard, nanite, cfg.economySpeed) * 1000;
          const maxAfford = Math.floor(Math.min(
            d.cost.metal ? have.metal / d.cost.metal : Infinity,
            d.cost.crystal ? have.crystal / d.cost.crystal : Infinity,
            d.cost.deuterium ? have.deuterium / d.cost.deuterium : Infinity,
          ));
          const ok = !missing.length && canAfford(have, total) && shipyard > 0;
          return (
            <Card key={id} title={<>{d.name} <span className="lvl">{fmt(owned)}</span></>}>
              <p className="muted">{d.desc}</p>
              <div className="stats">
                <span>⚔ {fmt(d.attack)}</span><span>🛡 {fmt(d.shield)}</span><span>❤ {fmt(d.hull)}</span>
                {d.cargo > 0 && <span>📦 {fmt(d.cargo)}</span>}{d.speed > 0 && <span>🚀 {fmt(d.speed)}</span>}
              </div>
              <div>Each: <Cost cost={d.cost} have={have} /> · {fmtDur(msUnit)}</div>
              {Object.keys(d.rapidFire).length > 0 && <div className="muted small">Rapid fire vs {Object.entries(d.rapidFire).map(([k, v]) => `${UNITS[k as UnitId].name} ×${v}`).join(', ')}</div>}
              {missing.length > 0 && <ReqList reqs={missing} />}
              <div className="row">
                <input type="number" min={1} max={d.max ?? 1000000} value={counts[id] ?? 1} onChange={(e) => setCounts({ ...counts, [id]: Number(e.target.value) })} />
                <button onClick={() => setCounts({ ...counts, [id]: Math.max(1, Math.min(d.max ?? Infinity, maxAfford)) })}>Max</button>
                <button className="primary" disabled={!ok} onClick={() => void act(() => post(`/planets/${planet.id}/produce`, { id, count: n }), `Queued ${n}× ${d.name}`)}>Build {n}</button>
              </div>
            </Card>
          );
        })}
      </div>
      <span hidden>{now}</span>
    </Page>
  );
}
