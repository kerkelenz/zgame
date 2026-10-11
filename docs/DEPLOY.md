# Running Stellar Frontier for other people

Two ways: a small server with Docker (recommended), or plain Node on any machine.

## Option A: Docker with automatic HTTPS

You need a machine that is always on (a small VPS is plenty: 1 vCPU and 1 GB RAM runs a few hundred players), Docker with the compose plugin, and a DNS name pointing at it with ports 80 and 443 open.

1. Copy the project to the server (`git clone`, or copy the folder).
2. Create a file named `.env` next to `docker-compose.yml`:

   ```
   DOMAIN=play.example.com
   OGAME_ADMINS=yourname
   OGAME_ADMIN_KEY=a-long-random-secret
   # optional
   OGAME_SEASON_DAYS=0
   OGAME_MAX_PLAYERS=500
   ```

   `OGAME_ADMINS` is a comma-separated list of usernames that get the Admin page. A listed name is **reserved** until it is registered, so a stranger cannot grab it first: register it on the Register tab and type the value of `OGAME_ADMIN_KEY` into the *Admin setup key* box (add a long random `OGAME_ADMIN_KEY=` line to `.env`; without one, only a browser on the server machine itself can claim the name).
3. Start it: `docker compose up -d --build`
4. Open `https://play.example.com`. Caddy fetches and renews the certificate on its own.

What you get: the game on its own SQLite database in the `game-data` volume, Caddy in front of it (TLS, compression, security headers), and a `backup` container that snapshots the database once a day and keeps the newest 14.

Everyday commands:

| What | Command |
| --- | --- |
| See logs | `docker compose logs -f game` |
| Update to a new version | `git pull && docker compose up -d --build` |
| Stop everything | `docker compose down` (data stays in the volumes) |
| Take a backup right now | `docker compose exec game npx tsx server/backup.ts` |
| List backups | `docker compose exec game ls /data/snapshots` |

### Restoring a backup

```
docker compose stop game backup
docker compose run --rm game npx tsx server/backup.ts restore /data/snapshots/<file>
docker compose start game backup
```

The file being replaced is kept next to it as `world.sqlite.before-restore-<time>`, so a mistaken restore is itself reversible.

Copy `/data/snapshots` somewhere else now and then (another machine or object storage): backups on the same disk do not survive that disk dying. For example `docker cp $(docker compose ps -q game):/data/snapshots ./offsite`.

## Option B: plain Node

Needs Node 24 or newer (the SQLite option uses the built-in `node:sqlite`).

```
npm ci
npm run build
OGAME_DB=data/world.sqlite OGAME_ADMINS=yourname npm start
```

Use a process manager (systemd, pm2) to restart it on a crash or reboot, and put a reverse proxy with HTTPS in front of it. Set `OGAME_TRUST_PROXY=1` when you do, so the rate limits see real client addresses and not the proxy's. Back up with `npm run backup` from cron, for example every night:

```
0 4 * * *  cd /path/to/game && OGAME_DB=data/world.sqlite npm run backup
```

## Settings worth knowing

Everything in the README table can be set as an environment variable. The ones that matter for a public server:

| Variable | Why |
| --- | --- |
| `OGAME_ADMINS` | who can moderate (ban, mute, announcements); the names are reserved until registered |
| `OGAME_ADMIN_KEY` | secret that lets you register a reserved admin name remotely |
| `OGAME_MAX_PLAYERS` | closes registration at this many commanders |
| `OGAME_TRUST_PROXY` | needed behind any proxy, otherwise everyone shares one rate limit |
| `OGAME_DB` | SQLite persistence (Docker sets it); without it the server writes `world.json` |
| `OGAME_SEASON_DAYS`, `OGAME_VICTORY_POINTS` | seasons and an early victory score |
| `OGAME_BACKUP_KEEP`, `OGAME_BACKUP_DIR` | how many snapshots to keep and where |

## What is protected, and what is not

- Passwords are stored as salted scrypt hashes. Logins expire after 30 days without use, and *Log out* revokes the login on the server.
- Wrong passwords are throttled per account and per address; registrations and messages are rate limited.
- Responses carry a strict content security policy and anti-framing headers; the WebSocket accepts no large client frames and at most 8 connections per player.
- Admin actions are checked on the server against `OGAME_ADMINS`, never against anything the browser sends.
- The page and API do **not** hide anything from the server operator: the save file contains everything. Treat backups as sensitive.
- Run it behind HTTPS (the Caddy setup does). The WebSocket takes its login token in the URL, which a proxy may log, so do not share proxy logs.

## Moving from a JSON save to SQLite

Set `OGAME_DB` and start the server once with `OGAME_SAVE` still pointing at the old `world.json`: it imports the file automatically when the database is empty. After that the JSON file is no longer written.

## Checklist before inviting players

- HTTPS works and `https://your-domain/api/health` answers `{"ok":true,...}`
- you registered your own account (using the admin setup key) and can open the Admin page
- you made a backup and tried restoring it into a test copy
- the machine restarts the game by itself after a reboot (`restart: unless-stopped` does this in Docker)
