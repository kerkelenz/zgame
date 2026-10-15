import { useCallback, useEffect, useState } from 'react';
import { useGame } from '../game';
import { Card, Page } from '../ui';
import { GalaxyView } from '../map/GalaxyView';
import { PlanetView } from '../map/PlanetView';
import { SystemView } from '../map/SystemView';
import { UniverseView } from '../map/UniverseView';
import { crumbs, depth, parentOf, type MapAt } from '../map/geometry';
import { DEFAULT_LAYERS, type Layers } from '../map/parts';

/** other pages (the Galaxy list) leave the place to open the map at here */
export const MAP_AT_KEY = 'zg.mapAt';
const LAYER_KEY = 'zg.mapLayers';
const LEVEL_WORD: Record<MapAt['level'], string> = { universe: 'All galaxies', galaxy: 'Galaxy', system: 'System', planet: 'Planet' };

function startAt(home: { g: number; s: number }): MapAt {
  try {
    const raw = sessionStorage.getItem(MAP_AT_KEY);
    if (raw) { sessionStorage.removeItem(MAP_AT_KEY); const v = JSON.parse(raw) as { g: number; s: number }; if (v?.g && v?.s) return { level: 'system', g: v.g, s: v.s }; }
  } catch { /* none */ }
  return { level: 'system', g: home.g, s: home.s };
}
const loadLayers = (): Layers => { try { return { ...DEFAULT_LAYERS, ...(JSON.parse(localStorage.getItem(LAYER_KEY) || '{}') as Partial<Layers>) }; } catch { return DEFAULT_LAYERS; } };

/**
 * The Map: the galaxy from above at four zoom levels. Click to zoom in (a galaxy, a system, a planet), use the trail, the Zoom out button or
 * Escape to zoom out. What is drawn about other commanders' worlds is limited to what is public and what the commander's own spy reports found.
 */
export function GameMap() {
  const { planet } = useGame();
  const [at, setAt] = useState<MapAt>(() => startAt({ g: planet.coords.g, s: planet.coords.s }));
  const [zoom, setZoom] = useState<'in' | 'out'>('in');
  const [layers, setLayers] = useState<Layers>(loadLayers);
  const go = useCallback((next: MapAt) => { setZoom(depth(next.level) >= depth(at.level) ? 'in' : 'out'); setAt(next); }, [at.level]);
  const up = useCallback(() => { const p = parentOf(at); if (p) go(p); }, [at, go]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('input, textarea, select')) up(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [up]);
  const toggle = (k: keyof Layers) => { const next = { ...layers, [k]: !layers[k] }; setLayers(next); try { localStorage.setItem(LAYER_KEY, JSON.stringify(next)); } catch { /* ignore */ } };
  const trail = crumbs(at);
  const view = at.level === 'universe' ? <UniverseView layers={layers} open={(g) => go({ level: 'galaxy', g })} />
    : at.level === 'galaxy' ? <GalaxyView g={at.g!} layers={layers} open={(s) => go({ level: 'system', g: at.g, s })} />
    : at.level === 'system' ? <SystemView g={at.g!} s={at.s!} layers={layers} open={(pl) => go({ level: 'planet', g: at.g, s: at.s, planetId: pl.id, planetName: pl.name })} />
    : <PlanetView planetId={at.planetId!} layers={layers} open={(id, name) => go({ ...at, planetId: id, planetName: name })} again={up} />;
  return (
    <Page title="Map">
      <div className="row wrap between mapbar">
        <div className="maptrail" role="navigation" aria-label="Where you are on the map">
          {trail.map((c, i) => <span key={c.label}>{i > 0 && <span className="muted"> › </span>}{i === trail.length - 1 ? <b aria-current="location">{c.label}</b> : <button className="link" onClick={() => go(c.to)}>{c.label}</button>}</span>)}
        </div>
        <span className="row wrap">
          <button onClick={up} disabled={at.level === 'universe'} title="One level out (Escape)">▲ Zoom out</button>
          <span className="muted small">{LEVEL_WORD[at.level]}</span>
        </span>
      </div>
      <div className={`mapstage zoom-${zoom}`} key={`${at.level}:${at.g ?? ''}:${at.s ?? ''}:${at.planetId ?? ''}`}>{view}</div>
      <Card>
        <div className="row wrap small maplegend">
          <label className="row"><input type="checkbox" checked={layers.fleets} onChange={() => toggle('fleets')} /> Fleets in flight</label>
          <label className="row"><input type="checkbox" checked={layers.territory} onChange={() => toggle('territory')} /> Territory and alliances</label>
          <label className="row"><input type="checkbox" checked={layers.markers} onChange={() => toggle('markers')} /> Rift, outposts, debris</label>
          <label className="row"><input type="checkbox" checked={layers.alerts} onChange={() => toggle('alerts')} /> Attack alerts</label>
        </div>
        <div className="row wrap small muted maplegend">
          <span><i className="lg own" /> yours</span><span><i className="lg ally" /> alliance</span><span><i className="lg other" /> others</span><span><i className="lg npc" /> computer empires</span>
          <span><i className="lg hostile" /> hostile fleet or alert</span><span>☠ outpost</span><span>✦ debris</span><span>☄ Void rift</span><span>🛡 defense · ⚔ fleet (≈ from your spy report)</span>
        </div>
      </Card>
    </Page>
  );
}
