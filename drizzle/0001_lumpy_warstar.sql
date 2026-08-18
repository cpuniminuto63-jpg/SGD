CREATE TABLE "section_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"status" "review_status" NOT NULL,
	"comment" text,
	"reviewer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "section_reviews" ADD CONSTRAINT "section_reviews_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_reviews" ADD CONSTRAINT "section_reviews_section_id_document_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."document_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_reviews" ADD CONSTRAINT "section_reviews_reviewer_id_profiles_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;