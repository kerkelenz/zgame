import { useState } from 'react';
import { useGame } from './game';
import { groupOfPage, hubTarget, loadLastPages } from './nav';
import { useBadges, useVisibleNav } from './NavParts';
import { t } from './i18n';

/** On a phone the hubs are a bar at the bottom: the five you use most, and More for the Alliance hub and the rest. Hidden on wide screens. */
export const BAR_HUBS = ['home', 'build', 'fleet', 'galaxy', 'inbox'];

export function MobileBar() {
  const { me, page, setPage } = useGame();
  const groups = useVisibleNav();
  const badges = useBadges();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const here = groupOfPage(page);
  const inBar = BAR_HUBS.includes(here);
  const go = (id: string) => { setOpen(false); setPage(id); };
  const more = groups.filter((g) => !BAR_HUBS.includes(g.id));
  return (
    <>
      {open && (
        <div className="sheetback" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="sheet" role="dialog" aria-label="More pages">
            {more.map((grp) => (
              <div key={grp.id} className="sheetgroup">
                <div className="sheethead">{t(`nav.group.${grp.id}`, grp.label)}</div>
                <div className="sheetitems">
                  {grp.items.map((it) => <button key={it.id} data-tour={`nav-${it.id}`} className={page === it.id ? 'active' : ''} onClick={() => go(it.id)}>{t(`nav.${it.id}`, it.label)}</button>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="tabbar" role="navigation" aria-label="Main pages">
        {groups.filter((g) => BAR_HUBS.includes(g.id)).map((g) => (
          <button key={g.id} data-tour={`hub-${g.id}`} className={here === g.id ? 'on' : ''} onClick={() => go(hubTarget(g.id, groups, loadLastPages()))} aria-label={g.label}>
            <span className="ti">{g.icon}</span><span className="tl">{t(`nav.group.${g.id}`, g.label)}</span>
            {badges[g.id] ? <b className="badge">{badges[g.id]}</b> : null}
          </button>
        ))}
        <button data-tour="hub-menu" className={!inBar || open ? 'on' : ''} onClick={() => setOpen(!open)} aria-label="More" aria-expanded={open}>
          <span className="ti">☰</span><span className="tl">{t('nav.group.more', 'More')}</span>
        </button>
      </div>
    </>
  );
}
