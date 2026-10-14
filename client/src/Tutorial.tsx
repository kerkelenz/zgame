import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame } from './game';
import { STEPS, setTutorialStep, settle, stopTutorial, useTutorial } from './tutorialSteps';

interface Box { x: number; y: number; w: number; h: number }
const PAD = 6;

/** the target, or on a phone the Menu button when the target lives in the (hidden) side menu */
function findTarget(name: string | undefined): { el: HTMLElement | null; viaMenu: boolean } {
  if (!name) return { el: null, viaMenu: false };
  const visible = (e: Element | null): e is HTMLElement => !!e && (e as HTMLElement).getClientRects().length > 0;
  // the desktop menu and the phone tab bar can both carry the name: whichever one is showing
  const el = [...document.querySelectorAll(`[data-tour="${name}"]`)].find(visible) ?? null;
  if (el) return { el, viaMenu: false };
  if (name.startsWith('nav-')) { const menu = document.querySelector('[data-tour="nav-menu"]'); if (visible(menu)) return { el: menu, viaMenu: true }; }
  return { el: null, viaMenu: false };
}

/** The tutorial overlay: dims the page around the target, which stays clickable, and says what to do. Moves on when the game shows it was done. */
export function Tutorial() {
  const { me, planet, page } = useGame();
  const t = useTutorial();
  const [box, setBox] = useState<Box | null>(null);
  const [viaMenu, setViaMenu] = useState(false);
  const tip = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef('');
  const step = t?.active && t.i < STEPS.length ? STEPS[t.i] : null;

  // moves on by itself when the game shows the step was done (and skips steps that are already done)
  useEffect(() => {
    if (!t?.active || !me || !planet) return;
    const next = settle(t.i, { page, planet, me });
    if (next !== t.i) setTutorialStep(next);
  }, [t, me, planet, page]);

  // follow the target: it can appear late, move when the page scrolls and resize with the window
  useLayoutEffect(() => {
    if (!step) { setBox(null); return; }
    const measure = () => {
      const { el, viaMenu: menu } = findTarget(step.target);
      setViaMenu(menu);
      if (!el) { setBox(null); return; }
      if (scrolledFor.current !== step.id) {
        scrolledFor.current = step.id;
        const r = el.getBoundingClientRect();
        if (r.top < 70 || r.bottom > window.innerHeight - 70) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      const r = el.getBoundingClientRect();
      setBox((old) => (old && Math.abs(old.x - r.x) < 0.5 && Math.abs(old.y - r.y) < 0.5 && Math.abs(old.w - r.width) < 0.5 && Math.abs(old.h - r.height) < 0.5 ? old : { x: r.x, y: r.y, w: r.width, h: r.height }));
    };
    measure();
    const timer = setInterval(measure, 250);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { clearInterval(timer); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [step]);

  if (!step || !me) return null;
  const last = step.id === STEPS[STEPS.length - 1].id;
  const waits = !!step.done;
  const narrow = window.innerWidth < 760;
  // the note sits below the target (or above it when there is no room); on a phone it stays at the top, clear of the tab bar
  const style: React.CSSProperties = (() => {
    if (!box || narrow) return narrow ? { top: 74, left: 8, right: 8 } : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    const w = 340, h = tip.current?.offsetHeight ?? 160;
    const below = box.y + box.h + PAD + 12 + h < window.innerHeight;
    const top = below ? box.y + box.h + PAD + 12 : Math.max(8, box.y - PAD - 12 - h);
    const left = Math.min(Math.max(8, box.x + box.w / 2 - w / 2), window.innerWidth - w - 8);
    return { top, left, width: w };
  })();

  return (
    <div className="tut" aria-live="polite">
      {box ? <div className="tutspot" style={{ left: box.x - PAD, top: box.y - PAD, width: box.w + PAD * 2, height: box.h + PAD * 2 }} /> : <div className="tutdim" />}
      <div className="tutnote" ref={tip} style={style} role="dialog" aria-label="Tutorial">
        <div className="muted small">Tutorial · {STEPS.indexOf(step) + 1} of {STEPS.length}</div>
        <h3>{step.title}</h3>
        <p>{step.text}{viaMenu ? ' (Open the Menu at the bottom first.)' : ''}</p>
        {waits && <p className="small tutwait">{box ? 'Do it, and the tutorial carries on.' : 'Waiting for you to do it.'}</p>}
        <div className="row">
          <button className="link" onClick={stopTutorial}>Skip tutorial</button>
          <span className="spacer" />
          {waits && <button onClick={() => setTutorialStep(STEPS.indexOf(step) + 1)}>Skip this step</button>}
          {!waits && <button className="primary" onClick={() => (last ? stopTutorial() : setTutorialStep(STEPS.indexOf(step) + 1))}>{last ? 'Finish' : 'Next'}</button>}
        </div>
      </div>
    </div>
  );
}
