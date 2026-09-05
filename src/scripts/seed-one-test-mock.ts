/* eslint-disable no-console */
// Adds ONE full test mock — both modules for both Math and Reading &
// Writing, using the same question generators as the main seed script —
// without touching or wiping any existing mocks/questions/users. Safe to
// run alongside manually-added admin content. Also marks all 4 modules
// released immediately, so it shows "Start Practice" (not "Coming soon")
// right away for actually testing the mock-taking flow end to end.
//
// Run with: npx tsx src/scripts/seed-one-test-mock.ts
import { db } from "../lib/db";
import { newId } from "../lib/id";
import { generateMathQuestions } from "../lib/generators/math-questions";
import { RW_BANK, buildRwQuestion, type RwQuestionSeed } from "../lib/generators/rw-questions";
import { SAT_STRUCTURE } from "../lib/sat-constants";

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
  position: number,
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
) {
  await db
    .prepare(
      `INSERT INTO questions
      (id, mock_id, section, domain, skill, difficulty, module, module_pool,
       question_text, choices, correct_answer, question_type, rationale, explanation,
       estimated_time, source, version, review_status, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BlueMind', 1, 'validated', ?)`
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
      q.estimatedTime,
      position
    );
}

async function main() {
  const title = "Test Mock";
  const orderInMonth =
    ((
      (await db
        .prepare("SELECT MAX(order_in_month) as m FROM mocks WHERE month = ? AND year = ?")
        .get("Test", 2026)) as { m: number | null }
    ).m ?? 0) + 1;

  const mockId = newId("mock");
  await db
    .prepare(
      `INSERT INTO mocks (id, title, subtitle, group_label, month, year, order_in_month, total_questions, duration_minutes, is_official)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      mockId,
      title,
      "Full test mock — Math + R&W",
      "BlueMind Tests",
      "Test",
      2026,
      orderInMonth,
      SAT_STRUCTURE.totalQuestions,
      SAT_STRUCTURE.totalMinutes
    );

  const rwCount = SAT_STRUCTURE.readingWriting.questionsPerModule;
  const mathCount = SAT_STRUCTURE.math.questionsPerModule;

  const rwM1 = pickRwByDifficulty(RW_BANK, rwCount, "any");
  const rwM2 = pickRwByDifficulty(RW_BANK, rwCount, "any");
  const mathM1 = generateMathQuestions(mathCount, { Easy: 7, Medium: 10, Hard: 5 });
  const mathM2 = generateMathQuestions(mathCount, { Easy: 6, Medium: 10, Hard: 6 });

  for (let i = 0; i < rwM1.length; i++) await insertQuestion(mockId, 1, null, i + 1, rwM1[i]);
  for (let i = 0; i < rwM2.length; i++) await insertQuestion(mockId, 2, "higher", i + 1, rwM2[i]);
  for (let i = 0; i < mathM1.length; i++) await insertQuestion(mockId, 1, null, i + 1, mathM1[i]);
  for (let i = 0; i < mathM2.length; i++) await insertQuestion(mockId, 2, "higher", i + 1, mathM2[i]);

  const release = db.prepare(
    "INSERT INTO module_releases (mock_id, section, module, released, released_at) VALUES (?, ?, ?, 1, datetime('now'))"
  );
  await release.run(mockId, "Reading and Writing", 1);
  await release.run(mockId, "Reading and Writing", 2);
  await release.run(mockId, "Math", 1);
  await release.run(mockId, "Math", 2);

  console.log(
    `Created "${title}" (${mockId}) with ${rwCount} R&W M1, ${rwCount} R&W M2, ${mathCount} Math M1, ${mathCount} Math M2 questions.`
  );
  console.log('All 4 modules released — it\'ll show "Start Practice" on /mocks right away.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.close();
  });
