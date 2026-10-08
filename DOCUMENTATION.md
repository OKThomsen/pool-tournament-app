# Frank's Poolhouse — developer documentation

Living documentation for the tournament platform. Product rules and open questions are in
`CLAUDE.md`; this file describes how the app is built and run, and the rules as implemented.
Open work and things waiting on the customer are in `TODO.md`.

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

Ny Turnering (`/admin/turnering/ny`, `CreateTournamentPage.tsx`): date (today by default), format,
and the players. "Tilføj spiller" searches as you type (Enter adds the first match); when no
player has exactly that name, "Tilføj ny spiller" creates them and adds them in one go. The page
shows how the players will be split into pools (from `poolSizes` in `@franks/core`, which the web
app imports straight from source via a Vite alias). If a tournament is already in progress, the
page links to it instead.

The tournament page (`/admin/turnering/:id`, `OngoingTournamentPage.tsx`) starts in draft with
the drawn pools in `PoolEditor` (dnd-kit): drag a player onto another to swap them, or into
another pool to move them (pools keep at least 2 players). Every change is saved at once. On
touch screens a short press starts the drag, so the page still scrolls. "finalize brackets" (after
a confirmation) creates the pool matches; "Annuller turnering" deletes the tournament.

In pool play the page shows each pool as a matrix (`PoolTable`), read across like the workbook.
Columns have fixed widths (`COLUMN` in `PoolTable.tsx`, in em) and the result cells are squares.
Every pool is drawn with as many rows and result columns as the largest pool (`slots`), leaving
the extra fields empty, so all pools have the same size and line up. Long names are cut off with
"…" and shown in full on hover. In the matrix,
a played cell shows the row player's score, green for a win and red for a loss. The set score
("5 W - 3 L", frames won and lost) is left of the name; wins and rank (from `poolStandings`)
are on the right, with "=" for a tie only the admin can settle. Tapping a cell opens
`ScoreDialog`, asked from that row player's side (in August's row against Oskar, 2-0 means August
won 2-0): one button per possible score (2-0, 2-1, 1-2, 0-2 for a race to 2), plus "Ryd
resultat". Pools of 3 and 5 show "Up next": the next matches in schedule order that can be
played at the same time, and who sits out (`poolView.ts`). Even pools have no schedule.

When every pool match is played, `QualifyPanel` appears ("complete qualifier brackets"): choose
quarterfinals or semifinals (the workbook's suggestion preselected) and the race length, and it
shows who qualifies, worked out with `qualifyFromPools` like the server. A tie that decides who
goes through must be settled first: the admin clicks the tied players in order, best first (a
tie inside a pool is saved as the pool's tiebreak; a tie between pools is sent with the request).
Then `Bracket` shows the knockout, one column per round with seed numbers in the first round;
admins tap a player in a match to enter the result from that player's side. Pool tables stay
visible but read-only.

When the final and the third-place final are played, "conclude tournament" (after a
confirmation) saves the results and opens the tournament's public page.

Turneringer (`/turneringer`, `TournamentsPage.tsx`) lists concluded tournaments (Dato, Vinder,
Antal deltagere, Format); a row opens `/turneringer/:id` (`TournamentDetailPage.tsx`) with the
placings, the bracket and the pools. Logged-in admins can click any result there to correct it
(placings and points update at once), or "Genåbn turnering" for bigger changes.

`/live` (`LivePage.tsx`) is the flatscreen view: the bracket (during the knockout), the pool
tables and "Up next" in large type,
or the season leaderboard between tournaments. `LiveUpdates` (mounted once in `main.tsx`)
listens to `/api/events` and refetches tournament data on every change, on every page.

**Languages.** The UI is in Danish (default) and English. All text lives in
`apps/web/src/strings.ts` as two dictionaries, `da` and `en`; TypeScript makes `en` keep the
same shape as `da`, so a string missing in one language is a build error. Components use `t`,
which points at the current language. The "EN"/"DA" pill in the header switches it
(`components/Language.tsx`); the choice is remembered in the browser (`localStorage`), and `/live`
uses whatever that browser chose. Add every new string to both dictionaries.

**Styling.** The look comes from the club itself: black ceiling and charcoal (header), bright blue
felt (buttons, links, table headers), mahogany (the rail around the leaderboard), the cream
brick wall (page background) and the logo's red (the stripe under the header). Public and admin
pages are light; the leaderboard is a dark "scoreboard". Everything is plain CSS in
`apps/web/src/styles.css`, with no CSS framework:

- The **palette** (`--felt-500`, `--wood-700`, `--cream-100` …) is at the top of `:root`.
- Components only use the **semantic variables** after it (`--bg`, `--surface`, `--text`,
  `--accent`, `--win-bg`, `--loss-bg` …). A theme redefines only those.
- Win/loss colours are a green and a coral of their own, so a loss never looks like the brand red,
  and buttons use felt blue rather than red for the same reason.
- Fonts are self-hosted with `@fontsource` (imported in `main.tsx`): **Barlow** for text and
  **Barlow Condensed** for headings, scores and numbers. Both cover æ, ø and å.
- Logo files are in `apps/web/public/brand/`: `wordmark.png` (transparent background, for light
  backgrounds) and `roundel.png` (the 8-ball, for the dark header); `favicon.png` is the roundel.
  An SVG from the club would be sharper; swap it in when it arrives.
- On phones the header puts the navigation on its own row, which scrolls sideways if needed.
- Seeds in the bracket are drawn as **pool balls** (`components/Ball.tsx`): 1 yellow, 2 blue,
  3 red, 4 purple, 5 orange, 6 green, 7 maroon, 8 black, and 9–15 striped.

### Running everything in Docker

```sh
docker compose up -d --build      # app on http://localhost:8080, Postgres on :5432 (APP_PORT, DB_PORT)
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
`MEMBER_BONUS` (10) if the player is a member that season.

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
| `PUT /api/tournaments/:id/matches/:matchId/result` | admin | `{ framesA, framesB }` (player A's and B's frames) enters or corrects a result. Must be a finished race (`assertValidScore` with the match's `raceTo`), else 400 `invalid_score`. Pool matches only while the status is `pools` (409 `stage_closed` otherwise). |
| `DELETE /api/tournaments/:id/matches/:matchId/result` | admin | Clears a result entered by mistake. |
| `PUT /api/tournaments/:id/pools/:poolId/tiebreak` | admin | `{ playerIds }`, best first: the admin's order for players in one pool that results can't separate (stored in `pool_members.admin_tiebreak`, returned as the pool's `tiebreak`). Only during pool play. |
| `POST /api/tournaments/:id/knockout` | admin | "complete qualifier brackets": `{ size: 4 \| 8, raceTo, adminOrder? }`. Needs every pool match played (409 `pools_incomplete`). Qualifies (`qualifyFromPools`), seeds (`seedQualifiers`: wins, set score, random), stores `knockout_seeds`, creates every knockout match with `raceTo`, and moves to `knockout`. 409 `unresolved_ties` with `ties` (groups of player ids) when the admin must order players first; 400 `cannot_qualify` if there are too few players. |

| `POST /api/tournaments/:id/conclude` | admin | "conclude tournament": needs the final and the third-place final played (409 `knockout_unfinished`). Writes every player's `results` row and moves to `concluded`. |
| `POST /api/tournaments/:id/reopen` | admin | Puts a concluded tournament back in the knockout for corrections too big to make in place; its results are removed until it is concluded again. 409 `tournament_in_progress` if another tournament is in progress. |
| `GET /api/tournaments` | public | Concluded tournaments, newest first: `id`, `date`, `week`, `season`, `format`, `winner` (name), `participants`. |

A result is a player's **placement** (from `placements` in core: 1st/2nd from the final, 3rd/4th
from the third-place final, quarterfinal losers 5–8, the rest participation), **points** from
`points_table`, **matches won** (pool wins, like the workbook's "Matches Won", which the handicap
review uses), and a **handicap snapshot** taken when the tournament is first concluded. The
tournament detail returns them as `results`, best first.

**Corrections.** Pool results can be corrected after the pools close, but not in a way that
changes who qualified (409 `would_change_qualification`). In a concluded tournament results can
be corrected but not cleared (409 `tournament_concluded`), and placements and points are
rewritten at once. A change that would alter an already-played later match (409
`later_match_played`) needs the tournament reopened, the later result cleared, and the
tournament concluded again.

Knockout results use the same result routes. Entering or clearing one fills in who plays the
later matches (`syncBracket`). A result that would change who plays an already-played later
match is refused (409 `later_match_played`): clear the later result first. A score fix with the
same winner is always allowed. Pool results are closed once the knockout starts (409
`stage_closed`).

The tournament detail also has `seeds` (player ids, best first; empty before the knockout) and,
per pool, `tiebreak`.

### Live updates

`GET /api/events` is a public Server-Sent Events stream. On connecting it sends `event: hello` with
`data: {"version": "…"}`: a hash of the frontend's `index.html` (`"dev"` when Vite serves the
frontend). `LiveUpdates` remembers the first version it sees and reloads the page when a later
connection reports a different one, so pages left open (the flatscreen on `/live`) pick up an
update as soon as the server restarts with it. Every change to a tournament (created,
pools saved, started, result entered or cleared, cancelled) sends `event: tournament` with
`data: {"tournamentId": n}`; pages then refetch what they show. A comment line is sent every 25
seconds so proxies keep the stream open. The event bus (`apps/server/src/events.ts`) lives in
memory, which is fine for one server process.

### Server tests

`npm test -w @franks/server` needs Postgres running (`docker compose up -d db`). The tests use a
separate `franks_test` database in the same container, created and migrated automatically, and
emptied before each test. Override it with `TEST_DATABASE_URL`.

### Hand-written SQL subqueries

Drizzle leaves column names unqualified in single-table queries (`"id"` rather than
`"players"."id"`). Inside a hand-written `sql` subquery that can silently bind to the wrong
table's column. In such subqueries, wrap every column in `qualified()` from
`apps/server/src/db/seasons.ts`.

### End-to-end checks on a separate stack

Never test against the local stack on :8080; it holds real data (players, tournaments in
progress). Run a throwaway copy with its own ports and database volume instead:

```sh
APP_PORT=8081 DB_PORT=5433 docker compose -p franks-e2e up -d --build   # app on :8081
# … create an admin with `docker compose -p franks-e2e exec app node apps/server/dist/cli/admin.js create e2e`
docker compose -p franks-e2e down -v                                   # delete it all again
```

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
| `memberships` | Player + season: the player renewed their membership for that season (+10 season points). |
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
- **Seasons** are calendar quarters **as a placeholder** (the real season dates are coming from the
  customer; see `TODO.md`): `01/YYYY` January–March,
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
| 2026-10-07 | Member bonus is 10 season points, not 50 (from the customer). |
| 2026-10-07 | Open pages reload themselves when a new version of the app is deployed. |
| 2026-10-07 | The UI comes in Danish (default) and English, switchable in the header. |
| 2026-10-07 | One tournament in progress at a time. A tournament's week is the ISO week of its date. |
| 2026-10-08 | Look: the bar's colours (charcoal, felt blue, mahogany, cream) with the logo's red; light pages, a dark `/live`. Plain CSS with tokens, no framework. |
