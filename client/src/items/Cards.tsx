import { useState } from 'react';
import { BUILDINGS, BUILDING_IDS, DEFENSE_IDS, buildingAllowed, SHIP_IDS, TECHS, TECH_IDS, UNITS } from '../../../shared/data';
import { buildingCost, buildingTime, canAfford, lvl, researchTime, scaleRes, techCost, unitTime } from '../../../shared/formulas';
import type { BuildingId, UnitId } from '../../../shared/types';
import { post } from '../api';
import { Art } from '../art';
import { Card, Cost, ItemLink, ReqList, fmtDur, unmet, fmt } from '../ui';
import { NumInput } from '../NumInput';
import { Flashing } from '../useFlash';
import type { ItemsData, Kind } from './useItems';

export function BuildingCards({ d, only }: { d: ItemsData; only: boolean }) {
  const { me, planet, act, live, now, toast, withUndo, cfg, techs, have, hint, timeFactor, lfBuild, lfShip, researchFactor, robotics, nanite, shipyard, lab, buildQ, researchQ, bBacklog, rBacklog, MAXB, MAXR, bTimes, bTotal, rTimes, rTotal, rowTimes, yardTotal } = d;
  return (
    <>
        {BUILDING_IDS.filter((id) => buildingAllowed(id, !!planet.isMoon)).map((id) => {
          const d = BUILDINGS[id];
          const built = lvl(planet.buildings, id);
          // an upgrade already running or waiting in the queue moves the next level up
          const pending = (buildQ?.id === id ? 1 : 0) + bBacklog.filter((x) => x === id).length;
          const level = built + pending;
          const cost = buildingCost(id, level + 1);
          const secs = buildingTime(cost, robotics, nanite, cfg.economySpeed * cfg.constructionBoost, timeFactor * lfBuild);
          const missing = unmet(d.requires, planet.buildings, techs);
          const ok = !missing.length && (!buildQ || bBacklog.length < MAXB) && canAfford(have, cost) && planet.usedFields + bBacklog.length < planet.fields;
          if (only && !ok) return null;
          return (
            <Card key={id} title={<><ItemLink id={id}>{d.name}</ItemLink> <Flashing className="lvl" value={built}>{built}{pending > 0 && <span className="muted"> +{pending}</span>}</Flashing></>}>
              <div className="cardtop"><img className="icon" src={Art.icon('building', id, d.name)} alt="" /><p className="muted">{d.desc}</p></div>
              <div>{pending > 0 ? `Level ${level + 1}` : 'Next'}: <Cost cost={cost} have={have} /> · {fmtDur(secs * 1000)}</div>
              {missing.length > 0 && <ReqList reqs={missing} />}
              {hint(cost, missing)}
              <button className="primary" data-tour={`build-${id}`} disabled={!ok} onClick={() => void act(() => post(`/planets/${planet.id}/build`, { id }), `${d.name} upgrade started`)}>
                {buildQ ? 'Add to queue' : level === 0 ? 'Build' : `Upgrade to ${level + 1}`}
              </button>
              {built > 0 && (
                <button className="link demolish" disabled={!!buildQ || bBacklog.length > 0} title={buildQ || bBacklog.length ? 'Finish or cancel the building queue first' : `Take one level down: half the build time, and 30% of that level's price comes back`}
                  onClick={() => confirm(`Demolish one level of ${d.name} on ${planet.name}? It drops to level ${built - 1}. Half of the build time, and about 30% of that level's price comes back.`) && void act(() => post(`/planets/${planet.id}/demolish`, { id }), `${d.name}: demolition started`)}>
                  Demolish a level
                </button>
              )}
            </Card>
          );
        })}
    </>
  );
}

export function TechCards({ d, only }: { d: ItemsData; only: boolean }) {
  const { me, planet, act, live, now, toast, withUndo, cfg, techs, have, hint, timeFactor, lfBuild, lfShip, researchFactor, robotics, nanite, shipyard, lab, buildQ, researchQ, bBacklog, rBacklog, MAXB, MAXR, bTimes, bTotal, rTimes, rTotal, rowTimes, yardTotal } = d;
  return (
    <>
        {TECH_IDS.map((id) => {
          const d = TECHS[id];
          const done = lvl(techs, id);
          const pendingT = (researchQ?.id === id ? 1 : 0) + rBacklog.filter((x) => x.id === id).length;
          const level = done + pendingT;
          const cost = techCost(id, level + 1);
          const secs = researchTime(cost, lab, cfg.economySpeed * cfg.researchBoost, me.allianceBonuses.research, timeFactor * researchFactor);
          const missing = unmet(d.requires, planet.buildings, techs);
          const energyOk = !d.energyReq || planet.production.energyProduced >= d.energyReq * 3 ** level;
          const ok = !missing.length && energyOk && (!researchQ || rBacklog.length < MAXR) && canAfford(have, cost);
          if (only && !ok) return null;
          return (
            <Card key={id} title={<><ItemLink id={id}>{d.name}</ItemLink> <Flashing className="lvl" value={done}>{done}{pendingT > 0 && <span className="muted"> +{pendingT}</span>}</Flashing></>}>
              <div className="cardtop"><img className="icon" src={Art.icon('tech', id, d.name)} alt="" /><p className="muted">{d.desc}</p></div>
              <div>Next: <Cost cost={cost} have={have} /> · {fmtDur(secs * 1000)}</div>
              {d.energyReq && <div className="small" style={{ color: planet.production.energyProduced >= d.energyReq * 3 ** level ? 'var(--good)' : 'var(--bad)' }}>Needs {fmt(d.energyReq * 3 ** level)} energy production on this planet (this one makes {fmt(planet.production.energyProduced)})</div>}
              {missing.length > 0 && <ReqList reqs={missing} />}
              {hint(cost, missing)}
              <button className="primary" disabled={!ok} onClick={() => void act(() => post(`/planets/${planet.id}/research`, { id }), `${researchQ ? 'Queued' : 'Researching'} ${d.name}`)}>{researchQ ? 'Queue' : 'Research'} level {level + 1}</button>
            </Card>
          );
        })}
    </>
  );
}

export function UnitCards({ kind, d, only }: { kind: Kind; d: ItemsData; only: boolean }) {
  const { me, planet, act, live, now, toast, withUndo, cfg, techs, have, hint, timeFactor, lfBuild, lfShip, researchFactor, robotics, nanite, shipyard, lab, buildQ, researchQ, bBacklog, rBacklog, MAXB, MAXR, bTimes, bTotal, rTimes, rTotal, rowTimes, yardTotal } = d;
  const [counts, setCounts] = useState<Record<string, number>>({});
  return (
    <>
        {(kind === 'ship' ? SHIP_IDS : kind === 'defense' ? DEFENSE_IDS : []).map((id) => {
          const d = UNITS[id];
          const owned = (kind === 'ship' ? planet.fleet : planet.defenses)[id] || 0;
          const n = Math.max(1, counts[id] || 1);
          const missing = unmet(d.requires, planet.buildings, techs);
          const total = scaleRes(d.cost, n);
          const msUnit = unitTime(id, shipyard, nanite, cfg.economySpeed * cfg.shipyardBoost, timeFactor * lfShip) * 1000;
          const maxAfford = Math.floor(Math.min(
            d.cost.metal ? have.metal / d.cost.metal : Infinity,
            d.cost.crystal ? have.crystal / d.cost.crystal : Infinity,
            d.cost.deuterium ? have.deuterium / d.cost.deuterium : Infinity,
          ));
          const ok = !missing.length && canAfford(have, total) && shipyard > 0;
          if (only && !ok) return null;
          return (
            <Card key={id} title={<><ItemLink id={id}>{d.name}</ItemLink> <Flashing className="lvl" value={owned}>{fmt(owned)}</Flashing></>}>
              <div className="cardtop"><img className="icon" src={Art.icon((kind === 'ship' ? 'ship' : 'defense'), id, d.name)} alt="" /><p className="muted">{d.desc}</p></div>
              <div className="stats">
                <span>⚔ {fmt(d.attack)}</span><span>🛡 {fmt(d.shield)}</span><span>❤ {fmt(d.hull)}</span>
                {d.cargo > 0 && <span>📦 {fmt(d.cargo)}</span>}{d.speed > 0 && <span>🚀 {fmt(d.speed)}</span>}
              </div>
              <div>Each: <Cost cost={d.cost} have={have} /> · {fmtDur(msUnit)}</div>
              {Object.keys(d.rapidFire).length > 0 && <div className="muted small">Rapid fire vs {Object.entries(d.rapidFire).map(([k, v]) => `${UNITS[k as UnitId].name} ×${v}`).join(', ')}</div>}
              {missing.length > 0 && <ReqList reqs={missing} />}
              {hint(total, missing)}
              <div className="row">
                <NumInput min={1} max={d.max ?? 1000000} value={counts[id] ?? 1} onChange={(n) => setCounts({ ...counts, [id]: n })} />
                <button onClick={() => setCounts({ ...counts, [id]: Math.max(1, Math.min(d.max ?? Infinity, maxAfford)) })}>Max</button>
                <button className="primary" disabled={!ok} onClick={() => void act(() => post(`/planets/${planet.id}/produce`, { id, count: n }), `Queued ${n}× ${d.name}`)}>Build {n}</button>
              </div>
            </Card>
          );
        })}
    </>
  );
}
