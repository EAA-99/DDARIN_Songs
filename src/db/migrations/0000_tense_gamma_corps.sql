CREATE TABLE "clips" (
	"title_no" bigint PRIMARY KEY NOT NULL,
	"title_raw" text NOT NULL,
	"uploader_nick" text NOT NULL,
	"uploader_id" text NOT NULL,
	"reg_date" timestamp with time zone NOT NULL,
	"read_cnt" integer DEFAULT 0 NOT NULL,
	"thumb_url" text NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"song_id" integer,
	"performers" text[] DEFAULT '{}' NOT NULL,
	"is_duet" boolean DEFAULT false NOT NULL,
	"performance_id" integer,
	"locked" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"views_updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performances" (
	"id" serial PRIMARY KEY NOT NULL,
	"song_id" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"best_clip_no" bigint,
	"best_read_cnt" integer DEFAULT 0 NOT NULL,
	"clip_count" integer DEFAULT 0 NOT NULL,
	"is_duet" boolean DEFAULT false NOT NULL,
	"performers" text[] DEFAULT '{}' NOT NULL,
	"performers_norm" text[] DEFAULT '{}' NOT NULL,
	"locked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"title_norm" text NOT NULL,
	"original_artist" text,
	"artist_norm" text,
	CONSTRAINT "songs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"new_clips" integer DEFAULT 0 NOT NULL,
	"updated_views" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clips" ADD CONSTRAINT "clips_performance_id_performances_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performances" ADD CONSTRAINT "performances_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clips_reg_date" ON "clips" USING btree ("reg_date");--> statement-breakpoint
CREATE INDEX "clips_status" ON "clips" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clips_song" ON "clips" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "clips_performance" ON "clips" USING btree ("performance_id");--> statement-breakpoint
CREATE INDEX "performances_song" ON "performances" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "performances_started" ON "performances" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "songs_title_norm" ON "songs" USING btree ("title_norm");--> statement-breakpoint
CREATE INDEX "songs_artist_norm" ON "songs" USING btree ("artist_norm");