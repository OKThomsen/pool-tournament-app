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
for the flatscreen in the club) and `/saeson`.

Login in the frontend: `useSession()` (`apps/web/src/auth.ts`) returns the logged-in admin,
`null` for the public, or `undefined` while loading. Pages under `/admin` are wrapped in
`RequireAdmin`, which sends visitors to `/login` and back afterwards. That only hides pages; the
API checks the session on every admin request. When logged in, the header shows Ny Turnering
and Logout instead of Log ind. Logout asks for confirmation first, using the reusable
`ConfirmDialog` component (`apps/web/src/components/ConfirmDialog.tsx`). API calls go through
`api()` in `apps/web/src/api.ts`.

Spillere (`apps/web/src/pages/PlayersPage.tsx`) lists every player with base and frame handicap
in separate columns, Medlem and Sæsonpoint for the current season, and all-time statistics.
When logged in, the page also has a "Tilføj ny spiller" form and Rediger/Slet on each row
(deleting asks for confirmation). The forms have a "Medlem denne sæson" checkbox.

Sæson (`/saeson`, `apps/web/src/pages/SeasonPage.tsx`) shows the current season's standings.
The frontpage's Sæson Leaderboard shows the same standings as "name – points" and links there.

All UI text lives in `apps/web/src/strings.ts`, and the placeholder colours are CSS variables at
the top of `apps/web/src/styles.css`.

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

### Admin accounts

There is no sign-up. Only the owner creates admin accounts, with this command on the machine
running the app, and hands out the logins:

```sh
npm run admin -w @franks/server -- create <username>        # asks for the password twice
npm run admin -w @franks/server -- set-password <username>  # also signs them out everywhere
npm run admin -w @franks/server -- list
```

Passwords need at least 8 characters. They're typed without being shown, and stored as scrypt
hashes (`apps/server/src/auth/password.ts`). To script it, set `ADMIN_PASSWORD` instead of
typing. In the Docker setup, run it inside the app container:

```sh
docker compose exec app node apps/server/dist/cli/admin.js create <username>
```

### Login API

| Route | Who | What |
|---|---|---|
| `POST /api/auth/login` | public | `{ username, password }` → `{ username }` and a session cookie. 401 on a wrong username or password (same answer for both). At most 10 attempts per IP per 15 minutes, then 429. |
| `POST /api/auth/logout` | anyone | Ends the session and clears the cookie. 204. |
| `GET /api/auth/me` | admin | `{ username }`, or 401 when not logged in. |

- Sessions last 30 days. The cookie (`session`) is `HttpOnly` and `SameSite=Lax`; set
  `COOKIE_SECURE=true` once the app is served over HTTPS. Only a SHA-256 hash of the token is
  stored in `sessions`.
- Every request gets `request.admin` (or null) from `sessionPlugin`. Make a route admin-only
  with `{ preHandler: requireAdmin }` (`apps/server/src/auth/plugin.ts`).
- There is deliberately no route that creates admins; see "Admin accounts".

### Players API

| Route | Who | What |
|---|---|---|
| `GET /api/players` | public | Every player, by name, with `member` and `seasonPoints` for the current season and all-time statistics from concluded tournaments: `participation`, `wins` (tournaments won), `semifinals` (reached), `quarterfinals` (played in one). |
| `GET /api/players/search?q=` | admin | "Tilføj spiller": up to 10 players whose name starts with `q`, ignoring case. |
| `GET /api/players/:id` | public | One player. |
| `POST /api/players` | admin | "Tilføj ny spiller": `{ name, baseHandicap?, frameHandicap?, member? }` → 201. |
| `PATCH /api/players/:id` | admin | Change name, handicaps and/or `member`. A handicap change sets `lastAdjusted` to today (Danish time). `member` records or removes the membership for the current season. |
| `DELETE /api/players/:id` | admin | 204. Refused with 409 `player_has_tournaments` if the player has been in a tournament, so history stays intact. |

Names are trimmed and unique regardless of capitalisation (409 `name_taken`), so the search never
shows two identical names. Handicaps are whole numbers from −20 to 20.

**Membership and season points.** A membership lasts one season (3 months) and is renewed per
season. It's stored per season in `memberships`, so past seasons keep their bonus, and shown on
the player as a simple yes/no for the current season. It resets when a new season starts until
the player renews. Season points = points from the season's concluded tournaments +
`MEMBER_BONUS` (50) if the player is a member that season.

### Seasons API

| Route | Who | What |
|---|---|---|
| `GET /api/seasons/current` | public | `{ label, start, end, standings }` for the season today is in. `standings` lists everyone who played in the season or is a member, by points (then name): `rank` (shared when level on points), `playerId`, `name`, `member`, `points`, `participation`, `wins`, `semifinals`, `quarterfinals`, all counted within the season. |

### Tournaments API

A tournament goes `draft` → `pools` → `knockout` → `concluded`. Only one tournament can be in
progress (not concluded) at a time; a partial unique index in the database enforces it.

| Route | Who | What |
|---|---|---|
| `GET /api/tournaments/ongoing` | public | `{ tournament: { id, date, status } \| null }`: the tournament in progress. |
| `GET /api/tournaments/:id` | public | Everything about a tournament: date, week, season, format, status, knockout size, `players` (with handicaps and Medlem for the tournament's season), `pools` (`{ id, name, playerIds }` in order) and `matches`. |
| `POST /api/tournaments` | admin | "Færdiggør": `{ date, format, playerIds }` → 201, a `draft` with the pools drawn at random (`poolSizes` + `drawPools`). The season and week come from the date. 409 `tournament_in_progress` if another one isn't concluded. |
| `PUT /api/tournaments/:id/pools` | admin | Draft only. `{ pools: playerId[][] }` saves the admin's swaps and moves. Every entrant exactly once, pools of at least 2. |
| `POST /api/tournaments/:id/start` | admin | "finalize brackets": draft only. Creates every pool match in play order (`roundRobinRounds` + `playOrder`, race to 2) and moves to `pools`. |
| `DELETE /api/tournaments/:id` | admin | Cancels a tournament that isn't concluded (deletes it with its pools and matches). |

### Server tests

`npm test -w @franks/server` needs Postgres running (`docker compose up -d db`). The tests use a
separate `franks_test` database in the same container, created and migrated automatically, and
emptied before each test. Override it with `TEST_DATABASE_URL`.

### Hand-written SQL subqueries

Drizzle leaves column names unqualified in single-table queries (`"id"` rather than
`"players"."id"`). Inside a hand-written `sql` subquery that can silently bind to the wrong
table's column. In such subqueries, wrap every column in `qualified()` from
`apps/server/src/db/seasons.ts`.

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
| `players` | Name (unique ignoring case), base/frame handicap, last adjusted date. |
| `seasons` | One row per season label (`01/YYYY` … `04/YYYY`), created the first time a season is used. |
| `memberships` | Player + season: the player renewed their membership for that season (+50 season points). |
| `tournaments` | Date, season, week, format (8/9/10-ball), knockout size (4/8), status (draft → pools → knockout → concluded). |
| `tournament_players` | Who entered a tournament. |
| `pools`, `pool_members` | Pools (A, B, …) and their players in drawn order. |
| `knockout_seeds` | Seeds, best first. The bracket is derived from these and the knockout scores. |
| `matches` | Pool and knockout matches: stage, pool or slot (QF1 … FINAL), players, race length, frames, play order. |
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
| `seasons.ts` | `seasonForDate`, `weekNumber`, `todayInDenmark`, `MEMBER_BONUS`: which season and week a date is in. |

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
- **Qualification** (`qualifyFromPools`): by finishing position. Every pool winner first, then
  the best runners-up, then the best third places, until the 4 or 8 places are filled. When
  only some players from a position fit, they're compared across pools by wins, then set
  score; if still level, the admin chooses (`adminOrder`). `unresolved` lists every tie the
  admin must settle first: ties between pools at the cut-off, and ties inside a pool that decide
  a player's finishing position. With equal pools this is the same as "top N from each pool".
  Wins are compared as raw counts, like the workbook. This favours bigger pools on purpose:
  finishing second in a small pool is easier, and those players also play fewer matches.
- **Seeding**: wins → set score → random. Bracket layout as in the workbook: QF1 1v8, QF2 4v5,
  QF3 2v7, QF4 3v6; SF1 = winners of QF1/QF2, SF2 = winners of QF3/QF4. Semifinals only: 1v4,
  2v3. The top two seeds can only meet in the final.
- **Same-pool players apart** (`firstRound`, quarterfinals only): two players from the same pool
  don't meet in a quarterfinal. Seeds 1–4 keep their places and seeds 5–8 are rearranged:
  seed 1 gets the weakest opponent possible, then seed 2, 3 and 4. If a clash can't be
  avoided, strict seeding is used and `samePoolMatches` says how many clashes there are.
  Semifinals are never rearranged. The workbook also keeps seeds 1–4 in place, but tries
  layouts in a fixed order, so it can give seed 1 a stronger opponent than needed.
- **Race length**: stored per match (`matches.race_to`, default 2). Pool matches are race to 2.
  For the knockout the admin picks a race length (usually 2, longer when there's time) and can
  change it for a single match. `assertValidScore(a, b, raceTo)` only accepts a finished race:
  the winner has exactly `raceTo` frames and the loser fewer.
- **Handicaps don't change scoring.** A frame handicap is the number of balls a player may leave
  on the table before playing the 8-ball (in 8-ball). It doesn't change the race length.
- **Knockout**: semifinal losers play the third-place final; winners play the final. The
  bracket is recomputed from seeds and scores every time, so a corrected score flows through.
- **Seasons** are calendar quarters, the same length as a membership: `01/YYYY` January–March,
  `02/YYYY` April–June, `03/YYYY` July–September, `04/YYYY` October–December. "Today" is
  always the date in Denmark.
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
| 2026-10-07 | Qualification: pool winners first, then the best runners-up (workbook rule). |
| 2026-10-07 | Players from the same pool are kept apart in the quarterfinals, not in the semifinals. |
| 2026-10-07 | Knockout race length is chosen by the admin (default race to 2). |
| 2026-10-07 | Scores are checked against the race length; frame handicaps don't affect it. |
| 2026-10-07 | Qualification and seeding compare raw wins across pools of different sizes, on purpose. |
| 2026-10-07 | Seasons are calendar quarters, labelled 01/YYYY–04/YYYY. |
| 2026-10-07 | Membership is per season (+50 season points), shown as a yes/no for the current season. |
| 2026-10-07 | One tournament in progress at a time. A tournament's week is the ISO week of its date. |
