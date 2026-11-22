CREATE TABLE "title_checks" (
	"title_norm" text PRIMARY KEY NOT NULL,
	"found" boolean NOT NULL,
	"artist" text,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "unverified" boolean DEFAULT false NOT NULL;