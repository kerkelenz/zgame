import { useState } from 'react';
import { useGame } from './game';
import { visibleNav, groupOfPage, type Features } from './nav';
import { useShowAllPages } from './nav';
import { t } from './i18n';

/** The five pages a phone player uses most, as a tab bar at the bottom of the screen, plus a Menu sheet with every page. Hidden on wide screens. */
export const TABS = [
  { id: 'overview', label: 'Overview', icon: '🏠' }, { id: 'buildings', label: 'Buildings', icon: '🏗' }, { id: 'fleet', label: 'Fleet', icon: '🚀' },
  { id: 'galaxy', label: 'Galaxy', icon: '🌌' }, { id: 'messages', label: 'Messages', icon: '✉' },
];

export function MobileBar() {
  const { me, page, setPage } = useGame();
  const showAll = useShowAllPages();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const inTabs = TABS.some((x) => x.id === page);
  const go = (id: string) => { setOpen(false); setPage(id); };
  return (
    <>
      {open && (
        <div className="sheetback" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="sheet" role="dialog" aria-label="All pages">
            {visibleNav(me.features as Features, showAll, !!me.player.admin, page).map((grp) => (
              <div key={grp.id} className="sheetgroup">
                <div className="sheethead">{t(`nav.group.${grp.id}`, grp.label)}</div>
                <div className="sheetitems">
                  {grp.items.map((it) => <button key={it.id} className={page === it.id ? 'active' : ''} onClick={() => go(it.id)}>{t(`nav.${it.id}`, it.label)}</button>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="tabbar" role="navigation" aria-label="Main pages">
        {TABS.map((x) => (
          <button key={x.id} className={page === x.id ? 'on' : ''} onClick={() => go(x.id)} aria-label={x.label}>
            <span className="ti">{x.icon}</span><span className="tl">{x.label}</span>
            {x.id === 'messages' && me.unread > 0 && <b className="badge">{me.unread}</b>}
          </button>
        ))}
        <button className={!inTabs || open ? 'on' : ''} onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
          <span className="ti">☰</span><span className="tl">{inTabs ? 'Menu' : t(`nav.${page}`, groupOfPage(page))}</span>
        </button>
      </div>
    </>
  );
}
