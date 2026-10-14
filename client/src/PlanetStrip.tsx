import { useEffect, useRef, useState } from 'react';
import { ROLES } from '../../shared/roles';
import { useAdvice } from './AdviceCard';
import { Art } from './art';
import { useGame } from './game';
import { isPlanetPage } from './nav';
import { filterGroups, positionOf, useList, worldGroups } from './planetBar';
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
 * Your planets, each with its name, role, coordinates and what needs attention, the moon as a smaller part of its planet's chip. With many
 * planets one switcher button (arrows, "3 of 7") opens a list you can search. Dimmed on pages that are not about a single planet.
 */
export function PlanetStrip() {
  const { planets, planet, selectPlanet, page } = useGame();
  const tagsFor = useTags();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);
  if (!planet) return null;
  const applies = isPlanetPage(page);
  const groups = worldGroups(planets);
  const pick = (id: string) => { selectPlanet(id); setOpen(false); setQ(''); };
  const dim = applies ? '' : ' dim';
  const dimTitle = applies ? undefined : 'This page is not about a single planet';

  const moonChip = (m: WorldView) => (
    <button className={`pmoon${m.id === planet.id ? ' on' : ''}`} onClick={() => pick(m.id)} aria-pressed={m.id === planet.id} aria-label={`Moon ${m.name}`}>
      <img src={Art.planet(m.id, m.maxTemp, true)} alt="" /><span className="pn">{m.name}</span><Tags tags={tagsFor(m)} />
    </button>
  );
  const moonRes = (m: WorldView) => <PlanetRes w={m} tour={m.id === planet.id} energy={false} />;

  if (!useList(groups)) {
    return (
      <div className={`pstrip${dim}`} role="group" aria-label="Your planets" title={dimTitle}>
        {groups.map(({ planet: p, moon }) => (
          <div key={p.id} className={`pchip${p.id === planet.id || moon?.id === planet.id ? ' in' : ''}${p.id === planet.id ? ' on' : ''}`}>
            <button className="pmain" onClick={() => pick(p.id)} aria-pressed={p.id === planet.id} aria-label={`Planet ${p.name}`}>
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

  const { index, total } = positionOf(groups, planet.id);
  const base = groups[index].planet;
  const step = (d: number) => selectPlanet(groups[(index + d + total) % total].planet.id);
  const shown = filterGroups(groups, q);
  return (
    <div className={`pstrip pswitch${dim}`} role="group" aria-label="Your planets" title={dimTitle} ref={box}>
      <button className="parrow" onClick={() => step(-1)} aria-label="Previous planet" title="Previous planet ([)">◀</button>
      <button className="pcur" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog">
        <img className="pimg" src={Art.planet(planet.id, planet.maxTemp, !!planet.isMoon)} alt="" />
        <span className="ptext"><b>{planet.isMoon ? `Moon of ${base.name}` : planet.name}</b><span className="muted small">{index + 1} of {total}{roleLabel(base) ? ` · ${roleLabel(base)}` : ''} ▾</span></span>
      </button>
      <button className="parrow" onClick={() => step(1)} aria-label="Next planet" title="Next planet (])">▶</button>
      <span className="pmeta"><CoordLink c={planet.coords} /><Tags tags={tagsFor(planet)} /></span>
      {open && (
        <div className="ppop" role="dialog" aria-label="All planets">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or coordinates" aria-label="Search planets" autoFocus />
          <ul>
            {shown.map(({ planet: p, moon }) => {
              const n = groups.findIndex((g) => g.planet.id === p.id) + 1;
              return (
                <li key={p.id}>
                  <div className={`prow${p.id === planet.id ? ' on' : ''}`}>
                    <button className="pmain" onClick={() => pick(p.id)} aria-label={`Planet ${p.name}`}>
                      <span className="pnum">{n <= 9 ? n : ''}</span><img className="pimg sm" src={Art.planet(p.id, p.maxTemp, false)} alt="" />
                      <span className="ptext"><b>{p.name}</b>{roleLabel(p) && <span className="prole">{roleLabel(p)}</span>}</span>
                    </button>
                    <span className="pmeta"><CoordLink c={p.coords} /><Tags tags={tagsFor(p)} /></span>
                  </div>
                  {moon && <div className="pchild">{moonChip(moon)}</div>}
                </li>
              );
            })}
            {shown.length === 0 && <li className="muted small" style={{ padding: 8 }}>No planet matches.</li>}
          </ul>
          <p className="muted small" style={{ margin: '4px 8px' }}>Keys 1 to 9 jump to a planet, [ and ] step through them.</p>
        </div>
      )}
    </div>
  );
}
