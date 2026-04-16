/**
 * Library scanner.
 *
 * Walks MUSIC_ROOT recursively, reads ID3/Vorbis/MP4 tags via music-metadata,
 * and upserts artists / albums / genres / tracks into Postgres.
 *
 * Incremental: skips files where (path, mtime, size) match the DB row.
 * Missing files are flagged with missing_at rather than deleted.
 */
import "dotenv/config";
import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { parseFile } from "music-metadata";
import { eq, inArray, sql as dsql } from "drizzle-orm";
import { db, sql } from "../src/db/client";
import { artists, albums, genres, tracks } from "../src/db/schema";
import { canonicalFor } from "../src/db/genre-taxonomy";

const AUDIO_EXT = new Set([".mp3", ".m4a", ".flac", ".wav", ".aac", ".ogg", ".opus", ".aiff", ".aif"]);

const MUSIC_ROOT = process.env.MUSIC_ROOT;
if (!MUSIC_ROOT) {
  console.error("MUSIC_ROOT not set");
  process.exit(1);
}

type Stats = { scanned: number; added: number; updated: number; skipped: number; errors: number };
const stats: Stats = { scanned: 0, added: 0, updated: 0, skipped: 0, errors: 0 };

// Simple in-memory caches to avoid re-querying lookup tables.
const artistCache = new Map<string, number>();
const albumCache = new Map<string, number>();
const genreCache = new Map<string, number>();

async function getOrCreateArtist(name: string | undefined): Promise<number | null> {
  if (!name) return null;
  const key = name.trim();
  if (!key) return null;
  if (artistCache.has(key)) return artistCache.get(key)!;
  const existing = await db.select().from(artists).where(eq(artists.name, key)).limit(1);
  if (existing.length) {
    artistCache.set(key, existing[0].id);
    return existing[0].id;
  }
  const [row] = await db.insert(artists).values({ name: key }).returning();
  artistCache.set(key, row.id);
  return row.id;
}

async function getOrCreateAlbum(title: string | undefined, artistId: number | null, year: number | null): Promise<number | null> {
  if (!title) return null;
  const key = `${title.trim()}::${artistId ?? ""}`;
  if (!key.startsWith("::") && albumCache.has(key)) return albumCache.get(key)!;
  const rows = await db
    .select()
    .from(albums)
    .where(
      artistId
        ? dsql`${albums.title} = ${title.trim()} and ${albums.artistId} = ${artistId}`
        : dsql`${albums.title} = ${title.trim()} and ${albums.artistId} is null`,
    )
    .limit(1);
  if (rows.length) {
    albumCache.set(key, rows[0].id);
    return rows[0].id;
  }
  const [row] = await db.insert(albums).values({ title: title.trim(), artistId, year }).returning();
  albumCache.set(key, row.id);
  return row.id;
}

async function getOrCreateGenre(rawName: string | undefined): Promise<number | null> {
  if (!rawName) return null;
  const trimmed = rawName.trim();
  if (!trimmed) return null;
  const { name, normKey: key, group } = canonicalFor(trimmed);
  if (genreCache.has(key)) return genreCache.get(key)!;
  // Look up by canonical norm_key, not raw name — avoids case/accent duplicates.
  const existing = await db.select().from(genres).where(eq(genres.normKey, key)).limit(1);
  if (existing.length) {
    genreCache.set(key, existing[0].id);
    return existing[0].id;
  }
  const [row] = await db
    .insert(genres)
    .values({ name, normKey: key, groupName: group })
    .returning();
  genreCache.set(key, row.id);
  return row.id;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`cannot read ${dir}: ${(err as Error).message}`);
    return;
  }
  // Synology SMB occasionally returns duplicate directory entries (byte-identical
  // strings, same dir listed twice) which makes us recurse / process the same
  // file twice. Dedupe by name.
  const seenNames = new Set<string>();
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "#recycle" || entry.name === "@eaDir") continue;
    if (seenNames.has(entry.name)) continue;
    seenNames.add(entry.name);
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && AUDIO_EXT.has(extname(entry.name).toLowerCase())) {
      yield full;
    }
  }
}

async function parseWithRetry(path: string, retries = 2): Promise<Awaited<ReturnType<typeof parseFile>> | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await parseFile(path, { duration: true, skipCovers: true });
    } catch (err) {
      if (attempt === retries) return null;
      // Brief backoff; SMB hiccups are transient.
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return null;
}

async function processFile(path: string, seen: Set<string>) {
  stats.scanned++;
  seen.add(path);

  // SMB on Synology is flaky with Unicode paths — retry stat a couple times before giving up.
  let st;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      st = await stat(path);
      break;
    } catch (err) {
      if (attempt === 2) {
        stats.errors++;
        // Reduce log noise: only warn once per directory
        return;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  if (!st) return;
  const mtime = st.mtime;
  const size = st.size;

  // Fast path: skip if unchanged.
  const existing = await db.select().from(tracks).where(eq(tracks.path, path)).limit(1);
  if (existing.length) {
    const t = existing[0];
    if (t.fileSize === size && t.fileMtime && t.fileMtime.getTime() === mtime.getTime() && !t.missingAt) {
      stats.skipped++;
      return;
    }
  }

  const meta = await parseWithRetry(path);

  // Tag read failed? Still index the track using just filename + filesystem info.
  // Better to have a playable row with no metadata than to lose it entirely.
  if (!meta) {
    stats.errors++;
    const title = path.split("/").pop() || path;
    const values = {
      path,
      title,
      artistId: null,
      albumId: null,
      genreId: null,
      year: null,
      durationS: null,
      bitrate: null,
      format: extname(path).slice(1).toLowerCase() || null,
      fileMtime: mtime,
      fileSize: size,
      missingAt: null,
    };
    if (existing.length) await db.update(tracks).set(values).where(eq(tracks.id, existing[0].id));
    else await db.insert(tracks).values(values);
    return;
  }

  const common = meta.common;
  const fmt = meta.format;
  const artistName = common.artist || common.albumartist;
  const year = common.year && Number.isFinite(common.year) ? common.year : null;
  const artistId = await getOrCreateArtist(artistName || undefined);
  const albumId = await getOrCreateAlbum(common.album || undefined, artistId, year);
  const genreId = await getOrCreateGenre(common.genre?.[0] || undefined);
  const title = common.title || path.split("/").pop() || path;

  const values = {
    path,
    title,
    artistId,
    albumId,
    genreId,
    year,
    durationS: fmt.duration && Number.isFinite(fmt.duration) ? Math.round(fmt.duration) : null,
    bitrate: fmt.bitrate && Number.isFinite(fmt.bitrate) ? Math.round(fmt.bitrate) : null,
    format: fmt.container || extname(path).slice(1).toLowerCase(),
    fileMtime: mtime,
    fileSize: size,
    missingAt: null,
  };

  if (existing.length) {
    await db.update(tracks).set(values).where(eq(tracks.id, existing[0].id));
    stats.updated++;
  } else {
    await db.insert(tracks).values(values);
    stats.added++;
  }

  if (stats.scanned % 200 === 0) {
    console.log(`[${stats.scanned}] scanned — added=${stats.added} updated=${stats.updated} skipped=${stats.skipped}`);
  }
}

async function markMissing(seen: Set<string>) {
  // Paginate through all non-missing tracks and flag any whose path wasn't seen.
  const all = await db.select({ id: tracks.id, path: tracks.path }).from(tracks);
  const missingIds: number[] = [];
  for (const row of all) {
    if (!seen.has(row.path)) missingIds.push(row.id);
  }
  if (missingIds.length) {
    await db.update(tracks).set({ missingAt: new Date() }).where(inArray(tracks.id, missingIds));
    console.log(`flagged ${missingIds.length} missing tracks`);
  }
}

async function main() {
  console.log(`scanning ${MUSIC_ROOT}…`);

  // Guard: refuse to run if the root isn't reachable. Otherwise a dropped mount
  // would make us walk nothing and flag the entire library as missing.
  try {
    const rootStat = await stat(MUSIC_ROOT!);
    if (!rootStat.isDirectory()) {
      console.error(`MUSIC_ROOT ${MUSIC_ROOT} is not a directory`);
      process.exit(1);
    }
    const entries = await readdir(MUSIC_ROOT!);
    if (entries.length === 0) {
      console.error(`MUSIC_ROOT ${MUSIC_ROOT} is empty — refusing to scan (would flag every track missing)`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`cannot access MUSIC_ROOT ${MUSIC_ROOT}: ${(err as Error).message}`);
    process.exit(1);
  }

  const seen = new Set<string>();
  for await (const file of walk(MUSIC_ROOT!)) {
    try {
      await processFile(file, seen);
    } catch (err) {
      stats.errors++;
      console.warn(`error on ${file}: ${(err as Error).message}`);
    }
  }

  // Second guard: if the walk yielded nothing (e.g. mount dropped mid-scan),
  // don't run markMissing. We'd rather skip the bookkeeping than nuke the DB.
  if (seen.size === 0) {
    console.error("walk yielded zero files — skipping markMissing to avoid mass-flagging");
    await sql.end();
    process.exit(1);
  }

  await markMissing(seen);
  console.log(
    `done — scanned=${stats.scanned} added=${stats.added} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
