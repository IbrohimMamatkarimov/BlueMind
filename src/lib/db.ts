import { Pool, type PoolClient } from "pg";
import fs from "fs";
import path from "path";

// Supabase (Postgres). Every existing query in this app was written with
// SQLite-style `?` positional placeholders — rather than rewrite every
// query in every file, convertPlaceholders() below transparently turns
// `?, ?, ?` into `$1, $2, $3` before it reaches pg, so the rest of the
// codebase (db.prepare(sql).run/get/all(...params)) didn't need to change
// at all. The one real syntax incompatibility SQLite→Postgres actually has
// (nullable-safe `column IS ?` — Postgres's IS only accepts the literal
// keywords NULL/TRUE/FALSE/UNKNOWN, never a bound parameter) is fixed at
// the two call sites below that need it; if you add a new query anywhere
// else in the app that filters on a nullable column with `IS ?`, swap it
// for `IS NOT DISTINCT FROM ?` (Postgres's null-safe equality operator) —
// a plain `= ?` will silently fail to match NULL rows.

const SCHEMA_PATH = path.join(process.cwd(), "src", "lib", "schema.sql");

declare global {
  // eslint-disable-next-line no-var
  var __bluemindPoolPromise: Promise<Pool> | undefined;
}

function convertPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function initPool(): Promise<Pool> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Set it to your Supabase connection string (Project Settings \u2192 Database \u2192 Connection string \u2192 Transaction pooler, port 6543)."
    );
  }

  const pool = new Pool({
    connectionString,
    // Supabase's pooler requires SSL; rejectUnauthorized:false is the
    // standard setting for connecting from serverless platforms (Vercel)
    // to Supabase, since the full CA chain isn't bundled there.
    ssl: { rejectUnauthorized: false },
    // Small pool: PgBouncer (Supabase's transaction pooler on :6543) is
    // already doing the real pooling upstream. Each serverless function
    // instance only needs a couple of local connections, not dozens.
    max: 3,
    idleTimeoutMillis: 30000,
    // Without this, a connection that can't actually be established (wrong
    // port, network black hole, a paused/sleeping Supabase project) hangs
    // forever instead of failing — every route touching the DB just sits
    // there until the CLIENT's own timeout gives up with a vague "taking
    // too long" message and zero information about why. This makes it fail
    // fast with the real Postgres/network error, which actually shows up
    // in Vercel's function logs instead of being invisible.
    connectionTimeoutMillis: 8000,
  });

  const client = await pool.connect();
  try {
    const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
    await client.query(schema);
    await runMigrations(client);
    await backfillModuleReleases(client);
  } finally {
    client.release();
  }

  return pool;
}

function getPool(): Promise<Pool> {
  if (!global.__bluemindPoolPromise) {
    global.__bluemindPoolPromise = initPool();
  }
  return global.__bluemindPoolPromise;
}

// The `module_releases` gate (added after a lot of content already existed)
// defaults every module to unreleased. Without this backfill, every
// already-complete mock/module that existed before the gate was added would
// silently vanish from students' view the moment this shipped. This runs
// once: for any (mock, section, module) with no release row yet AND a full
// question count already banked (22 Math / 27 R&W), it's grandfathered in
// as released. A module still mid-way through being added (like a fresh
// mock with only a few questions typed in so far) is correctly left
// unreleased, same as brand-new ones — only genuinely complete content gets
// auto-published.
async function backfillModuleReleases(client: PoolClient) {
  try {
    const result = await client.query(
      `SELECT mock_id, section, module, module_pool, COUNT(*) as n
       FROM questions
       WHERE mock_id IS NOT NULL
       GROUP BY mock_id, section, module, module_pool`
    );
    const rows = result.rows as {
      mock_id: string;
      section: string;
      module: number;
      module_pool: string | null;
      n: string; // pg returns COUNT(*) as a string (bigint) by default
    }[];

    // Module 2 has both a "higher" and "lower" pool; the release check
    // (and the actual exam) only look at the "higher" pool by default.
    const byModule = new Map<string, number>();
    for (const r of rows) {
      if (r.module === 2 && r.module_pool !== "higher") continue;
      const key = `${r.mock_id}|${r.section}|${r.module}`;
      byModule.set(key, (byModule.get(key) ?? 0) + Number(r.n));
    }

    // Bulk-fetch every existing release row in ONE query instead of one
    // existence-check query PER candidate module. With ~30 mocks x 4
    // modules, the old per-candidate SELECT loop meant 100+ sequential
    // network round-trips to Supabase on every single fresh process start
    // (every `npm run dev` restart re-creates the connection pool from
    // scratch) — in local dev, over a real network instead of a local
    // SQLite file, that alone was enough to blow well past the client's
    // 12s timeout before the page could even start loading.
    const existingResult = await client.query("SELECT mock_id, section, module FROM module_releases");
    const existingKeys = new Set(
      (existingResult.rows as { mock_id: string; section: string; module: number }[]).map(
        (r) => `${r.mock_id}|${r.section}|${r.module}`
      )
    );

    const expected: Record<string, number> = { Math: 22, "Reading and Writing": 27 };
    for (const [key, count] of byModule) {
      if (existingKeys.has(key)) continue; // already has an explicit status, don't override it
      const [mockId, section, moduleStr] = key.split("|");
      if (count < (expected[section] ?? Infinity)) continue; // not a full module yet — leave gated
      await client.query(
        `INSERT INTO module_releases (mock_id, section, module, released, released_at)
         VALUES ($1, $2, $3, 1, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`,
        [mockId, section, Number(moduleStr)]
      );
    }
  } catch {
    // best-effort — nothing to backfill on a fresh/empty database
  }
}

// One-off column additions for existing databases — schema.sql's
// CREATE TABLE IF NOT EXISTS only applies to brand-new tables, so columns
// added later (like passage_text below) need an explicit ALTER TABLE here.
// Postgres supports "ADD COLUMN IF NOT EXISTS" natively, so unlike the old
// SQLite version of this function, nothing here needs a try/catch per
// statement.
async function runMigrations(client: PoolClient) {
  const migrations = [
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS passage_text TEXT",
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0",
    // Base64 data URL for an optional chart/graph/photo shown with the
    // question (common in real R&W "data from a graph" items and some Math
    // questions). NULL when a question has no image.
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_data TEXT",
    // Account page fields — country is a free-text "Not set" until the
    // student picks one, avatar_data is a base64 data URL for an uploaded
    // profile photo (same pattern as question image_data above).
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT",
    // Backfill: getModuleQuestionsPublic requires module_pool = 'higher'
    // for every module-2 question, but several creation paths never set
    // that field before this was fixed at the source in addQuestionAdmin/
    // updateQuestionAdmin. Any module-2 question saved before that fix has
    // module_pool = NULL and is permanently invisible to students despite
    // sitting in the bank — this repairs all of them in one pass. Safe to
    // run every startup: only touches rows still NULL, so it's a no-op
    // once everything's been backfilled once.
    "UPDATE questions SET module_pool = 'higher' WHERE module = 2 AND module_pool IS NULL",
    // College Board Question Bank import (src/scripts/import-qbank.ts):
    // external_id holds the official 8-character question ID so re-running
    // the importer upserts in place instead of duplicating, and so the
    // student-facing bank can show the same ID the official site shows.
    "ALTER TABLE questions ADD COLUMN IF NOT EXISTS external_id TEXT",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_external_id ON questions(external_id) WHERE external_id IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_questions_bank_filters ON questions(section, domain, skill, difficulty) WHERE mock_id IS NULL",
    // Question Bank practice sets — a saved list of bank question ids that
    // the exam-style page (/practice/qbank/<section>/<setId>) serves like a
    // module. results_json keeps the graded breakdown for the Review view.
    "ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS section TEXT",
    "ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS title TEXT",
    "ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS results_json TEXT",
  ];
  for (const sql of migrations) {
    await client.query(sql);
  }

  // Backfill position for any pre-existing rows that still have the
  // default 0 (i.e. everything added before this column existed) — orders
  // them by their original insertion time (created_at, then id as a
  // tiebreaker) within each (mock, section, module) group, one time only.
  // Rows added after this migration get a real position at insert time in
  // addQuestionAdmin, so this never re-runs meaningfully once it's done.
  const needsBackfill = await client.query("SELECT COUNT(*) as n FROM questions WHERE position = 0");
  const n = Number(needsBackfill.rows[0].n);
  if (n > 1) {
    const groups = await client.query("SELECT DISTINCT mock_id, section, module FROM questions WHERE position = 0");
    for (const g of groups.rows as { mock_id: string | null; section: string; module: number }[]) {
      // mock_id is nullable (standalone Practice-bank questions have no
      // mock) — Postgres's IS only accepts literal NULL/TRUE/FALSE, never
      // a bound parameter, so this uses IS NOT DISTINCT FROM (the
      // null-safe equality operator) instead of `mock_id IS $1`.
      const rows = await client.query(
        "SELECT id FROM questions WHERE mock_id IS NOT DISTINCT FROM $1 AND section = $2 AND module = $3 AND position = 0 ORDER BY created_at, id",
        [g.mock_id, g.section, g.module]
      );
      let i = 0;
      for (const row of rows.rows as { id: string }[]) {
        i++;
        await client.query("UPDATE questions SET position = $1 WHERE id = $2", [i, row.id]);
      }
    }
  }
}

// Explicit, named types for the db handle — required so `transaction()`'s
// callback parameter can reference this shape directly instead of
// `typeof db`. Referencing `typeof db` from inside the object literal that
// defines `db` itself is a circular type reference; TypeScript doesn't
// error on it, it just silently gives up and treats the callback
// parameter as implicit `any` (which is what broke the build here, since
// `noImplicitAny` then flags it as an error).
interface PreparedStatement {
  run(...params: unknown[]): Promise<{ changes: number; lastInsertRowid: unknown }>;
  get(...params: unknown[]): Promise<unknown>;
  all(...params: unknown[]): Promise<unknown[]>;
}
interface DbHandle {
  prepare(sql: string): PreparedStatement;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: DbHandle) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function makeQueryable(query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>) {
  return {
    prepare(sql: string): PreparedStatement {
      const pgSql = convertPlaceholders(sql);
      return {
        async run(...params: unknown[]) {
          const r = await query(pgSql, params);
          return { changes: r.rowCount ?? 0, lastInsertRowid: undefined };
        },
        async get(...params: unknown[]) {
          const r = await query(pgSql, params);
          return r.rows[0];
        },
        async all(...params: unknown[]) {
          return (await query(pgSql, params)).rows;
        },
      };
    },
    async exec(sql: string): Promise<void> {
      await query(sql, []);
    },
  };
}

/**
 * Same calling shape the rest of the app already uses
 * (db.prepare(sql).run/get/all(...params)) — every call site just needed
 * an `await` in front, since these are network calls now. `?` placeholders
 * in `sql` are converted to Postgres's `$1, $2, ...` automatically.
 */
export const db: DbHandle = {
  ...makeQueryable(async (sql, params) => {
    const pool = await getPool();
    return pool.query(sql, params);
  }),
  /**
   * Runs several queries as one atomic Postgres transaction — BEGIN, your
   * callback, then COMMIT, or ROLLBACK if it throws. Needed for anything
   * that must all-or-nothing (bulk deletes, multi-table writes where a
   * partial failure would leave data inconsistent).
   *
   * The `tx` passed to your callback has the SAME `.prepare(sql).run/get/
   * all(...)` shape as `db` above, so existing code reads identically —
   * the only difference is every query in the callback runs on one
   * dedicated connection (via pg's PoolClient) instead of the shared pool,
   * which is what makes BEGIN/COMMIT/ROLLBACK actually scope correctly to
   * just these queries.
   *
   * Usage: `await db.transaction(async (tx) => { await tx.prepare("DELETE
   * FROM answers").run(); ... });`
   */
  async transaction<T>(fn: (tx: DbHandle) => Promise<T>): Promise<T> {
    const pool = await getPool();
    const client = await pool.connect();
    const tx: DbHandle = {
      ...makeQueryable((sql, params) => client.query(sql, params)),
      // Nested transactions aren't supported — a callback that tries to
      // call tx.transaction(...) itself is a bug, not a valid savepoint.
      transaction: () => {
        throw new Error("Nested transactions aren't supported — don't call tx.transaction() inside a transaction callback.");
      },
      close: async () => {
        throw new Error("Don't call close() on a transaction's tx handle — it manages its own connection lifecycle.");
      },
    };
    try {
      await client.query("BEGIN");
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },
  async close() {
    const pool = await getPool();
    await pool.end();
  },
};
