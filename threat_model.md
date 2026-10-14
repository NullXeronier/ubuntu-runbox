# Threat Model

## Project Overview

Pulse Runner is a browser-only Three.js rhythm game (React + Vite, Web Audio). It is a pnpm monorepo containing:

- `artifacts/pulse-runner` — the shipped game. Runs entirely client-side; state (personal bests, mission badges, reduced-effects preference) lives in browser `localStorage`. No accounts, no network calls, no server dependency.
- `artifacts/api-server` — an Express 5 server that currently exposes only `GET /api/healthz` returning `{status:"ok"}`. No authentication, database, user data, or privileged actions.
- `artifacts/mockup-sandbox` — a design/`/__mockup` sandbox (shadcn/ui component gallery). Development-only.
- `lib/*` — scaffolded, unused shared API client, Zod schemas, and DB (Drizzle) packages. Not wired into the game.

## Assets

- **Local gameplay state** — personal bests, mission completion, effects preference in `localStorage`. Low value; attacker-tampering only affects the local user's own scores/badges.
- **Application source/bundles** — client code is public by design. No secrets are embedded.

There is effectively no server-side sensitive data, no credentials, and no multi-user/tenant data in the current codebase.

## Trust Boundaries

- **Browser to API** — the only server endpoint is an unauthenticated health check. No sensitive data crosses this boundary.
- **Browser to localStorage** — game persistence. Fully under the local user's control; not a cross-user boundary.

There is no Public/Authenticated boundary, no User/Admin boundary, and no Server/Database boundary in active use (the DB library is unused).

## Scan Anchors

- Production entry points: `artifacts/pulse-runner/src/` (client game), `artifacts/api-server/src/routes/` (only `health.ts`).
- Highest-risk areas (relatively): `artifacts/api-server` if routes are added later; currently negligible.
- Public surface: static game assets + `GET /api/healthz` (unauthenticated, non-sensitive).
- Dev-only / ignore unless proven reachable: `artifacts/mockup-sandbox` (design sandbox), `lib/*` (unused scaffolding).
- `app.use(cors())` in `artifacts/api-server/src/app.ts` is permissive but currently only guards a non-sensitive health endpoint — revisit if authenticated/data routes are added.

## Threat Categories

### Tampering

Players can edit their own `localStorage` values (`pulse-best:*`, mission badges, `pulse-reduced-effects`). This only affects the local user's own display and is not a security boundary. Values are read defensively (`Number(...)`, try/catch) so malformed storage cannot crash the game or reach a dangerous sink.

### Information Disclosure

No secrets, PII, or credentials exist in the client bundle or server. The health endpoint returns a static status. No disclosure risk in the current code.

### Elevation of Privilege

No authentication, roles, or server-side privileged actions exist, so there is no privilege boundary to cross today. If the `api-server` or the scaffolded `lib/db` / `lib/api-client-react` packages are later activated with real routes and user data, authorization, input validation, and a restrictive CORS policy must be added before launch.
