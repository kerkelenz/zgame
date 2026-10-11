import { BUILDINGS, SHIP_IDS, UNITS, isStationary } from '../../../shared/data';
import { useGame } from '../game';
import { Card, Countdown, Page, coordStr, fmt } from '../ui';

export function Empire() {
  const { planets, me, now, selectPlanet, setPage } = useGame();
  const live = (p: any, k: 'metal' | 'crystal' | 'deuterium') => {
    const dt = Math.max(0, now - p.updatedAt) / 3_600_000;
    const cur = p.resources[k], rate = p.production[k], cap = p.capacity[k];
    return rate >= 0 ? (cur >= cap ? cur : Math.min(cap, cur + rate * dt)) : Math.max(0, cur + rate * dt);
  };
  const total = { metal: 0, crystal: 0, deuterium: 0, mph: 0, cph: 0, dph: 0 };
  for (const p of planets) {
    total.metal += live(p, 'metal'); total.crystal += live(p, 'crystal'); total.deuterium += live(p, 'deuterium');
    total.mph += p.production.metal; total.cph += p.production.crystal; total.dph += p.production.deuterium;
  }
  const open = (id: string, page: string) => { selectPlanet(id); setPage(page); };
  const shipCount = (p: any) => SHIP_IDS.reduce((n, id) => n + (isStationary(id) ? 0 : p.fleet[id] || 0), 0);
  const topShips = (p: any) => SHIP_IDS.filter((id) => !isStationary(id) && p.fleet[id]).sort((a, b) => p.fleet[b] - p.fleet[a]).slice(0, 3).map((id) => `${fmt(p.fleet[id])} ${UNITS[id].name}`).join(', ');

  return (
    <Page title="Empire">
      <Card title="Totals">
        <div className="bankline">
          <span className="metal">{fmt(total.metal)} M <small className="muted">+{fmt(total.mph)}/h</small></span>
          <span className="crystal">{fmt(total.crystal)} C <small className="muted">+{fmt(total.cph)}/h</small></span>
          <span className="deut">{fmt(total.deuterium)} D <small className="muted">+{fmt(total.dph)}/h</small></span>
        </div>
        {me.player.research && <p className="muted">Research: {me.player.research.id} → level {me.player.research.level} · <Countdown to={me.player.research.end} /></p>}
      </Card>
      <Card>
        <table className="table">
          <thead><tr><th>Planet</th><th>Resources</th><th>Per hour</th><th>Energy</th><th>Construction</th><th>Ships</th><th></th></tr></thead>
          <tbody>
            {planets.map((p) => {
              const full = (['metal', 'crystal', 'deuterium'] as const).some((k) => p.production[k] > 0 && live(p, k) >= p.capacity[k] * 0.98);
              const energy = p.production.energyProduced - p.production.energyUsed;
              const q = p.buildQueue;
              return (
                <tr key={p.id}>
                  <td><a onClick={() => open(p.id, 'overview')}>{p.isMoon ? '🌙 ' : ''}{p.name}</a><div className="muted small">{coordStr(p.coords)} · {p.usedFields}/{p.fields} fields</div></td>
                  <td>
                    <span className="metal">{fmt(live(p, 'metal'))}</span> · <span className="crystal">{fmt(live(p, 'crystal'))}</span> · <span className="deut">{fmt(live(p, 'deuterium'))}</span>
                    {full && <span className="bad" title="A storage is (nearly) full"> ⚠ full</span>}
                  </td>
                  <td className="muted">{fmt(p.production.metal)} · {fmt(p.production.crystal)} · {fmt(p.production.deuterium)}</td>
                  <td className={energy < 0 ? 'bad' : 'energy'}>{fmt(energy)}</td>
                  <td>
                    {q ? <>{BUILDINGS[q.id as keyof typeof BUILDINGS].name} {q.level} · <Countdown to={q.end} />{p.buildBacklog?.length ? <span className="muted"> (+{p.buildBacklog.length})</span> : null}</>
                      : <a className="muted" onClick={() => open(p.id, 'buildings')}>idle</a>}
                  </td>
                  <td className="muted small">{shipCount(p) ? `${fmt(shipCount(p))}: ${topShips(p)}` : '–'}</td>
                  <td className="actions"><button onClick={() => open(p.id, 'fleet')}>Fleet</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}
