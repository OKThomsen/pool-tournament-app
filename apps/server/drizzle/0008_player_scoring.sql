CREATE TABLE "player_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "join_code" text;--> statement-breakpoint
ALTER TABLE "player_sessions" ADD CONSTRAINT "player_sessions_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- A tournament already in progress gets a code too.
UPDATE "tournaments" SET "join_code" = lpad(floor(random() * 1000000)::int::text, 6, '0') WHERE "status" <> 'concluded';
