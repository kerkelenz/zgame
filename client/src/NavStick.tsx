import type { ReactNode } from 'react';

/** The resource bar, the planet cards and the page tabs stay at the top of the scrolling page. */
export function NavStick({ children }: { children: ReactNode }) {
  return <div className="navstick">{children}</div>;
}
