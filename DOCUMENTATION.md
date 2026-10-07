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

### Running the server locally

```sh
cp .env.example .env              # once; local settings, git-ignored
docker compose up -d db           # Postgres on localhost:5432 (data in the db-data volume)
npm run dev -w @franks/server     # API on http://localhost:3000, restarts on changes
```

The server applies pending migrations and seeds the points table on startup.
`GET /api/health` returns `{"status":"ok"}` when the API can reach the database.

### Running the frontend locally

```sh
npm run dev -w @franks/web        # http://localhost:5173, proxies /api to the server on :3000
```

Routes (see `apps/web/src/main.tsx`): `/`, `/turneringer`, `/turneringer/:id`, `/spillere`,
`/login`, `/admin/turnering/ny`, `/admin/turnering/:id`, and `/live` (full screen, no header,
for the flatscreen in the club). All UI text lives in `apps/web/src/strings.ts`, and the
placeholder colours are CSS variables at the top of `apps/web/src/styles.css`.

### Running everything in Docker

```sh
docker compose up -d --build      # app on http://localhost:8080, Postgres on :5432
docker compose logs -f app        # follow the app's logs
docker compose stop               # stop, keeping the data
```

The `Dockerfile` builds a single image: the Fastify server serves the API under `/api` and the
built React app for every other path, so client-side routes like `/live` work on reload. The
image is configured only through environment variables (`DATABASE_URL`, `PORT`, `WEB_DIST`),
so it can move to any container host later.

### Database changes

1. Edit `apps/server/src/db/schema.ts`.
2. `npm run db:generate -w @franks/server -- --name <what_changed>` writes a SQL migration to
   `apps/server/drizzle/`. Review it and commit it with the schema change.
3. Restart the server (or run `npm run db:migrate -w @franks/server`) to apply it.

To start over with an empty database: `docker compose down -v` (deletes all local data).

## Data model

Defined in `apps/server/src/db/schema.ts`. Only raw frame scores are stored; standings,
qualification, seeding and the knockout bracket are derived with `@franks/core`.

| Table | Purpose |
|---|---|
| `players` | Name, member, base/frame handicap, last adjusted date. |
| `seasons` | `01/YYYY`, `02/YYYY`. |
| `tournaments` | Date, season, week, format (8/9/10-ball), knockout size (4/8), status (draft → pools → knockout → concluded). |
| `tournament_players` | Who entered a tournament. |
| `pools`, `pool_members` | Pools (A, B, …) and their players in drawn order. |
| `knockout_seeds` | Seeds, best first. The bracket is derived from these and the knockout scores. |
| `matches` | Pool and knockout matches: stage, pool or slot (QF1 … FINAL), players, frames, play order. |
| `results` | Per player per concluded tournament: placement, points, matches won, handicap snapshot. |
| `points_table` | Points per placement, seeded from the workbook (10/7/5/4/2/1). |
| `admins`, `sessions` | Admin accounts and login sessions (token hashes only). |

## Architecture

Planned (see `CLAUDE.md` → Tech stack):

- `packages/core`: pure TypeScript domain logic (ranking, qualification, seeding, scheduling,
  points), unit-tested with Vitest.
- `apps/server`: Fastify REST API + Server-Sent Events for live updates; serves the built web app.
- `apps/web`: React + Vite frontend, including the public `/live` view for the club's flatscreen.
- PostgreSQL via Drizzle; `docker-compose` runs the app and the database locally.

## Domain logic (`packages/core`)

Pure functions with no I/O. Randomness is passed in as an `Rng` (`() => number`, like
`Math.random`), and `seededRng(seed)` gives a reproducible one for tests. Run the tests with
`npm test -w @franks/core`. The fixtures are the Group A–C results from the workbook.

| Module | What it does |
|---|---|
| `standings.ts` | `poolStandings(players, results)`: wins, losses, frames for/against, set score, rank. |
| `schedule.ts` | `roundRobinRounds`, `playOrder`, `upNext`, `nextOpponent`: pool schedule and the "up next" panel. |
| `pools.ts` | `poolSizes`, `drawPools`, `swapPlayers`, `movePlayer`: default pool sizes, random draw, admin changes. |
| `qualification.ts` | `qualifyFromPools`, `suggestedKnockoutSize`: who goes through to the knockout. |
| `seeding.ts` | `seedQualifiers`: order qualifiers for the bracket. |
| `knockout.ts` | `knockoutBracket(seeds, scores)`: the whole bracket, derived from seeds and scores. |
| `placements.ts` | `placements`, `pointsFor`, `DEFAULT_POINTS_TABLE`: final placings and season points. |

### Rules as implemented

- **Pool ranking**: matches won → set score (frames for − frames against) → head-to-head. With
  three or more tied players, head-to-head is a mini-league of their matches against each other,
  applied again to whoever is still level. A tie that can't be broken (a cycle such as A>B>C>A,
  or a deciding match not yet played) is **flagged** with `unresolvedTie`, and the **admin
  chooses** the order. The choice is passed to `poolStandings` as `adminOrder` and stored in
  `pool_members.admin_tiebreak`. It only applies to players results can't separate.
- **Tables**: the club has enough tables for every pool match to be played at once.
- **Pools of 4**: no schedule and no "up next" panel. Players just play whoever they haven't
  played yet, and results can be entered in any order.
- **Pools of 5**: circle-method round robin (`roundRobinRounds`). Each round has two matches and
  one player sitting out, and each player sits out exactly once, so nobody sits out twice in a
  row. The "up next" panel (`upNext`, `nextOpponent`) follows this order. `playOrder` also
  avoids back-to-back matches across round boundaries, in case matches are ever called one at a
  time.
- **Pool splits**: `poolSizes(n)` uses as few pools of 4–5 as possible, so 20 players make four
  pools of 5. Counts that can't be split that way have fixed splits: 6 → one pool of 6
  (everyone plays everyone), 7 → 4 + 3, 11 → 4 + 4 + 3.
- **Admin changes to pools**: after the random draw the admin can swap two players
  (`swapPlayers`, sizes unchanged) or move a player to another pool (`movePlayer`, sizes
  change; a pool can't drop below 2 players).
- **Odd and even pools**: pools of 3 and 5 follow the round order and show "up next"; each player
  sits out exactly once. Pools of 4 and 6 have no schedule.
- **Qualification**: the same number from each pool (for example, top 2 of 4 pools for
  quarterfinals). Uneven cases throw `UnsupportedQualificationError` until the rule is decided.
  An unresolved tie across the cut-off is reported in `tiesAtCutoff`.
- **Seeding**: wins → set score → random. Bracket layout as in the workbook: QF1 1v8, QF2 4v5,
  QF3 2v7, QF4 3v6; SF1 = winners of QF1/QF2, SF2 = winners of QF3/QF4. Semifinals only: 1v4,
  2v3. The top two seeds can only meet in the final.
- **Knockout**: semifinal losers play the third-place final; winners play the final. The
  bracket is recomputed from seeds and scores every time, so a corrected score flows through.
- **Placements**: 1st/2nd from the final, 3rd/4th from the third-place final, quarterfinal
  losers share 5–8, everyone else gets participation. Points: 10/7/5/4/2/1.

## Decisions log

| Date | Decision |
|---|---|
| 2026-10-07 | Web only (no app stores); responsive React instead of React Native. |
| 2026-10-07 | Public read-only `/live` route for the flatscreen in the club. |
| 2026-10-07 | Admins can correct results, including in concluded tournaments. |
| 2026-10-07 | Admins can edit player handicaps by hand. |
| 2026-10-07 | Run locally with Docker for now; production hosting decided later. |
| 2026-10-07 | Styling is placeholder until a later design pass. |
| 2026-10-07 | Pool ties: wins → set score → head-to-head (mini-league for 3+); if still level, the admin chooses. |
| 2026-10-07 | 20 players → four pools of 5 (as few pools as possible). |
| 2026-10-07 | Every pool match has a table. Pools of 4 have no schedule; "up next" is only for pools of 5. |
| 2026-10-07 | 6 players → one pool of 6; 7 → 4 + 3; 11 → 4 + 4 + 3. The admin can move players between pools. |
