import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UNITS, isDefense, isShip } from '../../shared/data';
import { Art } from './art';
import { beamCount, framesOf, iconPlan, iconsAlive, momentAt, roundStart, roundText, seeded, totalMs, type Census, type IconPlan, type ReplayData, type RoundFrame, type Side } from './replay';
import { fmt } from './ui';

const W = 860, H = 360, S = 34;
const COLOR: Record<Side, string> = { a: '#ffb347', d: '#55b7ff' };
const ease = (p: number) => 1 - (1 - p) * (1 - p);

const images = new Map<string, HTMLImageElement>();
function picture(id: string): HTMLImageElement | null {
  const kind = isShip(id) ? 'ship' : isDefense(id) ? 'defense' : null;
  if (!kind) return null;
  const url = Art.icon(kind, id, UNITS[id as keyof typeof UNITS]?.name ?? id);
  let img = images.get(url);
  if (!img) { img = new Image(); img.src = url; images.set(url, img); }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

interface Spot { id: string; k: number; x: number; y: number }
/** where each picture stands: types in blocks, columns running away from the middle, centred up and down */
function formation(plan: IconPlan, side: Side): Spot[] {
  const order = Object.keys(plan.icons).sort((x, y) => plan.icons[y] - plan.icons[x]);
  const rows = Math.max(1, Math.min(6, Math.ceil(Object.values(plan.icons).reduce((a, b) => a + b, 0) / 4)));
  const out: Spot[] = [];
  let slot = 0;
  for (const id of order) for (let k = 0; k < plan.icons[id]; k++, slot++) {
    const col = Math.floor(slot / rows), row = slot % rows;
    const x = side === 'a' ? 370 - col * (S + 12) : 490 + col * (S + 12);
    out.push({ id, k, x, y: H / 2 - ((rows - 1) * (S + 12)) / 2 + row * (S + 12) - 6 });
  }
  return out;
}

const stars = (() => { const r = seeded(11); return Array.from({ length: 70 }, () => ({ x: r() * W, y: r() * H, a: 0.2 + r() * 0.6, s: r() < 0.15 ? 2 : 1 })); })();

interface Scene { frames: RoundFrame[]; plans: Record<Side, IconPlan>; spots: Record<Side, Spot[]>; first: { a: Census; d: Census }; winner: string }

function draw(ctx: CanvasRenderingContext2D, sc: Scene, t: number, motion: boolean) {
  const rounds = sc.frames.length;
  const m = momentAt(t, rounds);
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#070b18'); bg.addColorStop(1, '#0d1430');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  for (const s of stars) { ctx.fillStyle = `rgba(255,255,255,${s.a})`; ctx.fillRect(s.x, s.y, s.s, s.s); }
  // the planet being fought over
  const pg = ctx.createRadialGradient(W - 40, H + 30, 20, W - 40, H + 30, 190);
  pg.addColorStop(0, 'rgba(90,140,200,.55)'); pg.addColorStop(1, 'rgba(90,140,200,0)');
  ctx.fillStyle = pg; ctx.fillRect(W - 260, H - 200, 260, 230);
  ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(W / 2, 20); ctx.lineTo(W / 2, H - 30); ctx.stroke(); ctx.setLineDash([]);

  const f = rounds ? sc.frames[m.round] : null;
  const phase = motion ? m.phase : 'rest';
  const fin = m.phase === 'outro';
  const aliveBefore = (s: Side) => iconsAlive(sc.plans[s], f ? f.before[s] : sc.first[s]);
  const aliveAfter = (s: Side) => iconsAlive(sc.plans[s], f ? f.after[s] : sc.first[s]);
  const intro = m.phase === 'intro' && motion ? ease(m.p) : 1;

  const standing: Record<Side, { s: Spot; dying: boolean; x: number; y: number }[]> = { a: [], d: [] };
  for (const side of ['a', 'd'] as Side[]) {
    const before = aliveBefore(side), after = aliveAfter(side);
    // after the hits of this round (or in the quiet that follows) only the survivors stand; before them, everyone of the round's start
    const useAfter = fin || (!motion) || phase === 'rest';
    for (const s of sc.spots[side]) {
      const aliveB = s.k < (before[s.id] ?? 0), aliveA = s.k < (after[s.id] ?? 0);
      if (!aliveB && !(useAfter && aliveA)) continue;
      const dying = aliveB && !aliveA;
      if (useAfter && dying) continue;
      const slide = (1 - intro) * (side === 'a' ? -220 : 220);
      standing[side].push({ s, dying, x: s.x + slide, y: s.y + (motion ? Math.sin(t / 420 + s.k * 1.7 + (side === 'a' ? 0 : 2)) * 2 : 0) });
    }
  }

  // beams and impacts
  if (motion && f && (m.phase === 'fire' || m.phase === 'hit')) {
    for (const side of ['a', 'd'] as Side[]) {
      const other: Side = side === 'a' ? 'd' : 'a';
      const mine = standing[side], theirs = standing[other];
      if (!mine.length || !theirs.length) continue;
      const shots = f.stats ? f.stats[side].shots : 20;
      const n = beamCount(shots);
      const rnd = seeded(m.round * 977 + (side === 'a' ? 1 : 2));
      const absorbedShare = f.stats ? f.stats[side].absorbed / Math.max(1, f.stats[side].absorbed + f.stats[side].damage) : 0;
      for (let b = 0; b < n; b++) {
        const src = mine[Math.floor(rnd() * mine.length)], dst = theirs[Math.floor(rnd() * theirs.length)];
        const start = (b / n) * 0.35, q = m.phase === 'fire' ? (m.p - start) / 0.65 : 1 + m.p;
        const sx = src.x + S / 2, sy = src.y + S / 2, dx = dst.x + S / 2, dy = dst.y + S / 2;
        if (q > 0 && q < 1) {
          const head = Math.min(1, q), tail = Math.max(0, q - 0.14);
          ctx.strokeStyle = COLOR[side]; ctx.lineWidth = 2; ctx.shadowColor = COLOR[side]; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.moveTo(sx + (dx - sx) * tail, sy + (dy - sy) * tail); ctx.lineTo(sx + (dx - sx) * head, sy + (dy - sy) * head); ctx.stroke();
          ctx.shadowBlur = 0;
        } else if (q >= 1 && q < 1.6) {
          const k = (q - 1) / 0.6;
          ctx.strokeStyle = `rgba(${side === 'a' ? '255,200,120' : '140,210,255'},${1 - k})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(dx, dy, 4 + k * 16, 0, Math.PI * 2); ctx.stroke();
          if (absorbedShare > 0.25) { ctx.strokeStyle = `rgba(120,230,255,${(1 - k) * Math.min(0.9, absorbedShare)})`; ctx.beginPath(); ctx.arc(dx, dy, S * 0.62, 0, Math.PI * 2); ctx.stroke(); }
        }
      }
    }
  }

  // the ships
  for (const side of ['a', 'd'] as Side[]) {
    for (const o of standing[side]) {
      const img = picture(o.s.id);
      let alpha = 1, scale = 1;
      if (o.dying && motion && m.phase === 'hit') { alpha = 1 - ease(m.p); scale = 1 + m.p * 0.6; }
      ctx.save();
      ctx.globalAlpha = alpha;
      const cx = o.x + S / 2, cy = o.y + S / 2;
      ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
      if (img) {
        ctx.save();
        ctx.beginPath(); ctx.roundRect(o.x, o.y, S, S, 6); ctx.clip();
        ctx.drawImage(img, o.x, o.y, S, S);
        ctx.restore();
      } else { ctx.fillStyle = '#1a2440'; ctx.beginPath(); ctx.roundRect(o.x, o.y, S, S, 6); ctx.fill(); }
      ctx.strokeStyle = COLOR[side]; ctx.globalAlpha = alpha * 0.9; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(o.x, o.y, S, S, 6); ctx.stroke();
      ctx.restore();
      if (o.dying && motion && m.phase === 'hit') {
        const rnd = seeded(o.s.k * 31 + o.s.id.length * 7 + m.round * 101);
        for (let i = 0; i < 7; i++) {
          const ang = rnd() * Math.PI * 2, d = ease(m.p) * (14 + rnd() * 22);
          ctx.fillStyle = `rgba(255,${150 + Math.floor(rnd() * 90)},60,${1 - m.p})`;
          ctx.beginPath(); ctx.arc(o.x + S / 2 + Math.cos(ang) * d, o.y + S / 2 + Math.sin(ang) * d, 2.5 * (1 - m.p) + 1, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = `rgba(255,220,150,${1 - m.p})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(o.x + S / 2, o.y + S / 2, 6 + m.p * 30, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  // the numbers: units alive per side, easing from the start of the round to its end during the hits
  const total = (c: Census) => Object.values(c).reduce((a: number, n) => a + (n ?? 0), 0);
  const shown = (s: Side) => {
    const b = total(f ? f.before[s] : sc.first[s]), a = total(f ? f.after[s] : sc.first[s]);
    if (!motion || !f) return a;
    if (fin || m.phase === 'rest') return a;
    if (m.phase === 'hit') return Math.round(b + (a - b) * ease(m.p));
    return b;
  };
  ctx.font = '600 14px "IBM Plex Mono", monospace'; ctx.textBaseline = 'top';
  ctx.fillStyle = COLOR.a; ctx.textAlign = 'left'; ctx.fillText(`ATTACKERS  ${fmt(shown('a'))}`, 16, 12);
  ctx.fillStyle = COLOR.d; ctx.textAlign = 'right'; ctx.fillText(`${fmt(shown('d'))}  DEFENDERS`, W - 16, 12);
  ctx.fillStyle = '#c9d3ee'; ctx.textAlign = 'center';
  ctx.fillText(rounds ? `Round ${Math.min(rounds, m.round + 1)} of ${rounds}` : 'No fighting', W / 2, 12);

  // what is left, by type, under each fleet
  const chips = (side: Side, census: Census) => {
    const entries = Object.entries(census).filter(([, n]) => (n ?? 0) > 0).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0)).slice(0, 5);
    let x = side === 'a' ? 16 : W - 16;
    ctx.font = '12px "IBM Plex Mono", monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = side === 'a' ? 'left' : 'right';
    for (const [id, n] of entries) {
      const label = `${UNITS[id as keyof typeof UNITS]?.name ?? id} ${fmt(n ?? 0)}`;
      const wTxt = ctx.measureText(label).width + 8;
      ctx.fillStyle = 'rgba(8,12,26,.75)'; ctx.fillRect(side === 'a' ? x : x - wTxt, H - 28, wTxt, 20);
      ctx.fillStyle = '#c9d3ee'; ctx.fillText(label, side === 'a' ? x + 4 : x - 4, H - 18);
      x += side === 'a' ? wTxt + 4 : -(wTxt + 4);
    }
  };
  const now = (s: Side) => (fin || !motion || m.phase === 'rest' ? (f ? f.after[s] : sc.first[s]) : (f ? f.before[s] : sc.first[s]));
  chips('a', now('a')); chips('d', now('d'));

  if (fin && motion) {
    const k = ease(m.p);
    ctx.fillStyle = `rgba(5,8,16,${0.55 * k})`; ctx.fillRect(0, H / 2 - 36, W, 72);
    ctx.font = '700 26px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.fillText(sc.winner, W / 2, H / 2);
  }
}

/** The animated replay of a battle: both fleets as rows of pictures, beams across the gap, ships bursting as they die, with controls and the text of each round below. */
export function BattleReplay({ d }: { d: ReplayData & { winner?: string; rounds?: number } }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frames = useMemo(() => framesOf(d), [d]);
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const scene: Scene = useMemo(() => {
    const first = { a: d.roundLog[0].a, d: d.roundLog[0].d };
    const plans = { a: iconPlan(first.a), d: iconPlan(first.d) };
    return { frames, plans, spots: { a: formation(plans.a, 'a'), d: formation(plans.d, 'd') }, first, winner: d.winner === 'attacker' ? 'ATTACKERS WIN' : d.winner === 'defender' ? 'DEFENDERS HOLD' : 'DRAW' };
  }, [d, frames]);
  const end = totalMs(frames.length);
  const t = useRef(reduced ? roundStart(0) : -200);
  const [shown, setShown] = useState(t.current);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1); speedRef.current = speed;

  const paint = useCallback(() => {
    const c = canvas.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, scene, t.current, !reduced);
  }, [scene, reduced]);

  useEffect(() => {
    let raf = 0, last = performance.now(), slow = 0, held = 0;
    const loop = (now: number) => {
      const dt = Math.min(80, now - last); last = now;
      if (playing) {
        if (reduced) { held += dt * speedRef.current; if (held > 1400) { held = 0; t.current = Math.min(end, roundStart(Math.min(frames.length - 1, Math.floor((t.current - roundStart(0)) / (roundStart(1) - roundStart(0))) + 1))); } }
        else t.current = Math.min(end, t.current + dt * speedRef.current);
        if (t.current >= end) setPlaying(false);
      }
      paint();
      slow += dt; if (slow > 90) { slow = 0; setShown(t.current); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, paint, end, reduced, frames.length]);

  const m = momentAt(t.current, frames.length);
  const roundIdx = frames.length ? m.round : 0;
  // before the first round has begun, Next goes to round one, not round two
  const shownRound = m.phase === 'intro' ? -1 : roundIdx;
  const jump = (v: number) => { t.current = Math.max(-200, Math.min(end, v)); setShown(t.current); paint(); };
  const goRound = (r: number) => jump(roundStart(Math.max(0, Math.min(frames.length - 1, r))) + 5);
  const text = frames[roundIdx] ? roundText(frames[roundIdx], fmt) : 'Nothing was fired.';
  void shown;

  return (
    <div className="replay">
      <canvas ref={canvas} width={W} height={H} role="img" aria-label="Animated replay of the battle" />
      <div className="row replayctl">
        <button className="primary" onClick={() => { if (t.current >= end) jump(-200); setPlaying(!playing || t.current >= end); }} aria-label={playing && t.current < end ? 'Pause' : t.current >= end ? 'Watch again' : 'Play'}>{playing && t.current < end ? '⏸ Pause' : t.current >= end ? '↺ Again' : '▶ Play'}</button>
        <button onClick={() => { setPlaying(false); goRound(shownRound - 1); }} aria-label="Previous round" disabled={!frames.length}>◀ Round</button>
        <button onClick={() => { setPlaying(false); goRound(shownRound + 1); }} aria-label="Next round" disabled={!frames.length}>Round ▶</button>
        <input type="range" min={-200} max={end} step={10} value={Math.round(t.current)} onChange={(e) => { setPlaying(false); jump(Number(e.target.value)); }} aria-label="Position in the replay" />
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Speed">
          {[0.5, 1, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
      </div>
      <p className="muted small" aria-live="polite">{text}</p>
    </div>
  );
}


/** a button that opens the replay under it, so a page full of reports does not start animations nobody asked for */
export function ReplayToggle({ d, startOpen }: { d: ReplayData & { winner?: string; rounds?: number }; startOpen?: boolean }) {
  const [open, setOpen] = useState(!!startOpen);
  return open
    ? <><BattleReplay d={d} /><button className="link" onClick={() => setOpen(false)}>Hide the replay</button></>
    : <button className="primary" onClick={() => setOpen(true)}>▶ Watch the replay</button>;
}
