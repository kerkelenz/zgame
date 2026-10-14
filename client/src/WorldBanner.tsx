import type { ReactNode } from 'react';
import { Art } from './art';
import { lookName } from './PlanetHero';

/** A slim banner of a planet or moon (its look) with the facts written over it; nothing at all when that look has no banner */
export function WorldBanner({ look, isMoon = false, children }: { look?: string | null; isMoon?: boolean; children?: ReactNode }) {
  const url = Art.bannerOfLook(look, isMoon);
  if (!url) return children ? <div className="wbanner plain">{children}</div> : null;
  return (
    <div className="wbanner" style={{ backgroundImage: `url(${url})` }} role="img" aria-label={lookName(look, isMoon)}>
      <span className="wbkind">{lookName(look, isMoon)}</span>
      <div className="wbtext">{children}</div>
    </div>
  );
}
