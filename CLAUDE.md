# Working on Stellar Frontier

- **Keep the in-game Guide current.** Any change players or admins can see (a feature, a rename, a changed rule or number, a new setting) updates `client/src/pages/Guide.tsx` and adds an item to the newest entry in `client/src/changelog.ts` (start a new entry with a new `id` for a batch, so the "What's new" banner shows again). Do it in the same commit as the change. Internal-only work (refactors, tests, deployment) does not need a Guide entry; deployment and settings go in `README.md` / `docs/DEPLOY.md`.
- **Every feature gets:** tests, UI, a README note, a check in the real browser on a private port (never the default save or port 3000), then a commit.
- Players see **Vespene Gas**; the internal key is still `deuterium`. Use `resName()` from `shared/data.ts` when printing a resource key.
- `npm run balance:new` after changing crawler, class, orbit, merchant, shop or expedition constants.
