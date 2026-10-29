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
`/login`, `/admin/turnering/ny`, `/admin/turnering/gammel`, `/admin/turnering/:id`, `/admin/handicap`, `/admin/handicap/:id`, `/saeson/:id` (an earlier season), and `/live` (full screen, no header,
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
in separate columns (each in text that gets redder below 0, fully red from -4, and
greener above 0, fully green from +3: `HandicapCell`, `RED_CAP`, `GREEN_CAP`), Medlem (an active membership), Sæsonpoint for the current season (the
column is left out in the off-season), and all-time statistics. When logged in, the page also
has a "Tilføj ny spiller" form and Rediger/Slet on each row (deleting asks for confirmation).
The forms have a Medlem checkbox and, when it's ticked, "Medlem siden" (today by default), so a
membership paid earlier can be entered late without losing the season bonus.

**Handicapregulering** (`/admin/handicap`, `HandicapsPage.tsx`, admins only, "Handicap" in the
header) lists every player with their handicap ("-4 (-2)" with a frame handicap), the hidden
regulation score, when a ±1 runs out ("Udløber"), "Sidst reguleret" (`lastAdjusted`) and the
recommendations waiting ("Sværere" / "Lettere"); it sorts and searches like Spillere (key
`view:handicap`). The header link carries a red badge with the number of players waiting.
"Sæt score" on each row (and on the player's page) opens `SetScoreDialog`: the score (−1, 0 or
+1) as it stood at the end of a date ("Pr. dato", today by default), to bring the score up to
date after old tournaments without pool results. A row
opens `/admin/handicap/:id` (`HandicapPlayerPage.tsx`): the same facts, each pending
recommendation with what applying it does ("-4 → -4 (-1)") and Anvend / Afvis (after a
confirmation; only Afvis at the end of the ladder), and the history, newest first: every
counting tournament since the first (linked) with the placement, pool wins, the handicap at the
time, the change and the score after it, plus the changes that ran out and the resets (applied,
dismissed, changed by hand). After a tournament is concluded, its page tells the admin how many
players it took to ±2, with a link, until they're resolved (`RegulationNotice` in
`TournamentDetailPage.tsx`). Data comes from `apps/web/src/handicaps.ts`.

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
The frontpage (`FrontPage.tsx`) says when the club meets (every Wednesday: training 17–18:30
for members, tournaments from 19:00) and the address, which links to Google Maps.
Above it, **Kalender** (`components/Calendar.tsx`, data from `apps/web/src/calendar.ts`) lists
today's and coming events, soonest first, as "29/10  title" (the year is added when it isn't
this year's: "6/1/2027"); an event disappears the day after its date. An event with a description
has a small blue "i" before its title (`.calendar-icon`; titles without one leave its room empty,
so they line up), and clicking it opens a popup with the date on the left of the title, as on the board, the description and "Luk". Logged-in admins
get "Tilføj begivenhed", which opens a dialog to choose a date (today by default, not in the past),
a title (up to 100 characters) and optionally a description (up to 2000; line breaks are kept),
and "Opslå" posts it. Each event has Rediger (the same dialog) and Slet (after a confirmation).
The board is a dark scoreboard like the leaderboard under it (`.scoreboard`, with the dark link and
button colours set on `.calendar`); its dialogs sit outside it and stay light.
The frontpage's Sæson Leaderboard shows the same standings as "name – points" and links there.
On all three leaderboards (Sæson, the frontpage and `/live` between tournaments) 1st to 3rd are
drawn as pool balls like the seeds in the bracket (`Rank` in `components/Standings.tsx`); a shared
place shares the ball, so two players level at the top both get the 1-ball and the next is 3rd.
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

**Admin panel.** On a tournament's pages the admin's tools are gathered in a panel on the right
(`components/AdminPanel.tsx`, `AdminLayout`), which stays in view while the page scrolls. Below
1000px wide it is a drawer on the right edge instead (`position: fixed`), which lies over the
pools and follows the screen as the page scrolls; it scrolls inside itself if it's taller than
the screen. The arrow in its header ("Admin ›") puts the tools away on the right: the panel
shrinks to a thin strip ("‹ Admin", written downwards), which beside the page gives the page the
room and on a phone sits at the screen's right edge; the arrow brings them back. The choice is
remembered in the browser (`localStorage`, key `view:adminPanel`); until then the panel starts
open beside the page and closed as a drawer, so on a phone the pools come first. On the tournament
in progress it has, top to bottom:
the **join code** for `/play` (`JoinCode.tsx`, shown as "482 913") with "Ny kode", which makes a
new one (after a confirmation) and signs out everyone using the old one, in case the code has
spread beyond the players; "Rediger spillere" and, during pool play, "Rediger puljer" (both until
the knockout starts); the "For sjov kamp" checkbox; and "Annuller turnering". On a concluded
tournament (`/turneringer/:id`) it has how to correct results, "Genåbn turnering", "For sjov kamp"
and "Slet turnering"; on an old tournament only "Slet turnering". The steps that move the
tournament on ("Gå til turnering", "Afslut puljespillet", "Afslut turneringen") stay on the page,
under what they finish.

The tournament page (`/admin/turnering/:id`, `OngoingTournamentPage.tsx`) starts in draft with
the drawn pools in `PoolEditor` (dnd-kit): drag a player onto another to swap them, or to the
bottom of another pool ("Slip her") to move them there, which makes that pool bigger. Dropping a
player next to the pools, or on the "Ny pulje" box that appears while dragging, starts a new pool,
and a pool left empty disappears (the pools after it move up a letter). A pool with a single
player can be left while rearranging, but the page says it can't be played, and "Gå til
turnering" and "Afslut puljespillet" wait until it has company. Every change is saved at once. On
touch screens a short press starts the drag, so the page still scrolls. At the bottom of each
pool's box the admin chooses that pool's length in "Først til" (2 to 5, 2 by default; saved at
once), the same field (`RaceToInput`) as the knockout's race lengths, so a pool of 3 can play a
longer race than the pools of 4. The field can be emptied to type a new number: a number in range
counts as soon as it's typed, and when the admin leaves the field, an empty one becomes 2 and one
out of range is pulled back to the nearest allowed length. The pool tables show it in their title ("Pulje C" over "Først til
3"), on /live too. "Gå til turnering" (after a confirmation that lists each pool's length) creates the
pool matches; "Annuller turnering" (in the admin panel, through pool play and the knockout too)
deletes the tournament. "Randomize" draws every pool again.

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
handicap in parentheses (`namesWithHandicap` in `tournaments.ts`: "Martin Johansen (-1)", with a space), except
"Næste kampe", which sits right under the pool table and shows names only. In cells
that cut long names off, `PlayerName` shortens the name and always keeps the handicap.

In pool play the page shows each pool as a matrix (`PoolTable`), read across like the workbook.
Columns have fixed widths (`COLUMN` in `PoolTable.tsx`, in em) and the result cells are squares.
Every pool is drawn with as many rows and result columns as the largest pool (`slots`), leaving
the extra fields empty, so all pools have the same size and line up. Long names are cut off with
"…" and shown in full on hover. On phones (up to 600px wide, or up to 500px high, so a phone turned sideways too) the matrix is compact
(`COMPACT_COLUMN`): the players are numbered 1–5, the result columns are headed by those numbers
instead of names, the set score is stacked ("5W" over "3L"), "Vundne" becomes "V", and the font
shrinks (down to 0.65rem) until the pool fits the screen, so a pool of 5 needs no swiping on a
360px phone. If a pool is still too wide, it scrolls sideways with the names and the pool's title
pinned, so you can always see whose row a result is in. In the matrix,
a played cell shows the row player's score, green for a win and red for a loss. The blue title
row has the pool's name and race length over the names, and each player's set score ("5 W - 3 L",
frames won and lost) over their column, so the set score takes no column of its own. Wins and rank
(from `poolStandings`) are on the right, with "=" for a tie only the admin can settle. Tapping a cell opens
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
Then `Bracket` shows the knockout, one column per round with seed numbers in the first round
(each round's title hangs right above its first match, so it follows the match down the column);
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
"Er du sikker på, at du vil indtaste resultatet:", then the result on a line of its own in bold
("August 2 – 1 Oskar?", from the tapped player's side), then "Det kan kun ændres af en administrator
bagefter." (Ja / Tilbage).
A match with a result can't be opened: a tap shows "Resultatet er låst"
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
(placings and points update at once), or use "Genåbn turnering" in the admin panel for bigger
changes. "Slet turnering" (also in the panel)
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
API → For sjov kamp). In the admin panel of the tournament's admin page, and of its public page
for logged-in admins, the same checkbox switches it at any time, concluded or not
(`ForFunSetting` in `components/ForFun.tsx`, not for old tournaments). When it's on, everyone sees
a "For sjov kamp" tag under the title with what it means (`ForFunNote`); Turneringer and
`/live` show the tag next to the date. A fun tournament's placings have no Point column.

Below it, a **"Par turnering"** checkbox ("Pairs") makes the tournament one of teams of two
(Tournaments API → Par turnering); both can be ticked. The player list then has a row per team,
"Spiller 1 | Spiller 2" (`TeamList`): "Tilføj spiller" fills the first empty place, and the × after
a name takes that player out, leaving the place empty for the next one added. Players are put
together by drag and drop, as in "Rediger puljer": dropping a player on another swaps the two
(within a team or between teams), and dropping on an empty place moves them there. Switching it on makes
teams of the players two by two in the order they were added. "Færdiggør" waits until every
team has two players ("Hvert hold skal have to spillere"). "Rediger spillere" shows the teams
the same way and can switch it until the knockout starts. In the placings, on the podium and in
the Turneringer list a team is named in full, "Anna Holm & Bo Jensen" (`entrantName`). In the
pools, "Næste kampe" and the bracket it goes by first names only, "Sara & Mathias (-1)", also
when two players share a first name (`namesWithHandicap`, `namesOf(players, true)`), with the
team's handicap (`entrantHandicap`; Rules → Team handicap). The pool tables get a wider name column
for teams (`PoolTable teams`). The header line counts teams
("8 hold", `entrantCount`), and a "Par turnering" tag with what it means sits under the title
(`DuoNote` in `components/Duo.tsx`) and next to the date on Turneringer and `/live`.

The header links to `/live` as "Live"; while a tournament is in progress the link glows amber with a
pulsing dot, like the badge on `/live` (`.nav-live.on-air`, `.live-dot`).

`/live` (`LivePage.tsx`) is the flatscreen view: the pool tables and "Up next" in large type during
the pools, only the bracket during the knockout (the pools are done with by then),
or the season leaderboard between tournaments. When the tournament on screen is concluded, it turns
into a podium with 1st, 2nd and 3rd (`components/Podium.tsx`, the pool balls 1–3 on wooden
steps), which stays until the page is reloaded; a cancelled tournament goes straight back to the
leaderboard. A page opened after the tournament ended shows the leaderboard. It uses the dark theme (`.theme-dark`, less glare in a dim bar) with a
"Live" badge; the logo links back to the frontpage (`.live-home`), since `/live` has no site header. While a tournament is in progress, the top right says where to enter results ("Indtast resultater på turneringsportal.kjaer-thomsen.dk/play", from the page's own address) under the date and format; the join code itself stays off the TV. The TV can't be scrolled, so `/live` is exactly one screen high and never scrolls:
below the header, `LiveStage` (`components/LiveStage.tsx`) lays the pools or the bracket out at
their natural size and scales them to fit the screen (at most 3 times, `MAX_SCALE`), centred. Pools show two per row (a third
sits under the first), each with its "Up next" as wide as the table, and shorter rows than the
square cells on the admin page; on a big screen they grow to fill it. The layout is
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
- **Tables on phones** (up to 600px wide, like the compact pool tables): every other table has
  tighter cells and smaller type, short column headings (`ColumnLabel` with `t.short`:
  "Sæsonpoint" → "Point", "Kvartfinaler" → "KF", the full heading as a tooltip), and only the
  sorted column keeps its arrow. `FitTable` (`components/TableView.tsx`, used instead of a plain
  `.table-scroll`) then shrinks the table's font until it fits the screen, down to 0.65rem, so
  Spillere's ten columns fit a 360px phone; padding is in em so it shrinks too. A table still too
  wide scrolls sideways. Dates and handicaps (`td.nowrap`) stay on one line; names wrap, and
  Rediger/Slet stack.
- **Sticky table headers**: every table's header (`thead`, the blue row) stays in view while its
  rows scroll past, right under the site header
  (`--sticky-top`, which `Layout` keeps at the header's height while it sticks, and 0 on phones,
  where it scrolls away). That needs the table's box not to be a scroll container, so
  `.table-scroll` clips instead of scrolling, and only a table wider than its box gets
  `overflows` and scrolls sideways (`useScrollWhenWide` in `TableView.tsx`); such a table's header
  then stays put. The pool tables (admin, `/play`, the archive, `/live`) and the placings on a
  tournament's page (`table.placings`) are left out: their
  headers scroll with the page, and a pool table's box always scrolls sideways when the pool is
  too wide.
- On phones the header puts the navigation on its own row (scrolling sideways if needed) and
  doesn't stick to the top, so the pools get the room; on a phone turned sideways (up to 500px
  high) it doesn't stick either. Below 480px only the 8-ball is shown.
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

The site runs on a Linux VM with Docker, from a clone of this repo. The same server also hosts
the portfolio site (oskar.kjaer-thomsen.dk), so HTTPS comes from a **shared Caddy** that isn't
part of this repo: it lives in the portfolio repo's `caddy/` folder (its own Compose project,
`name: caddy`), runs from `~/Projects/caddy` on the server, and is the only container with
published ports (80 and 443). It gets and renews the Let's Encrypt certificates by itself,
redirects http to https, and passes `turneringsportal.kjaer-thomsen.dk` on to `pool-app:3000`,
including the live-update stream. Its setup is in the portfolio repo's DOCUMENTATION.md,
"Production".

`docker-compose.prod.yml` goes on top of `docker-compose.yml` and adds:

- The app on the external Docker network **`web`**, where Caddy and the portfolio app also
  are, under the alias `pool-app` (both projects call their service `app`). It stays on this
  project's default network too, where Postgres and the backups are. Nothing of this project
  publishes a port; Postgres isn't on `web`.
- `COOKIE_SECURE=true` and `TRUST_PROXY=uniquelocal` for the app (see Login API; `web` is a
  private address range).
- A **backup** container (below).

`web` must exist before the stack starts (`docker network create web`, once per server).

**First setup**, in the repo folder on the server:

```sh
cat > .env <<EOF
COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
POSTGRES_PASSWORD=$(openssl rand -hex 24)
EOF
docker compose up -d --build
docker compose exec app node apps/server/dist/cli/admin.js create <username>
```

This repo used to run its own Caddy. Its `Caddyfile` is gone, and the `DOMAIN` line in `.env` is
no longer used (a leftover one is harmless).

**Moving to the shared Caddy** (once, on the server; the site is down for about a minute in
step 4):

1. Add a DNS A record for oskar.kjaer-thomsen.dk pointing at the server.
2. `docker network create web`.
3. Start the portfolio stack.
4. Here, in `pool-tournament-app`: `git pull && docker compose up -d --remove-orphans`. This
   stops and removes the pool app's own Caddy (now an orphan), which frees ports 80 and 443.
5. In `~/Projects/caddy`: `docker compose up -d`, then `docker compose logs -f` until both
   certificates are issued.

The old `caddy-data` and `caddy-config` volumes stay behind unused; `docker volume rm
pool-tournament-app_caddy-data pool-tournament-app_caddy-config` removes them.

With `COMPOSE_FILE` in `.env`, a plain `docker compose …` uses both files. Postgres only reads
`POSTGRES_PASSWORD` when it creates the database, so changing it later in `.env` doesn't change
the real password. If the database was first started with the default password, recreate it
while it's still empty (`docker compose down -v`, then `up` again).

**Updating**: `git pull && docker compose up -d --build`. The server migrates the database on
start, and open pages reload themselves with the new version. Logs: `docker compose logs -f app`
(or `backup`; Caddy's are in `~/Projects/caddy`).

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
  set `TRUST_PROXY` to the proxy's addresses (Fastify's `trustProxy`; `uniquelocal` for the shared
  Caddy on the `web` Docker network), so the IP comes from `X-Forwarded-For`. Without it every request looks
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

### Handicaps API (regulation)

The regulation score (Rules as implemented → Handicap regulation) is never stored. It's replayed
on every request from the player's results in concluded tournaments that count (not "For sjov
kamp" or "Par turnering"), merged with `handicap_adjustments`: the admin's decisions and handicap changes made by
hand. A tournament and an adjustment on the same date are ordered by when the tournament was
concluded. Corrections, reopening and deleting a tournament therefore change the score at once.
All of it is admin only: the score is hidden from players.

| Route | Who | What |
|---|---|---|
| `GET /api/handicaps` | admin | Every player by name: `id`, `name`, `baseHandicap`, `frameHandicap`, `lastAdjusted`, `score` (−1, 0 or 1 today), `expires` (when the ±1 runs out, or null), `pending` (`[{ tournamentId, date, direction: 'harder' \| 'easier', next: { base, frame } \| null }]`, `next` being the handicap after applying it, null at the end of the ladder). |
| `GET /api/handicaps/:id` | admin | One player as above, plus `history`, newest first: `tournament` steps (`tournamentId`, `date`, `format`, `historical`, `placement`, `poolWins` (null for an old tournament), the `baseHandicap`/`frameHandicap` snapshot, `change`, `score` after it, `recommendation`), `reset` steps (`reason`: `applied`, `dismissed` or `manual`, with `oldBase`, `oldFrame`, `newBase`, `newFrame`), and `expired` steps (a ±1 running out). 404 `not_found`. |
| `POST /api/handicaps/:id/recommendations/:tournamentId` | admin | `{ action: 'apply' \| 'dismiss' }` resolves the pending recommendation from that tournament. Apply moves the handicap one step on the ladder and sets `lastAdjusted` to today; dismiss leaves it. Both set the score back to 0. Returns the player as `GET /api/handicaps/:id`. 409 `not_pending`, 409 `handicap_at_limit` (apply at −4(−4) or +3). |
| `PUT /api/handicaps/:id/score` | admin | `{ score: -1 \| 0 \| 1, date? }` sets the regulation score by hand as it stood at the end of `date` (today by default), for old tournaments without pool results. Comes after that day's tournaments; later ones count on top. The handicap, `lastAdjusted` and open recommendations stay as they are. Shows in `history` as a `set` step. Returns the player as `GET /api/handicaps/:id`. 400 `date_in_future`. |

`PATCH /api/players/:id` records a change of handicap as a `manual` adjustment, which also sets
the score back to 0. Changes made before this existed aren't recorded, so they don't reset the
score.

### Seasons API

| Route | Who | What |
|---|---|---|
| `GET /api/seasons/current` | public | `{ season, next, standings }`. `season` is `{ label, start, end }` for the season today is in, or null in the off-season; `next` is the season after today. `standings` (empty in the off-season) lists everyone with at least 1 season point (from playing in the season or the member bonus; players with 0 points are left out here but still listed on Spillere), by points (then name): `rank` (shared when level on points), `playerId`, `name`, `member` (earns the bonus), `points`, `participation`, `wins`, `semifinals`, `quarterfinals`, all counted within the season. |
| `GET /api/seasons` | public | Every season with a concluded tournament that counts (not "For sjov kamp"), plus the current one, newest first: `[{ label, start, end }]`. |
| `GET /api/seasons/:id` | public | One season by its label with a dash (`1-2026` for 1/2026): `{ season, standings }`, the standings as above. 404 `not_found` for anything that isn't a season. |

### Calendar API

The frontpage's "Kalender": events the admins post, each a date and a title, with an optional
description.

| Route | Who | What |
|---|---|---|
| `GET /api/calendar` | public | Today's and coming events (Danish date), soonest first, then in the order posted: `[{ id, date, title, description }]` (`description` null when there is none). Past events drop off by themselves; they stay in the table. |
| `POST /api/calendar` | admin | `{ date, title, description? }` → 201 and the event. Both are trimmed; the title is 1–100 characters, the description up to 2000, and a blank one is stored as none. 400 `date_in_past`. |
| `PUT /api/calendar/:id` | admin | `{ date, title, description? }`: edits an event, as when posting; leaving `description` out removes it. 404 `not_found`. |
| `DELETE /api/calendar/:id` | admin | 204. 404 `not_found`. |

### Tournaments API

A tournament goes `draft` → `pools` → `knockout` → `concluded`. Only one tournament can be in
progress (not concluded) at a time; a partial unique index in the database enforces it.

| Route | Who | What |
|---|---|---|
| `GET /api/tournaments/ongoing` | public | `{ tournament: { id, date, status } \| null }`: the tournament in progress. |
| `GET /api/tournaments/:id` | public | Everything about a tournament: date, week, season (null in the off-season), format, status, knockout size, `forFun`, `duo`, `players` (with handicaps and Medlem on the tournament's date; in a "Par turnering" each is a team, with its second player as `partner`, otherwise `partner` is null), `pools` (`{ id, name, playerIds }` in order) and `matches`. |
| `GET /api/tournaments/:id/code` | admin | `{ code }`: the join code for `/play` (null once concluded). |
| `POST /api/tournaments/:id/code` | admin | "Ny kode": `{ code }`, a new join code. Everyone who joined with the old one is signed out. 409 `tournament_concluded`. |
| `POST /api/tournaments` | admin | "Færdiggør": `{ date, format, playerIds, forFun?, duo?, partnerIds? }` → 201, a `draft` with the pools drawn at random (`poolSizes` + `drawPools`) and a join code. The week comes from the date, and so does the season (it isn't stored). Tournaments in the off-season are allowed but give no season points. 409 `tournament_in_progress` if another one isn't concluded. For a "Par turnering" (`duo: true`), `playerIds` are the teams' first players and `partnerIds` their second, in the same order; 400 `incomplete_team` (not one partner per team), `player_in_two_teams`, `partners_without_duo`, and `too_few_players` counts teams. |
| `PUT /api/tournaments/:id` | admin | "Rediger spillere": `{ date, format, playerIds, forFun?, duo?, partnerIds? }` (`forFun` and `duo` left as they are when omitted; teams as when creating), in `draft` or `pools` (409 `pools_closed` once the knockout has started; 400 `too_few_players` / `unknown_player` as when creating). Players who leave are taken out of their pool with all their matches, so they get no result at all. Newcomers go into the smallest pool (`updatePools`). When the new count needs another number of pools (`poolSizes`), or a pool would get too small, every pool is drawn again and every pool result is deleted. In a "Par turnering" a team is kept (with its pool and results) while its first player stays; its partner can change freely. |
| `PUT /api/tournaments/:id/pools` | admin | `{ pools: playerId[][] }` saves the admin's swaps and moves, new pools and removed ones, in `draft` or `pools` (409 `pools_closed`). Every entrant exactly once, no empty pool (400). A pool of one can be saved while rearranging, but the pools can't start or close with it (`pool_too_small` below). Each pool keeps the row (id, matches, results, race length) of the pool most of its players were in, so removing pool B doesn't touch pool C's results; a new pool gets the race length of the pool before it. The pools are then named A, B, C … in order. During the pools, each pool's matches follow its players (`syncPoolMatches`): a result stays while both its players are still in that pool, matches with a player who left the pool are deleted, new pairings are added with their pool's race length, and the play order is rebuilt. A pool whose players changed loses its `tiebreak`. |
| `PUT /api/tournaments/:id/for-fun` | admin | `{ forFun }`: "For sjov kamp" on or off, in any status, concluded too. 409 `historical` for an old tournament. |
| `POST /api/tournaments/:id/randomize` | admin | "Randomize": draws every pool again (`poolSizes` + `drawPools`), in `draft` or `pools`. Every pool match and result is deleted; during the pools new matches are created. Each pool (A, B …) keeps its race length. |
| `POST /api/tournaments/:id/start` | admin | "Gå til turnering", draft only, no body. Creates every pool match in play order (`roundRobinRounds` + `playOrder`) with its pool's race length and moves to `pools`. 409 `pool_too_small` while a pool has a single player. Players and pools can still change afterwards (above). |
| `PUT /api/tournaments/:id/pools/:poolId/race` | admin | `{ raceTo }` (2 to 5, else 400): one pool's race length (`pools.race_to`, returned as the pool's `raceTo`), in `draft` or `pools` (409 `pools_closed`). During the pools also its matches', and only while that pool has no result (409 `round_started`). |
| `DELETE /api/tournaments/:id` | admin | Deletes a tournament, in progress or concluded, with its pools, matches, results and player sessions. Season points, standings and player statistics are derived from `results`, so the players lose that tournament's points and counts at once. Players and memberships stay. 404 `not_found`. |
| `PUT /api/tournaments/:id/matches/:matchId/result` | admin, player | `{ framesA, framesB }` (player A's and B's frames) enters or corrects a result. Must be a finished race (`assertValidScore` with the match's `raceTo`), else 400 `invalid_score`. Pool matches only while the status is `pools` (409 `stage_closed` otherwise). |
| `DELETE /api/tournaments/:id/matches/:matchId/result` | admin, player | Clears a result entered by mistake. |
| `PUT /api/tournaments/:id/pools/:poolId/tiebreak` | admin | `{ playerIds }`, best first: the admin's order for players in one pool that results can't separate (stored in `pool_members.admin_tiebreak`, returned as the pool's `tiebreak`). Only during pool play. |
| `POST /api/tournaments/:id/knockout` | admin | "complete qualifier brackets": `{ size: 2 \| 4 \| 8, adminOrder? }`, where 2 is the final only (400 `final_only_needs_one_pool` unless there is exactly one pool; the pool's #1 and #2 are the seeds). Needs every pool match played (409 `pools_incomplete`) and no pool of one (409 `pool_too_small`). Qualifies (`qualifyFromPools`), seeds (`seedQualifiers`: wins, set score, random), stores `knockout_seeds`, creates every knockout match without a race length (every round, the first included, gets one from the race route), and moves to `knockout`. 409 `unresolved_ties` with `ties` (groups of player ids) when the admin must order players first; 400 `cannot_qualify` if there are too few players. |
| `PUT /api/tournaments/:id/knockout/race` | admin | `{ stage: "QF" \| "SF" \| "THIRD" \| "FINAL", raceTo }`: the race length for one round. Only during the knockout (409 `not_in_knockout`), and only until the round has a result (409 `round_started`). 400 `no_such_round` for a round this knockout doesn't have. |
| `PUT /api/tournaments/:id/knockout/swap` | admin | `{ playerId, otherId }`: the admin's drag and drop in the knockout's first round (quarterfinals, semifinals, or the final only). Swaps the two players, or, when `otherId` is in the tournament but not in the knockout, puts them in `playerId`'s place and seed (`swapInFirstRound`). Only matches without a result can change (409 `match_played`); later rounds follow (`syncBracket`). 409 `not_in_knockout`, 400 `unknown_player` / `not_in_first_round`. |
| `POST /api/tournaments/:id/conclude` | admin | "conclude tournament": needs the final and the third-place final (if there is one) played (409 `knockout_unfinished`). Writes every player's `results` row and moves to `concluded`. The join code is retired and players are signed out. |
| `POST /api/tournaments/:id/reopen` | admin | Puts a concluded tournament back in the knockout for corrections too big to make in place; its results are removed until it is concluded again, and it gets a new join code. 409 `tournament_in_progress` if another tournament is in progress, 409 `historical` for an old tournament (it has no knockout). |
| `POST /api/tournaments/historical` | admin | "Indtast gammel turnering": `{ date, format, knockoutSize: 2 \| 4 \| 8, playerIds }`, the players best first (below) → 201, a tournament with `historical: true` that is `concluded` at once, with no pools, matches, seeds or join code. Allowed while another tournament is in progress. 400 `date_in_future`, `too_few_players` (fewer than the places to fill), `unknown_player`. |
| `GET /api/tournaments` | public | Concluded tournaments, newest first: `id`, `date`, `week`, `season`, `format`, `forFun`, `duo`, `winner` (name; a team as "Anna & Bo"), `participants` (players, both of every team). |

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

**Par turnering** (`duo`). Teams of two play instead of single players, and run like any other
tournament: each team takes one place in the pools, matches, seeds and placings. A team goes by
its first player's id everywhere; `tournament_players.partner_id` is its second player. When it
is concluded, both players get a `results` row with the team's placement and pool wins, and
every team gets the **participation points** (1), whatever its placement: duo tournaments are
for fun and only count as participation. So they count in season points, the standings and
Deltagelse, but Wins, Semifinals and Quarterfinals (`players.ts`, `seasons.ts`) and handicap
regulation (`handicaps.ts`) leave them out. A tournament can be both a "Par turnering" and "For
sjov kamp"; then it counts in nothing. Its detail's `results` has one row per team (the first
player's). It is chosen on Ny Turnering and can be changed with "Rediger spillere" until the
knockout starts. Old tournaments are always singles.

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
| `tournaments` | Date, week, format (8/9/10-ball), knockout size (2/4/8), status (draft → pools → knockout → concluded), join code for `/play`, `historical` (an old tournament entered with its placings only), `for_fun` ("For sjov kamp": left out of the statistics), `duo` ("Par turnering": teams of two, participation only). |
| `tournament_players` | Who entered a tournament; in a "Par turnering", `partner_id` is the team's second player. |
| `pools`, `pool_members` | Pools (A, B, …) with their race length (`race_to`, 2 to 5), and their players in drawn order. |
| `knockout_seeds` | Seeds, best first. The bracket is derived from these and the knockout scores. |
| `matches` | Pool and knockout matches: stage, pool or slot (QF1 … FINAL), players, race length, frames, play order. |
| `results` | Per player per concluded tournament: placement, points, matches won, handicap snapshot. |
| `points_table` | Points per placement, seeded from the workbook (10/7/5/4/2/1). |
| `handicap_adjustments` | What sets a player's regulation score back to 0: a recommendation applied or dismissed (with its tournament), or a handicap changed by hand; or a score set by hand (`set`, with `score`); the date and the handicap before and after. |
| `calendar_events` | The frontpage's calendar: date, title and an optional description (`description`, null for none). |
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
| `pools.ts` | `poolSizes`, `drawPools`, `swapPlayers`, `movePlayer`, `continuedPools`, `updatePools`: default pool sizes, random draw, admin changes (swaps, moves, new and removed pools), which earlier pool each rearranged pool continues, players joining or leaving. |
| `qualification.ts` | `qualifyFromPools`, `qualifyForFinal`, `suggestedKnockoutSize`: who goes through to the knockout. |
| `seeding.ts` | `seedQualifiers`: order qualifiers for the bracket. |
| `knockout.ts` | `knockoutBracket(seeds, scores)`: the whole bracket, derived from seeds and scores. `bracketFromFirstRound(pairings, scores)` does the same from a first round the admin may have changed (`swapInFirstRound`). |
| `placements.ts` | `placements`, `placementsInOrder`, `pointsFor`, `DEFAULT_POINTS_TABLE`: final placings (from the bracket, or for an old tournament from the order entered) and season points. |
| `seasons.ts` | `seasonForDate`, `seasonByLabel`, `nextSeason`, `joinDeadline`, `earnsMemberBonus`, `weekNumber`, `todayInDenmark`, `MEMBER_BONUS`: which season and week a date is in, and who earns the member bonus. |
| `handicaps.ts` | `regulation`, `regulationChange`, `regulatedHandicap`, `addMonths`, `teamHandicap`: a player's handicap regulation score, replayed from their tournaments, and the workbook's handicap ladder; a duo team's handicap. |

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
  (everyone plays everyone), 7 → one pool of 7, 11 → 5 + 6.
- **Admin changes to pools**: after the random draw the admin can swap two players
  (`swapPlayers`, sizes unchanged) or move a player to another pool or a new one (`movePlayer`,
  sizes change; an empty pool is removed). Pool sizes are free, but a pool needs 2 players to be
  played. A rearranged pool continues the earlier pool it shares the most players with
  (`continuedPools`) and keeps its results there.
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
- **Handicap regulation** (`regulation`, like the workbook's Handicap Tracking): every player has
  a hidden regulation score, starting at 0 and replayed from their first tournament. 1st or 2nd
  gives +1; no pool wins gives −1 (old tournaments only count finals, their pool wins aren't
  known); "For sjov kamp" and "Par turnering" tournaments don't count. A ±1 is forgotten two calendar months after
  the score last changed (on that date: a −1 from 04-11 is gone on 04-01). At +2 the player gets
  a recommendation to make the handicap harder, at −2 easier, and the count starts again from 0
  while it waits. The handicap never changes by itself: the admin applies or dismisses the
  recommendation, and either sets the score back to 0, as does changing the handicap by hand.
  Recommendations don't expire. The admin can also set the score by hand (−1, 0 or 1) as it stood
  at the end of a date, to bring in old tournaments whose pool results aren't known: later
  tournaments count on top of it, a ±1 runs out two months after that date, and the handicap and
  open recommendations stay as they are. The workbook keeps each notch on its own and has it last through
  the date two months on; with at most ±1 open at a time that's the same score, except that here
  the change is gone on that date.
- **Team handicap** (`teamHandicap`, "Par turnering"): the average of the two players' base
  handicaps, a half rounded towards the harder handicap: −4 & +2 → −1, −3 & 0 → −2 (−1.5),
  +1 & +2 → +1 (1.5). It's only shown; the players' own handicaps are kept and snapshotted.
- **Handicap ladder** (`regulatedHandicap`, the workbook's): base +3 … −4, then the frame
  handicap 0 … −4. Harder lowers the base, and below −4 the frame; easier takes the frame back
  first, then raises the base. −4(−4) can't get harder and +3 can't get easier; such a
  recommendation can only be dismissed.
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
| 2026-10-21 | The admin's tools on a tournament's pages (join code, Rediger spillere/puljer, For sjov kamp, Annuller/Genåbn/Slet turnering) are gathered in an admin panel on the right, above the page on narrow screens. The steps that move the tournament on stay on the page. |
| 2026-10-22 | New default splits: 7 players → one pool of 7, 11 → 5 + 6 (were 4 + 3 and 4 + 4 + 3). |
| 2026-10-22 | The admin sets pool sizes freely when editing pools: drop a player at the bottom of a pool to add them, next to the pools to start a new pool; an empty pool is removed. A pool of one can't be started or closed. |
| 2026-10-22 | /live shows only the bracket during the knockout, without the pools, so the bracket fills the screen. |
| 2026-10-22 | 1st to 3rd on the season leaderboards (frontpage, Sæson, /live) are shown as pool balls, like the seeds. |
| 2026-10-22 | Handicaps on Spillere are written in red below 0 (strongest from -4) and green above 0 (strongest from +3), both columns. |
| 2026-10-22 | When the tournament on /live is concluded, the screen shows a podium with the top three until it is reloaded; then it shows the season leaderboard again. |
| 2026-10-22 | A space between a player's name and their handicap: "Martin Johansen (-1)" on /live, /play and the admin's tournament pages. |
| 2026-10-22 | /live shows the /play address under the date and format while a tournament is in progress (not the join code). |
| 2026-10-23 | "Par turnering": a checkbox on Ny Turnering (with or without "For sjov kamp") for teams of two, entered two names per row. A team plays as one; both players get a result, but every team gets the participation point (1) whatever its placement, so it counts in season points and Deltagelse only, not in Wins, Semifinals, Quarterfinals or handicap regulation. |
| 2026-10-23 | Handicap regulation as in the workbook: a hidden score per player (+1 for 1st/2nd, −1 for no pool wins; old tournaments count, fun ones don't), each change forgotten two months after the latest. ±2 recommends one step on the workbook ladder; the admin applies or dismisses it on "Handicapregulering" and is told after concluding. Both, and a handicap changed by hand, set the score back to 0; until then a new count starts. Replayed from the first tournament; past ±2 hits show as open recommendations. The admin can also set the score by hand (−1, 0, +1) as of a date, for old tournaments without pool results. |
| 2026-10-23 | On phones every table is compact like the pool tables: short headings, tighter cells, and the font shrinks until the table fits the screen (down to 0.65rem). |
| 2026-10-27 | The server also hosts the portfolio site, so HTTPS moved to a shared Caddy (in the portfolio repo) on the external `web` network, where the app is `pool-app`. This repo no longer runs Caddy; its `Caddyfile` is gone. |
| 2026-10-29 | A calendar ("Kalender") on the frontpage, above the season leaderboard: admins post events (a date, a title and an optional description), and edit or delete them. Only today's and coming events are shown, as "29/10  title"; one with a description has an "i" icon and opens it in a popup. |
| 2026-10-29 | The pool tables are compact on a phone turned sideways too (up to 500px high), not only up to 600px wide. |
| 2026-10-29 | The admin panel can be hidden and shown with the arrow in its header (remembered per device). It starts closed on phones and narrow screens, where it sits above the page, so the pools come first. |
| 2026-10-29 | Below 1000px wide the admin panel is a drawer on the right edge that lies over the pools and follows the screen while scrolling; its arrow puts it away into a strip at the edge. Beside the page (wider screens) it stays as it was. |
| 2026-10-29 | The race length field ("Først til") can be emptied to type a new number; left empty, it becomes 2. |
| 2026-10-29 | Every table's header (the blue row) stays in view while scrolling through its rows, under the site header; not the pool tables (admin, /play, the archive, /live) or the placings on a tournament's page. |
| 2026-10-29 | The site header scrolls away on a phone turned sideways too (up to 500px high), as it already did on narrow screens. |
