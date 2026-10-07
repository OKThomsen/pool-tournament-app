# TODO

Open work and things waiting on decisions. Done items are removed; decisions are recorded in
`DOCUMENTATION.md` → Decisions log.

## Waiting on the customer

- **Season dates.** Seasons are *not* every third month. The customer will give the real season
  boundaries later. Until then the app uses calendar quarters as a placeholder
  (`seasonForDate` in `packages/core/src/seasons.ts`). When the dates arrive: replace
  `seasonForDate`, decide how season labels look, and check existing tournaments still land in
  the right season (`tournaments.season_id` is set from the date when a tournament is created).
- **Member bonus only for a full season.** The bonus (10 points) should only count if the player
  was a member throughout the entire season. Today an admin ticks "Medlem denne sæson" and the
  bonus counts at once. This needs the season dates above and a decision on how membership is
  recorded (for example a start date per membership, 3 months long).

## Later

- Handicap: leave as is for now (manual editing only); no recommendations.
- Production hosting (HTTPS, `COOKIE_SECURE=true`, proxy-aware rate limiting).
- The frontpage's club text: the wireframe only has placeholder copy.
- Real styling (the current look is a placeholder).
