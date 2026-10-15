import { useCallback, useEffect, useRef, useState } from 'react';
import { ABILITIES, STANCES, type Ability, type Stance, type TargetMode } from '../../../shared/combat';
import { UNITS } from '../../../shared/data';
import { Art } from '../art';
import { get, post } from '../api';
import { useGame } from '../game';
import { useMotion } from '../motion';
import { Card, CoordLink, Countdown, Empty, Loading, Page, fmt } from '../ui';

interface Group { id: string; n: number; hullPct: number }
interface Round { round: number; a: Group[]; d: Group[]; volleys: { side: 0 | 1; from: string; to: string; n: number }[]; destroyed: { side: 0 | 1; id: string; n: number }[]; stats: { attackers: { damage: number; destroyed: number }; defenders: { damage: number; destroyed: number } } }
interface Hist { round: number; dealt: number; taken: number; lostMine: number; lostFoe: number; stance: Stance; target: TargetMode; ability: Ability | null; foeStance: Stance }
interface View {
  id: string; coords: { g: number; s: number; p: number }; planet: string; owner: string; outpost: { name: string; tier: number } | null;
  round: number; maxRounds: number; done: boolean; a: Group[]; d: Group[]; start: { a: Group[]; d: Group[] };
  last: Round | null; history: Hist[]; cooldowns: Record<Ability, number>; deadline: number; pickSeconds: number; names: Record<string, string>;
}
interface Finished { finished: true; winner: 'attacker' | 'defender' | 'draw'; retreated: boolean; rounds: number; last: Round | null; lostMine: number; lostFoe: number; history: Hist[]; names: Record<string, string> }

const W = 1000, COLS = 2, TILE_W = 190, ROW_H = 78;
const STANCE_WORD: Record<Stance, { label: string; text: string }> = {
  balanced: { label: 'Balanced', text: 'No bonus, no penalty.' },
  assault: { label: 'Boost attack', text: `Your shots hit ${Math.round((STANCES.assault.dealt - 1) * 100)}% harder, and you take ${Math.round((STANCES.assault.taken - 1) * 100)}% more.` },
  evasive: { label: 'Evasive maneuvers', text: `You take ${Math.round((1 - STANCES.evasive.taken) * 100)}% less damage, but deal ${Math.round((1 - STANCES.evasive.dealt) * 100)}% less.` },
  brace: { label: 'Brace shields', text: `Your shields hold ${Math.round((STANCES.brace.shield - 1) * 100)}% more for the round; you deal ${Math.round((1 - STANCES.brace.dealt) * 100)}% less.` },
};
const TARGET_WORD: Record<TargetMode, { label: string; text: string }> = {
  spread: { label: 'Spread fire', text: 'Shots land on any enemy ship.' },
  big: { label: 'Focus the biggest', text: 'Most shots go to the dearest enemy ships.' },
  weak: { label: 'Finish the weakest', text: 'Most shots go to the most damaged and fragile enemy ships.' },
};
const ABILITY_WORD: Record<Ability, { label: string; text: string }> = {
  repair: { label: 'Repair', text: 'Mends every damaged hull of yours by 40%.' },
  emp: { label: 'EMP', text: 'The enemy deals 40% less this round and loses rapid fire.' },
  decoy: { label: 'Decoy', text: 'Three in ten enemy shots hit decoys.' },
  overcharge: { label: 'Overcharge', text: 'Your rapid fire is 50% stronger this round.' },
};

const kindOf = (id: string) => (UNITS as any)[id]?.kind === 'defense' ? 'defense' : 'ship';
const tilePos = (side: 0 | 1, i: number) => {
  const col = i % COLS, row = Math.floor(i / COLS);
  return { x: side === 0 ? 24 + col * (TILE_W + 8) : W - 24 - TILE_W - (COLS - 1 - col) * (TILE_W + 8) + (COLS - 1 - col) * 0, y: 54 + row * ROW_H };
};

/**
 * The Battle screen: your fleet on the left, the garrison on the right. Each round you choose a stance, how to aim and (when ready) an ability,
 * then fire; the volleys are drawn flying across and the numbers settle. The garrison answers with orders of its own. After the last round (or a
 * retreat) the normal battle report arrives in your messages.
 */
export function BattlePage() {
  const { detailId, setPage, refresh, now } = useGame();
  const motion = useMotion();
  const [v, setV] = useState<View | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [fin, setFin] = useState<Finished | null>(null);
  const [stance, setStance] = useState<Stance>('balanced');
  const [target, setTarget] = useState<TargetMode>('spread');
  const [ability, setAbility] = useState<Ability | null>(null);
  const [fx, setFx] = useState<{ key: number; round: Round } | null>(null);
  const [shown, setShown] = useState<{ a: Group[]; d: Group[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(15);
  const timers = useRef<number[]>([]);
  const id = detailId ?? '';

  const load = useCallback(async () => {
    try { const d = await get(`/battle/${id}`) as View; setV(d); setShown({ a: d.a, d: d.d }); }
    catch (e) { setGone((e as Error).message || 'This battle is over.'); }
  }, [id]);
  useEffect(() => { void load(); return () => timers.current.forEach(clearTimeout); }, [load]);

  const play = (round: Round, after: () => void) => {
    const slow = motion === 'full' ? 1 : 0;
    setFx({ key: Date.now(), round });
    timers.current.push(window.setTimeout(() => { setShown({ a: round.a, d: round.d }); }, slow ? 1500 : 0));
    timers.current.push(window.setTimeout(after, slow ? 2300 : 0));
  };

  const fire = useCallback(async () => {
    if (!v || busy || fin) return;
    setBusy(true);
    try {
      const r = await post(`/battle/${id}/round`, { stance, target, ability }) as View | Finished;
      if ('finished' in r) {
        const after = () => { setFin(r); setBusy(false); void refresh(); };
        if (r.last) play(r.last, after); else after();
      } else {
        play(r.last!, () => { setV(r); setAbility(null); setLeft(r.pickSeconds); setBusy(false); });
      }
    } catch (e) { setBusy(false); setGone((e as Error).message); }
  }, [v, busy, fin, id, stance, target, ability]); // eslint-disable-line react-hooks/exhaustive-deps

  const retreat = async () => {
    if (!v || busy || !confirm('Retreat? Your surviving ships fly home, the outpost stays standing and nothing is looted.')) return;
    setBusy(true);
    try { const r = await post(`/battle/${id}/retreat`) as Finished; setFin(r); void refresh(); } catch (e) { setGone((e as Error).message); }
    setBusy(false);
  };

  // the pick timer: when it runs out the orders chosen so far go in
  const fireRef = useRef(fire); fireRef.current = fire;
  useEffect(() => {
    if (!v || busy || fin) return;
    setLeft(v.pickSeconds);
    const t = window.setInterval(() => setLeft((s) => { if (s <= 1) { void fireRef.current(); return v.pickSeconds; } return s - 1; }), 1000);
    return () => clearInterval(t);
  }, [v, busy, fin]);

  if (!id) return <Page title="Battle"><Empty>No battle chosen.</Empty></Page>;
  if (gone && !fin) return <Page title="Battle"><Card><p>{gone}</p><button className="primary" onClick={() => setPage('messages')}>Open your messages</button> <button onClick={() => setPage('fleet')}>Back to Fleet</button></Card></Page>;
  if (!v || !shown) return <Page title="Battle"><Loading /></Page>;

  const rows = Math.max(1, Math.ceil(Math.min(14, Math.max(v.start.a.length, v.start.d.length)) / COLS));
  const H = 62 + rows * ROW_H + 14;
  const cd = v.cooldowns;
  const name = (gid: string) => v.names[gid] ?? (UNITS as any)[gid]?.name ?? gid;
  const order = (side: 0 | 1) => (side === 0 ? v.start.a : v.start.d).map((g) => g.id);
  const tileOf = (side: 0 | 1, gid: string) => { const i = order(side).indexOf(gid); return i < 0 ? null : tilePos(side, i); };
  const groupOf = (side: 0 | 1, gid: string) => (side === 0 ? shown.a : shown.d).find((g) => g.id === gid);
  const last = v.history[v.history.length - 1];
  const sideTiles = (side: 0 | 1) => order(side).slice(0, 14).map((gid, i) => {
    const p = tilePos(side, i), g = groupOf(side, gid), n = g?.n ?? 0, hp = g?.hullPct ?? 0;
    const lost = fx?.round.destroyed.find((x) => x.side === side && x.id === gid)?.n ?? 0;
    return (
      <g key={`${side}-${gid}`} className={`bt-tile s${side}${n ? '' : ' dead'}`} transform={`translate(${p.x} ${p.y})`}>
        <title>{`${fmt(n)}× ${name(gid)}${n ? `, hulls at ${hp}%` : ' (destroyed)'}`}</title>
        <rect width={TILE_W} height={ROW_H - 12} rx={10} />
        <image href={Art.icon(kindOf(gid), gid, name(gid))} x={8} y={8} width={44} height={44} />
        <text className="bt-name" x={60} y={22}>{name(gid)}</text>
        <text className="bt-n" x={60} y={42}>{fmt(n)}</text>
        <rect className="bt-bar" x={60} y={50} width={TILE_W - 72} height={5} rx={2.5} />
        <rect className={`bt-hp${hp < 40 ? ' low' : ''}`} x={60} y={50} width={Math.max(0, (TILE_W - 72) * (hp / 100))} height={5} rx={2.5} />
        {lost > 0 && fx && <text key={fx.key} className="bt-lost" x={TILE_W - 12} y={20} textAnchor="end">−{fmt(lost)}</text>}
      </g>
    );
  });

  const lasers = fx?.round.volleys.map((vo, i) => {
    const a = tileOf(vo.side, vo.from), b = tileOf((1 - vo.side) as 0 | 1, vo.to);
    if (!a || !b) return null;
    const x1 = a.x + (vo.side === 0 ? TILE_W : 0), y1 = a.y + (ROW_H - 12) / 2, x2 = b.x + (vo.side === 0 ? 0 : TILE_W), y2 = b.y + (ROW_H - 12) / 2;
    return (
      <g key={`${fx.key}-${i}`} className={`bt-volley s${vo.side}`} style={{ animationDelay: `${i * 70}ms` }}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} pathLength={1} style={{ strokeWidth: Math.min(6, 2.5 + Math.log10(vo.n + 1)) }} />
        <circle className="bt-hit" cx={x2} cy={y2} r={12} style={{ animationDelay: `${i * 70 + 380}ms` }} />
      </g>
    );
  });

  const outcome = fin ? (fin.retreated ? 'You retreated' : fin.winner === 'attacker' ? 'Victory' : fin.winner === 'defender' ? 'Defeat' : 'Draw') : '';
  const live = !fin && !busy;
  return (
    <Page title="Battle">
      <Card title={<>{v.outpost?.name ?? v.planet}{v.outpost ? ` (strength ${v.outpost.tier})` : ''} <CoordLink c={v.coords} /></>} right={<span className="muted small">Round {fin ? fin.rounds : Math.min(v.round + 1, v.maxRounds)} of {v.maxRounds}{!fin && <> · fights on its own in <Countdown to={v.deadline} /></>}</span>}>
        <svg className="btsvg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="The battle: your fleet on the left, the garrison on the right">
          <text className="bt-side" x={24} y={34}>Your fleet</text>
          <text className="bt-side" x={W - 24} y={34} textAnchor="end">Garrison</text>
          <line className="bt-mid" x1={W / 2} y1={50} x2={W / 2} y2={H - 14} />
          {sideTiles(0)}
          {sideTiles(1)}
          {lasers}
        </svg>
        {last && !fin && (
          <p className="small muted bt-note">Last round: you dealt {fmt(last.dealt)} and took {fmt(last.taken)}; you lost {fmt(last.lostMine)} ships and they lost {fmt(last.lostFoe)}. The garrison fought in a <b>{STANCE_WORD[last.foeStance].label.toLowerCase()}</b> stance.</p>
        )}
      </Card>

      {fin ? (
        <Card title={outcome}>
          <p>{fin.retreated ? 'Your fleet broke off and is flying home.' : fin.winner === 'attacker' ? 'The garrison is broken. Your fleet loads its loot and flies home.' : fin.winner === 'defender' ? 'The garrison held. What is left of your fleet flies home.' : 'Neither side could finish the other. Your fleet flies home.'}</p>
          <p className="small">You lost {fmt(fin.lostMine)} resources of ships, the garrison lost {fmt(fin.lostFoe)}. The full battle report, with loot and bounty, is in your messages.</p>
          <div className="row wrap"><button className="primary" onClick={() => setPage('messages')}>Open the battle report</button><button onClick={() => setPage('fleet')}>Back to Fleet</button></div>
        </Card>
      ) : (
        <Card title="Your orders for this round" right={<span className={`bt-timer${left <= 5 ? ' hot' : ''}`}>{busy ? 'Firing…' : `Auto-fire in ${left}s`}</span>}>
          <div className="bt-pick">
            <div><div className="bt-h">Stance</div>
              <div className="bt-opts">{(Object.keys(STANCE_WORD) as Stance[]).map((k) => <button key={k} className={stance === k ? 'on' : ''} disabled={!live} title={STANCE_WORD[k].text} onClick={() => setStance(k)}>{STANCE_WORD[k].label}</button>)}</div>
              <div className="small muted">{STANCE_WORD[stance].text}</div></div>
            <div><div className="bt-h">Aim</div>
              <div className="bt-opts">{(Object.keys(TARGET_WORD) as TargetMode[]).map((k) => <button key={k} className={target === k ? 'on' : ''} disabled={!live} title={TARGET_WORD[k].text} onClick={() => setTarget(k)}>{TARGET_WORD[k].label}</button>)}</div>
              <div className="small muted">{TARGET_WORD[target].text}</div></div>
            <div><div className="bt-h">Ability <span className="muted small">(one per round)</span></div>
              <div className="bt-opts">{(Object.keys(ABILITY_WORD) as Ability[]).map((k) => <button key={k} className={ability === k ? 'on' : ''} disabled={!live || cd[k] > 0} title={ABILITY_WORD[k].text} onClick={() => setAbility(ability === k ? null : k)}>{ABILITY_WORD[k].label}{cd[k] > 0 ? ` (${cd[k]})` : ''}</button>)}</div>
              <div className="small muted">{ability ? `${ABILITY_WORD[ability].text} Ready again after ${ABILITIES[ability].cooldown} rounds.` : 'None this round.'}</div></div>
          </div>
          <div className="row wrap">
            <button className="primary" disabled={!live} onClick={() => void fire()} data-tour="battle-fire">Fire!</button>
            <button disabled={!live} onClick={() => void retreat()}>Retreat</button>
            <span className="muted small">If the timer runs out, these orders go in. Retreating ends the fight: the outpost stands and nothing is looted.</span>
          </div>
        </Card>
      )}

      {(fin?.history ?? v.history).length > 0 && (
        <Card title="Rounds so far">
          <table className="btlog"><thead><tr><th>Round</th><th>Your orders</th><th>Garrison</th><th>You dealt</th><th>You took</th><th>Ships lost (you / them)</th></tr></thead>
            <tbody>{(fin?.history ?? v.history).map((h) => (
              <tr key={h.round}><td>{h.round}</td><td>{STANCE_WORD[h.stance].label}, {TARGET_WORD[h.target].label.toLowerCase()}{h.ability ? `, ${ABILITY_WORD[h.ability].label}` : ''}</td><td>{STANCE_WORD[h.foeStance].label}</td><td>{fmt(h.dealt)}</td><td>{fmt(h.taken)}</td><td>{fmt(h.lostMine)} / {fmt(h.lostFoe)}</td></tr>
            ))}</tbody></table>
        </Card>
      )}
      <span hidden>{now}</span>
    </Page>
  );
}
