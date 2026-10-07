# Frank's Poolhouse — developer documentation

Living documentation for the tournament platform. Product rules and open questions are in
`CLAUDE.md`; this file describes how the app is built and run, and the rules as implemented.

## Prerequisites

- Node.js 24 LTS (includes npm)
- Docker Desktop

## Setup and commands

The repo is an npm workspaces monorepo. From the repo root:

```sh
npm install         # install all workspaces
npm test            # run every workspace's tests
npm run typecheck   # type-check every workspace
npm run lint        # ESLint over the whole repo
npm run format      # Prettier (Markdown is excluded)
```

Line endings are normalized to LF by `.gitattributes`, so files behave the same on Windows and
inside Linux containers.

## Architecture

Planned (see `CLAUDE.md` → Tech stack):

- `packages/core`: pure TypeScript domain logic (ranking, qualification, seeding, scheduling,
  points), unit-tested with Vitest.
- `apps/server`: Fastify REST API + Server-Sent Events for live updates; serves the built web app.
- `apps/web`: React + Vite frontend, including the public `/live` view for the club's flatscreen.
- PostgreSQL via Drizzle; `docker-compose` runs the app and the database locally.

## Decisions log

| Date | Decision |
|---|---|
| 2026-10-07 | Web only (no app stores); responsive React instead of React Native. |
| 2026-10-07 | Public read-only `/live` route for the flatscreen in the club. |
| 2026-10-07 | Admins can correct results, including in concluded tournaments. |
| 2026-10-07 | Admins can edit player handicaps by hand. |
| 2026-10-07 | Run locally with Docker for now; production hosting decided later. |
| 2026-10-07 | Styling is placeholder until a later design pass. |
