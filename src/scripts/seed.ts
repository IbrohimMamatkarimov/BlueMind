/* eslint-disable no-console */
import { db } from "../lib/db";
import { newId } from "../lib/id";
import { hashPassword } from "../lib/auth";
import { generateMathQuestions } from "../lib/generators/math-questions";
import { RW_BANK, buildRwQuestion, type RwQuestionSeed } from "../lib/generators/rw-questions";
import { selectNextModule, type QuestionDifficultyInfo } from "../lib/adaptive";
import { calculateBlueMindScore, saveScoreRecord, calculateTotalScore } from "../lib/scoring";
import { SAT_STRUCTURE, MISTAKE_TYPES } from "../lib/sat-constants";

async function reset() {
  const tables = [
    "answers",
    "score_records",
    "score_conversions",
    "coach_conversations",
    "practice_sessions",
    "skill_stats",
    "attempts",
    "questions",
    "mocks",
    "sessions",
    "users",
  ];
  for (const t of tables) await db.prepare(`DELETE FROM ${t}`).run();
  console.log("Cleared existing data.");
}

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
) {
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

/** Builds the full question bank for one mock: module 1 (broad mix) + module 2 higher pool + module 2 lower pool. */
async function buildMockQuestionBank(mockId: string) {
  // ---- Reading & Writing ----
  const rwModule1 = pickRwByDifficulty(RW_BANK, SAT_STRUCTURE.readingWriting.questionsPerModule, "any");
  const rwHigher = pickRwByDifficulty(RW_BANK, SAT_STRUCTURE.readingWriting.questionsPerModule, "harder");
  const rwLower = pickRwByDifficulty(RW_BANK, SAT_STRUCTURE.readingWriting.questionsPerModule, "easier");

  for (const q of rwModule1) await insertQuestion(mockId, 1, null, q);
  for (const q of rwHigher) await insertQuestion(mockId, 2, "higher", q);
  for (const q of rwLower) await insertQuestion(mockId, 2, "lower", q);

  // ---- Math ----
  const mathCount = SAT_STRUCTURE.math.questionsPerModule; // 22
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
  subtitle: string | null = null
) {
  const id = newId("mock");
  await db
    .prepare(
      `INSERT INTO mocks (id, title, subtitle, group_label, month, year, order_in_month, total_questions, duration_minutes, is_official)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      id,
      title,
      subtitle,
      groupLabel,
      month,
      year,
      orderInMonth,
      SAT_STRUCTURE.totalQuestions,
      SAT_STRUCTURE.totalMinutes
    );
  await buildMockQuestionBank(id);
  return id;
}

async function getMockQuestions(mockId: string) {
  return (await db.prepare("SELECT * FROM questions WHERE mock_id = ?").all(mockId)) as any[];
}

interface SkillPct {
  [skill: string]: number; // 0-100
}

// Latest-attempt skill accuracy targets (mirrors the BlueMind results-page example).
const LATEST_SKILL_PCT: SkillPct = {
  "Linear Equations": 82,
  "Linear Functions": 82,
  "Systems of Equations": 80,
  "Linear Inequalities": 82,
  "Nonlinear Functions": 58,
  "Nonlinear Equations": 58,
  "Equivalent Expressions": 58,
  "Ratios and Proportions": 76,
  Percentages: 76,
  "Data Interpretation": 76,
  Probability: 74,
  "Area and Volume": 71,
  "Lines/Angles/Triangles": 71,
  "Right Triangle Trig": 71,
  Circles: 69,
  "Central Ideas and Details": 84,
  "Command of Evidence": 84,
  Inferences: 82,
  "Words in Context": 61,
  "Text Structure and Purpose": 61,
  "Cross-Text Connections": 59,
  "Rhetorical Synthesis": 69,
  Transitions: 69,
  Boundaries: 79,
  "Form, Structure, and Sense": 79,
};

function earliestPct(latest: number) {
  return Math.max(30, latest - 20);
}

function interpolate(latest: number, attemptIndex: number, totalAttempts: number) {
  const earliest = earliestPct(latest);
  if (totalAttempts <= 1) return latest;
  return Math.round(earliest + ((latest - earliest) * attemptIndex) / (totalAttempts - 1));
}

function randomWrongChoice(correct: string, choices: { id: string }[]) {
  const options = choices.map((c) => c.id).filter((id) => id !== correct);
  if (options.length === 0) return correct;
  return options[Math.floor(Math.random() * options.length)];
}

function randomMistakeType() {
  const opts = MISTAKE_TYPES.map((m) => m.id);
  return opts[Math.floor(Math.random() * opts.length)];
}

/** Simulates and persists a full completed attempt, targeting a specific total scaled score. */
async function simulateCompletedAttempt(params: {
  userId: string;
  mockId: string;
  attemptIndex: number; // 0 = oldest, totalAttempts-1 = latest
  totalAttempts: number;
  targetRw: number;
  targetMath: number;
  daysAgo: number;
}) {
  const { userId, mockId, attemptIndex, totalAttempts, targetRw, targetMath, daysAgo } = params;
  const attemptId = newId("attempt");
  const startedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const completedAt = new Date(startedAt.getTime() + SAT_STRUCTURE.totalMinutes * 60 * 1000);

  const allQuestions = await getMockQuestions(mockId);
  const bySection = (section: string, module: number, pool: string | null) =>
    allQuestions.filter(
      (q) => q.section === section && q.module === module && (pool === null || q.module_pool === pool)
    );

  function pctFor(skill: string) {
    const latest = LATEST_SKILL_PCT[skill] ?? 70;
    return interpolate(latest, attemptIndex, totalAttempts);
  }

  function simulateSet(questions: any[]) {
    return questions.map((q) => {
      const pct = pctFor(q.skill);
      const isCorrect = Math.random() * 100 < pct;
      const choices = JSON.parse(q.choices) as { id: string; text: string }[];
      const selected = isCorrect
        ? q.correct_answer
        : q.question_type === "spr"
          ? String(Number(q.correct_answer) + (Math.random() > 0.5 ? 1 : -1))
          : randomWrongChoice(q.correct_answer, choices);
      return {
        question: q,
        selected,
        isCorrect,
        timeSpent: Math.round(q.estimated_time * (0.7 + Math.random() * 0.7)),
      };
    });
  }

  // Module 1
  const rwM1 = simulateSet(bySection("Reading and Writing", 1, null));
  const mathM1 = simulateSet(bySection("Math", 1, null));

  const rwRouting = selectNextModule({
    firstModuleResult: rwM1.map(
      (a): QuestionDifficultyInfo => ({
        questionId: a.question.id,
        difficulty: a.question.difficulty,
        skill: a.question.skill,
        isCorrect: a.isCorrect,
      })
    ),
  });
  const mathRouting = selectNextModule({
    firstModuleResult: mathM1.map(
      (a): QuestionDifficultyInfo => ({
        questionId: a.question.id,
        difficulty: a.question.difficulty,
        skill: a.question.skill,
        isCorrect: a.isCorrect,
      })
    ),
  });

  const rwM2 = simulateSet(bySection("Reading and Writing", 2, rwRouting.moduleId));
  const mathM2 = simulateSet(bySection("Math", 2, mathRouting.moduleId));

  const allAnswers = [...rwM1, ...rwM2, ...mathM1, ...mathM2];

  await db
    .prepare(
      `INSERT INTO attempts
      (id, user_id, mock_id, status, current_section, current_module, started_at, completed_at,
       rw_routing_pool, rw_routing_reason, math_routing_pool, math_routing_reason)
     VALUES (?, ?, ?, 'completed', 'Math', 2, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      attemptId,
      userId,
      mockId,
      startedAt.toISOString(),
      completedAt.toISOString(),
      rwRouting.moduleId,
      rwRouting.routingReason,
      mathRouting.moduleId,
      mathRouting.routingReason
    );

  const insertAnswer = db.prepare(
    `INSERT INTO answers
      (id, attempt_id, question_id, section, module, skill, difficulty, selected_answer,
       correct_answer, is_correct, time_spent_seconds, marked_for_review, mistake_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const a of allAnswers) {
    await insertAnswer.run(
      newId("ans"),
      attemptId,
      a.question.id,
      a.question.section,
      a.question.module,
      a.question.skill,
      a.question.difficulty,
      a.selected,
      a.question.correct_answer,
      a.isCorrect ? 1 : 0,
      a.timeSpent,
      Math.random() < 0.08 ? 1 : 0,
      a.isCorrect ? null : randomMistakeType()
    );
  }

  const rwRawScore = [...rwM1, ...rwM2].filter((a) => a.isCorrect).length;
  const mathRawScore = [...mathM1, ...mathM2].filter((a) => a.isCorrect).length;

  // We pin the demo attempts to clean target scores so the dashboard/progress
  // story is coherent, while everything else (answers, skills, mistakes,
  // routing) is genuinely simulated from real question data.
  const rwResult = await calculateBlueMindScore({
    mockId,
    section: "Reading and Writing",
    rawScore: rwRawScore,
    maxRaw: SAT_STRUCTURE.readingWriting.totalQuestions,
  });
  const mathResult = await calculateBlueMindScore({
    mockId,
    section: "Math",
    rawScore: mathRawScore,
    maxRaw: SAT_STRUCTURE.math.totalQuestions,
  });
  rwResult.estimatedScore = targetRw;
  rwResult.scoreRange = { lower: targetRw - 20, upper: targetRw + 20 };
  mathResult.estimatedScore = targetMath;
  mathResult.scoreRange = { lower: targetMath - 20, upper: targetMath + 20 };

  await saveScoreRecord(attemptId, rwResult);
  await saveScoreRecord(attemptId, mathResult);
  await saveScoreRecord(attemptId, calculateTotalScore(rwResult, mathResult));

  return { attemptId, rwRawScore, mathRawScore };
}

async function simulateInProgressAttempt(userId: string, mockId: string) {
  const attemptId = newId("attempt");
  const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // started 2h ago
  const allQuestions = await getMockQuestions(mockId);
  const rwM1 = allQuestions.filter((q) => q.section === "Reading and Writing" && q.module === 1);
  const rwM2Higher = allQuestions.filter(
    (q) => q.section === "Reading and Writing" && q.module === 2 && q.module_pool === "higher"
  );

  await db
    .prepare(
      `INSERT INTO attempts
      (id, user_id, mock_id, status, current_section, current_module, started_at)
     VALUES (?, ?, ?, 'in_progress', 'Reading and Writing', 1, ?)`
    )
    .run(attemptId, userId, mockId, startedAt.toISOString());

  const insertAnswer = db.prepare(
    `INSERT INTO answers
      (id, attempt_id, question_id, section, module, skill, difficulty, selected_answer,
       correct_answer, is_correct, time_spent_seconds, marked_for_review, mistake_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // Fully answer RW module 1 (mostly correct) so routing + partial progress feels real.
  const rwM1Results: QuestionDifficultyInfo[] = [];
  for (const q of rwM1) {
    const isCorrect = Math.random() < 0.75;
    const choices = JSON.parse(q.choices) as { id: string; text: string }[];
    const selected = isCorrect ? q.correct_answer : randomWrongChoice(q.correct_answer, choices);
    await insertAnswer.run(
      newId("ans"),
      attemptId,
      q.id,
      q.section,
      q.module,
      q.skill,
      q.difficulty,
      selected,
      q.correct_answer,
      isCorrect ? 1 : 0,
      Math.round(q.estimated_time * 0.9),
      0,
      isCorrect ? null : randomMistakeType()
    );
    rwM1Results.push({ questionId: q.id, difficulty: q.difficulty, skill: q.skill, isCorrect });
  }
  const routing = selectNextModule({ firstModuleResult: rwM1Results });

  // Answer about half of RW module 2.
  const pool = routing.moduleId === "higher" ? rwM2Higher : rwM2Higher; // fine for demo either way
  const halfway = Math.floor(pool.length / 2);
  for (let i = 0; i < halfway; i++) {
    const q = pool[i];
    const isCorrect = Math.random() < 0.7;
    const choices = JSON.parse(q.choices) as { id: string; text: string }[];
    const selected = isCorrect ? q.correct_answer : randomWrongChoice(q.correct_answer, choices);
    await insertAnswer.run(
      newId("ans"),
      attemptId,
      q.id,
      q.section,
      q.module,
      q.skill,
      q.difficulty,
      selected,
      q.correct_answer,
      isCorrect ? 1 : 0,
      Math.round(q.estimated_time * 0.9),
      0,
      isCorrect ? null : randomMistakeType()
    );
  }

  await db
    .prepare(`UPDATE attempts SET current_module = 2, rw_routing_pool = ?, rw_routing_reason = ? WHERE id = ?`)
    .run(routing.moduleId, routing.routingReason, attemptId);

  return attemptId;
}

async function recomputeSkillStats(userId: string) {
  await db.prepare("DELETE FROM skill_stats WHERE user_id = ?").run(userId);
  const rows = (await db
    .prepare(
      `SELECT skill,
              SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct,
              COUNT(*) as attempted
       FROM answers a
       JOIN attempts att ON att.id = a.attempt_id
       WHERE att.user_id = ?
       GROUP BY skill`
    )
    .all(userId)) as { skill: string; correct: number; attempted: number }[];

  const domainOf = (skill: string) => {
    // Small lookup mirrors sat-constants DOMAINS mapping.
    const map: Record<string, { section: string; domain: string }> = {
      "Linear Equations": { section: "Math", domain: "Algebra" },
      "Linear Functions": { section: "Math", domain: "Algebra" },
      "Systems of Equations": { section: "Math", domain: "Algebra" },
      "Linear Inequalities": { section: "Math", domain: "Algebra" },
      "Nonlinear Functions": { section: "Math", domain: "Advanced Math" },
      "Nonlinear Equations": { section: "Math", domain: "Advanced Math" },
      "Equivalent Expressions": { section: "Math", domain: "Advanced Math" },
      "Ratios and Proportions": { section: "Math", domain: "Problem-Solving and Data Analysis" },
      Percentages: { section: "Math", domain: "Problem-Solving and Data Analysis" },
      "Data Interpretation": { section: "Math", domain: "Problem-Solving and Data Analysis" },
      Probability: { section: "Math", domain: "Problem-Solving and Data Analysis" },
      "Area and Volume": { section: "Math", domain: "Geometry and Trigonometry" },
      "Lines/Angles/Triangles": { section: "Math", domain: "Geometry and Trigonometry" },
      "Right Triangle Trig": { section: "Math", domain: "Geometry and Trigonometry" },
      Circles: { section: "Math", domain: "Geometry and Trigonometry" },
      "Central Ideas and Details": { section: "Reading and Writing", domain: "Information and Ideas" },
      "Command of Evidence": { section: "Reading and Writing", domain: "Information and Ideas" },
      Inferences: { section: "Reading and Writing", domain: "Information and Ideas" },
      "Words in Context": { section: "Reading and Writing", domain: "Craft and Structure" },
      "Text Structure and Purpose": { section: "Reading and Writing", domain: "Craft and Structure" },
      "Cross-Text Connections": { section: "Reading and Writing", domain: "Craft and Structure" },
      "Rhetorical Synthesis": { section: "Reading and Writing", domain: "Expression of Ideas" },
      Transitions: { section: "Reading and Writing", domain: "Expression of Ideas" },
      Boundaries: { section: "Reading and Writing", domain: "Standard English Conventions" },
      "Form, Structure, and Sense": { section: "Reading and Writing", domain: "Standard English Conventions" },
    };
    return map[skill] ?? { section: "Math", domain: "Algebra" };
  };

  const insert = db.prepare(
    `INSERT INTO skill_stats (id, user_id, section, domain, skill, correct, attempted)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const row of rows) {
    const { section, domain } = domainOf(row.skill);
    await insert.run(newId("skill"), userId, section, domain, row.skill, row.correct, row.attempted);
  }
}

async function main() {
  await reset();

  // ---- Demo user ----
  const passwordHash = await hashPassword("demo1234");
  const userId = newId("user");
  await db
    .prepare("INSERT INTO users (id, email, name, password_hash, is_guest) VALUES (?, ?, ?, ?, 0)")
    .run(userId, "demo@bluemind.app", "Alex Demo", passwordHash);
  console.log("Created demo user: demo@bluemind.app / demo1234");

  // ---- Monthly mock library ----
  const months: { month: string; year: number }[] = [
    { month: "March", year: 2026 },
    { month: "April", year: 2026 },
    { month: "May", year: 2026 },
    { month: "June", year: 2026 },
    { month: "July", year: 2026 },
    { month: "August", year: 2026 },
  ];

  const mockIdsByMonth: Record<string, string[]> = {};
  for (const { month, year } of months) {
    const ids: string[] = [];
    for (let n = 1; n <= 3; n++) {
      // Title is just the exam's month + year (matches how real past-paper
      // libraries like PurpleBook label theirs, e.g. "2026 June Digital") —
      // the specific form is what the subtitle is for, not the title.
      const title = `${month} ${year}`;
      const id = await createMock(title, month, year, n, "2026", `Form ${month[0]}${n}`);
      ids.push(id);
    }
    mockIdsByMonth[`${month}-${year}`] = ids;
    console.log(`Seeded ${month} ${year}: 3 mocks x 147 bank questions.`);
  }

  // ---- Historical library (2024 / 2025) + BlueMind's own original series ----
  // These give the public mock directory real year-based browsing structure
  // from 2024 onward. They are BlueMind-authored placeholder question banks
  // (same generators as above) — NOT reproductions of any College Board
  // Bluebook test content, which is proprietary and isn't redistributed
  // here. Swap in real authored questions per mock via the questions table
  // whenever you're ready (see spec §17 for the question schema).
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
      // Same convention as the 2026 loop above: title is just "{Month} {Year}",
      // the form label carries the subtitle.
      await createMock(`${group.month} ${group.year}`, group.month, group.year, i + 1, group.groupLabel, group.forms[i]);
    }
    console.log(`Seeded group "${group.groupLabel}": ${group.forms.length} mocks.`);
  }

  // ---- Attempt history (4 completed, trending upward, + 1 in progress) ----
  const completedTargets = [
    { rw: 600, math: 640, daysAgo: 120 }, // March -> total 1240
    { rw: 620, math: 660, daysAgo: 90 }, // April -> total 1280
    { rw: 630, math: 690, daysAgo: 60 }, // May   -> total 1320
    { rw: 640, math: 700, daysAgo: 30 }, // June  -> total 1340 (latest, matches results-page example)
  ];
  const completedMonths = ["March-2026", "April-2026", "May-2026", "June-2026"];

  for (let i = 0; i < completedTargets.length; i++) {
    const t = completedTargets[i];
    const mockId = mockIdsByMonth[completedMonths[i]][0]; // Mock 01 of that month
    await simulateCompletedAttempt({
      userId,
      mockId,
      attemptIndex: i,
      totalAttempts: completedTargets.length,
      targetRw: t.rw,
      targetMath: t.math,
      daysAgo: t.daysAgo,
    });
  }

  await recomputeSkillStats(userId);

  // In-progress mock for the "Continue" dashboard card (August, Mock 01).
  const augustMockId = mockIdsByMonth["August-2026"][0];
  await simulateInProgressAttempt(userId, augustMockId);
  console.log("Seeded 4 completed attempts (1240 -> 1280 -> 1320 -> 1340) + 1 in-progress attempt.");

  // ---- Sample Coach conversation ----
  const sampleQuestion = (await db
    .prepare("SELECT * FROM questions WHERE mock_id = ? AND skill = 'Nonlinear Equations' LIMIT 1")
    .get(mockIdsByMonth["June-2026"][0])) as any;
  if (sampleQuestion) {
    await db
      .prepare(
        `INSERT INTO coach_conversations (id, user_id, question_id, mode, messages)
       VALUES (?, ?, ?, 'coach', ?)`
      )
      .run(
        newId("coach"),
        userId,
        sampleQuestion.id,
        JSON.stringify([
          { role: "student", content: "Why did I get this one wrong?" },
          {
            role: "coach",
            content:
              "You picked the smaller root of the quadratic instead of the larger one — the algebra was right, but the question asked for the larger solution. That's a misread, not a concept gap.",
            structured: {
              diagnosis: "Correct factoring, but selected the wrong root relative to what the question asked.",
              mistake_type: "misread_question",
              concept: "Quadratic equations can have two solutions — always check which one the question wants.",
              hint: "After factoring, list both roots before choosing an answer.",
              explanation:
                "Once you factor into two binomials, note both roots explicitly, then re-read the question stem to see if it wants the larger, smaller, sum, or product of the roots.",
              next_step: "Try two more 'largest/smallest root' quadratic questions to build the habit of checking the stem twice.",
              recommended_skill: "Nonlinear Equations",
              difficulty: "Medium",
            },
          },
        ])
      );
  }

  console.log("\nSeed complete.");
  console.log("Login with: demo@bluemind.app / demo1234");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.close();
  });
