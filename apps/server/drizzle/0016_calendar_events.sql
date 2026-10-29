CREATE TABLE "calendar_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "calendar_events_date_idx" ON "calendar_events" USING btree ("date");