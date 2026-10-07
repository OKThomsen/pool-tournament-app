CREATE TABLE "memberships" (
	"player_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	CONSTRAINT "memberships_player_id_season_id_pk" PRIMARY KEY("player_id","season_id")
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" DROP COLUMN "member";