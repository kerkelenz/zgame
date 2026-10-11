import { useCallback, useEffect, useMemo, useState } from 'react';
import { BUILDINGS, TECHS } from '../../../shared/data';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, Page, when } from '../ui';

interface Step { kind: 'building' | 'tech'; id: string; level: number }

const buildingOptions = Object.values(BUILDINGS).map((b) => ({ id: b.id, name: b.name })).sort((a, b) => a.name.localeCompare(b.name));
const techOptions = Object.values(TECHS).map((t) => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));
const nameOf = (s: Step) => (s.kind === 'building' ? BUILDINGS : TECHS)[s.id as never]?.['name' as never] ?? s.id;

export function Automation() {
  const { act, planet } = useGame();
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => setD(await get('/automation')), []);
  useEffect(() => { void load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const [name, setName] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [kind, setKind] = useState<'building' | 'tech'>('building');
  const [item, setItem] = useState('metalMine');
  const [level, setLevel] = useState(5);
  const options = kind === 'building' ? buildingOptions : techOptions;
  const run = async (fn: () => Promise<any>, ok?: string) => { const r = await act(fn, ok); if (r?.templates) setD(r); else await load(); return r; };
  const move = (i: number, dir: number) => setSteps((s) => { const n = [...s]; const j = i + dir; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const rules = d?.rules;
  const defenseName = useMemo(() => new Map<string, string>((d?.defenses ?? []).map((x: any) => [x.id, x.name])), [d]);

  if (!d) return <Page title="Automation"><p className="muted">Loading…</p></Page>;
  const summary = (st: Step[]) => st.slice(0, 6).map((s) => `${nameOf(s)} ${s.level}`).join(', ') + (st.length > 6 ? `, … (${st.length} steps)` : '');

  return (
    <Page title="Automation">
      <p className="muted">Let the server do the routine work while you are away. Build orders raise buildings and technologies in sequence on one planet; rules react to energy shortages, full storage and incoming attacks. Nothing here ever spends more than you have, and nothing is dropped - what cannot be paid for waits.</p>

      {d.plans.length > 0 && (
        <Card title="Running now">
          {d.plans.map((p: any) => (
            <div key={p.planetId} className="plan">
              <div className="row between"><span><b>{p.name}</b> on {p.planet}{p.added > 0 && <span className="muted small"> · {p.added} prerequisite{p.added > 1 ? 's' : ''} added</span>}</span>
                <button onClick={() => void run(() => post('/automation/stop', { planetId: p.planetId }), 'Build order stopped')}>Stop</button></div>
              <div className="chips">{p.steps.map((s: any, i: number) => <span key={i} className={`tag ${s.done ? 'active' : ''}`} title={`${s.name} ${s.have}/${s.level}`}>{s.done ? '✔ ' : ''}{s.name} {s.level}</span>)}</div>
              <div className="muted small">{p.status}</div>
            </div>
          ))}
        </Card>
      )}

      <Card title="Build orders" right={<span className="muted small">runs on {planet.name}</span>}>
        <h4>Ready-made</h4>
        {d.templates.map((t: any) => (
          <div key={t.id} className="row between">
            <span><b>{t.name}</b> <span className="muted small">{t.desc}</span></span>
            <span className="row"><button onClick={() => { setName(t.name + ' (copy)'); setSteps(t.steps.map((s: Step) => ({ ...s }))); }}>Copy to editor</button>
              <button className="primary" onClick={() => void run(() => post('/automation/start', { planetId: planet.id, template: t.id }), `${t.name} started on ${planet.name}`)}>Run here</button></span>
          </div>
        ))}
        <h4>Yours</h4>
        {d.orders.length === 0 && <p className="muted small">None yet - build one below.</p>}
        {d.orders.map((o: any) => (
          <div key={o.id} className="row between">
            <span><b>{o.name}</b> <span className="muted small">{summary(o.steps)}</span></span>
            <span className="row"><button onClick={() => { setName(o.name); setSteps(o.steps.map((s: Step) => ({ ...s }))); }}>Edit</button>
              <button onClick={() => confirm(`Delete "${o.name}"?`) && void run(() => post('/automation/orders/remove', { id: o.id }))}>Delete</button>
              <button className="primary" onClick={() => void run(() => post('/automation/start', { planetId: planet.id, orderId: o.id }), `${o.name} started on ${planet.name}`)}>Run here</button></span>
          </div>
        ))}
        <h4>Editor</h4>
        <p className="muted small">Each step means "raise this to level N". Steps start in order whenever you can afford them; missing requirements are added automatically.</p>
        {steps.map((s, i) => (
          <div key={i} className="row between">
            <span>{i + 1}. {nameOf(s)} → level {s.level} <span className="muted small">({s.kind === 'building' ? 'building' : 'research'})</span></span>
            <span className="row"><button disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button disabled={i === steps.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>Remove</button></span>
          </div>
        ))}
        <div className="row wrap">
          <select value={kind} onChange={(e) => { const k = e.target.value as 'building' | 'tech'; setKind(k); setItem((k === 'building' ? buildingOptions : techOptions)[0].id); }}><option value="building">Building</option><option value="tech">Research</option></select>
          <select value={item} onChange={(e) => setItem(e.target.value)}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          <label className="row">to level <input type="number" className="sm" min={1} max={60} value={level} onChange={(e) => setLevel(Number(e.target.value))} /></label>
          <button onClick={() => setSteps((x) => [...x, { kind, id: item, level }].slice(0, 80))}>Add step</button>
        </div>
        <div className="row wrap">
          <input placeholder="Name this build order" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary" disabled={!name.trim() || !steps.length} onClick={async () => { const r = await run(() => post('/automation/orders', { name, steps }), 'Build order saved'); if (r) { setName(''); setSteps([]); } }}>Save build order</button>
          {steps.length > 0 && <button onClick={() => { setSteps([]); setName(''); }}>Clear</button>}
        </div>
      </Card>

      <Card title="Rules">
        <label className="check"><input type="checkbox" checked={rules.energy} onChange={(e) => void run(() => post('/automation/rules', { energy: e.target.checked }))} /> <b>Keep the lights on</b> <span className="muted small">- when a planet runs short of energy and nothing is being built, build a Solar Plant there</span></label>
        <label className="check"><input type="checkbox" checked={rules.storage} onChange={(e) => void run(() => post('/automation/rules', { storage: e.target.checked }))} /> <b>Never cap out</b> <span className="muted small">- when a resource reaches 90% of storage and nothing is being built, upgrade that storage</span></label>
        <label className="check"><input type="checkbox" checked={rules.defense.on} onChange={(e) => void run(() => post('/automation/rules', { defense: { on: e.target.checked } }))} /> <b>Dig in when attacked</b> <span className="muted small">- when a hostile fleet is heading for one of your planets, queue defenses there (once per fleet)</span></label>
        <div className="row wrap">
          <label>Defense<select value={rules.defense.unit} onChange={(e) => void run(() => post('/automation/rules', { defense: { unit: e.target.value } }))}>{d.defenses.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>Up to<input type="number" className="sm" min={1} max={1000} defaultValue={rules.defense.count} key={'c' + rules.defense.count} onBlur={(e) => void run(() => post('/automation/rules', { defense: { count: Number(e.target.value) } }))} /></label>
          <label>Spend at most (% of stock)<input type="number" className="sm" min={1} max={100} defaultValue={rules.defense.maxSharePct} key={'s' + rules.defense.maxSharePct} onBlur={(e) => void run(() => post('/automation/rules', { defense: { maxSharePct: Number(e.target.value) } }))} /></label>
        </div>
        <p className="muted small">With the current settings an attack on a planet queues up to {rules.defense.count} {defenseName.get(rules.defense.unit) ?? rules.defense.unit}, never spending more than {rules.defense.maxSharePct}% of what that planet holds of each resource.</p>
      </Card>

      <Card title="What automation did">
        {d.log.length === 0 && <p className="muted small">Nothing yet.</p>}
        {d.log.map((l: any, i: number) => <div key={i} className="muted small">{when(l.at)} – {l.text}</div>)}
      </Card>
    </Page>
  );
}
