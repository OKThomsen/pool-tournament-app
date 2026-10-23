ALTER TYPE "public"."handicap_adjustment_kind" ADD VALUE 'set';--> statement-breakpoint
ALTER TABLE "handicap_adjustments" ADD COLUMN "score" integer;