CREATE TABLE "membership_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"start" date NOT NULL,
	"end" date,
	CONSTRAINT "membership_periods_end_after_start" CHECK ("end" is null or "end" >= "start")
);
--> statement-breakpoint
ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_periods_one_active_idx" ON "membership_periods" USING btree ("player_id") WHERE "end" is null;