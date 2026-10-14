# Zgame

A co-op multiplayer, OGame-style space strategy game. Everyone shares one persistent universe; alliances pool resources, buy shared bonuses and defend each other against NPC raiders and hostile players.

## Run it

```bash
npm install
npm start            # builds the client, serves everything on http://localhost:3000
```

Development (hot reload, client on :5173 proxying to the server on :3000):

```bash
npm run dev
```

Friends on your LAN/VPN just open `http://<your-ip>:3000`, register a commander name and play. State is saved to `data/world.json` every 10 s and on shutdown.

### Universe settings (env vars)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | HTTP/WebSocket port |
| `ZGAME_*` | | every setting below is a `ZGAME_` variable; the older `OGAME_` names still work (the `ZGAME_` one wins when both are set) |
| `ZGAME_SAVE` | `data/world.json` | save file |
| `ZGAME_ECONOMY_SPEED` | 20 | production ×, build/research/ship time ÷ |
| `ZGAME_PRODUCTION_BOOST` | 5 | extra multiplier on all resource production, on top of the economy speed |
| `ZGAME_RESEARCH_BOOST` | 5 | extra multiplier on research speed |
| `ZGAME_CONSTRUCTION_BOOST` | 5 | extra multiplier on building construction speed |
| `ZGAME_SHIPYARD_BOOST` | 5 | extra multiplier on ship and defense build speed |
| `ZGAME_STORAGE_BOOST` | 5 | extra multiplier on storage (level-0 storage = 10,000 × economy speed × this = 1,000,000 by default) |
| `ZGAME_FLEET_SPEED` | 10 | flight time ÷ |
| `ZGAME_PROTECTION_POINTS` | 200 | players under this can't attack or be attacked |
| `ZGAME_RAID_INTERVAL_MIN` | 45 | minutes between NPC raid waves (0 = off) |
| `ZGAME_NPC_DENSITY` | 0.3 | share of free slots settled by computer empires when the universe is created (0 = none; an existing save without empires gets them on next start) |
| `ZGAME_RAID_STRENGTH` | 1 | size of raiding fleets: 0.6 relaxed, 1 standard, 1.35 brutal. A raid is 0.6-1.3x the value defending the target planet (with a floor of 3-7% of the commander's invested points), times this setting, and is scaled down for accounts younger than a week |
| `ZGAME_VACATION_MIN_HOURS` | 48 | minimum vacation stay |
| `ZGAME_INVASION_INTERVAL_HOURS` | 72 | hours between Void invasions (0 = none); also `ZGAME_INVASION_ANNOUNCE_HOURS` (12), `ZGAME_INVASION_DURATION_HOURS` (24), `ZGAME_INVASION_ENGAGE_MINUTES` (30), `ZGAME_INVASION_STRENGTH` (0.35), `ZGAME_INVASION_MIN_PLAYERS` (2), `ZGAME_INVASION_WAVES` (4; 1 = a single Armada), `ZGAME_INVASION_HOME_SHARE` (0.5: the chance per wave that an active commander is hit by a strike team, 0 = none), `ZGAME_INVASION_STRIKE_STRENGTH` (1), `ZGAME_INVASION_BREATHER_MINUTES` (20) |
| `ZGAME_WAR_HOURS` | 48 | length of an alliance war in hours (0 = wars switched off) |
| `ZGAME_FORGE_HOURS` | 12 | how long a Moon Forge takes (0 = switched off) |
| `ZGAME_OUTPOSTS_PER_GALAXY` | 6 | pirate and alien outposts settled in every galaxy when the world is first started (0 = none) |
| `ZGAME_OUTPOST_RESPAWN_HOURS` | 8 | hours before a cleared outpost is rebuilt |
| `ZGAME_ENCOUNTER_MIN_MINUTES` | 20 | minutes of active play at the least between two events at a commander's planets (0 = no events) |
| `ZGAME_ENCOUNTER_MAX_MINUTES` | 40 | at the most |
| `ZGAME_ENCOUNTER_DAILY_MAX` | 6 | events per commander per UTC day at the most (0 = no limit); at 20-40 minutes apart and about half an hour of production each, uncapped play would nearly double an income |
| `ZGAME_MARKET_HOURS` | 48 | how long a player-market offer stands before it expires and the goods return (0 = the market is switched off) |
| `ZGAME_MARKET_FEE_PERCENT` | 5 | percent of what a buyer receives that the market keeps (alliance offers carry none) |
| `ZGAME_MARKET_MAX_OFFERS` | 5 | open offers one commander may have |
| `ZGAME_PUSH_SUBJECT` | `mailto:admin@example.com` | contact (mailto: or https) sent to push services with every notification; set a real one |
| `ZGAME_ADMIN_KEY` | unset | secret that lets you register a reserved `ZGAME_ADMINS` name from another machine (otherwise only the server itself can) |
| `ZGAME_SEASON_DAYS` | 0 | season length in days, then the universe resets (0 = endless) |
| `ZGAME_SEASON_RESET_HOURS` | 24 | grace period between the end of a season and the automatic reset (0 = wait for an admin) |
| `ZGAME_VICTORY_POINTS` | 0 | first commander to reach this many points wins the season early (0 = off) |
| `ZGAME_INACTIVE_DAYS` / `ZGAME_LONG_INACTIVE_DAYS` | 7 / 28 | days away before the i / I flags |
| `ZGAME_MAX_PLAYERS` | 500 | registration closes at this many commanders |
| `ZGAME_TRUST_PROXY` | unset | set to `true` (or a hop count) when behind a reverse proxy so rate limits use the real client IP |
| `ZGAME_GALAXIES`, `ZGAME_SYSTEMS`, `ZGAME_POSITIONS` | 2 / 40 / 15 | universe size |

Config is stored in the save on first start; env vars override it on later starts.

## Features

- **Economy** – metal/crystal/vespene gas mines, solar/fusion/satellite energy, storage caps, production sliders, robotics/nanite build speed, planet fields & temperature.
- **Tech** – 14 researches with OGame-style prerequisites; drives change ship speeds, weapons/shielding/armour change combat.
- **Shipyard** – 14 ships, 8 defenses, batch queues with refunds, shield-dome limits. Buildings and research can queue 4 deep (paid and reserved when queued, refunded if removed).
- **Encounters** – (`server/encounters.ts`, saved on each player as `events`) while a commander's page is open (a request within 3 minutes) a clock counts play time; after 20-40 minutes a distress call, trader, anomaly, pirate patrol or lucky find is put at one of their planets for 10-20 minutes, shown as a card in the notice strip and a dialog. One at a time, never on vacation, rewards 1-2 hours of that planet's production. Admins can send one from the Commanders list.
- **Admin tools** – the Admin page also holds an audit log of admin actions (`world.auditLog`, newest 500), scheduled announcements (`world.scheduledAnnouncements`, once or repeating, sent by the one-minute tick), a Moderation list of active bans and mutes, and per-day counts of new and active commanders (`world.dailyStats`, 60 days). Code in `server/adminlog.ts`, routes under `/api/admin/{audit,stats,schedule}`.
- **Outposts** – `ZGAME_OUTPOSTS_PER_GALAXY` pirate and alien outposts per galaxy (`server/outposts.ts`, saved as `world.outposts`): frozen computer empires with one planet, a tier 1-4 garrison measured against the average combat fleet of the commanders seen this week (never below a floor) and a treasure of 80% of it. The first winning attack pays Command Credits (20/45/100/220, shared) and counts toward the Outpost Breaker achievement; `ZGAME_OUTPOST_RESPAWN_HOURS` later the garrison is rebuilt. They never appear in the Standing and never hold grudges.
- **Player market** – a Market tab under Home where commanders swap resources: an offer escrows its goods (taken from the selected planet), prices must stay within 80%-125% of the merchant's fair rate (no free transfers between accounts), a buyer takes an offer whole and the market keeps `ZGAME_MARKET_FEE_PERCENT` of what the buyer gets; alliance-only offers carry no fee; offers expire after `ZGAME_MARKET_HOURS` and return to their planet. Server code in `server/market.ts`, saved as `world.market`.
- **Moon Forge** – a late-game way to make a moon for certain: Graviton Technology 1, Shipyard 12 and a 1M+ debris field above the planet; it consumes the field, costs vespene gas (as much as the debris) plus a quarter each of metal and crystal, takes `ZGAME_FORGE_HOURS` (12) and makes a moon of 3,000-8,000 km by field size.
- **Moons** – after a battle over a planet without a moon, the debris above it (old debris included) condenses into one with a 20% chance once it holds 100k resources (proportionally less below). Build a Lunar Base for room, a **Sensor Phalanx** to scan fleet movements around planets in range (spot raiders heading for allies) and a **Jump Gate** to teleport ships between your moons. Missions can target moons.
- **Computer empires** – hundreds of bot empires (inactive / active / aggressive) fill the galaxy with raid targets. They develop, expand, fight each other (wars leave debris and moons, with galaxy news), and aggressive ones raid commanders in fleets sized to your defenses. Raiding one builds a grudge that can turn it hostile; strong ones demand tribute (pay for a truce, refuse and face their fleet).
- **Factions and reputation** – four factions with rival pairs. Raiding a faction's empires costs standing with it and earns half as much with its rival; at 40 standing you can join for a perk (shields, weapons, mine output, or plunder + cargo), a pact with its members (they stop raiding you) and supply convoys. Hit your own and you are expelled.
- **Command** – Command Credits (from expeditions, objectives and achievements) buy permanent Officers: Quartermaster, Chief Engineer, Fleet Admiral, Spymaster, Geologist. 12 guided **objectives** walk new players through the first hours; 13 **achievements** pay credits.
- **Tools** – a Travelling Merchant (3:2:1 resource swaps), a Battle Simulator that can load defenders straight from spy reports, fleet presets, and Standing charts of your points, fleet and rank over time.
- **Late game** – Terraformer (+5 fields per level), Graviton Technology (costs nothing but needs a planet making 300,000+ energy; unlocks the Deathstar). Storage scales with universe speed.
- **Missiles** – missile silo, anti-ballistic and interplanetary missiles: strike defenses in range, ABMs intercept one-for-one.
- **Fleets** – attack, transport, deploy, espionage, colonize, recycle debris, expeditions, plus **hold (defend ally)**. Fuel, cargo, speed %, fleet slots, recall.
- **Combat** – 6-round simulation with rapid fire, shield bounce, explosion chance, debris fields, 70 % defense rebuild, loot rules, detailed battle reports.
- **Co-op** – alliances (open/application), ranks, shared bank with grants, alliance upgrades (+mine output, −research time, +fleet speed for every member), allied fleets that fight alongside a defender, joint (ACS) attacks that arrive together and split the loot, allied alerts when a member is attacked, alliance chat.
- **PvE** – periodic NPC raid waves aimed at players; defenders (and allied holders) split a bounty when raiders are crushed. Expeditions can find resources, ships, pirates or a black hole.
- **Social** – messages (battle/spy/system reports and player mail), global chat, galaxy browser, highscore for players and alliances, newbie protection.
- **Details pages** – click any building, research, ship or defense name (including requirement lists) for its own page: what it does at every level (production, energy, storage, speeds, slots, ranges…), the cost and time of each level with your officers and bonuses applied, what you still need, and what it unlocks. Ships and defenses show base vs. tech-boosted stats, rapid fire both ways, and how weapons, shields, armour and drives scale them.
- **Economy page** – empire income per hour and day, a planet-by-planet table, a breakdown of where each resource comes from (mines, plasma, boosts, energy-shortage losses), the energy picture, storage fill timers and projections, and an upgrade planner that ranks mine and energy upgrades by payback time.
- **Vacation mode and status flags** – freeze your empire while away (nothing produced, nobody can attack or spy on you; needs a quiet empire and lasts a minimum stay). The Galaxy flags vacation, online/inactive/long-inactive commanders, and newbie vs. too-strong protection.
- **Alerts outside the game** – when a fleet, raid or missile is heading for you (or an ally), or a tribute is demanded, get a push on Discord (webhook) or your phone (ntfy.sh topic), or a browser notification. Per-event switches, only-when-away by default, rate-limited; addresses are allowlisted (no arbitrary URLs) and masked in the UI.
- **Character classes** – pick Collector (+15% mines, +10% energy, bigger cargo ships, cheaper merchant), General (+2 fleet slots, -25% fuel, faster combat ships, more debris) or Discoverer (+1 expedition slot, +50% finds, fewer ambushes, faster research, bigger colonies). First pick is free; changing costs Command Credits.
- **Moon destruction and wreck fields** – send Deathstars on a *Destroy moon* mission: the chance is (100 - sqrt(diameter)) x sqrt(Deathstars) %, and the shock wave can tear the Deathstars apart (sqrt(diameter)/2 %). Defenders whose lost ships are worth enough get a wreck field; a Space Dock rebuilds a share of it for free (30% + 6% per level, max 90%) before it drifts away.
- **Position bonuses and Crawlers** – orbits 1-3 pay +40/30/20% crystal and orbits 6-10 pay up to +35% metal. Crawlers (planet-only, stay home, fragile) add +0.1% to every mine each, up to 6 per mine level and +50% overall (Collectors: x1.25), and each working crawler draws 6 energy. The Economy page shows both as their own slices.
- **Standing categories and commander profiles** – switch the highscore between total, economy, research, fleet, defense and activity rankings (battles won, destroyed, plundered, recycled, expeditions, raids repelled, moons destroyed). Click any name (Standing or Galaxy) for a public profile: rank in every category, points breakdown, record, class, faction, alliance, achievements and a history chart. Resources, fleets and queues stay private.
- **Accounts and admin** – change password, rename (weekly), delete account, and a one-time recovery key for lost passwords (no email needed). Set `ZGAME_ADMINS=name1,name2` to get an Admin page: ban/mute (timed or permanent), announcements, send a raid, gift resources, remove a commander.
- **Contacts and galaxy tools** – buddy list with presence, block list, private notes on commanders and coordinates, system bookmarks, recent targets, a spy-report archive (latest report per planet), inactive/protected filters in the Galaxy, and a Report button that feeds the admin queue.
- **Alliance depth** – custom ranks with individual permissions, a bulletin board with pinned posts, mass messages, and diplomacy: non-aggression pacts (neither alliance can attack the other) and war declarations (flagged in the Galaxy).
- **Battle reports and expeditions** – every report has a round-by-round census and a public share link. Expeditions last 1-4 hours (+30% finds per extra hour, a wider black hole), recyclers add +25% resource finds and can salvage wreckage, probes scout and shrink pirate fleets 25%, and ancient data caches speed up your running research.
- **Merchant daily deal and empire gather** – each day the merchant does one trade at a 2% cut up to a daily allowance; a one-click Gather sends cargo ships from all your planets to the current one.
- **Polish** – phone-friendly layout, a welcome tour, an in-game What's new, optional sound cues, unread/hostile counters in the browser tab title, and menus/login in English, German, Spanish and French (other screens fall back to English).
- **Seasons** – optional time limit and/or victory score. When a season ends the champion gets Command Credits and an achievement, the top 10 enter the hall of fame (Standing page), and after a grace period the universe resets: new homeworlds and computer empires, while accounts, credits, officers, class, achievements and alliances carry over.
- **Supply depot, Pathfinder, Joint Command, server-side presets** – Command Credits buy production crates and build/research rushes; the Pathfinder ship boosts expeditions and dodges black holes; an alliance upgrade adds fleet slots; fleet presets are stored on the server. Admins can inspect any commander's full state.
- **Automation** – saved build orders ("raise X to level N" steps, with automatic prerequisites, waiting for resources, separate building and research lanes, ready-made templates) and rules (energy, storage, defense on incoming attack, each within spending limits). Runs in the server tick, so it works while you are away.
- **Contracts** – three daily and two weekly contracts per commander (build, research, ships, spy reports, battles, expeditions, debris, deliveries to allies, plunder), seeded per player and period, measured from player stats, paid in Command Credits with a daily streak and an all-dailies bonus.
- **Banners elsewhere** – the galaxy list (click a position number), commander profiles (home world), spy reports and battle reports show the world's banner through a shared `WorldBanner`; the server sends each world's `look` in those views.
- **Territory** – an alliance holds a system when its members' planets there (100 base + points of what stands on them) reach 300 and lead by 25%; holders keep it until a rival has 25% more or its own weight falls below 150. Each held system gives every member +0.5% mine output (cap +10%). Recalculated every minute; sector map page, banner in the Galaxy, systems-held column in Standing.
- **Scored alliance wars** – an officer declares a timed war (`ZGAME_WAR_HOURS`, default 48, 0 = off; both alliances need 2+ members, one war at a time, 24 h rematch cooldown). Each side scores 1 point per 1,000 resources of enemy units destroyed in battles between the two alliances plus 15 points per held system per hour; the higher score wins a quarter of the loser's losses for its bank and a Command Credit pool for the fighters (only if at least 50 points came from fighting). Conceding ends it at once.
- **Void invasions** – a scheduled campaign: waves of alien kinds (`shared/aliens.ts`), a shared front at the rift, strike teams at planets, scouting probes and supply convoys (`server/alien.ts`), rewards for every job (`server/invasion.ts`). Originally a single shared boss (`ZGAME_INVASION_INTERVAL_HOURS`, default every 72 h, 0 = off): announced hours ahead, then a rift in deep space where every fleet that joined the front fights the Armada as one force each engagement (30 min). The Armada is sized from the combat fleets the whole server owns (35% of them when it is announced), rebuilds 5% per round, and rewards (Command Credits, Void Slayer) follow each commander's damage share. Admins can start or end one by hand.
- **Installable app and web push** – a web manifest, icons and a service worker make the game installable on phones and desktops, and devices can subscribe to push notifications that follow the same categories, "only when away" setting and rate limits as Discord/ntfy. The server creates its VAPID identity once (kept in the save; set `ZGAME_PUSH_SUBJECT` to a `mailto:` or https contact). Push needs HTTPS (or localhost). `node scripts/make-icons.mjs` redraws the icons.
- **SQLite persistence (optional)** – set `ZGAME_DB=data/world.sqlite` and every player, planet, fleet and message becomes its own row; autosaves write only rows that changed. An existing JSON save is imported automatically on the first start. Uses Node's built-in `node:sqlite`, so there is nothing to install.
- **Empire page** – every planet and moon on one screen: resources, production, construction, ships, storage warnings.
- **Live UI** – WebSocket push for alerts/messages/chat, interpolated resource counters, countdowns.

## Artwork

Buildings, research, ships, defenses and resources use a drawn placeholder until a real picture exists. Pictures are generated outside the game and dropped in as files:

```
npm run art              # progress per category and what is missing
npm run art -- next 4    # the next 4 missing items with prompts to paste into the image generator
npm run art -- all       # write art/PROMPTS.md with every prompt
```

Save each result as `client/src/assets/art/<id>.png` (`.webp` and `.jpg` also work; or point `npm run art -- ingest <folder>` at a folder of generated files: it recognises generator names such as `media-generation-metalmine-0-<uuid>.webp` (case-insensitive, with optional `buildings/`, `ships/`, `research/`, `defenses/`, `planets/`, `moons/` sub-folders), shrinks each to at most 768 px as WebP and saves it under its id; `npm run art -- optimize` shrinks files dropped in by hand. Planet and moon looks are `planet-<look>.webp` and `moon-<look>.webp`, picked per world id (planets by temperature) in `shared/artlist.ts`; resources are `res-metal`, `res-crystal`, `res-deuterium`, `res-energy`). The next build bundles it and replaces the placeholder for that item; items without a file keep the placeholder. Prompts come from `shared/artlist.ts`, which reads the item list, so new items appear automatically. Square images, 512 px or so, are plenty: they are shown at 64-96 px.

## Try it with a demo universe

```bash
npm run demo   # seeds alice/bob/carol (allied) + rival, password demo1234, then starts the server
```

## Layout

```
shared/   pure game rules shared by server and client (data, formulas, combat)
server/   Express + ws server, world model, economy, fleets, alliances, NPC raids, persistence
client/   React + Vite single-page app
test/     vitest: formulas & combat, full game flows with a fake clock, HTTP API
```

Performance: `npm run bench -- 300` builds a 300-commander universe and times the hot paths (a full server tick is ~1 ms, a save ~5 ms, so a small server is nowhere near its limits).

Browser smoke tests: `npm run e2e` builds the client, starts a real server on a private port with a throwaway save, and drives it with the Edge or Chrome already on the machine (via `playwright-core`; no browser download). It registers through the form, opens every page on a desktop and a phone width checking for crashes, console errors and sideways scrolling, and uses the main features. It skips itself when no browser is found and is not part of `npm test`.

`npm run balance:new` prints payback times and multipliers for crawlers, classes, orbit bonuses, the merchant deal, the supply depot and expedition ships (run it after changing any of those constants).

`npm run balance:invasion [number]` dry-runs a Void invasion with simulated commanders (how big a share of the server fleets it takes to win, by fleet mix and technology); run it after changing the invasion strength, wave shares or alien kinds. `test/invasion-balance.test.ts` pins the targets: one commander never wins alone, about a third of the fleets together win.

`npm test` runs the suite, `npm run typecheck` runs `tsc`, and `npm run balance -- 72` plays a greedy bot for 72 simulated hours and prints economy milestones (handy when tuning speeds or costs).

## Not implemented (ideas)

A player-to-player market, scored alliance wars, translations beyond the menus, and automatic start of queued jobs once affordable.

## Hosting

The full guide is in [docs/DEPLOY.md](docs/DEPLOY.md): Docker with automatic HTTPS (`docker compose up -d`), plain Node, backups and restores, and a checklist before inviting players.

```bash
npm run backup                              # snapshot the save (JSON or SQLite) into data/snapshots, keeping the newest 14
npm run backup -- restore <snapshot file>   # put one back (stop the server first)
```
