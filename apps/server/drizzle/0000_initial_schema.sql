CREATE TYPE "public"."game_format" AS ENUM('8-ball', '9-ball', '10-ball');--> statement-breakpoint
CREATE TYPE "public"."match_stage" AS ENUM('pool', 'QF', 'SF', 'THIRD', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."placement" AS ENUM('1st', '2nd', '3rd', '4th', '5-8', 'participation');--> statement-breakpoint
CREATE TYPE "public"."tournament_status" AS ENUM('draft', 'pools', 'knockout', 'concluded');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "knockout_seeds" (
	"tournament_id" integer NOT NULL,
	"seed" integer NOT NULL,
	"player_id" integer NOT NULL,
	CONSTRAINT "knockout_seeds_tournament_id_seed_pk" PRIMARY KEY("tournament_id","seed")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"stage" "match_stage" NOT NULL,
	"pool_id" integer,
	"slot" text,
	"player_a_id" integer,
	"player_b_id" integer,
	"frames_a" integer,
	"frames_b" integer,
	"schedule_order" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_tournament_id_slot_unique" UNIQUE("tournament_id","slot")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"member" boolean DEFAULT false NOT NULL,
	"base_handicap" integer DEFAULT 0 NOT NULL,
	"frame_handicap" integer DEFAULT 0 NOT NULL,
	"last_adjusted" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points_table" (
	"placement" "placement" PRIMARY KEY NOT NULL,
	"points" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_members" (
	"pool_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "pool_members_pool_id_player_id_pk" PRIMARY KEY("pool_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" serial PRIMARY KEY NOT NULL,
	"tournament_id" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "pools_tournament_id_name_unique" UNIQUE("tournament_id","name")
);
--> statement-breakpoint
CREATE TABLE "results" (
	"tournament_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"placement" "placement" NOT NULL,
	"points" integer NOT NULL,
	"matches_won" integer NOT NULL,
	"base_handicap" integer NOT NULL,
	"frame_handicap" integer NOT NULL,
	CONSTRAINT "results_tournament_id_player_id_pk" PRIMARY KEY("tournament_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "seasons_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_players" (
	"tournament_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	CONSTRAINT "tournament_players_tournament_id_player_id_pk" PRIMARY KEY("tournament_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"season_id" integer NOT NULL,
	"week" integer NOT NULL,
	"format" "game_format" NOT NULL,
	"knockout_size" integer,
	"status" "tournament_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"concluded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "knockout_seeds" ADD CONSTRAINT "knockout_seeds_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knockout_seeds" ADD CONSTRAINT "knockout_seeds_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_player_a_id_players_id_fk" FOREIGN KEY ("player_a_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_player_b_id_players_id_fk" FOREIGN KEY ("player_b_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_members" ADD CONSTRAINT "pool_members_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_tournament_idx" ON "matches" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "players_name_idx" ON "players" USING btree ("name");