-- Seasons used to be calendar quarters ("04/2026") with membership ticked per quarter. Now a
-- tournament's season follows from its date, and membership is a dated period.
-- Each player's latest quarterly membership becomes one period. It starts when the quarter's
-- new season starts (Q1/Q2 → 1 January, Q3 → 1 July, Q4 → 1 September), so a member who was
-- ticked "this season" keeps the bonus, and is still active if the quarter hasn't ended yet.
INSERT INTO "membership_periods" ("player_id", "start", "end")
SELECT "player_id",
  CASE WHEN q <= 2 THEN make_date(y, 1, 1) WHEN q = 3 THEN make_date(y, 7, 1) ELSE make_date(y, 9, 1) END,
  CASE WHEN quarter_end >= (now() AT TIME ZONE 'Europe/Copenhagen')::date THEN NULL ELSE quarter_end END
FROM (
  SELECT DISTINCT ON (m."player_id") m."player_id", q, y,
    (make_date(y, q * 3, 1) + interval '1 month' - interval '1 day')::date AS quarter_end
  FROM "memberships" m
  JOIN "seasons" s ON s."id" = m."season_id",
  LATERAL (SELECT split_part(s."label", '/', 1)::int AS q, split_part(s."label", '/', 2)::int AS y) l
  ORDER BY m."player_id", y DESC, q DESC
) latest;--> statement-breakpoint
ALTER TABLE "tournaments" DROP CONSTRAINT "tournaments_season_id_seasons_id_fk";--> statement-breakpoint
ALTER TABLE "tournaments" DROP COLUMN "season_id";--> statement-breakpoint
DROP TABLE "memberships";--> statement-breakpoint
DROP TABLE "seasons";
