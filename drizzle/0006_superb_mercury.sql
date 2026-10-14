CREATE TYPE "public"."cpe_decision" AS ENUM('aprobado', 'rechazado');--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "cpe_decision" "cpe_decision";--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "cpe_decision_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "cpe_decision_by" uuid;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "cpe_rejection_comment" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_cpe_decision_by_profiles_id_fk" FOREIGN KEY ("cpe_decision_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;