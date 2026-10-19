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
`/login`, `/admin/turnering/ny`, `/admin/turnering/gammel`, `/admin/turnering/:id`, `/saeson/:id` (an earlier season), and `/live` (full screen, no header,
for the flatscreen in the club), `/saeson`, and `/play` (players enter results with the join code).

Login in the frontend: `useSession()` (`apps/web/src/auth.ts`) returns the logged-in admin,
`null` for the public, or `undefined` while loading. Pages under `/admin` are wrapped in
`RequireAdmin`, which sends visitors to `/login` and back afterwards. That only hides pages; the
API checks the session on every admin request. When logged in, the header shows Ny Turnering
and Logout instead of Log ind. Logout asks for confirmation first, using the reusable
`ConfirmDialog` component (`apps/web/src/components/ConfirmDialog.tsx`). API calls go through
`api()` in `apps/web/src/api.ts`. Queries are not retried when the server refuses them (a 4xx such
as 404), so a wrong address says "Siden findes ikke" at once; other failures are retried.

Spillere (`apps/web/src/pages/PlayersPage.tsx`) lists every player with base and frame handicap
in separate columns, Medlem (an active membership), Sæsonpoint for the current season (the
column is left out in the off-season), and all-time statistics. When logged in, the page also
has a "Tilføj ny spiller" form and Rediger/Slet on each row (deleting asks for confirmation).
The forms have a Medlem checkbox and, when it's ticked, "Medlem siden" (today by default), so a
membership paid earlier can be entered late without losing the season bonus.

**Sorting and search.** The tables on Spillere, Sæson and Turneringer sort by any column: click a
header to sort by it, and again to reverse (`components/TableView.tsx`). Names start A→Å
(Danish order), numbers and dates with the highest or newest; equal values keep the default
order. The search field above each table matches the start of any word in a name, ignoring case
("jo" and "martin jo" find "Martin Johansen"); on Turneringer it matches the winner, or the date
as shown ("10-2026" lists October 2026). The sort and the search are remembered in the browser
(`localStorage`, keys `view:spillere`, `view:saeson`, `view:turneringer`).

Sæson (`/saeson`, `apps/web/src/pages/SeasonPage.tsx`) shows the current season's standings;
its # column keeps the season rank whatever the table is sorted by. A picker beside the title
lists the current season and every earlier season with a concluded tournament; an earlier season
opens at `/saeson/1-2026` (the label with a dash) and is marked "Afsluttet".
In the off-season it, the frontpage leaderboard and `/live` say there's no current season and
when the next one starts (`components/NoSeason.tsx`).
The frontpage's Sæson Leaderboard shows the same standings as "name – points" and links there.
It is never taller than the screen; the list scrolls inside it (`.frontpage-leaderboard`).

Ny Turnering (`/admin/turnering/ny`, `CreateTournamentPage.tsx`): date (today by default), format,
and the players. "Tilføj spiller" searches as you type, like the search on Spillere (the start of
any word in a name, ignoring case, so "jo" finds "Martin Johansen"; up to 10 hits, and Enter adds
the first); when no player has exactly that name, "Tilføj ny spiller" opens a dialog with the typed name and the same
fields as on Spillere (handicap, frame handicap, Medlem and Medlem siden, from
`components/PlayerFields.tsx`), which creates the player and adds them in one go. The page
shows how the players will be split into pools (from `poolSizes` in `@franks/core`, which the web
app imports straight from source via a Vite alias). If a tournament is already in progress, the
page links to it instead.

At the top of the admin's tournament page (below) is the **join code** for `/play`
(`JoinCode.tsx`, shown as "482 913") with "Ny kode", which makes a new one (after a confirmation)
and signs out everyone using the old one, in case the code has spread beyond the players.

The tournament page (`/admin/turnering/:id`, `OngoingTournamentPage.tsx`) starts in draft with
the drawn pools in `PoolEditor` (dnd-kit): drag a player onto another to swap them, or into
another pool to move them (pools keep at least 2 players). Every change is saved at once. On
touch screens a short press starts the drag, so the page still scrolls. At the bottom of each
pool's box the admin chooses that pool's length in "Først til" (2 to 5, 2 by default; saved at
once), the same field (`RaceToInput`) as the knockout's race lengths, so a pool of 3 can play a
longer race than the pools of 4. The pool tables show it in their title ("Pulje C · Først til 3"),
on /live too. "Gå til turnering" (after a confirmation that lists each pool's length) creates the
pool matches; "Annuller turnering" deletes the tournament. It
stays at the bottom of the page through pool play and the knockout. "Randomize" draws every pool
again.

Until the knockout starts, nothing is locked. "Rediger spillere" opens the player list at
`/admin/turnering/:id/rediger` (`EditTournamentPage.tsx`, the same `EntryForm` as Ny Turnering)
with the date, format and every player already filled in; "Færdiggør" saves and goes back to the
pools. The form says beforehand what saving will do: the pools are drawn again when the new count
needs another number of pools, and how many pool results go with the players who leave; it asks
for confirmation when results would be deleted. During pool play "Rediger puljer" swaps the pool
tables for the pool editor, with "Randomize" and each pool's race length (only changeable while that
pool has no results). A move that would delete results (a played match whose players are no longer
in the same pool), and "Randomize" once results exist, ask first.

In the knockout, "Byt spillere" (`KnockoutSwap.tsx`) shows the first round as drag-and-drop: drag
a player onto another to swap them, or drag in someone from "Gik ikke videre" to take a player's
place and seed. Players in a match with a result are locked.

Wherever /live, /play and the admin's tournament pages show a player, the name carries their
handicap in parentheses (`namesWithHandicap` in `tournaments.ts`: "Martin Johansen(-1)"), except
"Næste kampe", which sits right under the pool table and shows names only. In cells
that cut long names off, `PlayerName` shortens the name and always keeps the handicap.

In pool play the page shows each pool as a matrix (`PoolTable`), read across like the workbook.
Columns have fixed widths (`COLUMN` in `PoolTable.tsx`, in em) and the result cells are squares.
Every pool is drawn with as many rows and result columns as the largest pool (`slots`), leaving
the extra fields empty, so all pools have the same size and line up. Long names are cut off with
"…" and shown in full on hover. On a phone a pool scrolls sideways with the names and the pool's title
pinned, so you can always see whose row a result is in. In the matrix,
a played cell shows the row player's score, green for a win and red for a loss. The set score
("5 W - 3 L", frames won and lost) is left of the name; wins and rank (from `poolStandings`)
are on the right, with "=" for a tie only the admin can settle. Tapping a cell opens
`ScoreDialog`, asked from that row player's side (in August's row against Oskar, 2-0 means August
won 2-0): one button per possible score (2-0, 2-1, 1-2, 0-2 for a race to 2), plus "Ryd
resultat". Pools of 3 and 5 show "Up next": the next matches in schedule order that can be
played at the same time, and who sits out (`poolView.ts`). Even pools have no schedule.

When every pool match is played, `QualifyPanel` appears ("complete qualifier brackets"): choose
quarterfinals or semifinals (the workbook's suggestion preselected), or, with a single pool,
"Kun finale (2)": the pool's #1 and #2 play the final and the pool's #3 and #4 finish 3rd
and 4th. It shows who qualifies, worked out with `qualifyFromPools` (or `qualifyForFinal`) like
the server. A tie that decides who goes through must be
settled first: the admin clicks the tied players in order, best first (a
tie inside a pool is saved as the pool's tiebreak; a tie between pools is sent with the request).
Then `Bracket` shows the knockout, one column per round with seed numbers in the first round;
admins tap a player in a match to enter the result from that player's side. Pool tables stay
visible but read-only. Above the bracket, "Kampenes længde" (`RacePanel`) lists each round whose
players are (partly) known and that has no result yet, with its race length: the first round as
soon as the knockout starts, the semifinals after the quarterfinals, then the third-place final and the
final separately. A round without one is marked "Skal vælges" and starts from the previous
round's length (the first round from the pool matches'), and its matches say "Afventer
længde" and can't be tapped (on `/play` too) until the admin saves it.

When the final and the third-place final (if there is one) are played, "conclude tournament" (after a
confirmation) saves the results and opens the tournament's public page.

`/play` (`PlayPage.tsx`) is where players enter results themselves. While a tournament is in
progress, the header links to it ("Spil", "Play" in English; not shown to admins). It asks for the
join code (6 digits, with or without the space), then shows the same pools, "Up next" and bracket
as the admin page (`components/TournamentPlay.tsx` with `manage={false}`): tapping a match opens
the same `ScoreDialog`, but there is no drawing, qualifying or concluding. Choosing a score asks
"Er du sikker på, at du vil indtaste resultatet: August 2 – 1 Oskar?" (Ja / Tilbage, from the
tapped player's side). A match with a result can't be opened: a tap shows "Resultatet er låst"
in a message that fades away by itself (`components/Toast.tsx`), and there's no "Ryd resultat".
When another player got there first, the same kind of message says "Resultatet er allerede
indtastet" and the page fetches their result. At the top, one button
per pool ("Pulje A", "Pulje B" …, `poolLinks`) jumps straight to that pool, so a player in pool D
doesn't have to scroll past the others (or past the bracket in the knockout). "Forlad" leaves. When
the admin makes a new code, or the tournament is concluded or cancelled, the page goes back to the
code form and says why (the live update makes it check its session again).

Turneringer (`/turneringer`, `TournamentsPage.tsx`) lists concluded tournaments (Dato, Vinder,
Antal deltagere, Format); a row opens `/turneringer/:id` (`TournamentDetailPage.tsx`) with the
placings, the bracket and the pools. Logged-in admins can click any result there to correct it
(placings and points update at once), or "Genåbn turnering" for bigger changes. "Slet turnering"
(after a confirmation that says it can't be undone) deletes the tournament for good: it leaves
Turneringer, and the players lose its points on the leaderboards and its counts on Spillere.

When logged in, Turneringer has "Indtast gammel turnering" on the right of the title, which opens
`/admin/turnering/gammel` (`OldTournamentPage.tsx`) for a tournament played before the app: date
(not in the future), format, "Slutspil" (Kvartfinaler, Semifinaler or Kun finale), then one field
per place, 1st to 4th and, with quarterfinals, four 5.–8., each a "Tilføj spiller" search
(`PlayerSearch` from Ny Turnering, with "Tilføj ny spiller"). "Øvrige deltagere" lists everyone
else. "Færdiggør" stays disabled until every place is filled, and opens the tournament's page. A
switch to semifinals or the final only moves the players in 5.–8. to the participants. The page
of an old tournament says it was entered afterwards and shows the placings only (no pool wins,
bracket or pools), with "Slet turnering" but not "Genåbn turnering".

Ny Turnering (and "Rediger spillere") has a **"For sjov kamp"** checkbox ("Just for fun") under the
date and format, for a tournament that is played as usual but counts in no statistic (Tournaments
API → For sjov kamp). On the tournament's admin page, and on its public page for logged-in admins,
the same checkbox switches it at any time, concluded or not (`components/ForFun.tsx`, not for old
tournaments). Everyone else sees a "For sjov kamp" tag there with what it means; Turneringer and
`/live` show the tag next to the date. A fun tournament's placings have no Point column.

The header links to `/live` as "Live"; while a tournament is in progress the link glows amber with a
pulsing dot, like the badge on `/live` (`.nav-live.on-air`, `.live-dot`).

`/live` (`LivePage.tsx`) is the flatscreen view: the bracket (during the knockout), the pool
tables and "Up next" in large type,
or the season leaderboard between tournaments. It uses the dark theme (`.theme-dark`, less glare in a dim bar) with a
"Live" badge; the logo links back to the frontpage (`.live-home`), since `/live` has no site header. The TV can't be scrolled, so `/live` is exactly one screen high and never scrolls:
below the header, `LiveStage` (`components/LiveStage.tsx`) lays the bracket and the pools out at
their natural size and scales each to fit the screen, centred. Pools show two per row (a third
sits under the first), each with its "Up next" as wide as the table, and shorter rows than the
square cells on the admin page; on a big screen they grow to fill it. During the knockout the
bracket is on top, taking at most half the height and growing at most 1.5 times as much as the
pools (`BRACKET_SHARE`, `BRACKET_GROWTH`), and the pools shrink to fit below it. The layout is
re-measured when results come in or the window changes size. `LiveUpdates` (mounted once in `main.tsx`)
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
pages are light; the leaderboard is a dark "scoreboard"; `/live` is dark. Everything is plain CSS in
`apps/web/src/styles.css`, with no CSS framework:

- The **palette** (`--felt-500`, `--wood-700`, `--cream-100` …) is at the top of `:root`.
- Components only use the **semantic variables** after it (`--bg`, `--surface`, `--text`,
  `--accent`, `--win-bg`, `--loss-bg` …). A theme redefines only those.
- Win/loss colours are a green and a coral of their own, so a loss never looks like the brand red,
  and buttons use felt blue rather than red for the same reason.
- Buttons come in two kinds: `.primary` (filled felt blue) for the main action, and `.secondary`
  (the same shape, outlined in felt blue) for the rest, like "Rediger spillere" or "Randomize".
  A toggle such as "Rediger puljer" / "Færdig" switches from secondary to primary while it's on.
- Fonts are self-hosted with `@fontsource` (imported in `main.tsx`): **Barlow** for text and
  **Barlow Condensed** for headings, scores and numbers. Both cover æ, ø and å.
- Logo files are in `apps/web/public/brand/`: `wordmark.png` (transparent background, for light
  backgrounds) and `roundel.png` (the 8-ball, for the dark header); `favicon.png` is the roundel.
  An SVG from the club would be sharper; swap it in when it arrives.
- On phones the header puts the navigation on its own row (scrolling sideways if needed) and
  doesn't stick to the top, so the pools get the room. Below 480px only the 8-ball is shown.
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

### Production (turneringsportal.kjaer-thomsen.dk)

The site runs on a Linux VM with Docker, from a clone of this repo. `docker-compose.prod.yml`
goes on top of `docker-compose.yml` and adds:

- **Caddy** (`Caddyfile`) on ports 80 and 443. It gets and renews the HTTPS certificate from
  Let's Encrypt by itself, redirects http to https, and passes everything on to the app,
  including the live-update stream. It's the only container with published ports; the app and
  Postgres are reachable only on the Docker network.
- `COOKIE_SECURE=true` and `TRUST_PROXY=uniquelocal` for the app (see Login API).
- A **backup** container (below).

Before the first start, the domain's A record must point at the server's public IP, and ports
80 and 443 must reach the VM (port forwarding on the router if it's behind one). Caddy can't
get a certificate otherwise.

**First setup**, in the repo folder on the server:

```sh
cat > .env <<EOF
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
DOMAIN=turneringsportal.kjaer-thomsen.dk
POSTGRES_PASSWORD=$(openssl rand -hex 24)
EOF
docker compose up -d --build
docker compose exec app node apps/server/dist/cli/admin.js create <username>
```

With `COMPOSE_FILE` in `.env`, a plain `docker compose …` uses both files. Postgres only reads
`POSTGRES_PASSWORD` when it creates the database, so changing it later in `.env` doesn't change
the real password. If the database was first started with the default password, recreate it
while it's still empty (`docker compose down -v`, then `up` again).

**Updating**: `git pull && docker compose up -d --build`. The server migrates the database on
start, and open pages reload themselves with the new version. Logs: `docker compose logs -f app`
(or `caddy`, `backup`).

**Backups.** The backup container (`scripts/backup.sh`) dumps the database with `pg_dump` when
it starts and every night at 04:00 Danish time, into `backups/` in the repo folder (git-ignored):
`daily/` keeps 14 days, and `monthly/` keeps the last dump of each month for 12 months
(`BACKUP_HOUR`, `BACKUP_KEEP_DAYS`, `BACKUP_KEEP_MONTHS` and `BACKUP_DIR` in `.env` change
this). `docker compose logs backup` shows each dump. These copies live on the same machine, so
copy `backups/` somewhere else regularly too.

**Restoring** a dump replaces the whole database. The app is stopped while it runs:

```sh
scripts/restore.sh backups/daily/franks-2026-10-14_0400.dump
```

The same script moves data between machines. To take the data from the local stack to the
server, dump it on the PC and restore it on the server:

```sh
docker compose exec -T db pg_dump -U franks --format=custom franks > franks.dump   # on the PC
scp franks.dump <user>@<server>:<repo folder>/
scripts/restore.sh franks.dump                                                     # on the server
```

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

- The rate limits (login, and joining on `/play`) count per client IP. Behind a reverse proxy,
  set `TRUST_PROXY` to the proxy's addresses (Fastify's `trustProxy`; `uniquelocal` for Caddy on
  the Docker network), so the IP comes from `X-Forwarded-For`. Without it every request looks
  like the proxy's, and one person's wrong passwords would lock everyone out.
- Sessions last 30 days. The cookie (`session`) is `HttpOnly` and `SameSite=Lax`; set
  `COOKIE_SECURE=true` once the app is served over HTTPS. Only a SHA-256 hash of the token is
  stored in `sessions`.
- Every request gets `request.admin` (or null) from `sessionPlugin`. Make a route admin-only
  with `{ preHandler: requireAdmin }` (`apps/server/src/auth/plugin.ts`).
- There is deliberately no route that creates admins; see "Admin accounts".

### Play API (players scoring their own matches)

Every tournament gets a random 6-digit **join code** when it's created. Only admins see it (on
the tournament page; it's kept out of the public detail and off `/live`, since people outside
the tournament are in the bar too). Players enter it on `/play` and can then enter results in that
tournament's pools and knockout, and nothing else. A player can only enter a result in a match that
has none: once it's entered, only an admin can correct or clear it. This runs on trust
("scouts honor"): players are anonymous, and anyone with the code can score any match.

| Route | Who | What |
|---|---|---|
| `POST /api/play/join` | public | `{ code }` (6 digits) → `{ tournamentId }` and a `player` cookie. 404 `unknown_code` unless it's the code of the tournament in progress. At most 50 attempts per IP per 15 minutes (everyone in the club shares the wifi's IP). |
| `GET /api/play/me` | player | `{ tournamentId }`, or 401 when this browser hasn't joined or its session ended. |
| `POST /api/play/leave` | anyone | Ends the player session and clears the cookie. 204. |

- Player sessions (`player_sessions`, token hashes only, like admin sessions) last at most 24
  hours and end when the tournament is concluded or cancelled, or when an admin makes a new
  code. The `player` cookie is separate from the admin's `session` cookie.
- `request.player` is set by `sessionPlugin` next to `request.admin`. The result routes use
  `requireScorer` (`apps/server/src/auth/plugin.ts`): an admin, or a player who joined this
  tournament. For a player, `PUT …/result` on a match that already has a result, and every
  `DELETE …/result`, is 409 `result_locked`. The update only goes in while the match has no
  result, so when two players enter the same match at once, the first one counts and the second
  gets `result_locked`. Corrections in a concluded tournament stay with the admins.

### Players API

| Route | Who | What |
|---|---|---|
| `GET /api/players` | public | Every player, by name, with `member` (has an active membership), `memberSince`, `seasonPoints` for the current season (null in the off-season) and all-time statistics from concluded tournaments (not "For sjov kamp", below): `participation`, `wins` (tournaments won), `semifinals` (reached; a final-only tournament has none, so it doesn't count), `quarterfinals` (played in one). |
| `GET /api/players/:id` | public | One player. |
| `POST /api/players` | admin | "Tilføj ny spiller": `{ name, baseHandicap?, frameHandicap?, member?, memberSince? }` → 201. |
| `PATCH /api/players/:id` | admin | Change name, handicaps and/or membership. A handicap change sets `lastAdjusted` to today (Danish time). `member: true` starts a membership (`memberSince`, default today; on an active one it moves the start), `member: false` ends it today. `memberSince` can't be in the future (400 `member_since_in_future`) or come without `member: true` (400 `member_since_without_member`). |
| `DELETE /api/players/:id` | admin | 204. Refused with 409 `player_has_tournaments` if the player has been in a tournament, so history stays intact. |

Names are trimmed and unique regardless of capitalisation (409 `name_taken`), so "Tilføj spiller" never
shows two identical names. Handicaps are whole numbers from −20 to 20.

**Membership and season points.** Membership runs all year, the off-season included (members
get cheaper entry, free table rent and so on), so it's stored as dated periods in
`membership_periods`: `start` and `end` (null while active; at most one active per player).
`setMembership` (`apps/server/src/db/seasons.ts`) starts and ends them, and joins a rejoin onto a
membership that ended the day before or later, so an accidental untick leaves no gap. Season
points = points from the season's concluded tournaments + `MEMBER_BONUS` (10) if the player
earns it: a membership that started by the end of the season's first month (31 January or 30
September) and lasts to the season's last day. During a running season an active membership
counts, and the bonus disappears if it ends early. Being a member in the off-season gives no
points.

### Seasons API

| Route | Who | What |
|---|---|---|
| `GET /api/seasons/current` | public | `{ season, next, standings }`. `season` is `{ label, start, end }` for the season today is in, or null in the off-season; `next` is the season after today. `standings` (empty in the off-season) lists everyone with at least 1 season point (from playing in the season or the member bonus; players with 0 points are left out here but still listed on Spillere), by points (then name): `rank` (shared when level on points), `playerId`, `name`, `member` (earns the bonus), `points`, `participation`, `wins`, `semifinals`, `quarterfinals`, all counted within the season. |
| `GET /api/seasons` | public | Every season with a concluded tournament that counts (not "For sjov kamp"), plus the current one, newest first: `[{ label, start, end }]`. |
| `GET /api/seasons/:id` | public | One season by its label with a dash (`1-2026` for 1/2026): `{ season, standings }`, the standings as above. 404 `not_found` for anything that isn't a season. |

### Tournaments API

A tournament goes `draft` → `pools` → `knockout` → `concluded`. Only one tournament can be in
progress (not concluded) at a time; a partial unique index in the database enforces it.

| Route | Who | What |
|---|---|---|
| `GET /api/tournaments/ongoing` | public | `{ tournament: { id, date, status } \| null }`: the tournament in progress. |
| `GET /api/tournaments/:id` | public | Everything about a tournament: date, week, season (null in the off-season), format, status, knockout size, `players` (with handicaps and Medlem on the tournament's date), `pools` (`{ id, name, playerIds }` in order) and `matches`. |
| `GET /api/tournaments/:id/code` | admin | `{ code }`: the join code for `/play` (null once concluded). |
| `POST /api/tournaments/:id/code` | admin | "Ny kode": `{ code }`, a new join code. Everyone who joined with the old one is signed out. 409 `tournament_concluded`. |
| `POST /api/tournaments` | admin | "Færdiggør": `{ date, format, playerIds, forFun? }` → 201, a `draft` with the pools drawn at random (`poolSizes` + `drawPools`) and a join code. The week comes from the date, and so does the season (it isn't stored). Tournaments in the off-season are allowed but give no season points. 409 `tournament_in_progress` if another one isn't concluded. |
| `PUT /api/tournaments/:id` | admin | "Rediger spillere": `{ date, format, playerIds, forFun? }` (`forFun` left as it is when omitted), in `draft` or `pools` (409 `pools_closed` once the knockout has started; 400 `too_few_players` / `unknown_player` as when creating). Players who leave are taken out of their pool with all their matches, so they get no result at all. Newcomers go into the smallest pool (`updatePools`). When the new count needs another number of pools (`poolSizes`), or a pool would get too small, every pool is drawn again and every pool result is deleted. |
| `PUT /api/tournaments/:id/pools` | admin | `{ pools: playerId[][] }` saves the admin's swaps and moves, in `draft` or `pools` (409 `pools_closed`). Every entrant exactly once, pools of at least 2. Pool rows keep their ids. During the pools, each pool's matches follow its players (`syncPoolMatches`): a result stays while both its players are still in that pool, matches with a player who left the pool are deleted, new pairings are added with their pool's race length, and the play order is rebuilt. A pool whose players changed loses its `tiebreak`. |
| `PUT /api/tournaments/:id/for-fun` | admin | `{ forFun }`: "For sjov kamp" on or off, in any status, concluded too. 409 `historical` for an old tournament. |
| `POST /api/tournaments/:id/randomize` | admin | "Randomize": draws every pool again (`poolSizes` + `drawPools`), in `draft` or `pools`. Every pool match and result is deleted; during the pools new matches are created. Each pool (A, B …) keeps its race length. |
| `POST /api/tournaments/:id/start` | admin | "Gå til turnering", draft only, no body. Creates every pool match in play order (`roundRobinRounds` + `playOrder`) with its pool's race length and moves to `pools`. Players and pools can still change afterwards (above). |
| `PUT /api/tournaments/:id/pools/:poolId/race` | admin | `{ raceTo }` (2 to 5, else 400): one pool's race length (`pools.race_to`, returned as the pool's `raceTo`), in `draft` or `pools` (409 `pools_closed`). During the pools also its matches', and only while that pool has no result (409 `round_started`). |
| `DELETE /api/tournaments/:id` | admin | Deletes a tournament, in progress or concluded, with its pools, matches, results and player sessions. Season points, standings and player statistics are derived from `results`, so the players lose that tournament's points and counts at once. Players and memberships stay. 404 `not_found`. |
| `PUT /api/tournaments/:id/matches/:matchId/result` | admin, player | `{ framesA, framesB }` (player A's and B's frames) enters or corrects a result. Must be a finished race (`assertValidScore` with the match's `raceTo`), else 400 `invalid_score`. Pool matches only while the status is `pools` (409 `stage_closed` otherwise). |
| `DELETE /api/tournaments/:id/matches/:matchId/result` | admin, player | Clears a result entered by mistake. |
| `PUT /api/tournaments/:id/pools/:poolId/tiebreak` | admin | `{ playerIds }`, best first: the admin's order for players in one pool that results can't separate (stored in `pool_members.admin_tiebreak`, returned as the pool's `tiebreak`). Only during pool play. |
| `POST /api/tournaments/:id/knockout` | admin | "complete qualifier brackets": `{ size: 2 \| 4 \| 8, adminOrder? }`, where 2 is the final only (400 `final_only_needs_one_pool` unless there is exactly one pool; the pool's #1 and #2 are the seeds). Needs every pool match played (409 `pools_incomplete`). Qualifies (`qualifyFromPools`), seeds (`seedQualifiers`: wins, set score, random), stores `knockout_seeds`, creates every knockout match without a race length (every round, the first included, gets one from the race route), and moves to `knockout`. 409 `unresolved_ties` with `ties` (groups of player ids) when the admin must order players first; 400 `cannot_qualify` if there are too few players. |
| `PUT /api/tournaments/:id/knockout/race` | admin | `{ stage: "QF" \| "SF" \| "THIRD" \| "FINAL", raceTo }`: the race length for one round. Only during the knockout (409 `not_in_knockout`), and only until the round has a result (409 `round_started`). 400 `no_such_round` for a round this knockout doesn't have. |
| `PUT /api/tournaments/:id/knockout/swap` | admin | `{ playerId, otherId }`: the admin's drag and drop in the knockout's first round (quarterfinals, semifinals, or the final only). Swaps the two players, or, when `otherId` is in the tournament but not in the knockout, puts them in `playerId`'s place and seed (`swapInFirstRound`). Only matches without a result can change (409 `match_played`); later rounds follow (`syncBracket`). 409 `not_in_knockout`, 400 `unknown_player` / `not_in_first_round`. |
| `POST /api/tournaments/:id/conclude` | admin | "conclude tournament": needs the final and the third-place final (if there is one) played (409 `knockout_unfinished`). Writes every player's `results` row and moves to `concluded`. The join code is retired and players are signed out. |
| `POST /api/tournaments/:id/reopen` | admin | Puts a concluded tournament back in the knockout for corrections too big to make in place; its results are removed until it is concluded again, and it gets a new join code. 409 `tournament_in_progress` if another tournament is in progress, 409 `historical` for an old tournament (it has no knockout). |
| `POST /api/tournaments/historical` | admin | "Indtast gammel turnering": `{ date, format, knockoutSize: 2 \| 4 \| 8, playerIds }`, the players best first (below) → 201, a tournament with `historical: true` that is `concluded` at once, with no pools, matches, seeds or join code. Allowed while another tournament is in progress. 400 `date_in_future`, `too_few_players` (fewer than the places to fill), `unknown_player`. |
| `GET /api/tournaments` | public | Concluded tournaments, newest first: `id`, `date`, `week`, `season`, `format`, `forFun`, `winner` (name), `participants`. |

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
per pool, `tiebreak`, and `historical` (an old tournament entered afterwards, below).

**Old tournaments** (`historical`). Tournaments played before the app are entered with their
placings only: the players come best first, filling 1st, 2nd, 3rd, 4th and, with quarterfinals,
the four 5–8 places (`placementsInOrder` in core); everyone after them gets participation. Every
place must be filled. Points come from `points_table` like any other tournament, so an old
tournament gives points in the season its date is in (none in the off-season), and counts in the
statistics on Spillere and Sæson from its knockout size (`knockout_size`: 8 quarterfinals, 4
semifinals, 2 the final only). Pool wins aren't known and are stored as 0; the handicap snapshot
is the players' handicaps when it's entered. It can't be reopened (there is no knockout to go back
to), but it can be deleted.

**For sjov kamp** (`forFun`). A tournament played for fun runs like any other (pools, knockout,
/play, corrections, concluding) and is listed under Turneringer with its placings, but it counts
in no statistic: not in season points, the season standings, the list of seasons, or Deltagelse,
Wins, Semifinals and Quarterfinals on Spillere. Its `results` rows are written as usual; the
statistics queries leave them out when they're read (`countsInStats` and `seasonPointsIn` in
`apps/server/src/db/seasons.ts`, `standings` in `routes/seasons.ts`), so switching it on or off
later needs no recomputing. It is set on Ny Turnering and can be switched on the tournament's
admin page at any time. Old tournaments can't be for fun.

### Live updates

`GET /api/events` is a public Server-Sent Events stream. On connecting it sends `event: hello` with
`data: {"version": "…"}`: a hash of the frontend's `index.html` (`"dev"` when Vite serves the
frontend). `LiveUpdates` remembers the first version it sees and reloads the page when a later
connection reports a different one, so pages left open (the flatscreen on `/live`) pick up an
update as soon as the server restarts with it. Every change to a tournament (created,
pools saved, started, result entered or cleared, new join code, cancelled) sends `event: tournament` with
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
| `membership_periods` | When a player was a member: start, end (null while active). |
| `tournaments` | Date, week, format (8/9/10-ball), knockout size (2/4/8), status (draft → pools → knockout → concluded), join code for `/play`, `historical` (an old tournament entered with its placings only), `for_fun` ("For sjov kamp": left out of the statistics). |
| `tournament_players` | Who entered a tournament. |
| `pools`, `pool_members` | Pools (A, B, …) with their race length (`race_to`, 2 to 5), and their players in drawn order. |
| `knockout_seeds` | Seeds, best first. The bracket is derived from these and the knockout scores. |
| `matches` | Pool and knockout matches: stage, pool or slot (QF1 … FINAL), players, race length, frames, play order. |
| `results` | Per player per concluded tournament: placement, points, matches won, handicap snapshot. |
| `points_table` | Points per placement, seeded from the workbook (10/7/5/4/2/1). |
| `admins`, `sessions` | Admin accounts and login sessions (token hashes only). |
| `player_sessions` | Players who joined a tournament with its code on `/play` (token hashes only). |

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
| `pools.ts` | `poolSizes`, `drawPools`, `swapPlayers`, `movePlayer`, `updatePools`: default pool sizes, random draw, admin changes, players joining or leaving. |
| `qualification.ts` | `qualifyFromPools`, `qualifyForFinal`, `suggestedKnockoutSize`: who goes through to the knockout. |
| `seeding.ts` | `seedQualifiers`: order qualifiers for the bracket. |
| `knockout.ts` | `knockoutBracket(seeds, scores)`: the whole bracket, derived from seeds and scores. `bracketFromFirstRound(pairings, scores)` does the same from a first round the admin may have changed (`swapInFirstRound`). |
| `placements.ts` | `placements`, `placementsInOrder`, `pointsFor`, `DEFAULT_POINTS_TABLE`: final placings (from the bracket, or for an old tournament from the order entered) and season points. |
| `seasons.ts` | `seasonForDate`, `seasonByLabel`, `nextSeason`, `joinDeadline`, `earnsMemberBonus`, `weekNumber`, `todayInDenmark`, `MEMBER_BONUS`: which season and week a date is in, and who earns the member bonus. |

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
- **Seeding** (`seedQualifiers`, as the workbook's Qualifier Seeding): finishing position in the
  pool first, so every pool winner is seeded above every runner-up, then wins → set score →
  random (the workbook uses a manual number, then the pool order, for that last step). Bracket layout as in the workbook: QF1 1v8, QF2 4v5,
  QF3 2v7, QF4 3v6; SF1 = winners of QF1/QF2, SF2 = winners of QF3/QF4. Semifinals only: 1v4,
  2v3. The top two seeds can only meet in the final.
- **Same-pool players apart** (`firstRound`, the first round only): two players from the same pool
  don't meet in the first round, but may meet later (after the quarterfinals, in the
  semifinals). When the semifinals are the first round, 1v4 and 2v3 become 1v3 and 2v4 if that
  means fewer same-pool matches, like the workbook. In the quarterfinals seeds 1–4 keep their places and seeds 5–8 are rearranged:
  seed 1 gets the weakest opponent possible, then seed 2, 3 and 4. If a clash can't be
  avoided, strict seeding is used and `samePoolMatches` says how many clashes there are.
  The workbook also keeps seeds 1–4 in place, but tries
  layouts in a fixed order, so it can give seed 1 a stronger opponent than needed.
- **Race length**: stored per match (`matches.race_to`). Pool matches are race to 2–5, chosen
  by the admin **per pool** (`pools.race_to`, 2 by default), so a pool of 3 can play longer
  matches than the pools of 4. A pool's length can change until it has a result. In the
  knockout the admin chooses it **per round**: the first round (quarterfinals or semifinals)
  as soon as the knockout has started; the semifinals once their players are known; and the
  third-place final and the final separately once the semifinals are played. Until then the
  round's `race_to` is null and its matches can't be scored (409 `race_not_set`). A round's
  race length can be changed until its first result is in. `assertValidScore(a, b, raceTo)`
  only accepts a finished race: the winner has exactly `raceTo` frames and the loser fewer.
- **Handicaps don't change scoring.** A frame handicap is the number of balls a player may leave
  on the table before playing the 8-ball (in 8-ball). It doesn't change the race length.
- **Knockout**: semifinal losers play the third-place final; winners play the final. The
  first round is drawn from the seeds once, when the knockout starts, and stored; the admin can
  then swap players in it, or bring in a player who didn't qualify, while its matches have no
  result. The rest of the bracket is recomputed from the stored first round and the scores every
  time (`bracketFromFirstRound`), so a corrected score flows through. Corrections to pool results
  are checked against who qualified by the results, not against who is in the bracket.
- **Final only** (`qualifyForFinal`, knockout size 2): an option when there is a single pool
  (4–6 players). The pool's #1 and #2 (by the pool ranking) play the final; there are no
  semifinals and no third-place final. A tie the admin must settle first is one that decides who
  plays the final, who is 3rd or who is 4th.
- **Seasons**: two a year. `1/YYYY` runs 1 January–31 May and `2/YYYY` 1 September–31
  December. June–August is the off-season (people are on holiday): no current season, no
  season points, and the leaderboards say when the next season starts. A tournament's season
  follows from its date. "Today" is always the date in Denmark.
- **Member bonus** (10 points): only for a membership that covers the whole season. Joining any
  time in the season's first month counts; joining later, or leaving before the last day,
  doesn't.
- **Placements**: 1st/2nd from the final, 3rd/4th from the third-place final, quarterfinal
  losers share 5–8, everyone else gets participation. Points: 10/7/5/4/2/1. With the final
  only, 3rd and 4th are the next two in the pool ranking (wins → set score → head-to-head →
  admin), and 5th–6th get participation. Each player gets one placement, and only its points:
  1st gets 10, not 10 + 1 for taking part. Without quarterfinals nobody is 5–8.

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
| 2026-10-10 | Seasons: 1 Jan–31 May (1/YYYY) and 1 Sep–31 Dec (2/YYYY); June–August is off-season. Off-season tournaments are allowed but give no points. |
| 2026-10-10 | Membership runs all year as dated periods. The bonus needs a membership from the season's first month to its last day. |
| 2026-10-08 | Look: the bar's colours (charcoal, felt blue, mahogany, cream) with the logo's red; light pages, a dark `/live`. Plain CSS with tokens, no framework. |
| 2026-10-11 | Players can score matches themselves on `/play` with a 6-digit code that only admins see (not on `/live`). Anonymous, on trust; pool and knockout results, including corrections. |
| 2026-10-11 | Knockout race length is chosen per round as the knockout goes on: first round at qualifying, then semifinals, then the third-place final and the final separately. |
| 2026-10-13 | The admin chooses race to 2 or 3 for the pool matches before locking the pools. |
| 2026-10-13 | The knockout's first round gets its race length in "Kampenes længde" like the later rounds, not in "Afslut puljespillet". |
| 2026-10-13 | With a single pool the admin can choose the final only: pool #1 v #2, 3rd/4th from the pool ranking (wins → set score → head-to-head → admin), 5th–6th participation. It doesn't count as reaching the semifinals. |
| 2026-10-13 | Spillere, Sæson and Turneringer sort by every column and have a search (start of any word in a name, ignoring case; Turneringer also the date). The view is remembered in the browser; # on Sæson stays the season rank. |
| 2026-10-13 | The season leaderboards (frontpage, Sæson, /live) only list players with at least 1 season point; everyone stays on Spillere. |
| 2026-10-13 | Sæson has a picker for earlier seasons (every season with a concluded tournament). The frontpage leaderboard stays on the current season (open question 8). |
| 2026-10-13 | Pool matches can be race to 2–5 (was 2 or 3). |
| 2026-10-14 | Admins can delete any tournament, concluded ones included; its results, and so its season points and statistics, go with it. |
| 2026-10-14 | Hosted at turneringsportal.kjaer-thomsen.dk on a Linux VM (Docker, Caddy for HTTPS), with nightly `pg_dump` backups. |
| 2026-10-15 | "Lås puljerne" is now "Gå til turnering" and locks nothing: until the knockout starts, the admin can change the date, format and players ("Rediger spillere", the list is kept) and rearrange or "Randomize" the pools. Results stay while both players are in the same pool; Randomize, or a new number of pools, starts the pool results over. Players who leave get no result at all. The pool race length can change while there are no pool results. |
| 2026-10-15 | The knockout's first round is computed as before, but the admin can then swap players in it, or bring in a player who didn't advance, while its matches have no result. |
| 2026-10-15 | The pool race length is chosen per pool (2–5), e.g. race to 3 for a pool of 3 next to pools of 4 playing race to 2. |
| 2026-10-15 | On /live, /play and the admin's tournament pages a player's handicap follows their name in parentheses ("Martin Johansen(-1)"), not in a column of its own. The public result pages under Turneringer show names only. |
| 2026-10-15 | Seeding follows the workbook's Qualifier Seeding: pool winners first, then runners-up (each by wins → set score), and players from the same pool are kept apart in the first round, the semifinals too when they are the first round. |
| 2026-10-16 | Players on `/play` can enter a result only in a match without one, after confirming it; correcting or clearing it is for logged-in admins. With two at once, the first result counts. |
| 2026-10-17 | Admins can enter old tournaments from before the app with their placings only: date, format, knockout (quarterfinals, semifinals or the final only), 1st–4th, 5–8 with quarterfinals, then the other participants. Every place must be filled. Points as usual (10/7/5/4/2/1, member bonus still 10), in the season of the date; statistics from the knockout. No pools or brackets are shown. |
| 2026-10-19 | "For sjov kamp": a checkbox on Ny Turnering for a tournament that is played and listed under Turneringer as usual, but counts in no statistic (season points, standings, Deltagelse, Wins, Semifinals, Quarterfinals). The admin can switch it later, also after concluding. Not offered for old tournaments. |
