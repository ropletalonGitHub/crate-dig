/**
 * Reverts tracks that were incorrectly flagged as missing.
 *
 * Use after a scan ran against an unmounted/empty MUSIC_ROOT and bulk-flagged
 * rows. Defaults to a 15-minute window so genuinely-missing tracks from
 * earlier runs stay flagged. Pass --minutes=N to widen, or --all to null
 * every missing_at.
 */
import "dotenv/config";
import { sql as dsql } from "drizzle-orm";
import { db, sql } from "../src/db/client";
import { tracks } from "../src/db/schema";

const args = new Set(process.argv.slice(2));
const minutesArg = [...args].find((a) => a.startsWith("--minutes="));
const all = args.has("--all");
const minutes = minutesArg ? Number(minutesArg.split("=")[1]) : 15;

async function main() {
  const where = all
    ? dsql`missing_at is not null`
    : dsql`missing_at > now() - (${minutes} || ' minutes')::interval`;

  const before = await db.execute(dsql`select count(*)::int as n from tracks where ${where}`);
  const n = (before[0] as { n: number }).n;
  console.log(`reverting ${n} tracks (${all ? "all" : `last ${minutes} minutes`})`);

  if (n > 0) {
    await db.execute(dsql`update tracks set missing_at = null where ${where}`);
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
