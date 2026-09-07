/* eslint-disable no-console */
/**
 * Pushes text-only corrections from a mock folder's `mock.json` into a mock
 * that is ALREADY in the database, without deleting and re-importing it.
 *
 * `db:import-mock --replace` is the normal way to reload a mock, but it
 * deletes every question row first and so refuses to run once students have
 * attempts on the mock (see import-mock.ts). That guard is right — real
 * history must never be wiped — but it leaves no way to fix a typo in a
 * rationale on a mock that is already live. This script is that way: it
 * UPDATEs the rendered text fields in place and touches nothing else.
 *
 * Deliberately narrow. It only ever writes:
 *   question_text, passage_text, rationale, explanation, and the `text` of
 *   each answer choice.
 * It never writes correct_answer, question_type, image_data, a choice's
 * imageData, question ids, or any metadata (domain/skill/difficulty/
 * position). Nothing an attempt, practice_attempt or module_result points at
 * changes, so grading history stays valid and student scores are unaffected.
 *
 * Usage:
 *   npm run db:resync-mock-text -- content/mocks/2023-may           # dry run
 *   npm run db:resync-mock-text -- content/mocks/2023-may --apply   # write
 *
 * A dry run is the default and prints every field it would change, so the
 * diff can be eyeballed against production before anything is written.
 *
 * Reads DATABASE_URL from the environment or from ./.env, the same way
 * import-mock.ts does (tsx doesn't load .env on its own).
 */
import fs from "fs";
import path from "path";

// Must run BEFORE importing ../lib/db, which reads process.env.DATABASE_URL
// when the pool is created. Same parser as import-mock.ts.
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

type Section = "Math" | "Reading and Writing";

interface MockFileChoice {
  id: string;
  text: string;
}

interface MockFileQuestion {
  number: number;
  passageText?: string | null;
  questionText: string;
  choices: MockFileChoice[];
  rationale: string;
  explanation: string;
}

interface MockFile {
  mock: { title: string; subtitle?: string | null };
  modules: { section: Section; module: 1 | 2; questions: MockFileQuestion[] }[];
}

interface QuestionRow {
  id: string;
  passage_text: string | null;
  question_text: string;
  choices: string;
  rationale: string | null;
  explanation: string | null;
}

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const dirs = args.filter((a) => !a.startsWith("--"));
  if (dirs.length !== 1) {
    fail("Usage: npm run db:resync-mock-text -- <folder containing mock.json> [--apply]");
  }
  for (const f of flags) {
    if (f !== "--apply") fail(`Unknown flag ${f}`);
  }
  return { dir: path.resolve(process.cwd(), dirs[0]), apply: flags.has("--apply") };
}

/** Shows just the differing region of a long field, so a one-word fix inside
 * a 500-character explanation doesn't print two full paragraphs. */
function preview(before: string, after: string): string {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--;
    endA--;
  }
  const lead = Math.max(0, start - 30);
  const ctx = (s: string, end: number) => (lead > 0 ? "…" : "") + s.slice(lead, end + 30) + (end + 30 < s.length ? "…" : "");
  return `\n         - ${JSON.stringify(ctx(before, endB))}\n         + ${JSON.stringify(ctx(after, endA))}`;
}

async function main() {
  const { dir, apply } = parseArgs();
  const file = path.join(dir, "mock.json");
  if (!fs.existsSync(file)) fail(`No mock.json in ${dir}`);
  const data = JSON.parse(fs.readFileSync(file, "utf-8")) as MockFile;

  // Imported lazily so the .env parsing above has already run.
  const { db } = await import("../lib/db");

  const { title, subtitle = null } = data.mock;
  const mocks = (await db
    .prepare("SELECT id FROM mocks WHERE title = ? AND subtitle IS NOT DISTINCT FROM ?")
    .all(title, subtitle)) as { id: string }[];
  if (mocks.length === 0) {
    fail(`No mock titled "${title}"${subtitle ? ` (${subtitle})` : ""} is in the database — import it first with db:import-mock.`);
  }
  if (mocks.length > 1) {
    fail(`${mocks.length} mocks share the title "${title}"${subtitle ? ` (${subtitle})` : ""} (${mocks.map((m) => m.id).join(", ")}) — resolve the duplicate first.`);
  }
  const mockId = mocks[0].id;

  // Collected first, applied second, so a dry run and a real run report
  // exactly the same thing and the writes go in one transaction.
  const updates: { row: QuestionRow; where: string; fields: Record<string, string | null>; notes: string[] }[] = [];
  const missing: string[] = [];

  for (const mod of data.modules) {
    for (const q of mod.questions) {
      const where = `${mod.section} M${mod.module} Q${q.number}`;
      const row = (await db
        .prepare(
          `SELECT id, passage_text, question_text, choices, rationale, explanation
             FROM questions
            WHERE mock_id = ? AND section = ? AND module = ? AND position = ?`
        )
        .get(mockId, mod.section, mod.module, q.number)) as QuestionRow | undefined;
      if (!row) {
        missing.push(where);
        continue;
      }

      const fields: Record<string, string | null> = {};
      const notes: string[] = [];

      // import-mock stores a blank passage as NULL — match that exactly, or
      // every passage-less question would look like a change on every run.
      const passage = q.passageText?.trim() ? q.passageText : null;
      if (passage !== row.passage_text) {
        fields.passage_text = passage;
        notes.push(`passage_text${preview(row.passage_text ?? "", passage ?? "")}`);
      }
      if (q.questionText !== row.question_text) {
        fields.question_text = q.questionText;
        notes.push(`question_text${preview(row.question_text, q.questionText)}`);
      }
      if (q.rationale !== row.rationale) {
        fields.rationale = q.rationale;
        notes.push(`rationale${preview(row.rationale ?? "", q.rationale)}`);
      }
      if (q.explanation !== row.explanation) {
        fields.explanation = q.explanation;
        notes.push(`explanation${preview(row.explanation ?? "", q.explanation)}`);
      }

      // Choice text only, matched by choice id — imageData and the ids
      // themselves are carried through untouched, so correct_answer (which
      // stores an id) keeps pointing at the same choice.
      const dbChoices = JSON.parse(row.choices) as { id: string; text?: string; imageData?: string }[];
      if (dbChoices.length > 0) {
        const byId = new Map(q.choices.map((c) => [c.id, c.text]));
        let changed = false;
        const next = dbChoices.map((c) => {
          const text = byId.get(c.id);
          if (text === undefined || text === c.text) return c;
          changed = true;
          notes.push(`choice ${c.id}${preview(c.text ?? "", text)}`);
          return { ...c, text };
        });
        if (changed) fields.choices = JSON.stringify(next);
      }

      if (Object.keys(fields).length > 0) updates.push({ row, where, fields, notes });
    }
  }

  if (missing.length > 0) {
    console.log(`\n⚠ ${missing.length} question(s) in mock.json have no row in mock ${mockId} and were skipped:`);
    for (const m of missing) console.log(`   • ${m}`);
  }

  if (updates.length === 0) {
    console.log(`\n✔ Mock ${mockId} ("${title}") already matches mock.json — nothing to update.`);
    return;
  }

  console.log(`\n${apply ? "Updating" : "Would update"} ${updates.length} question(s) in mock ${mockId} ("${title}"):`);
  for (const u of updates) {
    console.log(`\n   ${u.where} [${u.row.id}]`);
    for (const n of u.notes) console.log(`      ${n}`);
  }

  if (!apply) {
    console.log(`\nDry run — nothing was written. Re-run with --apply to save these ${updates.length} change(s).`);
    return;
  }

  await db.transaction(async (tx) => {
    for (const u of updates) {
      const cols = Object.keys(u.fields);
      // version/updated_at bumped exactly as updateQuestionAdmin does, so a
      // resync is indistinguishable from an edit made in the admin panel.
      const sets = [
        ...cols.map((c) => `${c} = ?`),
        "version = version + 1",
        `updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
      ];
      await tx.prepare(`UPDATE questions SET ${sets.join(", ")} WHERE id = ?`).run(...cols.map((c) => u.fields[c]), u.row.id);
    }
  });

  const fieldCount = updates.reduce((n, u) => n + Object.keys(u.fields).length, 0);
  console.log(`\n✔ Updated ${fieldCount} field(s) across ${updates.length} question(s) in mock ${mockId}. Attempts and scores were not touched.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      const { db } = await import("../lib/db");
      await db.close();
    } catch {
      // pool was never opened (bad args or a missing mock.json)
    }
  });
