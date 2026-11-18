import {
  bigint, boolean, index, integer, jsonb, pgTable, serial, text, timestamp,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const songs = pgTable("songs", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  titleNorm: text("title_norm").notNull(),
  originalArtist: text("original_artist"),
  artistNorm: text("artist_norm"),
}, (t) => [index("songs_title_norm").on(t.titleNorm), index("songs_artist_norm").on(t.artistNorm)]);

export const performances = pgTable("performances", {
  id: serial("id").primaryKey(),
  songId: integer("song_id").notNull().references(() => songs.id),
  startedAt: ts("started_at").notNull(),
  bestClipNo: bigint("best_clip_no", { mode: "number" }),
  bestReadCnt: integer("best_read_cnt").notNull().default(0),
  clipCount: integer("clip_count").notNull().default(0),
  isDuet: boolean("is_duet").notNull().default(false),
  performers: text("performers").array().notNull().default([]),
  performersNorm: text("performers_norm").array().notNull().default([]),
  locked: boolean("locked").notNull().default(false),
}, (t) => [index("performances_song").on(t.songId), index("performances_started").on(t.startedAt)]);

export const clips = pgTable("clips", {
  titleNo: bigint("title_no", { mode: "number" }).primaryKey(),
  titleRaw: text("title_raw").notNull(),
  uploaderNick: text("uploader_nick").notNull(),
  uploaderId: text("uploader_id").notNull(),
  regDate: ts("reg_date").notNull(),
  readCnt: integer("read_cnt").notNull().default(0),
  thumbUrl: text("thumb_url").notNull(),
  durationMs: integer("duration_ms").notNull().default(0),
  status: text("status", { enum: ["auto", "review", "not_song", "confirmed", "gone"] }).notNull(),
  songId: integer("song_id").references(() => songs.id),
  performers: text("performers").array().notNull().default([]),
  isDuet: boolean("is_duet").notNull().default(false),
  performanceId: integer("performance_id").references(() => performances.id),
  locked: boolean("locked").notNull().default(false),
  firstSeenAt: ts("first_seen_at").notNull(),
  viewsUpdatedAt: ts("views_updated_at").notNull(),
}, (t) => [
  index("clips_reg_date").on(t.regDate), index("clips_status").on(t.status),
  index("clips_song").on(t.songId), index("clips_performance").on(t.performanceId),
]);

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  kind: text("kind", { enum: ["daily", "manual", "backfill"] }).notNull(),
  startedAt: ts("started_at").notNull(),
  finishedAt: ts("finished_at"),
  newClips: integer("new_clips").notNull().default(0),
  updatedViews: integer("updated_views").notNull().default(0),
  error: text("error"),
});

export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  at: ts("at").notNull(),
  ok: boolean("ok").notNull(),
});
