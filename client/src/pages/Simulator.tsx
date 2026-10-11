import { useEffect, useState } from 'react';
import { makeRng, simulateCombat, type Combatant } from '../../../shared/combat';
import { DEFENSE_IDS, SHIP_IDS, UNITS, isStationary } from '../../../shared/data';
import { moonChance, totalRes } from '../../../shared/formulas';
import type { UnitId } from '../../../shared/types';
import { get } from '../api';
import { useGame } from '../game';
import { Card, Page, coordStr, fmt } from '../ui';
import { NumInput } from '../NumInput';

type Units = Partial<Record<UnitId, number>>;
type Tech = { weapons: number; shielding: number; armour: number };
const FIGHTING = (SHIP_IDS as UnitId[]).filter((id) => UNITS[id].speed > 0 || isStationary(id));
const DEF_SIDE: UnitId[] = [...SHIP_IDS, ...DEFENSE_IDS.filter((id) => !UNITS[id].missile)];
const techOf = (t: Record<string, number | undefined> = {}): Tech => ({ weapons: t.weapons || 0, shielding: t.shielding || 0, armour: t.armour || 0 });

function sideOf(units: Units, tech: Tech, name: string): Combatant {
  const fleet: Units = {}, defenses: Units = {};
  for (const [id, n] of Object.entries(units)) if (n) ((UNITS[id as UnitId].kind === 'ship' ? fleet : defenses) as Units)[id as UnitId] = n;
  return { owner: name, name, ...tech, fleet, defenses };
}

export function Simulator() {
  const { me, planet } = useGame();
  const myTech = techOf(me.player.techs);
  const [att, setAtt] = useState<Units>({});
  const [def, setDef] = useState<Units>({});
  const [attTech, setAttTech] = useState<Tech>(myTech);
  const [defTech, setDefTech] = useState<Tech>({ weapons: 0, shielding: 0, armour: 0 });
  const [runs, setRuns] = useState(50);
  const [oldDebris, setOldDebris] = useState(0);
  const [out, setOut] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [label, setLabel] = useState('');

  useEffect(() => {
    void get('/messages').then((ms: any[]) => setReports(ms.filter((m) => m.kind === 'espionage' && m.data?.resources && (m.data.fleet || m.data.defenses)).slice(0, 12)));
  }, []);

  const loadSpy = (m: any) => {
    const d: Units = {};
    for (const [k, v] of Object.entries({ ...(m.data.fleet || {}), ...(m.data.defenses || {}) })) if (!UNITS[k as UnitId]?.missile) d[k as UnitId] = v as number;
    setDef(d);
    setDefTech(techOf(m.data.techs));
    setLabel(`${m.data.planet} ${coordStr(m.data.coords)}${m.data.techs ? '' : ' (enemy technology unknown - set it by hand)'}`);
  };

  const set = (side: 'att' | 'def', id: UnitId, v: number) => (side === 'att' ? setAtt : setDef)((s) => ({ ...s, [id]: Math.max(0, Math.floor(v) || 0) }));
  const count = (u: Units) => Object.values(u).reduce((a, b) => a + (b || 0), 0);

  const run = () => {
    if (!count(att) || !count(def)) return;
    let wins = 0, draws = 0, rounds = 0, attLoss = 0, defLoss = 0, debris = 0, moon = 0;
    const seed = Math.floor(Math.random() * 2 ** 31);
    for (let i = 0; i < runs; i++) {
      const r = simulateCombat([sideOf(att, attTech, 'Attacker')], [sideOf(def, defTech, 'Defender')], makeRng(seed + i * 7919));
      if (r.winner === 'attacker') wins++; else if (r.winner === 'draw') draws++;
      rounds += r.rounds;
      attLoss += totalRes(r.attackers[0].lost) / runs;
      // shot-down defenses mostly rebuild, so count them at the 30% that stays down
      const rebuiltValue = Object.entries(r.defenders[0].rebuilt).reduce((a, [id, n]) => a + totalRes(UNITS[id as UnitId].cost) * (n || 0), 0);
      defLoss += (totalRes(r.defenders[0].lost) - rebuiltValue) / runs;
      debris += (r.debris.metal + r.debris.crystal) / runs;
      // the roll after a battle counts the whole field above the planet: what was already there plus what this battle leaves
      moon += moonChance({ metal: r.debris.metal + oldDebris, crystal: r.debris.crystal }) / runs;
    }
    setOut({ runs, wins, draws, losses: runs - wins - draws, rounds: rounds / runs, attLoss, defLoss, debris, moon, oldDebris });
  };

  const table = (side: 'att' | 'def', ids: UnitId[], units: Units) => (
    <table className="ships"><tbody>
      {ids.map((id) => (
        <tr key={id}><td>{UNITS[id].name}</td>
          <td><NumInput blankZero placeholder="0" value={units[id] || 0} onChange={(n) => set(side, id, n)} /></td></tr>
      ))}
    </tbody></table>
  );
  const techIn = (t: Tech, setT: (t: Tech) => void) => (
    <div className="row wrap">
      {(['weapons', 'shielding', 'armour'] as const).map((k) => (
        <label key={k}>{k}<input type="number" className="sm" min={0} max={30} value={t[k]} onChange={(e) => setT({ ...t, [k]: Math.max(0, Number(e.target.value) || 0) })} /></label>
      ))}
    </div>
  );

  return (
    <Page title="Battle simulator">
      <p className="muted">Try a fight before you fly it. Results average many random battles; single fights vary, especially when the sides are close.</p>
      <Card title="Load a side">
        <div className="chips">
          <button onClick={() => { const f: Units = {}; for (const id of SHIP_IDS) if (planet.fleet[id] && UNITS[id].speed > 0) f[id] = planet.fleet[id]; setAtt(f); setAttTech(myTech); }}>Attacker = my ships on {planet.name}</button>
          <button onClick={() => { setAtt({}); setDef({}); setOut(null); setLabel(''); }}>Clear both</button>
        </div>
        {reports.length > 0 ? (
          <>
            <h4>Defender from a spy report</h4>
            <div className="chips">{reports.map((m) => <button key={m.id} onClick={() => loadSpy(m)}>{m.data.planet} {coordStr(m.data.coords)}</button>)}</div>
          </>
        ) : <p className="muted small">Spy a planet with enough probes (3+ detail) and its report can fill the defender for you.</p>}
        {label && <p className="muted small">Defender: {label}</p>}
      </Card>
      <div className="grid2">
        <Card title="Attacker">{techIn(attTech, setAttTech)}{table('att', FIGHTING, att)}</Card>
        <Card title="Defender">{techIn(defTech, setDefTech)}{table('def', DEF_SIDE, def)}</Card>
      </div>
      <Card>
        <div className="row">
          <label>Battles<input type="number" className="sm" min={1} max={200} value={runs} onChange={(e) => setRuns(Math.min(200, Math.max(1, Number(e.target.value) || 1)))} /></label>
          <label>Debris already there<NumInput value={oldDebris} onChange={setOldDebris} title="Resources of debris already above the planet from earlier battles: they raise the moon chance" /></label>
          <button className="primary" disabled={!count(att) || !count(def)} onClick={run}>Run simulation</button>
        </div>
        {out && (
          <table className="kv"><tbody>
            <tr><td>Attacker wins</td><td className={out.wins / out.runs > 0.5 ? 'good' : 'bad'}>{Math.round((out.wins / out.runs) * 100)}%</td></tr>
            <tr><td>Draws</td><td>{Math.round((out.draws / out.runs) * 100)}%</td></tr>
            <tr><td>Defender wins</td><td>{Math.round((out.losses / out.runs) * 100)}%</td></tr>
            <tr><td>Average rounds</td><td>{out.rounds.toFixed(1)}</td></tr>
            <tr><td>Attacker losses</td><td>{fmt(out.attLoss)} resources</td></tr>
            <tr><td>Defender losses</td><td>{fmt(out.defLoss)} resources (after rebuilds)</td></tr>
            <tr><td>Debris field</td><td>{fmt(out.debris)}{out.oldDebris > 0 ? ` (+ ${fmt(out.oldDebris)} already there)` : ''}</td></tr>
            <tr><td>Chance of a moon</td><td className={out.moon > 0 ? 'good' : 'muted'} title="Only for a planet that has no moon yet: 20% once the field above it holds 100,000 resources, less below that. Debris left by earlier battles counts.">{(out.moon * 100).toFixed(out.moon > 0 && out.moon < 0.1 ? 1 : 0)}%</td></tr>
          </tbody></table>
        )}
      </Card>
    </Page>
  );
}
