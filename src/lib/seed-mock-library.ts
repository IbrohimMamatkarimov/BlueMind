import { db } from "./db";
import { newId } from "./id";
import { generateMathQuestions } from "./generators/math-questions";
import { RW_BANK, buildRwQuestion, type RwQuestionSeed } from "./generators/rw-questions";
import { SAT_STRUCTURE } from "./sat-constants";

// Auto-recovery for hosts with no persistent disk (e.g. Render's free
// tier): every time the service spins back up after being idle, /tmp is
// wiped, so the database db.ts falls back to is genuinely empty — not just
// missing user accounts/progress, but missing the mock library itself,
// which means there's nothing for a student to even open. This rebuilds
// JUST the mock + question library (no demo user, no fake attempt
// history — see scripts/seed.ts for that, which stays a manual, explicit
// dev-only step) so the site is immediately usable again after every
// cold start, without needing Shell access to re-run anything by hand.
//
// Intentionally NOT imported from scripts/seed.ts — that file executes
// main() immediately at the bottom (an intentional side effect for its
// CLI use), which would be wrong to trigger implicitly from here.

function pickRwByDifficulty(pool: RwQuestionSeed[], count: number, bias: "any" | "harder" | "easier") {
  let filtered = pool;
  if (bias === "harder") filtered = pool.filter((q) => q.difficulty !== "Easy");
  if (bias === "easier") filtered = pool.filter((q) => q.difficulty !== "Hard");
  if (filtered.length === 0) filtered = pool;
  const out = [];
  for (let i = 0; i < count; i++) out.push(buildRwQuestion(filtered[i % filtered.length]));
  return out;
}

async function insertQuestion(
  mockId: string,
  module: number,
  modulePool: string | null,
  q: {
    id: string;
    section: string;
    domain: string;
    skill: string;
    difficulty: string;
    questionText: string;
    choices: { id: string; text: string }[];
    correctAnswer: string;
    questionType: string;
    rationale: string;
    explanation: string;
    estimatedTime: number;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO questions
        (id, mock_id, section, domain, skill, difficulty, module, module_pool,
         question_text, choices, correct_answer, question_type, rationale, explanation,
         estimated_time, source, version, review_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BlueMind', 1, 'validated')`
    )
    .run(
      q.id,
      mockId,
      q.section,
      q.domain,
      q.skill,
      q.difficulty,
      module,
      modulePool,
      q.questionText,
      JSON.stringify(q.choices),
      q.correctAnswer,
      q.questionType,
      q.rationale,
      q.explanation,
      q.estimatedTime
    );
}

async function buildMockQuestionBank(mockId: string): Promise<void> {
  const rwModule1 = pickRwByDifficulty(RW_BANK, SAT_STRUCTURE.readingWriting.questionsPerModule, "any");
  const rwHigher = pickRwByDifficulty(RW_BANK, SAT_STRUCTURE.readingWriting.questionsPerModule, "harder");
  const rwLower = pickRwByDifficulty(RW_BANK, SAT_STRUCTURE.readingWriting.questionsPerModule, "easier");
  for (const q of rwModule1) await insertQuestion(mockId, 1, null, q);
  for (const q of rwHigher) await insertQuestion(mockId, 2, "higher", q);
  for (const q of rwLower) await insertQuestion(mockId, 2, "lower", q);

  const mathCount = SAT_STRUCTURE.math.questionsPerModule;
  const mathModule1 = generateMathQuestions(mathCount, { Easy: 7, Medium: 10, Hard: 5 });
  const mathHigher = generateMathQuestions(mathCount, { Easy: 2, Medium: 8, Hard: 12 });
  const mathLower = generateMathQuestions(mathCount, { Easy: 10, Medium: 9, Hard: 3 });
  for (const q of mathModule1) await insertQuestion(mockId, 1, null, q);
  for (const q of mathHigher) await insertQuestion(mockId, 2, "higher", q);
  for (const q of mathLower) await insertQuestion(mockId, 2, "lower", q);
}

async function createMock(
  title: string,
  month: string,
  year: number,
  orderInMonth: number,
  groupLabel: string,
  subtitle: string | null
): Promise<string> {
  const id = newId("mock");
  await db
    .prepare(
      `INSERT INTO mocks (id, title, subtitle, group_label, month, year, order_in_month, total_questions, duration_minutes, is_official)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(id, title, subtitle, groupLabel, month, year, orderInMonth, SAT_STRUCTURE.totalQuestions, SAT_STRUCTURE.totalMinutes);
  await buildMockQuestionBank(id);
  return id;
}

/**
 * Called once per fresh connection (from db.ts, right after migrations).
 * No-ops instantly if any mock already exists — this is purely a "the
 * database woke up completely empty" recovery path, not something that
 * runs meaningfully once real content exists.
 */
export async function seedMockLibraryIfEmpty(): Promise<void> {
  try {
    const row = (await db.prepare("SELECT COUNT(*) as n FROM mocks").get()) as { n: number | string };
    const count = Number(row.n);
    if (count > 0) return;

    // eslint-disable-next-line no-console
    console.log("[seed-mock-library] mocks table is empty — auto-seeding the mock library...");

    const months: { month: string; year: number }[] = [
      { month: "March", year: 2026 },
      { month: "April", year: 2026 },
      { month: "May", year: 2026 },
      { month: "June", year: 2026 },
      { month: "July", year: 2026 },
      { month: "August", year: 2026 },
    ];
    for (const { month, year } of months) {
      for (let n = 1; n <= 3; n++) {
        await createMock(`${month} ${year}`, month, year, n, "2026", `Form ${month[0]}${n}`);
      }
    }

    const historicalGroups: { groupLabel: string; month: string; year: number; forms: string[] }[] = [
      { groupLabel: "2024", month: "March", year: 2024, forms: ["Form V1", "Form V2"] },
      { groupLabel: "2025", month: "February", year: 2025, forms: ["Form V1", "Form V2", "Form V3"] },
      {
        groupLabel: "BlueMind Tests",
        month: "August",
        year: 2026,
        forms: ["Original 1", "Original 2", "Original 3", "Original 4"],
      },
    ];
    for (const group of historicalGroups) {
      for (let i = 0; i < group.forms.length; i++) {
        await createMock(`${group.month} ${group.year}`, group.month, group.year, i + 1, group.groupLabel, group.forms[i]);
      }
    }

    // eslint-disable-next-line no-console
    console.log("[seed-mock-library] Done — mock library rebuilt.");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[seed-mock-library] Auto-seed failed (site will just show an empty library):", err);
  }
}
