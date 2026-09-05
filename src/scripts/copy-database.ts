/* eslint-disable no-console */
/**
 * Copies every BlueMind table from one Postgres database to another — the
 * tool for moving off Supabase onto a self-hosted Postgres (or between any
 * two Postgres databases) without needing pg_dump/pg_restore version parity.
 *
 * Usage:
 *   SOURCE_DATABASE_URL="postgresql://...supabase..." \
 *   DATABASE_URL="postgresql://bluemind:...@127.0.0.1:5432/bluemind?sslmode=disable" \
 *   npm run db:copy
 *
 *   Add --truncate to empty the target tables first (a clean cut-over);
 *   without it, rows that already exist in the target (same primary key) are
 *   left alone and everything else is added (ON CONFLICT DO NOTHING).
 *
 * DATABASE_URL (the TARGET) is read from the environment or ./.env, exactly
 * like the app does. The target schema is created/migrated automatically the
 * moment the app's db module connects, so the target can be a brand-new
 * empty database. Tables are copied in foreign-key dependency order, and a
 * column is only copied when it exists in both databases, so a source that
 * is slightly ahead of or behind the target still copies cleanly.
 */
import fs from "fs";
import path from "path";
import { Pool } from "pg";

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

// Referenced tables first so foreign keys never fail.
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
  "sessions",
  "question_reports",
  "practice_attempts",
];

function redact(url: string | undefined) {
  return (url ?? "").replace(/:\/\/([^:]+):[^@]+@/, "://$1:***@");
}

async function columnsOf(pool: Pool, table: string): Promise<string[]> {
  const r = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
    [table]
  );
  return r.rows.map((row: { column_name: string }) => row.column_name);
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;
  if (!sourceUrl || !targetUrl) {
    console.error("Set SOURCE_DATABASE_URL (where the data is now) and DATABASE_URL (where it should go).");
    process.exit(1);
  }
  if (sourceUrl === targetUrl) {
    console.error("SOURCE_DATABASE_URL and DATABASE_URL are the same database — nothing to do.");
    process.exit(1);
  }
  const truncate = process.argv.includes("--truncate");

  console.log(`Source: ${redact(sourceUrl)}`);
  console.log(`Target: ${redact(targetUrl)}${truncate ? "  (target tables will be emptied first)" : ""}`);

  // Connecting through the app's own db module creates/migrates the target
  // schema exactly the way the running app would.
  const { db } = await import("../lib/db");
  await db.prepare("SELECT 1").get();

  const source = new Pool({ connectionString: sourceUrl, ssl: { rejectUnauthorized: false }, max: 2 });
  const target = new Pool({ connectionString: targetUrl, ssl: { rejectUnauthorized: false }, max: 2 });

  try {
    const sourceTables = new Set(
      (await source.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).rows.map(
        (r: { table_name: string }) => r.table_name
      )
    );

    if (truncate) {
      // Reverse dependency order so nothing is referenced when it's cleared.
      for (const table of [...TABLES_IN_ORDER].reverse()) {
        await target.query(`DELETE FROM ${table}`);
      }
      console.log("Emptied target tables.");
    }

    let grandTotal = 0;
    for (const table of TABLES_IN_ORDER) {
      if (!sourceTables.has(table)) {
        console.log(`  ${table.padEnd(20)} not in source — skipped`);
        continue;
      }
      const targetCols = new Set(await columnsOf(target, table));
      const cols = (await columnsOf(source, table)).filter((c) => targetCols.has(c));
      const rows = (await source.query(`SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM ${table}`)).rows;

      let copied = 0;
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const sql = `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      for (const row of rows) {
        const res = await target.query(sql, cols.map((c) => row[c]));
        copied += res.rowCount ?? 0;
      }
      grandTotal += copied;
      const skipped = rows.length - copied;
      console.log(`  ${table.padEnd(20)} ${String(copied).padStart(5)} copied${skipped ? `, ${skipped} already present` : ""}`);
    }
    console.log(`\n✔ Done — ${grandTotal} rows copied.`);
  } finally {
    await source.end();
    await target.end();
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
