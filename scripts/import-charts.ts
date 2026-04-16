/**
 * Import chart data from external sources and match against the library.
 *
 * Current sources:
 *  - ListenBrainz sitewide "all time" top recordings (globally most-listened, MusicBrainz-backed)
 *  - ListenBrainz sitewide "this year" top recordings
 *
 * ListenBrainz is the open, community-maintained sibling of Last.fm; the
 * sitewide stats reflect the global listen counts of millions of users and
 * serve as a well-respected "world chart" of popularity.
 *
 * Usage: npm run import-charts
 */
import "dotenv/config";
import { db, sql } from "../src/db/client";
import { charts, chartEntries, trackCharts, tracks, artists } from "../src/db/schema";
import { eq } from "drizzle-orm";

type LBRecording = {
  artist_name: string;
  track_name: string;
  listen_count: number;
};

type ChartSpec = {
  name: string;
  description: string;
  source: string;
  url: string;
};

const CHARTS: ChartSpec[] = [
  {
    name: "ListenBrainz — All-time Top",
    description: "Globally most-listened recordings across all time, ranked by listen count.",
    source: "ListenBrainz sitewide stats",
    url: "https://api.listenbrainz.org/1/stats/sitewide/recordings?range=all_time&count=1000",
  },
  {
    name: "ListenBrainz — This Year",
    description: "Globally most-listened recordings this year, ranked by listen count.",
    source: "ListenBrainz sitewide stats",
    url: "https://api.listenbrainz.org/1/stats/sitewide/recordings?range=this_year&count=1000",
  },
];

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    // remove parenthetical / bracketed suffixes often used for remix/remaster info
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    // drop common edition qualifiers joined by dash
    .replace(/\s*-\s*(remaster(ed)?|mono|stereo|single version|album version|edit|live|mix|version)\b.*$/i, "")
    // leading article
    .replace(/^the\s+/, "")
    .replace(/&/g, " and ")
    // keep only letters/digits/spaces
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchRecordings(url: string): Promise<LBRecording[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const body: any = await res.json();
  return body.payload.recordings as LBRecording[];
}

async function importChart(spec: ChartSpec) {
  console.log(`\n→ ${spec.name}`);
  const recs = await fetchRecordings(spec.url);
  console.log(`  fetched ${recs.length} entries`);

  // Upsert chart row
  const existing = await db.select().from(charts).where(eq(charts.name, spec.name)).limit(1);
  let chartId: number;
  if (existing.length) {
    chartId = existing[0].id;
    await db
      .update(charts)
      .set({ description: spec.description, source: spec.source })
      .where(eq(charts.id, chartId));
  } else {
    const [row] = await db
      .insert(charts)
      .values({ name: spec.name, description: spec.description, source: spec.source })
      .returning();
    chartId = row.id;
  }

  // Replace all entries for this chart
  await db.delete(chartEntries).where(eq(chartEntries.chartId, chartId));
  const values = recs.map((r, idx) => ({
    chartId,
    rank: idx + 1,
    artist: r.artist_name,
    title: r.track_name,
    artistNorm: normalize(r.artist_name),
    titleNorm: normalize(r.track_name),
  }));
  // Batch insert
  const BATCH = 500;
  for (let i = 0; i < values.length; i += BATCH) {
    await db.insert(chartEntries).values(values.slice(i, i + BATCH));
  }
  console.log(`  inserted ${values.length} entries`);
  return chartId;
}

async function rebuildTrackCharts() {
  console.log("\n→ matching library tracks to chart entries…");
  // Clear existing matches
  await db.delete(trackCharts);

  // Pull all tracks with artist name
  const libraryRows = await db
    .select({
      id: tracks.id,
      title: tracks.title,
      artist: artists.name,
    })
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id));

  // Normalize library side once
  const normalizedLibrary = libraryRows.map((r) => ({
    id: r.id,
    artistNorm: normalize(r.artist ?? ""),
    titleNorm: normalize(r.title),
  }));

  // Pull all chart entries
  const entries = await db.select().from(chartEntries);
  console.log(`  library=${normalizedLibrary.length} chart_entries=${entries.length}`);

  // Build index: key = `${artistNorm}|${titleNorm}` → list of {trackId}
  const libIndex = new Map<string, number[]>();
  for (const r of normalizedLibrary) {
    if (!r.artistNorm || !r.titleNorm) continue;
    const key = `${r.artistNorm}|${r.titleNorm}`;
    if (!libIndex.has(key)) libIndex.set(key, []);
    libIndex.get(key)!.push(r.id);
  }
  // Fallback title-only index for entries where artist norm differs
  const titleIndex = new Map<string, number[]>();
  for (const r of normalizedLibrary) {
    if (!r.titleNorm) continue;
    if (!titleIndex.has(r.titleNorm)) titleIndex.set(r.titleNorm, []);
    titleIndex.get(r.titleNorm)!.push(r.id);
  }

  const matched: { trackId: number; chartId: number; rank: number }[] = [];
  const seenPair = new Set<string>();
  let exact = 0;
  let titleOnly = 0;
  for (const e of entries) {
    const key = `${e.artistNorm}|${e.titleNorm}`;
    let trackIds = libIndex.get(key);
    if (trackIds && trackIds.length) {
      exact += trackIds.length;
    } else {
      // title-only fallback; only accept if exactly one candidate to avoid wrong links
      const cands = titleIndex.get(e.titleNorm);
      if (cands && cands.length === 1) {
        trackIds = cands;
        titleOnly += 1;
      }
    }
    if (!trackIds) continue;
    for (const tid of trackIds) {
      const pairKey = `${tid}-${e.chartId}`;
      if (seenPair.has(pairKey)) continue; // keep the best (earliest-added) rank per track+chart
      seenPair.add(pairKey);
      matched.push({ trackId: tid, chartId: e.chartId, rank: e.rank });
    }
  }

  const BATCH = 500;
  for (let i = 0; i < matched.length; i += BATCH) {
    await db.insert(trackCharts).values(matched.slice(i, i + BATCH));
  }
  console.log(`  matches: ${matched.length} (exact artist+title: ${exact}, title-only fallback: ${titleOnly})`);
}

async function main() {
  for (const spec of CHARTS) {
    try {
      await importChart(spec);
    } catch (err) {
      console.error(`failed: ${spec.name}: ${(err as Error).message}`);
    }
  }
  await rebuildTrackCharts();
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
