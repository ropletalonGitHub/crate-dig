import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  bigint,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const artists = pgTable(
  "artists",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
  },
  (t) => ({
    nameUnique: uniqueIndex("artists_name_unique").on(t.name),
  }),
);

export const albums = pgTable(
  "albums",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    artistId: integer("artist_id").references(() => artists.id),
    year: integer("year"),
  },
  (t) => ({
    titleArtistUnique: uniqueIndex("albums_title_artist_unique").on(t.title, t.artistId),
  }),
);

export const genres = pgTable(
  "genres",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    // Canonical lookup key: lowercase, NFD, diacritics stripped, punctuation collapsed.
    // Unique — used by the scanner so re-scans don't resurrect case/accent variants.
    normKey: text("norm_key").notNull().default(""),
    // Broad group label for the sidebar hierarchy (e.g. "Rock & Metal").
    groupName: text("group_name"),
  },
  (t) => ({
    normKeyUnique: uniqueIndex("genres_norm_key_unique").on(t.normKey),
  }),
);

// Separate axis from genre (e.g. workout, chill, party).
export const types = pgTable(
  "types",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
  },
  (t) => ({
    nameUnique: uniqueIndex("types_name_unique").on(t.name),
  }),
);

export const tracks = pgTable(
  "tracks",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull(),
    title: text("title").notNull(),
    artistId: integer("artist_id").references(() => artists.id),
    albumId: integer("album_id").references(() => albums.id),
    genreId: integer("genre_id").references(() => genres.id),
    year: integer("year"),
    durationS: integer("duration_s"),
    bitrate: integer("bitrate"),
    format: text("format"),
    fileMtime: timestamp("file_mtime", { withTimezone: true }),
    fileSize: bigint("file_size", { mode: "number" }),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
    missingAt: timestamp("missing_at", { withTimezone: true }),
  },
  (t) => ({
    pathUnique: uniqueIndex("tracks_path_unique").on(t.path),
    artistIdx: index("tracks_artist_idx").on(t.artistId),
    albumIdx: index("tracks_album_idx").on(t.albumId),
    genreIdx: index("tracks_genre_idx").on(t.genreId),
    yearIdx: index("tracks_year_idx").on(t.year),
  }),
);

export const trackTypes = pgTable(
  "track_types",
  {
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    typeId: integer("type_id")
      .notNull()
      .references(() => types.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.trackId, t.typeId] }),
  }),
);

export const ratings = pgTable("ratings", {
  trackId: integer("track_id")
    .primaryKey()
    .references(() => tracks.id, { onDelete: "cascade" }),
  stars: integer("stars").notNull().default(0),
  favorite: boolean("favorite").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tags = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
  },
  (t) => ({
    nameUnique: uniqueIndex("tags_name_unique").on(t.name),
  }),
);

export const trackTags = pgTable(
  "track_tags",
  {
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.trackId, t.tagId] }),
  }),
);

// A named external ranking list (e.g. "Rolling Stone 500 Greatest Songs").
export const charts = pgTable(
  "charts",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    source: text("source"),
  },
  (t) => ({
    nameUnique: uniqueIndex("charts_name_unique").on(t.name),
  }),
);

// Raw entries from a chart, normalized for matching.
export const chartEntries = pgTable(
  "chart_entries",
  {
    id: serial("id").primaryKey(),
    chartId: integer("chart_id")
      .notNull()
      .references(() => charts.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    artist: text("artist").notNull(),
    title: text("title").notNull(),
    artistNorm: text("artist_norm").notNull(),
    titleNorm: text("title_norm").notNull(),
  },
  (t) => ({
    chartIdx: index("chart_entries_chart_idx").on(t.chartId),
    matchIdx: index("chart_entries_match_idx").on(t.artistNorm, t.titleNorm),
  }),
);

// Resolved links between library tracks and chart entries.
export const trackCharts = pgTable(
  "track_charts",
  {
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    chartId: integer("chart_id")
      .notNull()
      .references(() => charts.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.trackId, t.chartId] }),
    trackIdx: index("track_charts_track_idx").on(t.trackId),
    rankIdx: index("track_charts_rank_idx").on(t.rank),
  }),
);

export const playHistory = pgTable(
  "play_history",
  {
    id: serial("id").primaryKey(),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    playedAt: timestamp("played_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    trackIdx: index("play_history_track_idx").on(t.trackId),
  }),
);
