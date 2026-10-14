/** Newest first. Bump the top entry's `id` to show the "What's new" banner again. */
export interface Release { id: string; date: string; title: string; items: string[] }

export const CHANGELOG: Release[] = [
  {
    id: '2026-10-t', date: '2026-10-15', title: 'The Void invasion is a campaign',
    items: [
      'Invasions come in waves (four by default): Scouts, Assaults and the Mothership. A wave arrives on schedule or soon after you destroy the one before. Each wave is a kind of alien with a weakness: swarms, shield-breakers, bio-ships that regrow, armoured carriers.',
      'Everyone has a job. Fleets fight at the rift together as before. Planets beat off alien strike teams that head for them with every wave (soft losses, never for newcomers or players on vacation). Probes can scout the rift and tell everyone what the next wave is. Cargo ships can fly supply convoys that rebuild ships lost at the front.',
      'Rewards follow all four jobs: damage, aliens destroyed at home, supplies delivered and scouting. Part of the ships you lose at the front comes back as resources. New achievements: Void Guardian, Void Quartermaster and Void Scout.',
      'The Invasion page shows the wave timeline, what scouts have learned, strike teams on the way to your planets, the supplies, a replay of the last engagement, your work and a board for each job. New missions on the Fleet page: Scout the Void rift and Supply convoy to the front.',
    ],
  },
  {
    id: '2026-10-s', date: '2026-10-15', title: 'A clearer planet bar',
    items: [
      'Every planet is a chip with its picture, name, role and coordinates, with its moon as a smaller part of the same chip. Small tags show what needs you: an attack on the way, an idle queue, time left on a build, a full store, low energy.',
      'With more than five planets the bar becomes one switcher with arrows and a searchable list. Keys 1 to 9 jump to a planet.',
      'The planet bar and the page tabs stay at the top while you scroll, as a slimmer bar.',
      'The Build tabs now run Buildings, Research, Shipyard, Defense, Tech tree, Resources, Automation.',
    ],
  },
  {
    id: '2026-10-r', date: '2026-10-14', title: 'A new menu',
    items: [
      'The long side menu is now seven hubs that are always showing: Home, Build, Fleet, Galaxy, Inbox, Alliance and More. The pages of a hub are tabs along the top, and a hub opens the page you were last on in it. Messages has its own hub with an unread count instead of hiding under Social.',
      'Your planets and moons are a strip of pictures under the top bar (it replaces the planet list). It dims on pages that are not about a single planet.',
      'Item and commander pages show a trail (Build > Buildings > Metal Mine) and keep their tab lit. On a phone the same hubs are the bottom bar, with the Alliance hub and the rest under More. Expand all and Collapse all are gone, since nothing folds any more.',
    ],
  },
  {
    id: '2026-10-q', date: '2026-10-14', title: 'Expedition chart',
    items: [
      'The Fleet page has an Expeditions chart: your planet in the middle, a spoke out to deep space for each expedition with the ship riding along it (orange out, purple exploring, green coming home), a timeline for each fleet with the time left, when it is home, its ships and cargo, a Recall button, and your latest five expedition results.',
    ],
  },
  {
    id: '2026-10-p', date: '2026-10-14', title: 'Battle replay',
    items: [
      'Watch any battle as an animated replay: both fleets as rows of pictures, beams across the gap, shields flashing, ships bursting as they fall and the counts ticking down, with Play, Pause, step by round, a slider and speeds from half to four times. Open it with Watch the replay in the battle message, in the full report or on a shared report link. The Simulator replays the first of its runs too.',
    ],
  },
  {
    id: '2026-10-o', date: '2026-10-14', title: 'Hands-on tutorial',
    items: [
      'A hands-on tutorial follows the welcome tour. It highlights the real button to press, waits for you to press it, and moves on by itself: open Buildings, build a Metal Mine, queue a Solar Plant, open an item and go back, then Research, the Tech tree, the Galaxy and the Overview. You can skip a step or the whole tutorial, and start it again from Settings.',
    ],
  },
  {
    id: '2026-10-n', date: '2026-10-14', title: 'Idle queues, planners, alliance tools and pictures everywhere',
    items: [
      'Feedback when something finishes: a level or ship count glows when it rises, pop-ups slide in and the bell shakes for a new message.',
      'Accessibility: a Skip to the page link, arrow-key movement and spoken status on the Tech tree cards, visible keyboard focus, announced pop-ups and respect for the reduced-motion setting.',
      'Alliance Operations: a shared target board. Plan an attack or a defense with an optional landing time, sign up with the ships of a planet, see when each member must leave to land together, get a reminder ten minutes before, and press Prepare launch to fill in the Fleet page.',
      'Alliance Activity feed: attacks on members, their attacks, raids, help asked, defenders who answered and building and research milestones, with a filter. A member under attack can press Ask allies for help on the Fleet page.',
      'Choosing an alliance is easier: open ones first, then the strongest, with active members, points and systems; the Overview suggests joining after the first hour.',
      'Share links for a planet (Share this planet on the Overview) and for your queue as a build order (on Buildings and Research). Opening an order link while logged in can queue the steps you still lack.',
      'Planner on the Shipyard and Defense pages: pick a unit and a number to see the price, the buildings and research still missing, the total, the building time and when you can pay, with a button to queue the missing steps.',
      'Defense advisor on the Defense page: fights the smallest and largest raid the game can send at your planet in the simulator, says whether it holds, and names the cheapest defense that would make the large raid fail.',
      'Planet roles (Mining, Fleet base, Fortress, Research) on the Overview: the idle-queue tip suggests the next building for that kind of planet, and the Empire page shows the role.',
      'What to do next: the Overview lists idle queues, stores about to fill, energy shortages and tips (a contract to claim, a free expedition slot, an undefended planet), each with a Go button. A chip in the top bar counts idle queues.',
      'Queues running dry: a building queue or the research that has been empty for half an hour sends one alert to Discord, ntfy or push (a new switch under Settings, on by default, away-only like the others).',
      'Item pictures appear in more places: queues, the production and research cards on the Overview, the Fleet ship list, the Simulator, fleet tooltips in the events, battle reports and the Tech tree cards. Pictures load faster, too: lists use small copies and the server lets the browser keep them for a year.',
    ],
  },
  {
    id: '2026-10-m', date: '2026-10-13', title: 'Getting around',
    items: [
      'The browser Back and Forward buttons now work inside the game: every page, details page, profile and galaxy view is a history entry, a refresh keeps your place, and the address can be bookmarked or shared (for example #/item/metalMine).',
      'Ctrl+K opens a jump box for any page, building, research, ship, defense, commander or coordinates. Keyboard: / searches players, [ and ] switch planet, g then a letter opens a page, ? lists them. Arrow buttons next to the planet list do the same for the mouse.',
      'Buildings, Research, Shipyard and Defense have an Only what I can start now filter, and a card you cannot pay for says when you can afford it. Upgrade and Research buttons appear next to unmet requirements and on the Tech tree.',
      'The top bar shows how long until a store is full (amber within the hour, red when full) and the percentage your mines run at when energy is short. A bell keeps every pop-up message with Mark all read and Clear.',
      'Cancelling a job or removing a queued one offers Undo. The Fleet page has Repeat last to prepare your previous dispatch again, and your moving fleets in the Overview events have a Recall button.',
      'On phones the menu is a bar at the bottom: Overview, Buildings, Fleet, Galaxy, Messages and a Menu button with every page.',
    ],
  },
  {
    id: '2026-10-l', date: '2026-10-13', title: 'Artwork',
    items: [
      'Every building, research, ship and defense has a picture now: a small icon on cards and lists, and large at the top of its details page. The resource icons keep their drawn style for now.',
      'Planets and moons have their own pictures: twelve planet looks (picked to suit the temperature of the position, so lava worlds are hot and ice worlds cold) and six moon looks. Each world keeps the picture it was given. They show on the Overview and, as a small round thumbnail, on the Empire page.',
    ],
  },
  {
    id: '2026-10-k', date: '2026-10-12', title: 'Rules and tidy-ups',
    items: [
      'Buildings can be demolished one level at a time, on planets and moons: Demolish a level on the card or details page. It takes half the build time, returns about 30% of the price of that level and frees a building field.',
      'Coordinates, commander names and planet names are working links everywhere: in messages (subject and text), battle reports, spy reports, the alliance page and its log and bulletin, chat, the Fleet page, the phalanx scan, Contacts, profiles and the top bar. A coordinate or planet opens the galaxy there, a name opens the profile.',
      'Raids are much weaker: a raid is sized from what defends the planet it targets (0.6 to 1.3 times its value) instead of from your total points, and new accounts are raided gently, rising to full strength over the first week.',
      'Every building, research, ship and defense has a short explanation on its details page, the change at the next level is coloured (green good, red costs), and ships have a Special features box with rapid fire and engine changes such as the switch of the Bomber to hyperspace drive at level 8.',
      'Battle reports in your messages show the result only, with a Full battle report button that opens a window with every round: shots, damage, what the enemy shields absorbed, what reached hulls and what was destroyed. The shared link shows the same full report.',
      'Battle reports say whether a moon formed and what the chance was; if no moon formed it shows the chance the debris field gave.',
      'Standing: the 24 h and Place columns show the points each commander gained or lost and the places they climbed or fell since the daily snapshot, refreshed every 24 hours.',
      'Queues show the time of every job and of the whole queue (buildings, research) and of every shipyard row and all rows together.',
      'Settings: an option to stop the in-game messages when a building, research or production run finishes.',
      'News about raids on people you do not know is now off by default; you hear about members of your own alliance, or switch the news on in Settings.',
      'Events: point at the word fleet to see what the fleet is made of, and point at transporting resources to see how much of each is on board (nothing is shown inline any more).',
      'Spy reports have clickable coordinates and Attack, Spy again and Transport buttons that open the Fleet page with the planet as target.',
      'The Simulator shows the chance of a moon, and you can add debris that is already above the planet.',
      'The Space Dock rebuilds 3.5% of a wreck field per level, at most 35% at level 10 (it used to reach 90%).',
      'Moons can no longer build storage buildings: nothing is mined there.',
      'The Moon Forge is no longer offered on a planet that already has a moon.',
      'Bombers switch to hyperspace drive at Hyperspace Drive 8 (base speed 5,000), which was already the case and is now covered by tests.',
    ],
  },
  {
    id: '2026-10-j', date: '2026-10-12', title: 'A friendlier Fleet page',
    items: [
      'Coordinates on the Fleet page are links to the galaxy.',
      'The Fleet page shows the transport capacity of the ships you pick (and the recycling capacity of Recyclers), and the cargo boxes have a small max link instead of the max metal button.',
      'Buttons with your own planets and moons fill in the target in one click.',
      'Number fields group the digits as you type: 2000000 becomes 2,000,000.',
      'Settings has a default number of Espionage Probes that Spy in the galaxy prepares for you.',
      'The expedition time choices come from the same limits the server uses (1 to 4 hours).',
    ],
  },
  {
    id: '2026-10-i', date: '2026-10-11', title: 'Player search and a tidier menu',
    items: [
      'Search players: a box in the top bar finds commanders by name (and alliance members by tag) and opens their profile.',
      'In the Events list only attacks on you are red; attacks on your allies are amber.',
      'The side menu has Expand all and Collapse all buttons at the top.',
      'The side menu is a little wider and has no visible scroll bar (it still scrolls with the wheel or a swipe when it is taller than the window), and it never scrolls sideways.',
    ],
  },
  {
    id: '2026-10-h', date: '2026-10-11', title: 'Moon Forge',
    items: [
      'The Moon Forge turns the debris field above one of your planets into a moon for certain. It needs Graviton Technology 1, a level 12 Shipyard on that planet and at least 1,000,000 resources of debris, costs vespene gas (as much as the debris) plus a quarter each of metal and crystal, and takes 12 hours. A bigger field makes a bigger moon, from 3,000 to 8,000 km.',
      'The forge appears as a card on the Overview and as an entry in the Events list while it runs; cancelling gives back the price but not the debris.',
    ],
  },
  {
    id: '2026-10-g', date: '2026-10-11', title: 'Events, moons and the tech tree',
    items: [
      'The welcome tour has a Tech tree step and mentions the Events list on the Overview.',
      'The game is now called Zgame.',
      'The Galaxy has a Recycle button next to Spy, Attack, Transport and Defend on every position with a debris field, including your own planets and empty positions.',
      'Recyclers take metal and crystal together in the proportion they lie in the debris field, so a full load is a mix of both instead of all metal first.',
      'Hostile fleets in the Events list and on the Fleet page show what they attack with, as far as your Espionage Technology compared with theirs lets you tell: nothing, the ship count, the types, or the exact fleet.',
      'The Overview Events list now shows how many resources fleets carry (a delivery on its way out, loot and salvage on the way home, a delivery from an ally), per resource and in total.',
      'Moons: a battle over a planet without a moon now gives a flat 20% chance (once the debris field holds 100,000 resources; less below that), and debris left by earlier battles counts toward it.',
      'The Overview shows a planet and its moon side by side, and the planet list keeps each moon next to its planet.',
      'Tech tree connections are now grid-style lines that only run up, down or sideways through the gaps between cards, never over or behind a card; lines leaving the same card share a trunk.',
      'The Overview has an Events list of every fleet movement that concerns you in time order: your fleets going out and the return flight still to come, hostile fleets heading for you or your allies (who, from where, when) and friendly deliveries, each with a clock time and countdown.',
      'Recyclers can now collect the debris field above your own planets and moons (it used to say "You are already there").',
      'A Tech tree page: one card per building, research, ship and defense with your level on it, rows by purpose and columns by step, what you can start right now glowing, click a card to light its chain and open its levels, and "Show only the path to" any item (with your next steps listed). Plus a Production and effects view of what boosts what. The map pans and zooms with the mouse or touch.',
      'The release notes page is now in the menu (under More), always one click away.',
    ],
  },
  {
    id: '2026-10-f', date: '2026-10-11', title: 'Alliance wars',
    items: [
      'Wars are now scored contests: 48 hours, points for the value of enemy units your side destroys and for every system you hold. The higher score wins.',
      'The winner earns a share of the losses of the enemy for the alliance bank and Command Credits for the fighters; conceding ends a war at once.',
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
      'Zgame became a shared online universe: one server, many commanders, real-time updates.',
      'Alliances with a shared bank and upgrades, and joint attacks where members strike together.',
      'Build and research queues four deep, paid when each item starts.',
      'Moons with a Lunar Base, Sensor Phalanx and Jump Gate; missile silos with interceptor and interplanetary missiles.',
      'Planets can be abandoned; attacks are called off if the target becomes an ally, and stationed fleets go home when an alliance bond ends.',
      'Rolling backups and quarantine of unreadable saves keep the universe safe; messages and joins are rate limited.',
      'A built-in guide and a demo universe for trying things out.',
    ],
  },
];
export const CHANGELOG_KEY = 'zg.seenChangelog';
export const unseenRelease = () => { try { return localStorage.getItem(CHANGELOG_KEY) !== CHANGELOG[0].id; } catch { return false; } };
export const markChangelogSeen = () => { try { localStorage.setItem(CHANGELOG_KEY, CHANGELOG[0].id); } catch { /* ignore */ } };
