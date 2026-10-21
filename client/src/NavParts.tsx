import { useMemo } from 'react';
import { nameOf } from '../../shared/effects';
import { useGame } from './game';
import { breadcrumb, groupOfPage, tabOfItem, hubTarget, loadLastPages, visibleNav, useShowAllPages, type Features } from './nav';
import { t } from './i18n';

/** the groups this commander can see right now (features unlocked, admin, "show every page") */
export function useVisibleNav() {
  const { me, page } = useGame();
  const showAll = useShowAllPages();
  return useMemo(() => visibleNav(me?.features as Features | undefined, showAll, !!me?.player.admin, page, me?.unlocked), [me?.features, me?.player.admin, me?.unlocked, showAll, page]);
}

/** how many things want attention inside a hub: unread messages, rewards to claim, an invasion under way */
export function useBadges(): Record<string, number | string> {
  const { me } = useGame();
  return { inbox: me?.unread || 0, home: me?.contractsClaimable || 0, fleet: me?.invasion ? '!' : 0 };
}

/** the hubs down the left side: always all visible, no folding, the one you are in highlighted; a hub opens the page you were last on in it */
export function Sidebar() {
  const { page, setPage } = useGame();
  const groups = useVisibleNav();
  const badges = useBadges();
  const here = groupOfPage(page);
  return (
    <nav aria-label="Main">
      {groups.map((g) => {
        const b = badges[g.id];
        return (
          <button key={g.id} data-tour={`hub-${g.id}`} className={`hubitem${here === g.id ? ' active' : ''}`} aria-current={here === g.id ? 'page' : undefined}
            onClick={() => setPage(hubTarget(g.id, groups, loadLastPages()))}>
            <span className="hubicon" aria-hidden="true">{g.icon}</span><span>{t(`nav.group.${g.id}`, g.label)}</span>{b ? <b className="badge">{b}</b> : null}
          </button>
        );
      })}
    </nav>
  );
}

/** the pages of the hub you are in, as tabs above the page */
export function SubTabs() {
  const { page, setPage, me, detailId } = useGame();
  const groups = useVisibleNav();
  const g = groups.find((x) => x.id === groupOfPage(page));
  // an item's page keeps the tab it belongs to lit
  const current = page === 'detail' ? tabOfItem(detailId) ?? page : page;
  if (!g || g.items.length < 2) return null;
  const badge = (id: string) => (id === 'messages' ? me.unread : id === 'contracts' ? me.contractsClaimable : id === 'invasion' && me.invasion ? '!' : 0) || 0;
  return (
    <div className="subtabs" role="navigation" aria-label={`${g.label} pages`}>
      {g.items.map((it) => (
        <button key={it.id} data-tour={`nav-${it.id}`} className={`subtab${current === it.id ? ' active' : ''}`} aria-current={current === it.id ? 'page' : undefined} onClick={() => setPage(it.id)}>
          {t(`nav.${it.id}`, it.label)}{badge(it.id) !== 0 && <b className="badge">{badge(it.id)}</b>}
        </button>
      ))}
    </div>
  );
}

/** Build › Buildings › Metal Mine: where you are, each step a way back */
export function Breadcrumb() {
  const { page, detailId, setPage } = useGame();
  const crumbs = breadcrumb(page, page === 'detail' && detailId ? nameOf(detailId) : undefined, page === 'detail' ? tabOfItem(detailId) : undefined);
  // the tabs already say where a normal page is: the trail is for item and commander pages
  if (crumbs.length < 2 || (page !== 'detail' && page !== 'profile')) return null;
  return (
    <div className="crumbs" role="navigation" aria-label="You are here">
      {crumbs.map((c, i) => (
        <span key={i}>{i > 0 && <span className="muted" aria-hidden="true"> › </span>}{c.page && i < crumbs.length - 1 ? <a onClick={() => setPage(c.page!)}>{c.label}</a> : <b>{c.label}</b>}</span>
      ))}
    </div>
  );
}
