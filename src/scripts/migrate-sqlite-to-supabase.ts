/**
 * One-time migration: copies everything from the local SQLite file
 * (bluemind.db — the pre-Supabase database) into the Supabase Postgres
 * database at DATABASE_URL. Run once after switching database providers so
 * all the mocks/questions/etc built up locally aren't lost.
 *
 * Usage:  npm run db:migrate-to-supabase
 *
 * Safe to re-run: every insert uses ON CONFLICT (id) DO NOTHING, so running
 * it twice just skips rows that already made it over instead of erroring
 * or duplicating anything.
 */
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { Pool } from "pg";

// tsx doesn't auto-load .env the way Next.js does — parse it ourselves.
function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile();

const SQLITE_PATH = path.join(process.cwd(), "bluemind.db");

// Tables in dependency order (referenced tables first) so foreign keys
// never fail. `sessions` is deliberately skipped — login tokens should be
// regenerated fresh, not carried over.
const TABLES_IN_ORDER = [
  "users",
  "mocks",
  "questions",
  "module_releases",
  "attempts",
  "answers",
  "module_results",
  "score_conversions",
  "score_records",
  "coach_conversations",
  "practice_sessions",
  "skill_stats",
  "question_reports",
  "practice_attempts",
];

async function main() {
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`No local SQLite database found at ${SQLITE_PATH} — nothing to migrate.`);
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set in .env — can't connect to Supabase.");
    process.exit(1);
  }

  console.log(`Reading from: ${SQLITE_PATH}`);
  const sqlite = new Database(SQLITE_PATH, { readonly: true, fileMustExist: true });

  console.log(`Connecting to Supabase...`);
  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await pool.query("SELECT 1"); // fail fast with a clear error if the connection string is wrong

  let totalCopied = 0;
  let totalSkipped = 0;

  for (const table of TABLES_IN_ORDER) {
    let rows: Record<string, unknown>[];
    try {
      rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    } catch {
      console.log(`  ${table}: doesn't exist in the local database, skipping.`);
      continue;
    }
    if (rows.length === 0) {
      console.log(`  ${table}: 0 rows, nothing to copy.`);
      continue;
    }

    const columns = Object.keys(rows[0]);
    const columnList = columns.map((c) => `"${c}"`).join(", ");
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const insertSql = `INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

    let copied = 0;
    let skipped = 0;
    for (const row of rows) {
      const values = columns.map((c) => row[c]);
      try {
        const result = await pool.query(insertSql, values);
        if ((result.rowCount ?? 0) > 0) copied++;
        else skipped++;
      } catch (err) {
        console.error(`  ${table}: failed to insert row ${row.id ?? "(no id)"} —`, err instanceof Error ? err.message : err);
        skipped++;
      }
    }
    console.log(`  ${table}: ${copied} copied, ${skipped} skipped (already present or failed) out of ${rows.length} total.`);
    totalCopied += copied;
    totalSkipped += skipped;
  }

  sqlite.close();
  await pool.end();

  console.log(`\nDone. ${totalCopied} rows copied, ${totalSkipped} skipped, across ${TABLES_IN_ORDER.length} tables.`);
  console.log(`Refresh your live site — your mocks and questions should be there now.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
