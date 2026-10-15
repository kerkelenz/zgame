import { useSyncExternalStore } from 'react';
import { BUILDINGS, TECHS, isDefense, isShip } from '../../shared/data';

/**
 * The navigation: a handful of hubs (Home, Build, Fleet, Galaxy, Inbox, Alliance, More), each with the pages that belong to it as tabs above the
 * page. Some pages are held back until they are relevant. Pure data and functions so it can be tested without a browser.
 */
export interface Features { automation: boolean; territory: boolean; invasion: boolean; simulator: boolean }
/** `planet` pages work on the selected planet (the strip under the header picks it); `empire` pages are about everything you own or other people */
export interface NavItem { id: string; label: string; feature?: keyof Features; admin?: boolean; scope: 'planet' | 'empire' }
export interface NavGroup { id: string; label: string; icon: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  { id: 'home', label: 'Home', icon: '🏠', items: [
    { id: 'overview', label: 'Overview', scope: 'planet' }, { id: 'empire', label: 'Empire', scope: 'empire' }, { id: 'economy', label: 'Economy', scope: 'empire' }, { id: 'market', label: 'Market', scope: 'planet' },
    { id: 'contracts', label: 'Contracts', scope: 'empire' }, { id: 'command', label: 'Command', scope: 'empire' },
  ] },
  { id: 'build', label: 'Build', icon: '🏗', items: [
    { id: 'buildings', label: 'Buildings', scope: 'planet' }, { id: 'research', label: 'Research', scope: 'planet' }, { id: 'shipyard', label: 'Shipyard', scope: 'planet' },
    { id: 'defense', label: 'Defense', scope: 'planet' }, { id: 'lifeform', label: 'Lifeform', scope: 'planet' }, { id: 'upgrades', label: 'Upgrades', scope: 'planet' }, { id: 'techtree', label: 'Tech tree', scope: 'empire' }, { id: 'resources', label: 'Resources', scope: 'planet' },
    { id: 'automation', label: 'Automation', feature: 'automation', scope: 'planet' },
  ] },
  { id: 'fleet', label: 'Fleet', icon: '🚀', items: [
    { id: 'fleet', label: 'Fleet', scope: 'planet' }, { id: 'simulator', label: 'Simulator', feature: 'simulator', scope: 'empire' }, { id: 'invasion', label: 'Invasion', feature: 'invasion', scope: 'empire' },
  ] },
  { id: 'galaxy', label: 'Galaxy', icon: '🌌', items: [{ id: 'galaxy', label: 'Galaxy', scope: 'empire' }, { id: 'map', label: 'Map', scope: 'empire' }] },
  { id: 'inbox', label: 'Inbox', icon: '✉', items: [
    { id: 'messages', label: 'Messages', scope: 'empire' }, { id: 'chat', label: 'Chat', scope: 'empire' }, { id: 'contacts', label: 'Contacts', scope: 'empire' },
  ] },
  { id: 'alliance', label: 'Alliance', icon: '🤝', items: [
    { id: 'alliance', label: 'Alliance', scope: 'empire' }, { id: 'territory', label: 'Territory', feature: 'territory', scope: 'empire' }, { id: 'highscore', label: 'Standing', scope: 'empire' },
  ] },
  { id: 'more', label: 'More', icon: '⋯', items: [
    { id: 'settings', label: 'Settings', scope: 'empire' }, { id: 'guide', label: 'Guide', scope: 'empire' }, { id: 'news', label: "What's new", scope: 'empire' }, { id: 'admin', label: 'Admin', admin: true, scope: 'empire' },
  ] },
];

/** the groups to show: pages whose feature is not unlocked are left out (unless everything is requested), the admin page only for admins, empty groups vanish */
export function visibleNav(features: Features | undefined, showAll: boolean, isAdmin: boolean, current?: string): NavGroup[] {
  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => (!i.admin || isAdmin) && (showAll || !i.feature || features?.[i.feature] || i.id === current)) }))
    .filter((g) => g.items.length > 0);
}

/** pages that are not tabs belong to the hub of what they are about: an item's page to Build, a commander's profile to Alliance */
const EXTRA: Record<string, string> = { detail: 'build', profile: 'alliance' };
export const groupOfPage = (page: string): string => EXTRA[page] ?? NAV_GROUPS.find((g) => g.items.some((i) => i.id === page))?.id ?? 'home';
export const itemOfPage = (page: string): NavItem | undefined => NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === page);
/** does the page work on the selected planet (so the planet strip applies)? */
export const isPlanetPage = (page: string): boolean => (page === 'detail' ? true : itemOfPage(page)?.scope === 'planet');

// ------------------------------------------------------------------ where a hub takes you

const LAST_KEY = 'zg.hubLast';
/** the page a hub opens: the one you were last on inside it (if it is still there), else its first */
export function hubTarget(hubId: string, visible: NavGroup[], last: Record<string, string>): string {
  const g = visible.find((x) => x.id === hubId);
  if (!g) return 'overview';
  const was = last[hubId];
  return was && g.items.some((i) => i.id === was) ? was : g.items[0].id;
}
export function loadLastPages(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) || '{}') as Record<string, string>; } catch { return {}; }
}
export function rememberPage(page: string) {
  const hub = groupOfPage(page);
  if (page === 'detail' || page === 'profile' || !NAV_GROUPS.find((g) => g.id === hub)?.items.some((i) => i.id === page)) return;
  try { const all = loadLastPages(); if (all[hub] !== page) { all[hub] = page; localStorage.setItem(LAST_KEY, JSON.stringify(all)); } } catch { /* ignore */ }
}

// ------------------------------------------------------------------ breadcrumb

export interface Crumb { label: string; page?: string }

/** the tab an item's details page sits under: buildings under Buildings, research under Research, ships under Shipyard, defenses under Defense */
export const tabOfItem = (id: string | null | undefined): string | undefined => (!id ? undefined : id in BUILDINGS ? 'buildings' : id in TECHS ? 'research' : isShip(id) ? 'shipyard' : isDefense(id) ? 'defense' : undefined);
/** Build › Buildings › Metal Mine: the hub, the tab, and the item or commander on a details page */
export function breadcrumb(page: string, leaf?: string, parentPage?: string): Crumb[] {
  const hub = NAV_GROUPS.find((g) => g.id === groupOfPage(page));
  if (!hub) return [];
  const tab = page === 'detail' ? undefined : itemOfPage(page);
  const out: Crumb[] = [{ label: hub.label, page: hub.items[0].id }];
  if (page === 'detail' || page === 'profile') {
    const parent = page === 'profile' ? itemOfPage('highscore') : parentPage ? itemOfPage(parentPage) : undefined;
    if (parent) out.push({ label: parent.label, page: parent.id });
    if (leaf) out.push({ label: leaf });
  } else if (tab && hub.items.length > 1) out.push({ label: tab.label });
  return out;
}

// ------------------------------------------------------------------ "show every page"

const ALL_KEY = 'zg.navAll';
let all = (() => { try { return localStorage.getItem(ALL_KEY) === '1'; } catch { return false; } })();
const subs = new Set<() => void>();
export const showAllPages = () => all;
export function setShowAllPages(on: boolean) {
  all = on;
  try { localStorage.setItem(ALL_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  subs.forEach((f) => f());
}
/** re-render when the "show every page" switch changes */
export const useShowAllPages = () => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => all);
