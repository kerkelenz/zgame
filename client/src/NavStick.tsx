import { useEffect, useRef, useState, type ReactNode } from 'react';

const FOLD_KEY = 'zg.stripFolded';
const loadFolded = () => { try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; } };

/**
 * The planet bar and the page tabs stay at the top of the scrolling page. Once you have scrolled a little they shrink to a slim bar, and a
 * button folds the planet cards to that slim bar for good (remembered on this device), to leave the room to the page.
 */
export function NavStick({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [folded, setFolded] = useState(loadFolded);
  useEffect(() => {
    const scroller = ref.current?.closest('main');
    if (!scroller) return;
    const on = () => setScrolled(scroller.scrollTop > 90);
    on();
    scroller.addEventListener('scroll', on, { passive: true });
    return () => scroller.removeEventListener('scroll', on);
  }, []);
  const fold = () => { const next = !folded; setFolded(next); try { localStorage.setItem(FOLD_KEY, next ? '1' : '0'); } catch { /* ignore */ } };
  return (
    <div ref={ref} className={`navstick${scrolled || folded ? ' compact' : ''}${folded ? ' folded' : ''}`}>
      <button className="stickfold" onClick={fold} aria-pressed={folded} aria-label={folded ? 'Show the planet cards in full' : 'Fold the planet cards to a slim bar'} title={folded ? 'Show the planet cards in full' : 'Fold the planet cards to a slim bar'}>{folded ? '▾' : '▴'}</button>
      {children}
    </div>
  );
}
