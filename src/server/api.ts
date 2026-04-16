/**
 * Tiny API served via Vite middleware during `npm run dev` / `tauri dev`.
 * Backed by Drizzle.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql as dsql,
  SQL,
  type AnyColumn,
} from "drizzle-orm";
import { db } from "../db/client";
import {
  albums,
  artists,
  chartEntries,
  charts,
  genres,
  playHistory,
  ratings,
  tags,
  trackCharts,
  trackTags,
  trackTypes,
  tracks,
  types,
} from "../db/schema";

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function listTracks(url: URL, res: ServerResponse) {
  const params = url.searchParams;
  const q = params.get("q")?.trim();
  const genreId = params.get("genre_id");
  const genreGroup = params.get("genre_group");
  const artistIdParam = params.get("artist_id");
  const albumIdParam = params.get("album_id");
  const typeId = params.get("type_id");
  const tagId = params.get("tag_id");
  const yearMin = params.get("year_min");
  const yearMax = params.get("year_max");
  const minStars = params.get("min_stars");
  const favoritesOnly = params.get("favorites") === "1";
  const chartedOnly = params.get("charted") === "1";
  const sort = params.get("sort") ?? "title";
  const dir = params.get("dir") === "desc" ? desc : asc;
  const limit = Math.min(parseInt(params.get("limit") ?? "500", 10) || 500, 5000);

  const conditions: SQL[] = [isNull(tracks.missingAt)];
  if (artistIdParam) conditions.push(eq(tracks.artistId, parseInt(artistIdParam, 10)));
  if (albumIdParam) conditions.push(eq(tracks.albumId, parseInt(albumIdParam, 10)));
  if (genreId) conditions.push(eq(tracks.genreId, parseInt(genreId, 10)));
  if (genreGroup)
    conditions.push(
      dsql`exists (select 1 from ${genres} g where g.id = ${tracks.genreId} and g.group_name = ${genreGroup})`,
    );
  if (yearMin) conditions.push(dsql`${tracks.year} >= ${parseInt(yearMin, 10)}`);
  if (yearMax) conditions.push(dsql`${tracks.year} <= ${parseInt(yearMax, 10)}`);
  if (minStars) conditions.push(dsql`coalesce(${ratings.stars}, 0) >= ${parseInt(minStars, 10)}`);
  if (favoritesOnly) conditions.push(dsql`coalesce(${ratings.favorite}, false) = true`);
  if (chartedOnly)
    conditions.push(
      dsql`exists (select 1 from ${trackCharts} tc where tc.track_id = ${tracks.id})`,
    );
  if (typeId)
    conditions.push(
      dsql`exists (select 1 from ${trackTypes} tt where tt.track_id = ${tracks.id} and tt.type_id = ${parseInt(typeId, 10)})`,
    );
  if (tagId)
    conditions.push(
      dsql`exists (select 1 from ${trackTags} tt where tt.track_id = ${tracks.id} and tt.tag_id = ${parseInt(tagId, 10)})`,
    );
  if (q) {
    const pattern = `%${q}%`;
    // If the query is a plausible year (4 digits), also match tracks.year exactly.
    const asYear = /^\d{4}$/.test(q) ? parseInt(q, 10) : null;
    const parts: (SQL | undefined)[] = [
      ilike(tracks.title, pattern),
      ilike(artists.name, pattern),
      ilike(albums.title, pattern),
    ];
    if (asYear != null) parts.push(eq(tracks.year, asYear));
    const clause = or(...(parts.filter(Boolean) as SQL[]));
    if (clause) conditions.push(clause);
  }

  const sortColMap: Record<string, AnyColumn> = {
    title: tracks.title,
    artist: artists.name,
    album: albums.title,
    year: tracks.year,
    duration: tracks.durationS,
    stars: ratings.stars,
  };

  let orderBySql: SQL;
  if (sort === "chart") {
    // Order by best (lowest) chart rank across any chart; NULLS last so charted tracks come first when ASC.
    const direction = params.get("dir") === "desc" ? "desc" : "asc";
    orderBySql = dsql.raw(
      `(select min(tc.rank) from track_charts tc where tc.track_id = tracks.id) ${direction} nulls last`,
    );
  } else {
    const sortCol: AnyColumn = sortColMap[sort] ?? tracks.title;
    orderBySql = dir(sortCol) as SQL;
  }

  const rows = await db
    .select({
      id: tracks.id,
      title: tracks.title,
      path: tracks.path,
      year: tracks.year,
      durationS: tracks.durationS,
      bitrate: tracks.bitrate,
      format: tracks.format,
      artistId: tracks.artistId,
      albumId: tracks.albumId,
      genreId: tracks.genreId,
      artist: artists.name,
      album: albums.title,
      genre: genres.name,
      stars: dsql<number>`coalesce(${ratings.stars}, 0)::int`,
      favorite: dsql<boolean>`coalesce(${ratings.favorite}, false)`,
      chartRank: dsql<number | null>`(select min(tc.rank) from ${trackCharts} tc where tc.track_id = ${tracks.id})::int`,
    })
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(genres, eq(tracks.genreId, genres.id))
    .leftJoin(ratings, eq(ratings.trackId, tracks.id))
    .where(and(...conditions))
    .orderBy(orderBySql)
    .limit(limit);

  json(res, 200, { tracks: rows, total: rows.length });
}

async function listGenres(res: ServerResponse) {
  const rows = await db
    .select({
      id: genres.id,
      name: genres.name,
      group: genres.groupName,
      count: dsql<number>`count(${tracks.id})::int`,
    })
    .from(genres)
    .leftJoin(tracks, and(eq(tracks.genreId, genres.id), isNull(tracks.missingAt)))
    .groupBy(genres.id, genres.name, genres.groupName)
    .orderBy(asc(genres.groupName), asc(genres.name));
  json(res, 200, { genres: rows });
}

async function listTypes(res: ServerResponse) {
  const rows = await db
    .select({
      id: types.id,
      name: types.name,
      count: dsql<number>`count(distinct ${trackTypes.trackId})::int`,
    })
    .from(types)
    .leftJoin(trackTypes, eq(trackTypes.typeId, types.id))
    .groupBy(types.id, types.name)
    .orderBy(asc(types.name));
  json(res, 200, { types: rows });
}

async function listTags(res: ServerResponse) {
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      count: dsql<number>`count(distinct ${trackTags.trackId})::int`,
    })
    .from(tags)
    .leftJoin(trackTags, eq(trackTags.tagId, tags.id))
    .groupBy(tags.id, tags.name)
    .orderBy(asc(tags.name));
  json(res, 200, { tags: rows });
}

async function yearRange(res: ServerResponse) {
  const row = await db
    .select({
      min: dsql<number>`min(${tracks.year})::int`,
      max: dsql<number>`max(${tracks.year})::int`,
    })
    .from(tracks)
    .where(isNull(tracks.missingAt));
  json(res, 200, { min: row[0]?.min ?? null, max: row[0]?.max ?? null });
}

async function stats(res: ServerResponse) {
  const row = await db
    .select({
      total: dsql<number>`count(*)::int`,
      missing: dsql<number>`count(*) filter (where ${tracks.missingAt} is not null)::int`,
    })
    .from(tracks);
  json(res, 200, row[0] ?? { total: 0, missing: 0 });
}

async function getArtist(id: number, res: ServerResponse) {
  const artistRow = await db.select().from(artists).where(eq(artists.id, id)).limit(1);
  if (!artistRow.length) {
    json(res, 404, { error: "not found" });
    return;
  }
  // Album rows + aggregates for this artist.
  const albumRows = await db
    .select({
      id: albums.id,
      title: albums.title,
      year: albums.year,
      trackCount: dsql<number>`count(${tracks.id})::int`,
      totalDurationS: dsql<number>`coalesce(sum(${tracks.durationS}), 0)::int`,
    })
    .from(albums)
    .leftJoin(tracks, and(eq(tracks.albumId, albums.id), isNull(tracks.missingAt)))
    .where(eq(albums.artistId, id))
    .groupBy(albums.id, albums.title, albums.year)
    .orderBy(asc(albums.year), asc(albums.title));
  // Total aggregates
  const totals = await db
    .select({
      tracks: dsql<number>`count(*)::int`,
      totalDurationS: dsql<number>`coalesce(sum(${tracks.durationS}), 0)::int`,
    })
    .from(tracks)
    .where(and(eq(tracks.artistId, id), isNull(tracks.missingAt)));
  json(res, 200, {
    id: artistRow[0].id,
    name: artistRow[0].name,
    albums: albumRows,
    totalTracks: totals[0]?.tracks ?? 0,
    totalDurationS: totals[0]?.totalDurationS ?? 0,
  });
}

async function getAlbum(id: number, res: ServerResponse) {
  const rows = await db
    .select({
      id: albums.id,
      title: albums.title,
      year: albums.year,
      artistId: albums.artistId,
      artist: artists.name,
    })
    .from(albums)
    .leftJoin(artists, eq(artists.id, albums.artistId))
    .where(eq(albums.id, id))
    .limit(1);
  if (!rows.length) {
    json(res, 404, { error: "not found" });
    return;
  }
  const totals = await db
    .select({
      tracks: dsql<number>`count(*)::int`,
      totalDurationS: dsql<number>`coalesce(sum(${tracks.durationS}), 0)::int`,
    })
    .from(tracks)
    .where(and(eq(tracks.albumId, id), isNull(tracks.missingAt)));
  json(res, 200, {
    ...rows[0],
    totalTracks: totals[0]?.tracks ?? 0,
    totalDurationS: totals[0]?.totalDurationS ?? 0,
  });
}

async function listCharts(res: ServerResponse) {
  const rows = await db
    .select({
      id: charts.id,
      name: charts.name,
      description: charts.description,
      source: charts.source,
      entries: dsql<number>`count(distinct ${chartEntries.id})::int`,
      matched: dsql<number>`count(distinct ${trackCharts.trackId})::int`,
    })
    .from(charts)
    .leftJoin(chartEntries, eq(chartEntries.chartId, charts.id))
    .leftJoin(trackCharts, eq(trackCharts.chartId, charts.id))
    .groupBy(charts.id)
    .orderBy(asc(charts.name));
  json(res, 200, { charts: rows });
}

async function getTrackDetail(id: number, res: ServerResponse) {
  const trackRows = await db
    .select({
      id: tracks.id,
      title: tracks.title,
      stars: dsql<number>`coalesce(${ratings.stars}, 0)::int`,
      favorite: dsql<boolean>`coalesce(${ratings.favorite}, false)`,
    })
    .from(tracks)
    .leftJoin(ratings, eq(ratings.trackId, tracks.id))
    .where(eq(tracks.id, id))
    .limit(1);
  if (!trackRows.length) {
    json(res, 404, { error: "not found" });
    return;
  }
  const typeRows = await db
    .select({ id: types.id, name: types.name })
    .from(trackTypes)
    .innerJoin(types, eq(types.id, trackTypes.typeId))
    .where(eq(trackTypes.trackId, id));
  const tagRows = await db
    .select({ id: tags.id, name: tags.name })
    .from(trackTags)
    .innerJoin(tags, eq(tags.id, trackTags.tagId))
    .where(eq(trackTags.trackId, id));
  const chartRows = await db
    .select({ id: charts.id, name: charts.name, rank: trackCharts.rank })
    .from(trackCharts)
    .innerJoin(charts, eq(charts.id, trackCharts.chartId))
    .where(eq(trackCharts.trackId, id))
    .orderBy(asc(trackCharts.rank));
  json(res, 200, { ...trackRows[0], types: typeRows, tags: tagRows, charts: chartRows });
}

async function upsertRating(id: number, body: any, res: ServerResponse) {
  const stars = Math.max(0, Math.min(5, parseInt(body.stars ?? 0, 10) || 0));
  const favorite = !!body.favorite;
  await db
    .insert(ratings)
    .values({ trackId: id, stars, favorite, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: ratings.trackId,
      set: { stars, favorite, updatedAt: new Date() },
    });
  json(res, 200, { ok: true });
}

async function setTrackTypes(id: number, body: any, res: ServerResponse) {
  const names: string[] = Array.isArray(body.names) ? body.names.map((n: any) => String(n).trim()).filter(Boolean) : [];
  const ids: number[] = [];
  for (const name of names) {
    const existing = await db.select().from(types).where(eq(types.name, name)).limit(1);
    if (existing.length) ids.push(existing[0].id);
    else {
      const [row] = await db.insert(types).values({ name }).returning();
      ids.push(row.id);
    }
  }
  await db.delete(trackTypes).where(eq(trackTypes.trackId, id));
  if (ids.length) await db.insert(trackTypes).values(ids.map((typeId) => ({ trackId: id, typeId })));
  json(res, 200, { ok: true });
}

async function setTrackTags(id: number, body: any, res: ServerResponse) {
  const names: string[] = Array.isArray(body.names) ? body.names.map((n: any) => String(n).trim()).filter(Boolean) : [];
  const ids: number[] = [];
  for (const name of names) {
    const existing = await db.select().from(tags).where(eq(tags.name, name)).limit(1);
    if (existing.length) ids.push(existing[0].id);
    else {
      const [row] = await db.insert(tags).values({ name }).returning();
      ids.push(row.id);
    }
  }
  await db.delete(trackTags).where(eq(trackTags.trackId, id));
  if (ids.length) await db.insert(trackTags).values(ids.map((tagId) => ({ trackId: id, tagId })));
  json(res, 200, { ok: true });
}

async function logPlay(body: any, res: ServerResponse) {
  const trackId = parseInt(body.trackId, 10);
  if (!trackId) {
    json(res, 400, { error: "missing trackId" });
    return;
  }
  await db.insert(playHistory).values({ trackId });
  json(res, 200, { ok: true });
}

async function recentPlays(url: URL, res: ServerResponse) {
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200", 10) || 200, 1000);
  // Latest play per track, joined back to track info.
  const rows = await db
    .select({
      id: tracks.id,
      title: tracks.title,
      path: tracks.path,
      year: tracks.year,
      durationS: tracks.durationS,
      bitrate: tracks.bitrate,
      format: tracks.format,
      artistId: tracks.artistId,
      albumId: tracks.albumId,
      genreId: tracks.genreId,
      artist: artists.name,
      album: albums.title,
      genre: genres.name,
      stars: dsql<number>`coalesce(${ratings.stars}, 0)::int`,
      favorite: dsql<boolean>`coalesce(${ratings.favorite}, false)`,
      chartRank: dsql<number | null>`(select min(tc.rank) from ${trackCharts} tc where tc.track_id = ${tracks.id})::int`,
      playedAt: dsql<string>`max(${playHistory.playedAt})`,
      playCount: dsql<number>`count(${playHistory.id})::int`,
    })
    .from(playHistory)
    .innerJoin(tracks, eq(tracks.id, playHistory.trackId))
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(genres, eq(tracks.genreId, genres.id))
    .leftJoin(ratings, eq(ratings.trackId, tracks.id))
    .where(isNull(tracks.missingAt))
    .groupBy(
      tracks.id,
      artists.name,
      albums.title,
      genres.name,
      ratings.stars,
      ratings.favorite,
    )
    .orderBy(dsql`max(${playHistory.playedAt}) desc`)
    .limit(limit);
  json(res, 200, { tracks: rows });
}

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!req.url || !req.url.startsWith("/api/")) return false;
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const method = req.method ?? "GET";

  try {
    if (path === "/api/tracks" && method === "GET") {
      await listTracks(url, res);
      return true;
    }
    if (path === "/api/genres" && method === "GET") {
      await listGenres(res);
      return true;
    }
    if (path === "/api/types" && method === "GET") {
      await listTypes(res);
      return true;
    }
    if (path === "/api/tags" && method === "GET") {
      await listTags(res);
      return true;
    }
    if (path === "/api/charts" && method === "GET") {
      await listCharts(res);
      return true;
    }
    if (path === "/api/years" && method === "GET") {
      await yearRange(res);
      return true;
    }
    if (path === "/api/stats" && method === "GET") {
      await stats(res);
      return true;
    }
    if (path === "/api/recent" && method === "GET") {
      await recentPlays(url, res);
      return true;
    }
    if (path === "/api/plays" && method === "POST") {
      await logPlay(await readBody(req), res);
      return true;
    }

    const detailMatch = /^\/api\/tracks\/(\d+)$/.exec(path);
    if (detailMatch && method === "GET") {
      await getTrackDetail(parseInt(detailMatch[1], 10), res);
      return true;
    }
    const artistMatch = /^\/api\/artists\/(\d+)$/.exec(path);
    if (artistMatch && method === "GET") {
      await getArtist(parseInt(artistMatch[1], 10), res);
      return true;
    }
    const albumMatch = /^\/api\/albums\/(\d+)$/.exec(path);
    if (albumMatch && method === "GET") {
      await getAlbum(parseInt(albumMatch[1], 10), res);
      return true;
    }
    const ratingMatch = /^\/api\/tracks\/(\d+)\/rating$/.exec(path);
    if (ratingMatch && method === "PUT") {
      await upsertRating(parseInt(ratingMatch[1], 10), await readBody(req), res);
      return true;
    }
    const typesMatch = /^\/api\/tracks\/(\d+)\/types$/.exec(path);
    if (typesMatch && method === "PUT") {
      await setTrackTypes(parseInt(typesMatch[1], 10), await readBody(req), res);
      return true;
    }
    const tagsMatch = /^\/api\/tracks\/(\d+)\/tags$/.exec(path);
    if (tagsMatch && method === "PUT") {
      await setTrackTags(parseInt(tagsMatch[1], 10), await readBody(req), res);
      return true;
    }

    if (path === "/api/file" && (method === "GET" || method === "HEAD")) {
      const { createReadStream, statSync } = await import("node:fs");
      const id = url.searchParams.get("id");
      if (!id) {
        json(res, 400, { error: "missing id" });
        return true;
      }
      const row = await db.select().from(tracks).where(eq(tracks.id, parseInt(id, 10))).limit(1);
      if (!row.length) {
        json(res, 404, { error: "not found" });
        return true;
      }
      const filePath = row[0].path;
      let st;
      try {
        st = statSync(filePath);
      } catch {
        json(res, 404, { error: "file missing" });
        return true;
      }
      const lower = filePath.toLowerCase();
      const contentType = lower.endsWith(".flac")
        ? "audio/flac"
        : lower.endsWith(".m4a") || lower.endsWith(".aac")
          ? "audio/mp4"
          : lower.endsWith(".wav")
            ? "audio/wav"
            : lower.endsWith(".ogg") || lower.endsWith(".opus")
              ? "audio/ogg"
              : "audio/mpeg";
      const range = req.headers.range;
      if (range && method === "GET") {
        const match = /bytes=(\d+)-(\d*)/.exec(range);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : st.size - 1;
          res.statusCode = 206;
          res.setHeader("content-type", contentType);
          res.setHeader("accept-ranges", "bytes");
          res.setHeader("content-range", `bytes ${start}-${end}/${st.size}`);
          res.setHeader("content-length", end - start + 1);
          createReadStream(filePath, { start, end }).pipe(res);
          return true;
        }
      }
      res.statusCode = 200;
      res.setHeader("content-type", contentType);
      res.setHeader("accept-ranges", "bytes");
      res.setHeader("content-length", st.size);
      if (method === "HEAD") {
        res.end();
        return true;
      }
      createReadStream(filePath).pipe(res);
      return true;
    }

    // Silence unused-import warning for inArray in dev; kept for future batch ops.
    void inArray;

    json(res, 404, { error: "not found" });
    return true;
  } catch (err) {
    console.error("api error", err);
    json(res, 500, { error: (err as Error).message });
    return true;
  }
}
