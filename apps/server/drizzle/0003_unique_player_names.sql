DROP INDEX "players_name_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "players_name_lower_idx" ON "players" USING btree (lower("name"));