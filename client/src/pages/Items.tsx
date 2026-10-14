import { useState } from 'react';
import {
  BUILDINGS, BUILDING_IDS, DEFENSE_IDS, buildingAllowed, SHIP_IDS, TECHS, TECH_IDS, UNITS,
} from '../../../shared/data';
import { buildingCost, buildingTime, canAfford, lvl, researchTime, scaleRes, techCost, unitTime } from '../../../shared/formulas';
import type { BuildingId, Res, TechId, UnitId } from '../../../shared/types';
import { post } from '../api';
import { Art } from '../art';
import { useGame } from '../game';
import { Card, Cost, Countdown, copyLink, ItemIcon, ItemLink, Page, Progress, ReqList, fmtDur, unmet, fmt } from '../ui';
import { NumInput } from '../NumInput';
import { AdvisorCard } from '../AdvisorCard';
import { PlannerCard } from '../PlannerCard';
import { Flashing } from '../useFlash';
import { affordWait, getOnlyStartable, setOnlyStartable } from '../afford';

type Kind = 'building' | 'tech' | 'ship' | 'defense';
const TITLES: Record<Kind, string> = { building: 'Buildings', tech: 'Research', ship: 'Shipyard', defense: 'Defense' };

export function Items({ kind }: { kind: Kind }) {
  const { me, planet, act, live, now, toast } = useGame();
  // a cancel or removal can be taken back for a few seconds: Undo puts the same thing in again (a running job starts over from the beginning)
  const withUndo = async (doIt: () => Promise<unknown>, text: string, undo: () => Promise<unknown>) => {
    const r = await act(doIt);
    if (r !== undefined) toast(text, 'info', { label: 'Undo', run: () => void act(undo, 'Restored') });
  };
  const cfg = me.config;
  const techs = me.player.techs;
  const have = { metal: live.metal, crystal: live.crystal, deuterium: live.deuterium };
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [only, setOnly] = useState(getOnlyStartable);
  // for a card that cannot be paid yet: when it can, at this planet's production
  const hint = (cost: Res, missing: unknown[]) => {
    if (missing.length || canAfford(have, cost)) return null;
    const w = affordWait(cost, have, planet.production, planet.capacity);
    return <div className="muted small">{w.ms === null ? (w.why === 'storage' ? 'Does not fit the storage: build more first' : 'A missing resource has no income here') : <>Affordable in {fmtDur(w.ms)}</>}</div>;
  };

  // the Chief Engineer shortens every timer; the server applies the same factor
  const timeFactor = planet.detail.timeFactor as number;
  const researchFactor = planet.detail.researchFactor as number; // Discoverer: research only
  const robotics = lvl(planet.buildings, 'roboticsFactory');
  const nanite = lvl(planet.buildings, 'naniteFactory');
  const shipyard = lvl(planet.buildings, 'shipyard');
  const lab = lvl(planet.buildings, 'researchLab');

  const buildQ = planet.buildQueue;
  const researchQ = me.player.research;
  const bBacklog: string[] = planet.buildBacklog ?? [];
  const rBacklog: { id: string }[] = me.player.researchBacklog ?? [];
  const MAXQ = 4;

  // how long the whole queue takes: the running job's time left plus every queued job, worked out at today's levels (a queued Robotics Factory or Lab
  // would shorten the ones behind it, so the total is an estimate)
  const seenB: Record<string, number> = buildQ ? { [buildQ.id]: 1 } : {};
  const bTimes = bBacklog.map((id) => {
    const level = lvl(planet.buildings, id as BuildingId) + (seenB[id] ?? 0) + 1;
    seenB[id] = (seenB[id] ?? 0) + 1;
    return buildingTime(buildingCost(id as BuildingId, level), robotics, nanite, cfg.economySpeed * cfg.constructionBoost, timeFactor) * 1000;
  });
  const bTotal = (buildQ ? Math.max(0, buildQ.end - now) : 0) + bTimes.reduce((a, b) => a + b, 0);
  const seenR: Record<string, number> = researchQ ? { [researchQ.id]: 1 } : {};
  const rTimes = rBacklog.map((q) => {
    const level = lvl(techs, q.id as TechId) + (seenR[q.id] ?? 0) + 1;
    seenR[q.id] = (seenR[q.id] ?? 0) + 1;
    return researchTime(techCost(q.id as TechId, level), lab, cfg.economySpeed * cfg.researchBoost, me.allianceBonuses.research, timeFactor * researchFactor) * 1000;
  });
  const rTotal = (researchQ ? Math.max(0, researchQ.end - now) : 0) + rTimes.reduce((a, b) => a + b, 0);
  // the shipyard: a row finishes after its running unit plus the rest; the whole queue is every row one after the other
  const rowTimes: number[] = planet.shipyardQueue.map((j: any, i: number) => (i === 0 ? Math.max(0, j.start + j.unitMs - now) + Math.max(0, j.remaining - 1) * j.unitMs : j.remaining * j.unitMs));
  const yardTotal = rowTimes.reduce((a, b) => a + b, 0);

  return (
    <Page title={TITLES[kind]}>
      {kind === 'building' && buildQ && (
        <Card tour="queue" title={buildQ.down ? 'Being demolished' : 'Under construction'} right={<button onClick={() => void withUndo(() => post(`/planets/${planet.id}/build/cancel`), 'Cancelled', () => post(buildQ.down ? `/planets/${planet.id}/demolish` : `/planets/${planet.id}/build`, { id: buildQ.id }))}>Cancel</button>}>
          <div className="job"><div><ItemIcon id={buildQ.id} size={24} /> {buildQ.down ? 'Demolishing' : ''} {BUILDINGS[buildQ.id as BuildingId].name} → level {buildQ.level} · <Countdown to={buildQ.end} /></div><Progress from={buildQ.start} to={buildQ.end} />
            {buildQ.down && buildQ.refund && <div className="muted small">Returns <Cost cost={buildQ.refund} /> when it is done.</div>}</div>
        </Card>
      )}
      {kind === 'building' && bBacklog.length > 0 && (
        <Card title={`Queue (${bBacklog.length}/${MAXQ})`}>
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
        <Card title={`Queue (${rBacklog.length}/${MAXQ})`}>
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

      {kind === 'defense' && <AdvisorCard />}
      {(kind === 'ship' || kind === 'defense') && <PlannerCard kind={kind} />}
      {(kind === 'building' || kind === 'tech') && (buildQ || bBacklog.length > 0 || researchQ || rBacklog.length > 0) && (
        <button className="link" onClick={async () => { const r = await act(() => post(`/planets/${planet.id}/share-order`)); if (r) await copyLink(r.id, toast); }}>Share my queue as a build order link</button>
      )}
      <label className="row small startable"><input type="checkbox" checked={only} onChange={() => { setOnly(!only); setOnlyStartable(!only); }} /> Only what I can start now</label>
      <div className="items">
        {kind === 'building' && BUILDING_IDS.filter((id) => buildingAllowed(id, !!planet.isMoon)).map((id) => {
          const d = BUILDINGS[id];
          const built = lvl(planet.buildings, id);
          // an upgrade already running or waiting in the queue moves the next level up
          const pending = (buildQ?.id === id ? 1 : 0) + bBacklog.filter((x) => x === id).length;
          const level = built + pending;
          const cost = buildingCost(id, level + 1);
          const secs = buildingTime(cost, robotics, nanite, cfg.economySpeed * cfg.constructionBoost, timeFactor);
          const missing = unmet(d.requires, planet.buildings, techs);
          const ok = !missing.length && (!buildQ || bBacklog.length < MAXQ) && canAfford(have, cost) && planet.usedFields + bBacklog.length < planet.fields;
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

        {kind === 'tech' && TECH_IDS.map((id) => {
          const d = TECHS[id];
          const done = lvl(techs, id);
          const pendingT = (researchQ?.id === id ? 1 : 0) + rBacklog.filter((x) => x.id === id).length;
          const level = done + pendingT;
          const cost = techCost(id, level + 1);
          const secs = researchTime(cost, lab, cfg.economySpeed * cfg.researchBoost, me.allianceBonuses.research, timeFactor * researchFactor);
          const missing = unmet(d.requires, planet.buildings, techs);
          const energyOk = !d.energyReq || planet.production.energyProduced >= d.energyReq * 3 ** level;
          const ok = !missing.length && energyOk && (!researchQ || rBacklog.length < MAXQ) && canAfford(have, cost);
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

        {(kind === 'ship' ? SHIP_IDS : kind === 'defense' ? DEFENSE_IDS : []).map((id) => {
          const d = UNITS[id];
          const owned = (kind === 'ship' ? planet.fleet : planet.defenses)[id] || 0;
          const n = Math.max(1, counts[id] || 1);
          const missing = unmet(d.requires, planet.buildings, techs);
          const total = scaleRes(d.cost, n);
          const msUnit = unitTime(id, shipyard, nanite, cfg.economySpeed * cfg.shipyardBoost, timeFactor) * 1000;
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
      </div>
      <span hidden>{now}</span>
    </Page>
  );
}
