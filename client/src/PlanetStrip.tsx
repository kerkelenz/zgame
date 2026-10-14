import { useEffect, useRef, useState } from 'react';
import { ROLES } from '../../shared/roles';
import { useAdvice } from './AdviceCard';
import { Art } from './art';
import { useGame } from './game';
import { isPlanetPage } from './nav';
import { worldGroups } from './planetBar';
import { PlanetRes } from './PlanetRes';
import { CoordLink, fmtDur } from './ui';

type WorldView = ReturnType<typeof useGame>['planets'][number];
interface Tag { text: string; kind: 'bad' | 'warn' | 'info' }

/** what needs attention on a planet or moon: an attack on the way, an idle queue, a full store, short energy, or the time left on what is being built */
function useTags(): (w: WorldView) => Tag[] {
  const { fleets, now } = useGame();
  const advice = useAdvice();
  return (w) => {
    const out: Tag[] = [];
    const hits = (fleets.incoming as any[]).filter((f) => !f.ally && f.to.g === w.coords.g && f.to.s === w.coords.s && f.to.p === w.coords.p && !!f.toMoon === !!w.isMoon);
    if (hits.length) out.push({ text: `attack in ${fmtDur(Math.max(0, Math.min(...hits.map((f) => f.arriveAt)) - now))}`, kind: 'bad' });
    const mine = advice.filter((x) => x.planetId === w.id);
    if (mine.some((x) => x.id.startsWith('idle-build'))) out.push({ text: 'idle', kind: 'warn' });
    else if (w.buildQueue) out.push({ text: `building ${fmtDur(Math.max(0, w.buildQueue.end - now))}`, kind: 'info' });
    if (mine.some((x) => x.id.startsWith('full:'))) out.push({ text: 'store full', kind: 'warn' });
    if (mine.some((x) => x.id.startsWith('energy:'))) out.push({ text: 'low energy', kind: 'warn' });
    return out;
  };
}
const Tags = ({ tags }: { tags: Tag[] }) => <>{tags.map((t) => <span key={t.text} className={`ptag ${t.kind}`}>{t.text}</span>)}</>;
const roleLabel = (w: WorldView) => ROLES.find((r) => r.id === w.role)?.label;

/**
 * Your planets, each a card with its name, role, coordinates, stock and what needs attention, the moon as a smaller part of its planet's card.
 * One row that scrolls sideways when there are many. Dimmed on pages that are not about a single planet.
 */
export function PlanetStrip() {
  const { planets, planet, selectPlanet, page } = useGame();
  const tagsFor = useTags();
  const strip = useRef<HTMLDivElement>(null);
  // the selected card stays in view when the row scrolls (many planets, or a narrow window)
  useEffect(() => { strip.current?.querySelector<HTMLElement>('.pchip.in')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [planet?.id]);
  if (!planet) return null;
  const applies = isPlanetPage(page);
  const groups = worldGroups(planets);
  const dim = applies ? '' : ' dim';
  const dimTitle = applies ? undefined : 'This page is not about a single planet';

  const moonChip = (m: WorldView) => (
    <button className={`pmoon${m.id === planet.id ? ' on' : ''}`} onClick={() => selectPlanet(m.id)} aria-pressed={m.id === planet.id} aria-label={`Moon ${m.name}`}>
      <img src={Art.planet(m.id, m.maxTemp, true)} alt="" /><span className="pn">{m.name}</span><Tags tags={tagsFor(m)} />
    </button>
  );
  const moonRes = (m: WorldView) => <PlanetRes w={m} tour={m.id === planet.id} energy={false} />;

  return (
    <div className={`pstrip${dim}`} role="group" aria-label="Your planets" title={dimTitle} ref={strip}>
      {groups.map(({ planet: p, moon }) => (
        <div key={p.id} className={`pchip${p.id === planet.id || moon?.id === planet.id ? ' in' : ''}${p.id === planet.id ? ' on' : ''}`}>
          <button className="pmain" onClick={() => selectPlanet(p.id)} aria-pressed={p.id === planet.id} aria-label={`Planet ${p.name}`}>
            <img className="pimg" src={Art.planet(p.id, p.maxTemp, false)} alt="" />
            <span className="ptext"><b>{p.name}</b>{roleLabel(p) && <span className="prole">{roleLabel(p)}</span>}</span>
          </button>
          <div className="pmeta"><CoordLink c={p.coords} /><Tags tags={tagsFor(p)} /></div>
          <PlanetRes w={p} tour={p.id === planet.id} />
          {moon && <div className="pchild">{moonChip(moon)}{moonRes(moon)}</div>}
        </div>
      ))}
    </div>
  );
}
