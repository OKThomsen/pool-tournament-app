ALTER TABLE "pools" ADD COLUMN "race_to" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
-- Pools that are already being played keep the race length their matches have.
UPDATE "pools" SET "race_to" = m."race_to"
FROM (
  SELECT DISTINCT ON ("pool_id") "pool_id", "race_to" FROM "matches"
  WHERE "stage" = 'pool' AND "race_to" IS NOT NULL
  ORDER BY "pool_id", "id"
) m
WHERE m."pool_id" = "pools"."id";
