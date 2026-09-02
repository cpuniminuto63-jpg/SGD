ALTER TYPE "public"."user_role" ADD VALUE 'sgd';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'coordinador_eafit';--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "re_review_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "re_review_requested_by" uuid;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "re_review_pending_document_ids" jsonb;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "traspaso_eafit_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "traspaso_eafit_by" uuid;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "entregado_cpe_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "entregado_cpe_by" uuid;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_re_review_requested_by_profiles_id_fk" FOREIGN KEY ("re_review_requested_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_traspaso_eafit_by_profiles_id_fk" FOREIGN KEY ("traspaso_eafit_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_entregado_cpe_by_profiles_id_fk" FOREIGN KEY ("entregado_cpe_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;