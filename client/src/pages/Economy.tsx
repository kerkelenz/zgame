import { useState } from 'react';
import { EnergyIcon, ResIcon } from '../ResIcon';
import { BUILDINGS } from '../../../shared/data';
import {
  KEYS, bestUpgrade, empireTotals, planetEconomy, projectStock, upgradeOptions, type ResKey,
} from '../../../shared/analysis';
import { detailCtxFrom } from '../../../shared/effects';
import type { BuildingId, Res } from '../../../shared/types';
import { post } from '../api';
import { useGame } from '../game';
import { fmtDurShort } from '../../../shared/format';
import { Card, CoordLink, coordStr, fmt, fmtDur, ItemLink, Page } from '../ui';

const LABEL: Record<ResKey, string> = { metal: 'Metal', crystal: 'Crystal', deuterium: 'Vespene Gas' };
const CLS: Record<ResKey, string> = { metal: 'metal', crystal: 'crystal', deuterium: 'deut' };
const hours = (h: number | null) => (h == null ? '–' : h === Infinity ? 'never' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 100 ? `${h.toFixed(1)} h` : `${Math.round(h / 24)} days`);
const signed = (n: number) => (Math.abs(n) < 0.5 ? '0' : (n > 0 ? '+' : '−') + fmt(Math.abs(n)));
const secs = (s: number | null) => (s == null ? '–' : s === 0 ? 'full' : fmtDurShort(s));

/** a horizontal bar split into labelled coloured parts */
function Stack({ parts, total }: { parts: { label: string; v: number; cls: string }[]; total: number }) {
  return (
    <div className="stack" role="img" aria-label={parts.map((p) => `${p.label} ${fmt(p.v)}`).join(', ')}>
      {parts.filter((p) => p.v > 0).map((p) => <i key={p.label} className={p.cls} style={{ width: `${(p.v / Math.max(total, 1e-9)) * 100}%` }} title={`${p.label}: ${fmt(p.v)} / h`} />)}
    </div>
  );
}

export function Economy() {
  const { planets, planet, me, now, selectPlanet, act, openItem } = useGame();
  const [sort, setSort] = useState<'payback' | 'cost'>('payback');
  const techs = me.player.techs;
  const worlds = planets.filter((p) => !p.isMoon);

  const stockOf = (p: any): Res => {
    const dt = Math.max(0, now - p.updatedAt) / 3_600_000;
    const f = (k: ResKey) => {
      const cur = p.resources[k], rate = p.production[k], cap = p.capacity[k];
      return rate >= 0 ? (cur >= cap ? cur : Math.min(cap, cur + rate * dt)) : Math.max(0, cur + rate * dt);
    };
    return { metal: f('metal'), crystal: f('crystal'), deuterium: f('deuterium') };
  };

  const rows = worlds.map((p) => {
    const ctx = detailCtxFrom(p, techs);
    const stock = stockOf(p);
    const economy = planetEconomy(ctx, stock, p.capacity);
    const opts = upgradeOptions(ctx, stock);
    return { p, ctx, stock, capacity: p.capacity as Res, economy, opts, best: bestUpgrade(opts) };
  });
  const totals = empireTotals(rows);

  // the planet being studied in detail
  const sel = rows.find((r) => r.p.id === planet.id) ?? rows[0];
  if (!sel) return <Page title="Economy"><p className="muted">You have no planets with an economy yet.</p></Page>;
  const { economy: eco, ctx, stock, capacity } = sel;
  const d = eco.production.detail;
  const energyNeeded = Math.max(0, eco.energy.used - eco.energy.produced);

  const planner = [...sel.opts].sort((a, b) =>
    sort === 'cost' ? a.costValue - b.costValue : (a.paybackHours ?? Infinity) - (b.paybackHours ?? Infinity));
  const best = sel.best;

  return (
    <Page title="Economy">
      <p className="muted">How much you make, where it comes from, when stores fill up, and which upgrade pays back fastest. All numbers include your officers, alliance and faction bonuses.</p>

      <Card title="Empire income">
        <div className="grid3">
          {KEYS.map((k) => (
            <div key={k} className="stat">
              <div className={`label ${CLS[k]}`}>{LABEL[k]}</div>
              <div className="big">{signed(totals.perHour[k])}<small> / hour</small></div>
              <div className="muted small">{signed(totals.perDay[k])} per day</div>
              <div className="muted small">stored {fmt(totals.stock[k])} of {fmt(totals.capacity[k])} ({Math.round((totals.stock[k] / Math.max(1, totals.capacity[k])) * 100)}%)</div>
            </div>
          ))}
        </div>
        <p className="muted small">In metal-equivalents (crystal ×1.5, vespene gas ×3): <b>{fmt(totals.value.perHour)}</b> per hour · <b>{fmt(totals.value.perDay)}</b> per day · stockpile <b>{fmt(totals.value.stock)}</b>.</p>
        {totals.lostValuePerHour > 1 && <p className="bad">⚠ Energy shortages are costing you about {fmt(totals.lostValuePerHour)} metal-equivalents every hour. Open the planet below to fix it.</p>}
      </Card>

      <Card title="Planet by planet">
        <div className="dwrap"><table className="table">
          <thead><tr><th>Planet</th><th className="metal"><ResIcon k="metal" /> Metal / h</th><th className="crystal"><ResIcon k="crystal" /> Crystal / h</th><th className="deut"><ResIcon k="deuterium" /> Vespene / h</th><th><EnergyIcon size={14} /> Energy</th><th>Store fills</th><th>Best next upgrade</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const soonest = KEYS.map((k) => ({ k, s: r.economy.fullIn[k] })).filter((x) => x.s != null).sort((a, b) => a.s! - b.s!)[0];
              return (
                <tr key={r.p.id} className={r.p.id === sel.p.id ? 'mine' : ''}>
                  <td><a onClick={() => selectPlanet(r.p.id)}>{r.p.name}</a><div className="muted small"><CoordLink c={r.p.coords} /></div></td>
                  <td>{signed(r.economy.rates.metal)}</td><td>{signed(r.economy.rates.crystal)}</td><td>{signed(r.economy.rates.deuterium)}</td>
                  <td className={r.economy.energy.balance < 0 ? 'bad' : ''}>{signed(r.economy.energy.balance)}<div className="muted small">{Math.round(r.economy.energy.efficiency * 100)}% efficient</div></td>
                  <td className={soonest && soonest.s! < 7200 ? 'bad' : ''}>{soonest ? <>{LABEL[soonest.k]} {secs(soonest.s)}</> : '–'}</td>
                  <td>{r.best ? <><a onClick={() => openItem(r.best!.id)}>{BUILDINGS[r.best.id].name}</a> {r.best.level}<div className="muted small">pays back in {hours(r.best.paybackHours)}</div></> : <span className="muted">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <p className="muted small">Click a planet to study it below. Moons produce nothing and are left out.</p>
      </Card>

      <Card title={`${sel.p.name}: where the income comes from`} right={<span className="muted small">per hour</span>}>
        {(['metal', 'crystal', 'deuterium'] as ResKey[]).map((k) => {
          const m = d.mine[k];
          const basic = k === 'metal' ? d.basic.metal : k === 'crystal' ? d.basic.crystal : 0;
          const burn = k === 'deuterium' ? eco.production.fusionDeutUse : 0;
          const parts = [
            { label: 'Free basic income', v: basic, cls: 'seg-basic' },
            { label: 'Mines', v: m.raw, cls: 'seg-mine' },
            { label: 'Plasma technology', v: m.plasma, cls: 'seg-plasma' },
            { label: 'Planet position', v: m.placement, cls: 'seg-pos' },
            { label: 'Crawlers', v: m.crawlers, cls: 'seg-crawl' },
            { label: 'Alliance, officers and faction', v: m.boosts, cls: 'seg-boost' },
            { label: 'Lost to energy shortage', v: m.lostToEnergy, cls: 'seg-lost' },
          ];
          const total = basic + m.potential;
          return (
            <div key={k} className="breakdown">
              <div className="row between"><b className={CLS[k]}>{LABEL[k]}</b><b>{signed(eco.rates[k])} / h net</b></div>
              <Stack parts={parts} total={total} />
              <div className="legend">
                {parts.filter((p) => p.v > 0.5).map((p) => <span key={p.label}><i className={p.cls} />{p.label} <b>{p.cls === 'seg-lost' ? '−' : '+'}{fmt(p.v)}</b> <span className="muted">({Math.round((p.v / Math.max(total, 1e-9)) * 100)}%)</span></span>)}
                {burn > 0.5 && <span><i className="seg-lost" />Burned by fusion reactors <b>−{fmt(burn)}</b></span>}
              </div>
            </div>
          );
        })}
      </Card>

      <Card title={<><EnergyIcon size={18} /> Energy</>} right={<span className={eco.energy.efficiency < 1 ? 'bad' : 'good'}>{Math.round(eco.energy.efficiency * 100)}% efficiency</span>}>
        <div className="grid2">
          <div>
            <h4>Produced: {fmt(eco.energy.produced)}</h4>
            <Stack total={Math.max(eco.energy.produced, 1)} parts={[
              { label: 'Solar plants', v: d.energy.solar, cls: 'seg-mine' }, { label: 'Fusion reactors', v: d.energy.fusion, cls: 'seg-plasma' },
              { label: 'Solar satellites', v: d.energy.satellites, cls: 'seg-basic' }, { label: 'Officers', v: d.energy.boosts, cls: 'seg-boost' }]} />
            <div className="legend">
              <span><i className="seg-mine" /><ItemLink id="solarPlant" /> <b>{fmt(d.energy.solar)}</b></span>
              <span><i className="seg-plasma" /><ItemLink id="fusionReactor" /> <b>{fmt(d.energy.fusion)}</b></span>
              {d.energy.satellites > 0 && <span><i className="seg-basic" />Satellites <b>{fmt(d.energy.satellites)}</b></span>}
              {d.energy.boosts > 0.5 && <span><i className="seg-boost" />Officers <b>{fmt(d.energy.boosts)}</b></span>}
            </div>
          </div>
          <div>
            <h4>Used by mines: {fmt(eco.energy.used)}</h4>
            <Stack total={Math.max(eco.energy.used, 1)} parts={[
              { label: 'Metal mine', v: d.energy.usedMetal, cls: 'seg-basic' }, { label: 'Crystal mine', v: d.energy.usedCrystal, cls: 'seg-mine' }, { label: 'Vespene extractor', v: d.energy.usedDeuterium, cls: 'seg-plasma' }, { label: 'Crawlers', v: d.energy.usedCrawlers, cls: 'seg-crawl' }]} />
            <div className="legend">
              <span><i className="seg-basic" /><ItemLink id="metalMine" /> <b>{fmt(d.energy.usedMetal)}</b></span>
              <span><i className="seg-mine" /><ItemLink id="crystalMine" /> <b>{fmt(d.energy.usedCrystal)}</b></span>
              <span><i className="seg-plasma" /><ItemLink id="deuteriumSynthesizer" /> <b>{fmt(d.energy.usedDeuterium)}</b></span>
              {d.energy.usedCrawlers > 0.5 && <span><i className="seg-crawl" />Crawlers <b>{fmt(d.energy.usedCrawlers)}</b></span>}
            </div>
          </div>
        </div>
        {energyNeeded > 0
          ? <p className="bad">Short by <b>{fmt(energyNeeded)}</b> energy. Mines run at {Math.round(eco.energy.efficiency * 100)}%, which wastes {fmt(eco.lostToEnergy.value)} metal-equivalents per hour.</p>
          : <p className="good">Fully powered, with {fmt(eco.energy.balance)} to spare.</p>}
      </Card>

      <Card title="Storage and projections">
        <div className="dwrap"><table className="table">
          <thead><tr><th></th><th>Stored</th><th>Full in</th><th>In 1 hour</th><th>In 6 hours</th><th>In 24 hours</th><th>In 7 days</th></tr></thead>
          <tbody>
            {KEYS.map((k) => {
              const at = (h: number) => projectStock(stock, eco.rates, capacity, h)[k];
              const pct = Math.min(100, (stock[k] / Math.max(1, capacity[k])) * 100);
              return (
                <tr key={k}>
                  <td className={CLS[k]}><b>{LABEL[k]}</b></td>
                  <td style={{ minWidth: 190 }}><div className="bar"><div style={{ width: pct + '%' }} /></div>{fmt(stock[k])} / {fmt(capacity[k])} <span className="muted small">({Math.round(pct)}%)</span></td>
                  <td className={eco.fullIn[k] != null && eco.fullIn[k]! < 7200 ? 'bad' : ''}>{eco.emptyIn[k] != null ? <span className="bad">empty in {secs(eco.emptyIn[k])}</span> : secs(eco.fullIn[k])}</td>
                  {[1, 6, 24, 168].map((h) => <td key={h} className={at(h) >= capacity[k] ? 'muted' : ''}>{fmt(at(h))}{at(h) >= capacity[k] && eco.rates[k] > 0 ? ' (full)' : ''}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <p className="muted small">Projections assume constant production and no spending. A full store stops filling, so upgrade storage ({' '}<ItemLink id="metalStorage" />, <ItemLink id="crystalStorage" />, <ItemLink id="deuteriumTank" />) before it caps out.</p>
      </Card>

      <Card title="Upgrade planner" right={
        <div className="chips"><button className={sort === 'payback' ? 'active' : ''} onClick={() => setSort('payback')}>fastest payback</button><button className={sort === 'cost' ? 'active' : ''} onClick={() => setSort('cost')}>cheapest</button></div>}>
        {best && <p>Best next step on {sel.p.name}: <b><ItemLink id={best.id} /> {best.level}</b> pays for itself in about <b>{hours(best.paybackHours)}</b>.</p>}
        <div className="dwrap"><table className="table">
          <thead><tr><th>Upgrade</th><th>Cost</th><th>Time</th><th className="metal"><ResIcon k="metal" /> Metal</th><th className="crystal"><ResIcon k="crystal" /> Crystal</th><th className="deut"><ResIcon k="deuterium" /> Vespene Gas</th><th>Energy</th><th>Payback</th><th>Can afford in</th><th></th></tr></thead>
          <tbody>
            {planner.map((o) => (
              <tr key={o.id} className={o.id === best?.id ? 'next' : ''}>
                <td><ItemLink id={o.id} /> <span className="muted small">→ {o.level}</span>{!o.available && <div className="bad small">requirements missing</div>}</td>
                <td className="small"><span className="metal">{fmt(o.cost.metal)}</span>{o.cost.crystal > 0 && <> · <span className="crystal">{fmt(o.cost.crystal)}</span></>}{o.cost.deuterium > 0 && <> · <span className="deut">{fmt(o.cost.deuterium)}</span></>}</td>
                <td>{fmtDur(o.seconds * 1000)}</td>
                <td>{signed(o.delta.metal)}</td><td>{signed(o.delta.crystal)}</td><td>{signed(o.delta.deuterium)}</td>
                <td className={o.delta.energy < 0 ? 'bad' : ''}>{signed(o.delta.energy)}{o.efficiencyAfter < eco.energy.efficiency - 0.001 && <div className="bad small">efficiency → {Math.round(o.efficiencyAfter * 100)}%</div>}</td>
                <td>{o.paybackHours != null ? hours(o.paybackHours) : (o.id === 'solarPlant' || o.id === 'fusionReactor') && eco.energy.efficiency >= 0.999 ? <span className="muted small">not needed yet - already fully powered</span> : <span className="muted">–</span>}</td>
                <td>{o.waitSeconds === 0 ? <span className="good">now</span> : secs(o.waitSeconds)}</td>
                <td className="actions"><button disabled={!o.available} onClick={() => void act(() => post(`/planets/${sel.p.id}/build`, { id: o.id as BuildingId }), `${BUILDINGS[o.id].name}: ordered`)}>Build</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="muted small">Payback = cost ÷ extra income, both in metal-equivalents (crystal ×1.5, vespene gas ×3). Energy buildings pay back by lifting the efficiency of every mine. Storage and facility upgrades are not ranked here because they pay back in other ways (room to grow, faster building).</p>
      </Card>
    </Page>
  );
}
