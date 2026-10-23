CREATE TYPE "public"."handicap_adjustment_kind" AS ENUM('manual', 'applied', 'dismissed');--> statement-breakpoint
CREATE TABLE "handicap_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"kind" "handicap_adjustment_kind" NOT NULL,
	"tournament_id" integer,
	"date" date NOT NULL,
	"old_base" integer NOT NULL,
	"old_frame" integer NOT NULL,
	"new_base" integer NOT NULL,
	"new_frame" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "handicap_adjustments" ADD CONSTRAINT "handicap_adjustments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handicap_adjustments" ADD CONSTRAINT "handicap_adjustments_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "handicap_adjustments_player_idx" ON "handicap_adjustments" USING btree ("player_id");