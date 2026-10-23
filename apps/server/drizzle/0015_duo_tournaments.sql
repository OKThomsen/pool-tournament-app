ALTER TABLE "tournament_players" ADD COLUMN "partner_id" integer;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "duo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_partner_id_players_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_players_partner_idx" ON "tournament_players" USING btree ("tournament_id","partner_id");