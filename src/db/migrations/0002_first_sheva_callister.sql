ALTER TABLE "clips" ADD COLUMN "source_bj" text;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "source_vod" bigint;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "seek_sec" integer;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "via_broadcast" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "clips_source_vod" ON "clips" USING btree ("source_vod");