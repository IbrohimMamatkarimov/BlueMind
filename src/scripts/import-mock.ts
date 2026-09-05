/* eslint-disable no-console */
/**
 * Imports a real, hand-transcribed mock test (a folder containing `mock.json`
 * plus a `figures/` directory of PNG/JPG images) into the database as a new
 * mock with all of its questions — the way to load an official-style
 * question set (e.g. content/mocks/2026-march-int-a) without typing 98
 * questions into the admin UI one at a time.
 *
 * Usage:
 *   npm run db:import-mock -- content/mocks/2026-march-int-a
 *   npm run db:import-mock -- content/mocks/2026-march-int-a --replace
 *   npm run db:import-mock -- content/mocks/2026-march-int-a --no-release
 *
 * Flags:
 *   --replace     If a mock with the same title + subtitle already exists,
 *                 delete it (and its questions) first and import fresh.
 *                 Refused when students already have attempts on it — that
 *                 guard exists so real history can never be wiped by accident.
 *   --no-release  Leave the four modules unreleased (hidden behind "Coming
 *                 soon" until an admin releases them). By default every
 *                 module is released immediately, since an imported set is
 *                 complete by construction.
 *
 * Reads DATABASE_URL from the environment or from ./.env (tsx doesn't load
 * .env on its own the way Next.js does). Every question row is written with
 * the exact same columns/defaults as addQuestionAdmin in src/lib/admin.ts,
 * so imported content is indistinguishable from admin-entered content.
 *
 * mock.json shape — see content/mocks/mock.schema.json for the full schema:
 *   {
 *     "mock": { "title", "subtitle", "groupLabel", "month", "year", "source" },
 *     "modules": [
 *       { "section": "Reading and Writing" | "Math", "module": 1 | 2,
 *         "questions": [ { "number", "domain", "skill", "difficulty",
 *                          "questionType"?, "passageText"?, "questionText",
 *                          "image"?, "choices": [{ "id", "text", "image"? }],
 *                          "correctAnswer", "rationale", "explanation" } ] }
 *     ]
 *   }
 * Image fields are file names relative to the folder's `figures/` directory;
 * they're embedded as base64 data URLs, which is how the app stores
 * question and choice images (questions.image_data / choices[].imageData).
 */
import fs from "fs";
import path from "path";

// tsx doesn't auto-load .env — parse it ourselves (same approach as
// src/scripts/migrate-sqlite-to-supabase.ts). Must run BEFORE importing
// ../lib/db, which reads process.env.DATABASE_URL when the pool is created.
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
  image?: string | null;
}

interface MockFileQuestion {
  number: number;
  domain: string;
  skill: string;
  difficulty: "Easy" | "Medium" | "Hard";
  questionType?: "multiple_choice" | "spr";
  passageText?: string | null;
  questionText: string;
  image?: string | null;
  choices: MockFileChoice[];
  correctAnswer: string;
  rationale: string;
  explanation: string;
  estimatedTime?: number;
}

interface MockFile {
  mock: {
    title: string;
    subtitle?: string | null;
    groupLabel: string;
    month: string;
    year: number;
    source?: string;
    totalQuestions?: number;
    durationMinutes?: number;
  };
  modules: { section: Section; module: 1 | 2; questions: MockFileQuestion[] }[];
}

const SECTIONS: Section[] = ["Reading and Writing", "Math"];
const EXPECTED_PER_MODULE: Record<Section, number> = { "Reading and Writing": 27, Math: 22 };
const MIME_BY_EXT: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

function nowIso() {
  return new Date().toISOString();
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
    fail("Usage: npm run db:import-mock -- <folder containing mock.json> [--replace] [--no-release]");
  }
  for (const f of flags) {
    if (f !== "--replace" && f !== "--no-release") fail(`Unknown flag ${f}`);
  }
  return { dir: path.resolve(process.cwd(), dirs[0]), replace: flags.has("--replace"), release: !flags.has("--no-release") };
}

function readMockFile(dir: string): MockFile {
  const file = path.join(dir, "mock.json");
  if (!fs.existsSync(file)) fail(`No mock.json found in ${dir}`);
  const data = JSON.parse(fs.readFileSync(file, "utf-8")) as MockFile;
  if (!data.mock?.title || !data.mock?.groupLabel || !data.mock?.month || !data.mock?.year) {
    fail("mock.json: `mock` needs title, groupLabel, month and year");
  }
  if (!Array.isArray(data.modules) || data.modules.length === 0) fail("mock.json: `modules` is empty");
  return data;
}

/** Validates the whole file up front so a typo in question 90 can't leave a
 * half-imported mock behind — nothing is written until this passes. */
function validate(data: MockFile, figuresDir: string): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const mod of data.modules) {
    const key = `${mod.section}|${mod.module}`;
    if (!SECTIONS.includes(mod.section) || (mod.module !== 1 && mod.module !== 2)) {
      problems.push(`Module "${key}": section must be Math or Reading and Writing, module must be 1 or 2`);
      continue;
    }
    if (seen.has(key)) problems.push(`Module ${key} appears twice`);
    seen.add(key);
    if (mod.questions.length !== EXPECTED_PER_MODULE[mod.section]) {
      problems.push(`${key}: has ${mod.questions.length} questions, a real ${mod.section} module has ${EXPECTED_PER_MODULE[mod.section]}`);
    }
    mod.questions.forEach((q, i) => {
      const tag = `${key} Q${q.number ?? i + 1}`;
      if (q.number !== i + 1) problems.push(`${tag}: questions must be numbered 1..n in order (found ${q.number} at position ${i + 1})`);
      if (!q.questionText?.trim()) problems.push(`${tag}: empty questionText`);
      if (!q.rationale?.trim() || !q.explanation?.trim()) problems.push(`${tag}: rationale and explanation are required`);
      if (!["Easy", "Medium", "Hard"].includes(q.difficulty)) problems.push(`${tag}: difficulty must be Easy/Medium/Hard`);
      const type = q.questionType ?? "multiple_choice";
      if (type === "multiple_choice") {
        const ids = (q.choices ?? []).map((c) => c.id);
        if (ids.length < 2) problems.push(`${tag}: multiple-choice question needs choices`);
        if (!ids.includes(q.correctAnswer)) problems.push(`${tag}: correctAnswer "${q.correctAnswer}" is not one of the choice ids ${ids.join(",")}`);
      } else if (type === "spr") {
        if (!q.correctAnswer?.trim()) problems.push(`${tag}: SPR question needs a correctAnswer`);
      } else {
        problems.push(`${tag}: questionType must be multiple_choice or spr`);
      }
      const images = [q.image, ...(q.choices ?? []).map((c) => c.image)].filter((x): x is string => !!x);
      for (const img of images) {
        if (!fs.existsSync(path.join(figuresDir, img))) problems.push(`${tag}: figure not found: figures/${img}`);
        else if (!MIME_BY_EXT[path.extname(img).toLowerCase()]) problems.push(`${tag}: unsupported image type: ${img}`);
      }
    });
  }
  return problems;
}

function imageToDataUrl(figuresDir: string, name: string | null | undefined): string | null {
  if (!name) return null;
  const file = path.join(figuresDir, name);
  const mime = MIME_BY_EXT[path.extname(name).toLowerCase()];
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

async function main() {
  const { dir, replace, release } = parseArgs();
  const data = readMockFile(dir);
  const figuresDir = path.join(dir, "figures");

  const problems = validate(data, figuresDir);
  if (problems.length > 0) {
    console.error(`mock.json has ${problems.length} problem(s) — nothing was imported:`);
    for (const p of problems) console.error(`  • ${p}`);
    process.exit(1);
  }

  // Imported lazily so the .env parsing above has already run.
  const { db } = await import("../lib/db");
  const { newId } = await import("../lib/id");

  const { title, subtitle = null, groupLabel, month, year } = data.mock;
  const source = data.mock.source ?? `${title}${subtitle ? ` — ${subtitle}` : ""}`;

  // Same title + subtitle = the same test form. Never silently create a
  // duplicate card in the library.
  const existing = (await db
    .prepare("SELECT id FROM mocks WHERE title = ? AND subtitle IS NOT DISTINCT FROM ?")
    .all(title, subtitle)) as { id: string }[];
  if (existing.length > 0) {
    if (!replace) {
      fail(
        `A mock titled "${title}"${subtitle ? ` (${subtitle})` : ""} already exists (${existing.map((e) => e.id).join(", ")}). ` +
          `Re-run with --replace to delete it and import fresh, or change the title/subtitle in mock.json.`
      );
    }
    for (const e of existing) {
      const attempts = (await db.prepare("SELECT COUNT(*) as n FROM attempts WHERE mock_id = ?").get(e.id)) as { n: number | string };
      if (Number(attempts.n) > 0) {
        fail(`Can't --replace mock ${e.id}: ${attempts.n} student attempt(s) reference it. Delete it from the Admin panel instead.`);
      }
      // module_results has no attempt row, so clear it explicitly along with
      // anything else that points at these questions.
      await db.transaction(async (tx) => {
        await tx.prepare("DELETE FROM practice_attempts WHERE question_id IN (SELECT id FROM questions WHERE mock_id = ?)").run(e.id);
        await tx.prepare("DELETE FROM question_reports WHERE question_id IN (SELECT id FROM questions WHERE mock_id = ?)").run(e.id);
        await tx.prepare("UPDATE coach_conversations SET question_id = NULL WHERE question_id IN (SELECT id FROM questions WHERE mock_id = ?)").run(e.id);
        await tx.prepare("DELETE FROM module_results WHERE mock_id = ?").run(e.id);
        await tx.prepare("DELETE FROM module_releases WHERE mock_id = ?").run(e.id);
        await tx.prepare("DELETE FROM score_conversions WHERE mock_id = ?").run(e.id);
        await tx.prepare("DELETE FROM questions WHERE mock_id = ?").run(e.id);
        await tx.prepare("DELETE FROM mocks WHERE id = ?").run(e.id);
      });
      console.log(`Replaced existing mock ${e.id}.`);
    }
  }

  const orderRow = (await db
    .prepare("SELECT MAX(order_in_month) as m FROM mocks WHERE month = ? AND year = ?")
    .get(month, year)) as { m: number | string | null };
  const orderInMonth = Number(orderRow.m ?? 0) + 1;

  const totalQuestions = data.mock.totalQuestions ?? data.modules.reduce((n, m) => n + m.questions.length, 0);
  const durationMinutes = data.mock.durationMinutes ?? 134;
  const mockId = newId("mock");

  // One transaction for the whole import: either the complete mock lands
  // (98 questions + release rows) or nothing does.
  await db.transaction(async (tx) => {
    await tx
      .prepare(
        `INSERT INTO mocks (id, title, subtitle, group_label, month, year, order_in_month, total_questions, duration_minutes, is_official, official_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      )
      .run(mockId, title, subtitle, groupLabel, month, year, orderInMonth, totalQuestions, durationMinutes, source);

    for (const mod of data.modules) {
      // Module 2 is served to students from the 'higher' pool only (see
      // getModuleQuestionsPublic) — same default addQuestionAdmin applies.
      const modulePool = mod.module === 2 ? "higher" : null;
      const defaultTime = mod.section === "Math" ? 95 : 71; // ≈ real per-question pacing: 35 min/22 and 32 min/27
      for (const q of mod.questions) {
        const type = q.questionType ?? "multiple_choice";
        const choices = (type === "spr" ? [] : q.choices).map((c) => {
          const imageData = imageToDataUrl(figuresDir, c.image);
          return imageData ? { id: c.id, text: c.text ?? "", imageData } : { id: c.id, text: c.text ?? "" };
        });
        await tx
          .prepare(
            `INSERT INTO questions
              (id, mock_id, section, domain, skill, difficulty, module, module_pool,
               passage_text, image_data, question_text, choices, correct_answer, question_type, rationale, explanation,
               estimated_time, source, version, review_status, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'validated', ?)`
          )
          .run(
            newId("q"),
            mockId,
            mod.section,
            q.domain,
            q.skill,
            q.difficulty,
            mod.module,
            modulePool,
            q.passageText?.trim() ? q.passageText : null,
            imageToDataUrl(figuresDir, q.image),
            q.questionText,
            JSON.stringify(choices),
            q.correctAnswer,
            type,
            q.rationale,
            q.explanation,
            q.estimatedTime ?? defaultTime,
            source,
            q.number
          );
      }
    }

    // Release rows are written for every module either way, so the release
    // gate's one-time backfill never has to guess about this mock later.
    for (const mod of data.modules) {
      await tx
        .prepare(
          `INSERT INTO module_releases (mock_id, section, module, released, released_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (mock_id, section, module) DO UPDATE SET released = EXCLUDED.released, released_at = EXCLUDED.released_at`
        )
        .run(mockId, mod.section, mod.module, release ? 1 : 0, release ? nowIso() : null);
    }
  });

  console.log(`\n✔ Imported "${title}"${subtitle ? ` (${subtitle})` : ""} as mock ${mockId} — group "${groupLabel}", ${month} ${year}, #${orderInMonth} in month.`);
  for (const mod of data.modules) {
    const withImages = mod.questions.filter((q) => q.image || q.choices.some((c) => c.image)).length;
    const spr = mod.questions.filter((q) => (q.questionType ?? "multiple_choice") === "spr").length;
    console.log(`   ${mod.section} M${mod.module}: ${mod.questions.length} questions (${spr} SPR, ${withImages} with figures)`);
  }
  console.log(release ? "   All modules released — visible on /mocks as \"Start Practice\" right away." : "   Modules left UNRELEASED — release them from the Admin panel when ready.");
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
      // pool was never opened (validation failed before any DB access)
    }
  });
