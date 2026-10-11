# Working on Stellar Frontier

- **The in-game Guide (`client/src/pages/Guide.tsx`) is a player manual**, strictly about how to play: features, rules, numbers and nuances. It is never an update log: no "new", "now", "changed", "was", dates or version talk. When a change alters something players or admins see or do (a feature, a rename, a rule or number, a setting), **edit the matching topic in place** so the Guide always describes the game as it is, or add a topic for a brand-new system. Do this in the same commit as the change. `test/guide.test.ts` enforces the tone and that every screen and key system is covered; extend its lists when you add one.
- **Release notes live elsewhere**: `client/src/changelog.ts`, shown on the *What's new* page (banner + Settings link). Add an item to the newest entry for each player-visible change (start a new entry with a new `id` for a batch, so the banner shows again).
- Internal-only work (refactors, tests, deployment) needs neither; deployment and settings go in `README.md` / `docs/DEPLOY.md`. Server-operation details (environment variables, backups) do not belong in the Guide.
- **Every feature gets:** tests, UI, a README note, a check in the real browser on a private port (never the default save or port 3000), then a commit.
- Players see **Vespene Gas**; the internal key is still `deuterium`. Use `resName()` from `shared/data.ts` when printing a resource key.
- `npm run balance:new` after changing crawler, class, orbit, merchant, shop or expedition constants.
