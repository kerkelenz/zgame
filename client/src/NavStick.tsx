import { useEffect, useRef, useState, type ReactNode } from 'react';

/** The planet bar and the page tabs stay at the top of the scrolling page. Once you have scrolled a little they shrink to a slim bar. */
export function NavStick({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const scroller = ref.current?.closest('main');
    if (!scroller) return;
    const on = () => setCompact(scroller.scrollTop > 90);
    on();
    scroller.addEventListener('scroll', on, { passive: true });
    return () => scroller.removeEventListener('scroll', on);
  }, []);
  return <div ref={ref} className={`navstick${compact ? ' compact' : ''}`}>{children}</div>;
}
