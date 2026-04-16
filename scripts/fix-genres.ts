/**
 * One-shot data migration: canonicalize genre rows.
 *
 * For each genre row:
 *   1. Compute canonical { name, normKey, group } from the taxonomy module.
 *   2. Group rows by normKey; keep the lowest-id row as the "survivor".
 *   3. Re-point tracks.genre_id to the survivor.
 *   4. Delete losers.
 *   5. Update survivor's name/norm_key/group_name to canonical values.
 * Finally, add the unique index on norm_key so the scanner's upsert path stays safe.
 *
 * Safe to re-run: converges on a canonical state.
 */
import "dotenv/config";
import { db, sql } from "../src/db/client";
import { genres, tracks } from "../src/db/schema";
import { canonicalFor } from "../src/db/genre-taxonomy";
import { eq, inArray, sql as dsql } from "drizzle-orm";

async function main() {
  const all = await db.select().from(genres);
  console.log(`loaded ${all.length} genre rows`);

  // Group rows by their canonical normKey.
  type Bucket = { survivor: number; name: string; group: string | null; losers: number[] };
  const buckets = new Map<string, Bucket>();

  for (const row of all) {
    const { name, normKey: key, group } = canonicalFor(row.name);
    if (!buckets.has(key)) {
      buckets.set(key, { survivor: row.id, name, group, losers: [] });
    } else {
      const b = buckets.get(key)!;
      // Keep the lowest id as survivor so foreign keys prefer the earliest row.
      if (row.id < b.survivor) {
        b.losers.push(b.survivor);
        b.survivor = row.id;
      } else {
        b.losers.push(row.id);
      }
    }
  }

  let totalDeleted = 0;
  for (const b of buckets.values()) {
    if (b.losers.length > 0) {
      await db
        .update(tracks)
        .set({ genreId: b.survivor })
        .where(inArray(tracks.genreId, b.losers));
      await db.delete(genres).where(inArray(genres.id, b.losers));
      totalDeleted += b.losers.length;
    }
    const { normKey: key } = canonicalFor(b.name);
    await db
      .update(genres)
      .set({ name: b.name, normKey: key, groupName: b.group })
      .where(eq(genres.id, b.survivor));
  }

  console.log(`deleted ${totalDeleted} duplicate genre rows, ${buckets.size} canonical rows remain`);

  // Now safe to enforce uniqueness.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS genres_norm_key_unique ON genres (norm_key)`;
  console.log("unique index on norm_key created");

  // Print summary
  const summary = await db
    .select({
      group: genres.groupName,
      name: genres.name,
      count: dsql<number>`(select count(*) from tracks where tracks.genre_id = genres.id)::int`,
    })
    .from(genres)
    .orderBy(dsql`coalesce(${genres.groupName}, 'zzz'), ${genres.name}`);
  console.log("\nCanonical genres:");
  let currentGroup = "";
  for (const row of summary) {
    if (row.group !== currentGroup) {
      currentGroup = row.group ?? "(no group)";
      console.log(`\n  ${currentGroup}`);
    }
    console.log(`    ${row.name.padEnd(20)} ${row.count}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
