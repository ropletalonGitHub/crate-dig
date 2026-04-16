// Node-side DB client. Used by the scanner and other Node scripts.
// The Tauri frontend talks to Postgres via @tauri-apps/plugin-sql instead.
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

export const sql = postgres(url);
export const db = drizzle(sql, { schema });
