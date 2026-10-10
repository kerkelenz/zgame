# Stellar Frontier

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
| `OGAME_SAVE` | `data/world.json` | save file |
| `OGAME_ECONOMY_SPEED` | 20 | production ×, build/research/ship time ÷ |
| `OGAME_PRODUCTION_BOOST` | 5 | extra multiplier on all resource production, on top of the economy speed |
| `OGAME_RESEARCH_BOOST` | 5 | extra multiplier on research speed |
| `OGAME_STORAGE_BOOST` | 5 | extra multiplier on storage (level-0 storage = 10,000 × economy speed × this = 1,000,000 by default) |
| `OGAME_FLEET_SPEED` | 10 | flight time ÷ |
| `OGAME_PROTECTION_POINTS` | 200 | players under this can't attack or be attacked |
| `OGAME_RAID_INTERVAL_MIN` | 45 | minutes between NPC raid waves (0 = off) |
| `OGAME_NPC_DENSITY` | 0.3 | share of free slots settled by computer empires when the universe is created (0 = none; an existing save without empires gets them on next start) |
| `OGAME_RAID_STRENGTH` | 1 | size of raiding fleets: 0.6 relaxed, 1 standard, 1.35 brutal |
| `OGAME_MAX_PLAYERS` | 500 | registration closes at this many commanders |
| `OGAME_TRUST_PROXY` | unset | set to `true` (or a hop count) when behind a reverse proxy so rate limits use the real client IP |
| `OGAME_GALAXIES`, `OGAME_SYSTEMS`, `OGAME_POSITIONS` | 2 / 40 / 15 | universe size |

Config is stored in the save on first start; env vars override it on later starts.

## Features

- **Economy** – metal/crystal/deuterium mines, solar/fusion/satellite energy, storage caps, production sliders, robotics/nanite build speed, planet fields & temperature.
- **Tech** – 14 researches with OGame-style prerequisites; drives change ship speeds, weapons/shielding/armour change combat.
- **Shipyard** – 14 ships, 8 defenses, batch queues with refunds, shield-dome limits. Buildings and research can queue 4 deep (paid when each starts).
- **Moons** – big debris fields can condense into a moon (1% per 100k, max 20%). Build a Lunar Base for room, a **Sensor Phalanx** to scan fleet movements around planets in range (spot raiders heading for allies) and a **Jump Gate** to teleport ships between your moons. Missions can target moons.
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
- **Empire page** – every planet and moon on one screen: resources, production, construction, ships, storage warnings.
- **Live UI** – WebSocket push for alerts/messages/chat, interpolated resource counters, countdowns.

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

`npm test` runs the suite, `npm run typecheck` runs `tsc`, and `npm run balance -- 72` plays a greedy bot for 72 simulated hours and prints economy milestones (handy when tuning speeds or costs).

## Not implemented (ideas)

Premium currency, moon destruction (Deathstar vs moon).

## Hosting

```bash
docker build -t stellar-frontier .
docker run -p 3000:3000 -v stellar-data:/data stellar-frontier
```
