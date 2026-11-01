CREATE TABLE "photo_players" (
	"photo_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	CONSTRAINT "photo_players_photo_id_player_id_pk" PRIMARY KEY("photo_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"file" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"tournament_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_file_unique" UNIQUE("file")
);
--> statement-breakpoint
ALTER TABLE "photo_players" ADD CONSTRAINT "photo_players_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_players" ADD CONSTRAINT "photo_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "photos_tournament_idx" ON "photos" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "photos_date_idx" ON "photos" USING btree ("date");