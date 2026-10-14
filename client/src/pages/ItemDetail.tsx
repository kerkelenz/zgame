import { useState } from 'react';
import { ResIcon } from '../ResIcon';
import { BUILDINGS, DRIVE_SWITCH, TECHS, UNITS, buildingAllowed } from '../../../shared/data';
import { HELP } from '../../../shared/help';
import {
  buildingEffectsAt, buildingTable, detailCtxFrom, kindOf, requirementStatus, requirementsOf, techEffectsAt, techTable, unitDetails, unlocksOf,
  type Col, type DetailCtx, type TableDetails,
} from '../../../shared/effects';
import { canAfford, lvl, scaleRes } from '../../../shared/formulas';
import type { BuildingId, Res, TechId, UnitId } from '../../../shared/types';
import { post } from '../api';
import { Art } from '../art';
import { artFile } from '../artFiles';
import { useGame } from '../game';
import { fmtCell, fmtDelta } from '../../../shared/format';
import { Card, Cost, ItemLink, Page, fmt, fmtDur } from '../ui';
import { NumInput } from '../NumInput';

const fmtDeltaCell = (c: Col, v: number) => fmtDelta(c.fmt, v);

function LevelTable({ table, current, prevEffects, have, hasCost = true }: { table: TableDetails; current: number; prevEffects: Record<string, number>; have: Res; hasCost?: boolean }) {
  return (
    <div className="dwrap">
      <table className="dtable">
        <thead>
          <tr>
            <th>Level</th>
            {hasCost && <><th className="metal"><ResIcon k="metal" /> Metal</th><th className="crystal"><ResIcon k="crystal" /> Crystal</th><th className="deut"><ResIcon k="deuterium" /> Vespene Gas</th><th>Time</th></>}
            {table.columns.map((c) => <th key={c.key} title={c.hint}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => {
            const prev = i === 0 ? prevEffects : table.rows[i - 1].v;
            const cls = row.level === current ? 'cur' : row.level === current + 1 ? 'next' : row.level <= current ? 'done' : '';
            return (
              <tr key={row.level} className={cls}>
                <td><b>{row.level}</b>{row.level === current && <span className="muted small"> you</span>}{row.level === current + 1 && <span className="muted small"> next</span>}</td>
                {hasCost && <>
                  <td className={row.level === current + 1 && have.metal < row.cost.metal ? 'bad' : ''}>{row.cost.metal ? fmt(row.cost.metal) : '–'}</td>
                  <td className={row.level === current + 1 && have.crystal < row.cost.crystal ? 'bad' : ''}>{row.cost.crystal ? fmt(row.cost.crystal) : '–'}</td>
                  <td className={row.level === current + 1 && have.deuterium < row.cost.deuterium ? 'bad' : ''}>{row.cost.deuterium ? fmt(row.cost.deuterium) : '–'}</td>
                  <td>{fmtDur(row.seconds * 1000)}</td>
                </>}
                {table.columns.map((c) => (
                  <td key={c.key}>
                    {fmtCell(c.fmt, row.v[c.key])}
                    {c.delta && prev[c.key] !== undefined && <span className={`delta ${(row.v[c.key] - prev[c.key] < 0) !== !!c.lowerIsBetter ? 'neg' : ''}`}>{fmtDeltaCell(c, row.v[c.key] - prev[c.key])}</span>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Requirements({ id, ctx }: { id: string; ctx: DetailCtx }) {
  const reqs = requirementStatus(requirementsOf(id), ctx);
  if (!reqs.length) return <p className="muted small">No requirements.</p>;
  return (
    <ul className="reqlist">
      {reqs.map((r) => (
        <li key={r.id} className={r.met ? 'ok' : 'miss'}>
          <span>{r.met ? '✓' : '✗'}</span> <ItemLink id={r.id} /> level {r.level}
          <span className="muted small"> - you have {r.have}</span>
        </li>
      ))}
    </ul>
  );
}

/** what the item is for, in a couple of friendly sentences, with the things worth knowing */
function Explain({ id, fallback }: { id: string; fallback: string }) {
  const h = HELP[id];
  return (
    <div className="explain">
      <p style={{ margin: 0 }}>{h?.does ?? fallback}</p>
      {h?.tips && h.tips.length > 0 && <ul className="tips">{h.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
    </div>
  );
}

function Unlocks({ id, current }: { id: string; current: number }) {
  const list = unlocksOf(id);
  if (!list.length) return <p className="muted small">Nothing else depends on this.</p>;
  const label = { building: 'Building', tech: 'Research', ship: 'Ship', defense: 'Defense' } as const;
  return (
    <table className="dtable compact">
      <thead><tr><th>At level</th><th>Unlocks</th><th>Type</th><th>Also needs</th></tr></thead>
      <tbody>
        {list.map((u) => (
          <tr key={u.id} className={u.level <= current ? 'done' : ''}>
            <td>{u.level}{u.level <= current && <span className="muted small"> ✓</span>}</td>
            <td><ItemLink id={u.id} /></td>
            <td className="muted small">{label[u.kind]}</td>
            <td className="small">{u.also.length ? u.also.map((r, i) => <span key={r.id}>{i ? ', ' : ''}<ItemLink id={r.id} /> {r.level}</span>) : <span className="muted">–</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ItemDetail() {
  const { detailId: id, closeItem, planet, me, act, live, planets } = useGame();
  const [more, setMore] = useState(10);
  const [fromOne, setFromOne] = useState(false);
  const [count, setCount] = useState(1);
  if (!id) return <Page title="Details"><p className="muted">Nothing selected.</p></Page>;
  const kind = kindOf(id);
  if (!kind) return <Page title="Details"><p className="muted">Unknown item.</p><button onClick={closeItem}>Back</button></Page>;

  const techs = me.player.techs;
  const ctx = detailCtxFrom(planet, techs);
  const have: Res = { ...live };
  const back = <button onClick={closeItem}>← Back</button>;

  // ------------------------------------------------------------------ buildings and research
  if (kind === 'building' || kind === 'tech') {
    const isB = kind === 'building';
    const def = isB ? BUILDINGS[id as BuildingId] : TECHS[id as TechId];
    const cur = isB ? lvl(planet.buildings, id as BuildingId) : lvl(techs, id as TechId);
    const from = fromOne ? 1 : Math.max(1, cur - 1);
    const to = Math.min(80, Math.max(cur + more, 10));
    const table = isB ? buildingTable(id as BuildingId, ctx, from, to) : techTable(id as TechId, ctx, from, to);
    const prevEffects = from <= 1 ? (isB ? buildingEffectsAt(id as BuildingId, 0, ctx) : techEffectsAt(id as TechId, 0, ctx)) : (isB ? buildingEffectsAt(id as BuildingId, from - 1, ctx) : techEffectsAt(id as TechId, from - 1, ctx));
    // an upgrade already running or queued moves the next purchasable level up
    const pend = isB
      ? (planet.buildQueue?.id === id ? 1 : 0) + (planet.buildBacklog ?? []).filter((x: string) => x === id).length
      : (me.player.research?.id === id ? 1 : 0) + (me.player.researchBacklog ?? []).filter((x: { id: string }) => x.id === id).length;
    const nextLevel = cur + 1 + pend;
    const next = table.rows.find((r) => r.level === nextLevel) ?? (isB ? buildingTable(id as BuildingId, ctx, nextLevel, nextLevel) : techTable(id as TechId, ctx, nextLevel, nextLevel)).rows[0];
    const reqs = requirementStatus(def.requires, ctx);
    const missing = reqs.filter((r) => !r.met);
    const queueFull = isB ? (planet.buildBacklog?.length ?? 0) >= 4 : (me.player.researchBacklog?.length ?? 0) >= 4;
    const busy = isB ? !!planet.buildQueue : !!me.player.research;
    const legal = !isB || buildingAllowed(id as BuildingId, !!planet.isMoon);
    const energyOk = isB || !TECHS[id as TechId].energyReq || planet.production.energyProduced >= TECHS[id as TechId].energyReq! * 3 ** cur;
    const fieldsOk = !isB || id === 'terraformer' || planet.usedFields + (planet.buildBacklog?.length ?? 0) < planet.fields;
    const ok = legal && !missing.length && energyOk && fieldsOk && (!busy || !queueFull) && canAfford(have, next.cost);
    const run = () => void act(() => post(isB ? `/planets/${planet.id}/build` : `/planets/${planet.id}/research`, { id }), `${def.name}: ${busy ? 'queued' : 'started'}`);

    return (
      <Page title={def.name}>
        <div className="row">{back}<span className="muted small">{isB ? 'Building' : 'Research'}</span></div>
        <Card>
          <div className="cardtop">
            <img className={artFile(id) ? "icon big hero" : "icon big"} src={artFile(id) ?? Art.icon(isB ? 'building' : 'tech', id, def.name)} alt="" />
            <div>
              <Explain id={id} fallback={def.desc} />
              <p className="muted">{isB ? `Level on ${planet.name}:` : 'Your level:'} <b className="energy">{cur}</b>{!isB && TECHS[id as TechId].energyReq ? ` · needs ${fmt(TECHS[id as TechId].energyReq! * 3 ** cur)} energy production for level ${cur + 1}` : ''}</p>
            </div>
          </div>
        </Card>

        <div className="grid2">
          <Card title={`Next: level ${nextLevel}`}>
            <table className="kv"><tbody>
              <tr><td>Cost</td><td><Cost cost={next.cost} have={have} /></td></tr>
              <tr><td>Time</td><td>{fmtDur(next.seconds * 1000)}</td></tr>
              {table.columns.map((c) => {
                const nv = next.v[c.key], cv = (isB ? buildingEffectsAt(id as BuildingId, cur, ctx) : techEffectsAt(id as TechId, cur, ctx))[c.key];
                const change = c.delta && cv !== undefined && nv !== undefined ? nv - cv : 0;
                const tone = !change ? '' : (change > 0) !== !!c.lowerIsBetter ? 'good' : 'bad';      // a bigger output is good, a bigger cost or delay is bad
                return <tr key={c.key}><td title={c.hint}>{c.label}</td><td>{cur > 0 || c.delta ? <>{fmtCell(c.fmt, cv)} → <b>{fmtCell(c.fmt, nv)}</b></> : <b>{fmtCell(c.fmt, nv)}</b>}{tone && <span className={`chg ${tone}`}>{fmtDeltaCell(c, change)}</span>}</td></tr>;
              })}
            </tbody></table>
            <div className="row">
              <button className="primary" disabled={!ok} onClick={run}>{busy ? 'Add to queue' : cur === 0 ? (isB ? 'Build' : 'Research') : isB ? `Upgrade to ${nextLevel}` : `Research level ${nextLevel}`}</button>
              {!legal && <span className="bad small">{planet.isMoon ? 'Cannot be built on a moon.' : 'Moon-only building.'}</span>}
              {legal && !ok && missing.length === 0 && energyOk && fieldsOk && !busy && !canAfford(have, next.cost) && <span className="bad small">Not enough resources on {planet.name}.</span>}
              {!energyOk && <span className="bad small">Not enough energy production on this planet.</span>}
              {!fieldsOk && <span className="bad small">No free fields.</span>}
            </div>
            {isB && cur > 0 && (
              <div className="row">
                <button className="danger" disabled={busy || ((planet.buildBacklog?.length ?? 0) > 0)} title={busy ? 'Finish or cancel the building queue first' : undefined}
                  onClick={() => confirm(`Demolish one level of ${def.name} on ${planet.name}? It drops to level ${cur - 1}. Half of the build time, and about 30% of that level's price comes back.`) && void act(() => post(`/planets/${planet.id}/demolish`, { id }), `${def.name}: demolition started`)}>
                  Demolish level {cur}
                </button>
                <span className="muted small">Takes half the build time and returns about 30% of that level's price. It frees a building field. Needs an empty building queue.</span>
              </div>
            )}
          </Card>
          <Card title="Requirements"><Requirements id={id} ctx={ctx} /></Card>
        </div>

        {table.notes.length > 0 && <Card title="Good to know"><ul className="notes">{table.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Card>}

        <Card title="Level by level" right={<span className="muted small">costs and times use your current speeds, officers and bonuses</span>}>
          <LevelTable table={table} current={cur} prevEffects={prevEffects} have={have} />
          <div className="row">
            {from > 1 && <button onClick={() => setFromOne(true)}>Show from level 1</button>}
            {to < 80 && <button onClick={() => setMore(more + 10)}>Show 10 more levels</button>}
          </div>
        </Card>

        <Card title={`What level ${cur + 1} and beyond unlock`}><Unlocks id={id} current={cur} /></Card>
      </Page>
    );
  }

  // ------------------------------------------------------------------ ships and defenses
  const u = UNITS[id as UnitId];
  const d = unitDetails(id as UnitId, ctx, 10);
  const owned = (kind === 'ship' ? planet.fleet : planet.defenses)[id] || 0;
  const missing = requirementStatus(u.requires, ctx).filter((r) => !r.met);
  const n = Math.max(1, count);
  const total = scaleRes(u.cost, n);
  const ok = lvl(planet.buildings, 'shipyard') > 0 && !missing.length && canAfford(have, total);
  const stat = (label: string, base: number, eff: number, unit = '') => (
    <tr key={label}><td>{label}</td><td>{fmt(base)}{unit}</td><td>{fmt(eff)}{unit}{Math.abs(eff - base) > 0.5 && <span className={`delta ${eff < base ? 'neg' : ''}`}>{eff > base ? '+' : '−'}{fmt(Math.abs(eff - base))}</span>}</td></tr>
  );
  return (
    <Page title={u.name}>
      <div className="row">{back}<span className="muted small">{kind === 'ship' ? 'Ship' : 'Defense'}{u.missile ? ' · stored in the missile silo' : ''}</span></div>
      <Card>
        <div className="cardtop">
          <img className={artFile(id) ? "icon big hero" : "icon big"} src={artFile(id) ?? Art.icon(kind === 'ship' ? 'ship' : 'defense', id, u.name)} alt="" />
          <div>
            <Explain id={id} fallback={u.desc} />
            <p className="muted">On {planet.name}: <b className="energy">{fmt(owned)}</b></p>
          </div>
        </div>
      </Card>

      <div className="grid2">
        <Card title="Stats">
          <table className="kv"><thead><tr><td></td><td className="muted small">Base</td><td className="muted small">With your technology</td></tr></thead><tbody>
            {stat('Attack', d.base.attack, d.effective.attack)}
            {stat('Shield', d.base.shield, d.effective.shield)}
            {stat('Hull', d.base.hull, d.effective.hull)}
            {u.cargo > 0 && stat('Cargo', d.base.cargo, d.base.cargo)}
            {u.speed > 0 && stat('Speed', d.base.speed, d.effective.speed)}
            {u.fuel > 0 && stat('Fuel use', d.base.fuel, d.base.fuel)}
          </tbody></table>
          {u.drive && <p className="muted small">Uses the <ItemLink id={u.drive} /> engine{d.driveSwitch ? <>, and switches to <ItemLink id={d.driveSwitch.tech} /> from level {d.driveSwitch.level}</> : null}.</p>}
        </Card>
        <Card title="Build">
          <table className="kv"><tbody>
            <tr><td>Cost each</td><td><Cost cost={u.cost} have={have} /></td></tr>
            <tr><td>Time each</td><td>{fmtDur(d.seconds * 1000)} <span className="muted small">(shipyard {lvl(planet.buildings, 'shipyard')})</span></td></tr>
            {u.max && <tr><td>Limit</td><td>{u.max} per planet</td></tr>}
          </tbody></table>
          <h4>Requirements</h4>
          <Requirements id={id} ctx={ctx} />
          <div className="row">
            <NumInput min={1} max={u.max ?? 1000000} value={count} onChange={(n) => setCount(n)} />
            <button className="primary" disabled={!ok} onClick={() => void act(() => post(`/planets/${planet.id}/produce`, { id, count: n }), `Queued ${n}× ${u.name}`)}>Build {n}</button>
          </div>
        </Card>
      </div>

      {(u.kind === 'ship' || d.rapidFireAgainst.length > 0 || d.driveSwitch) && (
        <Card title="Special features">
          <ul className="specials">
            {d.driveSwitch && (() => {
              const sw = d.driveSwitch, have = lvl(techs, sw.tech as TechId), on = have >= sw.level;
              return <li className="warn"><b>Changes engine:</b> from <ItemLink id={sw.tech} /> level {sw.level} it flies on the {sw.tech === 'hyperspaceDrive' ? 'hyperspace' : 'impulse'} drive from a base speed of {fmt(sw.speed)}, and its speed then grows with that drive. You are at level {have}: {on ? <b className="good">switched, now {fmt(d.effective.speed)}</b> : <b className="muted">not yet ({sw.level - have} more level{sw.level - have === 1 ? '' : 's'})</b>}.</li>;
            })()}
            {d.rapidFireAgainst.slice(0, 4).map((r) => <li key={r.id} className="good"><b>Rapid fire ×{r.value}</b> against <ItemLink id={r.id} /></li>)}
            {d.rapidFireAgainst.length > 4 && <li className="muted small">…and {d.rapidFireAgainst.length - 4} more, listed below.</li>}
            {d.rapidFireFrom.slice(0, 4).map((r) => <li key={r.id} className="bad"><ItemLink id={r.id} /> has <b>rapid fire ×{r.value}</b> against it</li>)}
            {u.cargo > 0 && u.kind === 'ship' && <li className="info"><b>Cargo {fmt(u.cargo)}</b>{id === 'recycler' ? ' (also its recycling capacity)' : ''}</li>}
            {!d.driveSwitch && d.rapidFireAgainst.length === 0 && d.rapidFireFrom.length === 0 && u.cargo === 0 && <li className="muted">No special features.</li>}
          </ul>
        </Card>
      )}

      {(d.rapidFireAgainst.length > 0 || d.rapidFireFrom.length > 0) && (
        <div className="grid2">
          <Card title="Rapid fire against">
            {d.rapidFireAgainst.length ? <ul className="notes">{d.rapidFireAgainst.map((r) => <li key={r.id}><ItemLink id={r.id} /> ×{r.value} <span className="muted small">(about {fmt(r.value)} shots before it moves on)</span></li>)}</ul> : <p className="muted small">None.</p>}
          </Card>
          <Card title="Rapid fire from">
            {d.rapidFireFrom.length ? <ul className="notes">{d.rapidFireFrom.map((r) => <li key={r.id}><ItemLink id={r.id} /> shoots this ×{r.value}</li>)}</ul> : <p className="muted small">Nothing has rapid fire against this.</p>}
          </Card>
        </div>
      )}

      {u.attack > 1 && (
        <Card title="How technology changes it" right={<span className="muted small">your tech: weapons {lvl(techs, 'weapons')} · shielding {lvl(techs, 'shielding')} · armour {lvl(techs, 'armour')}{d.drive ? ` · drive ${lvl(techs, d.drive as TechId)}` : ''}</span>}>
          <div className="dwrap"><table className="dtable">
            <thead><tr><th>Tech level</th><th><ItemLink id="weapons">Attack</ItemLink></th><th><ItemLink id="shielding">Shield</ItemLink></th><th><ItemLink id="armour">Hull</ItemLink></th>{d.drive && <th><ItemLink id={d.drive}>Speed</ItemLink></th>}</tr></thead>
            <tbody>{d.techRows.map((r) => (
              <tr key={r.level}><td><b>{r.level}</b></td><td className={r.level === lvl(techs, 'weapons') ? 'cur' : ''}>{fmt(r.attack)}</td><td className={r.level === lvl(techs, 'shielding') ? 'cur' : ''}>{fmt(r.shield)}</td><td className={r.level === lvl(techs, 'armour') ? 'cur' : ''}>{fmt(r.hull)}</td>
                {d.drive && <td className={r.level === lvl(techs, d.drive as TechId) ? 'cur' : ''}>{fmt(r.speed)}</td>}</tr>
            ))}</tbody>
          </table></div>
          {d.driveSwitch && (
            <>
              <h4>Speed by <ItemLink id={d.driveSwitch.tech} /> level</h4>
              <div className="dwrap"><table className="dtable compact"><thead><tr><th>Level</th>{d.driveSwitch.rows.map((r) => <th key={r.level} className={r.level === d.driveSwitch!.level ? 'cur' : ''}>{r.level}</th>)}</tr></thead>
                <tbody><tr><td>Speed</td>{d.driveSwitch.rows.map((r) => <td key={r.level} className={r.level === lvl(techs, d.driveSwitch!.tech as TechId) ? 'cur' : r.level === d.driveSwitch!.level ? 'next' : ''}>{fmt(r.speed)}</td>)}</tr></tbody></table></div>
              <p className="muted small">The jump at level {d.driveSwitch.level} is the engine change.</p>
            </>
          )}
          <p className="muted small">Each level of weapons, shielding and armour adds +10%. Drive levels add +10% / +20% / +30% speed for combustion / impulse / hyperspace ships.</p>
        </Card>
      )}
    </Page>
  );
}
