/** Newest first. Bump the top entry's `id` to show the "What's new" banner again. */
export interface Release { id: string; date: string; title: string; items: string[] }

export const CHANGELOG: Release[] = [
  {
    id: '2026-10-b', date: '2026-10-10', title: 'Community & tools',
    items: [
      'Alliance ranks with permissions, a bulletin board, mass messages and pacts/wars between alliances.',
      'Contacts: buddies, block list, private notes, bookmarks, recent targets and a spy-report archive.',
      'Round-by-round battle reports with public share links.',
      'Expeditions last 1-4 hours; recyclers and probes now matter; ancient data caches speed up research.',
      'The merchant has a daily cheap deal, and Gather pulls resources from all planets in one click.',
      'Command Credit supply depot, Pathfinder expedition ship, Joint Command alliance upgrade (+fleet slots) and fleet presets that follow you between devices.',
      'Seasons with a hall of fame and optional victory score.',
      'Account settings: change password, rename, recovery key, delete account.',
      'Optional sound cues, tab-title alerts, a welcome tour and four languages for the main menus.',
    ],
  },
  {
    id: '2026-10-a', date: '2026-10-09', title: 'Retail gap features',
    items: [
      'Vacation mode, activity flags and newbie protection in the Galaxy.',
      'Alerts outside the game via Discord, ntfy and browser notifications.',
      'Character classes: Collector, General, Discoverer.',
      'Moon destruction with Deathstars, wreck fields and the Space Dock.',
      'Orbit position bonuses and Crawlers.',
      'Highscore categories and public commander profiles.',
      'Queued buildings and research are paid for when queued.',
    ],
  },
];
export const CHANGELOG_KEY = 'sf.seenChangelog';
export const unseenRelease = () => { try { return localStorage.getItem(CHANGELOG_KEY) !== CHANGELOG[0].id; } catch { return false; } };
export const markChangelogSeen = () => { try { localStorage.setItem(CHANGELOG_KEY, CHANGELOG[0].id); } catch { /* ignore */ } };
