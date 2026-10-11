/** Newest first. Bump the top entry's `id` to show the "What's new" banner again. */
export interface Release { id: string; date: string; title: string; items: string[] }

export const CHANGELOG: Release[] = [
  {
    id: '2026-10-f', date: '2026-10-11', title: 'Alliance wars',
    items: [
      'A Tech tree page: a progression graph with every building and research level as its own box and arrows for what needs what (click a box to light up its whole path), plus a Production and effects view of what boosts what.',
      'Wars are now scored contests: 48 hours, points for the value of enemy units your side destroys and for every system you hold. The higher score wins.',
      'The winner earns a share of the losses of the enemy for the alliance bank and Command Credits for the fighters; conceding ends a war at once.',
      'The release notes page is now in the menu (under More), always one click away.',
      'The Alliance page has a War panel with the live score, the top fighters and the last results.',
    ],
  },
  {
    id: '2026-10-e', date: '2026-10-11', title: 'A tidier menu and a faster server',
    items: [
      'The menu is grouped into Planet, Space, Empire, Social and More, and pages like Automation, Territory, Invasion and the Simulator appear once they are useful (Settings can show them all).',
      'Void invasions: the Armada is now sized from the combat fleets on the server, so it can actually be beaten by a good part of the server working together; damage you deal stays until it rebuilds.',
      'The server does far less work every second and the rankings refresh every fifteen seconds, so big worlds stay responsive.',
    ],
  },  {
    id: '2026-10-d', date: '2026-10-10', title: 'Automation and more',
    items: [
      'Install the game as an app and get push notifications on your phone or desktop (Settings), using the same alert categories as Discord and ntfy.',
      'Void invasions: a shared boss fleet opens a rift in deep space; every fleet at the front fights together and rewards follow the damage each commander does.',
      'Territory: alliances hold systems by out-weighing rivals there, earn a production bonus for every member, and fight over a sector map.',
      'Contracts: three daily and two weekly jobs that pay Command Credits, with a daily streak and an all-dailies bonus.',
      'Automation page: build orders that raise buildings and research in sequence on a planet (with automatic prerequisites), plus rules that keep energy up, avoid full storage and build defenses when a fleet is heading for you.',
    ],
  },
  {
    id: '2026-10-c', date: '2026-10-10', title: 'Vespene Gas, pictures and fixes',
    items: [
      'The Guide is now a full player manual organised by topic; release notes live on this page (also under Settings).',
      'Deuterium is now Vespene Gas (the Synthesizer is the Vespene Extractor), and metal, crystal and Vespene Gas have pictures everywhere.',
      'Queued upgrades are priced at the level you will actually get, and failed purchases say exactly what is missing.',
      'Hostile fleets show where they launched from; alliance member names and home coordinates are clickable, and profiles list all planets.',
      'Crawlers now draw 6 energy each and Collectors get +25% from them (was +50%) - see the Economy page energy breakdown.',
      'Safer logins: sessions expire after 30 days without use, Log out signs you out on the server, and repeated wrong passwords are throttled.',
    ],
  },  {
    id: '2026-10-b', date: '2026-10-10', title: 'Community & tools',
    items: [
      'Alliance ranks with permissions, a bulletin board, mass messages and pacts/wars between alliances.',
      'Contacts: buddies, block list, private notes, bookmarks, recent targets and a spy-report archive.',
      'Round-by-round battle reports with public share links.',
      'Expeditions last 1-4 hours; recyclers and probes now matter; ancient data caches speed up research.',
      'The merchant has a daily cheap deal, and Gather pulls resources from all planets in one click.',
      'Pictures for metal, crystal and Vespene Gas in the top bar, costs and resource pages.',
      'Balance: crawlers now draw energy and Collectors get +25% (not +50%) from them.',
      'Command Credit supply depot, Pathfinder expedition ship, Joint Command alliance upgrade (+fleet slots) and fleet presets that follow you between devices.',
      'Seasons with a hall of fame and optional victory score.',
      'Account settings: change password, rename, recovery key, delete account.',
      'Optional sound cues, tab-title alerts, a welcome tour and four languages for the main menus.',
      'Reorder queued buildings and research, a details page for every building, research, ship and defense, and an Economy overview page.',
      'Production, research and building speeds were raised (5x) so progress is quicker; fleet speed is unchanged.',
      'Optional SQLite storage and a production deployment kit (Docker, HTTPS, nightly backups) for server owners.',
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
  {
    id: '2026-10-0b', date: '2026-10-09', title: 'Computer empires, progress and a new look',
    items: [
      'Computer-controlled empires expand, wage wars on each other, hold grudges, demand tribute, raid players and make the news.',
      'Command Credits, officers, achievements and guided objectives walk new commanders through the first hours.',
      'Factions with reputation, and the trader who swaps resources at a rate.',
      'Terraformer, Graviton technology and planet sizes; storage scales with game speed.',
      'Command screen, battle simulator, standing charts, empire overview page and fleet presets.',
      'A procedural art set and an amber theme; wide tables scroll inside themselves on phones.',
      'An error screen instead of a blank page, and an offline banner when the connection drops.',
    ],
  },
  {
    id: '2026-10-0a', date: '2026-10-09', title: 'The multiplayer game',
    items: [
      'Stellar Frontier became a shared online universe: one server, many commanders, real-time updates.',
      'Alliances with a shared bank and upgrades, and joint attacks where members strike together.',
      'Build and research queues four deep, paid when each item starts.',
      'Moons with a Lunar Base, Sensor Phalanx and Jump Gate; missile silos with interceptor and interplanetary missiles.',
      'Planets can be abandoned; attacks are called off if the target becomes an ally, and stationed fleets go home when an alliance bond ends.',
      'Rolling backups and quarantine of unreadable saves keep the universe safe; messages and joins are rate limited.',
      'A built-in guide and a demo universe for trying things out.',
    ],
  },
];
export const CHANGELOG_KEY = 'sf.seenChangelog';
export const unseenRelease = () => { try { return localStorage.getItem(CHANGELOG_KEY) !== CHANGELOG[0].id; } catch { return false; } };
export const markChangelogSeen = () => { try { localStorage.setItem(CHANGELOG_KEY, CHANGELOG[0].id); } catch { /* ignore */ } };
