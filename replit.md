# Pulse Runner

A responsive browser rhythm game: race through a Three.js tunnel, hit four lanes in time with original electronic music, and build a score and combo.

## Run & Operate

- `pnpm --filter @workspace/pulse-runner run dev` — managed web workflow (provides PORT and BASE_PATH)
- `pnpm --filter @workspace/pulse-runner run typecheck` — check the game
- `pnpm --filter @workspace/scripts exec tsx --test ../artifacts/pulse-runner/src/game/missions.test.ts` — focused mission and game lifecycle checks
- `pnpm --filter @workspace/scripts exec tsx --test ../artifacts/pulse-runner/src/game/timing.test.ts` — calibration, storage, audio-clock and note-arrival checks
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- The game runs entirely in the browser; no database, API keys, or external music service required.
- `DATABASE_URL` is only needed if developing the unused shared database library.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Game: React + Vite, Three.js with React Three Fiber, Web Audio
- Personal bests: browser localStorage, separated by track and difficulty
- The shared API and database packages are scaffolded but are not used by the game.
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/pulse-runner/src/App.tsx` — menu, HUD, controls, and result screens
- `artifacts/pulse-runner/src/components/` — tunnel renderers
- `artifacts/pulse-runner/src/game/engine.ts` — beatmaps, timing, scoring, game lifecycle
- `artifacts/pulse-runner/src/game/audio.ts` — original procedural synth soundtrack and audio clock
- `artifacts/pulse-runner/src/game/missions.ts` — per-run mission progress and persistent completion badges
- `artifacts/pulse-runner/src/index.css` — visual theme

## Architecture decisions

- Keep the first version browser-only: the user asked for a playable music game, not accounts or online leaderboards.
- Use original procedural electronic music so the game works immediately without external assets, credentials, or licensed tracks.
- Audio time is authoritative; visual frame rate must not determine note timing.

## Product

- Three original tracks with distinct tempos and three difficulty levels.
- D/F/J/K or Left/Down/Up/Right key timing; touch pads for smaller screens.
- Perfect/Good/Miss judgments, combo multipliers, accuracy, final grades, and local personal bests.
- Start/countdown, pause/resume, restart, track selection, volume/mute, and help.
- Optional timing calibration from Tracks or Results: eight audible/visual clicks, tap suggestion or manual −300 to +300 ms, reset to 0, and browser-local preference with storage warnings. Adjustments apply between runs; this is not a hardware-latency guarantee.
- Four missions: finish a track, reach a 20-hit combo, land 40 perfect hits, and score 100,000 points. Completed badges persist locally; incomplete objectives reset each run.

## User preferences

- The user explicitly requested a responsive web tunnel runner music game using Three.js, with keyboard rhythm hits and score-based forward travel.
- The user wants missions/quests and a more intense circular cyberpunk tunnel theme.

## Gotchas

- Browser audio starts only after a user gesture. Do not autoplay before Start.
- Leaving the tab pauses gameplay to prevent unfair misses.
- Use the existing managed `artifacts/pulse-runner: web` workflow rather than a separate dev server.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
