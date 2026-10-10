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
| `OGAME_FLEET_SPEED` | 10 | flight time ÷ |
| `OGAME_PROTECTION_POINTS` | 200 | players under this can't attack or be attacked |
| `OGAME_RAID_INTERVAL_MIN` | 45 | minutes between NPC raid waves (0 = off) |
| `OGAME_GALAXIES`, `OGAME_SYSTEMS`, `OGAME_POSITIONS` | 2 / 40 / 15 | universe size |

Config is stored in the save on first start; env vars override it on later starts.

## Features

- **Economy** – metal/crystal/deuterium mines, solar/fusion/satellite energy, storage caps, production sliders, robotics/nanite build speed, planet fields & temperature.
- **Tech** – 14 researches with OGame-style prerequisites; drives change ship speeds, weapons/shielding/armour change combat.
- **Shipyard** – 14 ships, 8 defenses, batch queues with refunds, shield-dome limits. Buildings and research can queue 4 deep (paid when each starts).
- **Missiles** – missile silo, anti-ballistic and interplanetary missiles: strike defenses in range, ABMs intercept one-for-one.
- **Fleets** – attack, transport, deploy, espionage, colonize, recycle debris, expeditions, plus **hold (defend ally)**. Fuel, cargo, speed %, fleet slots, recall.
- **Combat** – 6-round simulation with rapid fire, shield bounce, explosion chance, debris fields, 70 % defense rebuild, loot rules, detailed battle reports.
- **Co-op** – alliances (open/application), ranks, shared bank with grants, alliance upgrades (+mine output, −research time, +fleet speed for every member), allied fleets that fight alongside a defender, joint (ACS) attacks that arrive together and split the loot, allied alerts when a member is attacked, alliance chat.
- **PvE** – periodic NPC raid waves aimed at players; defenders (and allied holders) split a bounty when raiders are crushed. Expeditions can find resources, ships, pirates or a black hole.
- **Social** – messages (battle/spy/system reports and player mail), global chat, galaxy browser, highscore for players and alliances, newbie protection.
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

`npm test` runs the suite, `npm run typecheck` runs `tsc`.

## Not implemented (ideas)

Moons/jump gates, premium currency.

## Hosting

```bash
docker build -t stellar-frontier .
docker run -p 3000:3000 -v stellar-data:/data stellar-frontier
```
