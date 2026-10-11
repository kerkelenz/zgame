import { useSyncExternalStore } from 'react';

/** The side menu: grouped, with some pages held back until they are relevant. Pure data and functions so it can be tested without a browser. */
export interface Features { automation: boolean; territory: boolean; invasion: boolean; simulator: boolean }
export interface NavItem { id: string; label: string; feature?: keyof Features; admin?: boolean }
export interface NavGroup { id: string; label: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  { id: 'planet', label: 'Planet', items: [
    { id: 'overview', label: 'Overview' }, { id: 'resources', label: 'Resources' }, { id: 'buildings', label: 'Buildings' }, { id: 'research', label: 'Research' },
    { id: 'shipyard', label: 'Shipyard' }, { id: 'defense', label: 'Defense' }, { id: 'automation', label: 'Automation', feature: 'automation' },
  ] },
  { id: 'space', label: 'Space', items: [
    { id: 'fleet', label: 'Fleet' }, { id: 'galaxy', label: 'Galaxy' }, { id: 'invasion', label: 'Invasion', feature: 'invasion' }, { id: 'simulator', label: 'Simulator', feature: 'simulator' },
  ] },
  { id: 'empire', label: 'Empire', items: [
    { id: 'empire', label: 'Empire' }, { id: 'economy', label: 'Economy' }, { id: 'contracts', label: 'Contracts' }, { id: 'command', label: 'Command' },
  ] },
  { id: 'social', label: 'Social', items: [
    { id: 'alliance', label: 'Alliance' }, { id: 'territory', label: 'Territory', feature: 'territory' }, { id: 'contacts', label: 'Contacts' },
    { id: 'messages', label: 'Messages' }, { id: 'chat', label: 'Chat' }, { id: 'highscore', label: 'Standing' },
  ] },
  { id: 'more', label: 'More', items: [
    { id: 'settings', label: 'Settings' }, { id: 'guide', label: 'Guide' }, { id: 'news', label: "What's new" }, { id: 'admin', label: 'Admin', admin: true },
  ] },
];

/** the groups to show: pages whose feature is not unlocked are left out (unless everything is requested), the admin page only for admins, empty groups vanish */
export function visibleNav(features: Features | undefined, showAll: boolean, isAdmin: boolean, current?: string): NavGroup[] {
  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => (!i.admin || isAdmin) && (showAll || !i.feature || features?.[i.feature] || i.id === current)) }))
    .filter((g) => g.items.length > 0);
}

/** pages that are not in the menu belong to the group of the page they were opened from */
const EXTRA: Record<string, string> = { detail: 'planet', profile: 'social' };
export const groupOfPage = (page: string): string => EXTRA[page] ?? NAV_GROUPS.find((g) => g.items.some((i) => i.id === page))?.id ?? 'planet';

const KEY = 'sf.navCollapsed';
const ALL_KEY = 'sf.navAll';
export function loadCollapsed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, boolean>; } catch { return {}; }
}
export function saveCollapsed(c: Record<string, boolean>) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ } }
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

/** a group is open if the player left it open, or it holds the current page; by default only the Planet group starts open */
export function isOpen(groupId: string, collapsed: Record<string, boolean>, page: string): boolean {
  if (groupOfPage(page) === groupId) return true;
  return groupId in collapsed ? !collapsed[groupId] : groupId === 'planet';
}
