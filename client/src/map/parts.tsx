import { useEffect, useState } from 'react';
import { get } from '../api';
import { useGame } from '../game';
import { flightProgress } from '../motion';
import { lerp, type Pt } from './geometry';

export interface Layers { fleets: boolean; territory: boolean; markers: boolean; alerts: boolean }
export const DEFAULT_LAYERS: Layers = { fleets: true, territory: true, markers: true, alerts: true };
export interface MoveView { id: string; kind: 'own' | 'hostile' | 'ally' | 'guest'; mission: string; phase: string; from: { g: number; s: number; p: number }; to: { g: number; s: number; p: number }; departAt: number; arriveAt: number; returnAt?: number; flightMs?: number; ships: number; owner: string }

/** a map level's data, fetched when it opens and refreshed every ten seconds while it stays open */
export function useMapData<T = any>(path: string): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    const load = () => get(path).then((d) => { if (live) setData(d as T); }).catch(() => undefined);
    void load();
    const t = setInterval(load, 10_000);
    return () => { live = false; clearInterval(t); };
  }, [path]);
  return data;
}

export const KIND_CLASS: Record<MoveView['kind'], string> = { own: 'own', hostile: 'hostile', ally: 'ally', guest: 'guest' };
export const MISSION_WORD: Record<string, string> = { attack: 'Attack', transport: 'Transport', deploy: 'Deploy', espionage: 'Spy', colonize: 'Colonize', recycle: 'Recycle', expedition: 'Expedition', hold: 'Defend', missile: 'Missiles', destroy: 'Moon strike', invade: 'Void front', scout: 'Scout', supply: 'Supply' };

/** a ship gliding along the line between two points, as far on its way as the clock says */
export function MovingShip({ a, b, m }: { a: Pt; b: Pt; m: MoveView }) {
  const { now } = useGame();
  const { frac, dir } = flightProgress(m, now);
  const p = lerp(a, b, frac);
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + (dir === 'back' ? 180 : 0);
  return (
    <g className={`mp-ship ${KIND_CLASS[m.kind]}${dir === 'hold' ? ' hold' : ''}`} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${angle.toFixed(0)})`}>
      <title>{`${MISSION_WORD[m.mission] ?? m.mission} (${m.kind === 'own' ? 'yours' : m.owner}), ${m.ships} ship${m.ships === 1 ? '' : 's'}, ${dir === 'back' ? 'returning' : dir === 'hold' ? 'holding' : `${Math.round(frac * 100)}% there`}`}</title>
      <path d="M -7 -5 L 8 0 L -7 5 L -3 0 Z" />
    </g>
  );
}

/** the line a movement follows, drawn faintly under its ship */
export const Route = ({ a, b, kind }: { a: Pt; b: Pt; kind: MoveView['kind'] }) => <line className={`mp-route ${KIND_CLASS[kind]}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;

/** the picture clip for round pictures that are not cut out */
export const RoundClip = () => <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs><clipPath id="mp-round" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5" /></clipPath></defs></svg>;
