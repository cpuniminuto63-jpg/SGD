CREATE TABLE "coordinator_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "coordinator_scopes_profile_institution_unique" UNIQUE("profile_id","institution_id")
);
--> statement-breakpoint
CREATE TABLE "profile_pings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_catalog" ADD COLUMN "per_session" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "source_row_id" text;--> statement-breakpoint
ALTER TABLE "coordinator_scopes" ADD CONSTRAINT "coordinator_scopes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordinator_scopes" ADD CONSTRAINT "coordinator_scopes_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordinator_scopes" ADD CONSTRAINT "coordinator_scopes_granted_by_profiles_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_pings" ADD CONSTRAINT "profile_pings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;