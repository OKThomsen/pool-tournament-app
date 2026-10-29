ALTER TABLE "calendar_events" RENAME COLUMN "message" TO "title";--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "description" text;
