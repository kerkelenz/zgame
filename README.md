# Stellar Dominion

A singleplayer, OGame-style space empire game. One codebase, three targets:
iOS, Android and web (Expo + React Native + `react-native-web`).

## Getting started

```bash
npm install
npm run gen:placeholders   # generates placeholder art + src/assets/manifest.ts
npm run web                # or: npm start / npm run ios / npm run android
```

## Scripts

| Script                     | What it does                                            |
| -------------------------- | ------------------------------------------------------- |
| `npm start`                | Expo dev server (pick a platform from the menu)         |
| `npm run web`              | Dev server, opens the web build                         |
| `npm run ios` / `android`  | Dev server targeting a simulator/emulator or Expo Go    |
| `npm test`                 | Vitest — pure-TypeScript engine unit tests              |
| `npm run lint`             | ESLint, including the `src/engine` purity boundary      |
| `npm run gen:placeholders` | Regenerates placeholder PNGs and `src/assets/manifest.ts` |

## Architecture

```
src/engine/   pure TypeScript simulation — costs, production, queue, tick.
              No React, no React Native, no storage. Enforced by ESLint.
src/state/    zustand store + AsyncStorage persistence. Owns *time*.
src/assets/   asset manifest, generated placeholder art, real art later.
src/components/  small presentational React Native components.
src/lib/      formatting helpers and the visual theme.
app/          Expo Router screens (file-based routing).
scripts/      build-time tooling (placeholder art generator).
```

The single most important rule in this codebase: **the store owns time, the
engine is timeless.** Every engine function that cares about "now" receives it
as an argument. That is what makes the whole simulation deterministic and
testable, and what will let the same code run on a server later.
