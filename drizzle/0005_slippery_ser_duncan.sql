CREATE TYPE "public"."sgd_decision" AS ENUM('aprobado', 'rechazado');--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "sgd_decision" "sgd_decision";--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "sgd_decision_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "sgd_decision_by" uuid;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "sgd_rejection_comment" text;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "sgd_second_review_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "sgd_second_review_requested_by" uuid;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_sgd_decision_by_profiles_id_fk" FOREIGN KEY ("sgd_decision_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_sgd_second_review_requested_by_profiles_id_fk" FOREIGN KEY ("sgd_second_review_requested_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;