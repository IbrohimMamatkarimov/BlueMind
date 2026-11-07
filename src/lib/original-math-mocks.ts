import { db } from "./db";
import { generateMathQuestions } from "./generators/math-questions";

// Original foundational math practice, not College Board exam papers.
// Stable mock IDs keep student history intact across deployments.
const IDS = Array.from({ length: 10 }, (_, i) => "bluemind-original-math-" + (i + 1));
let pending: Promise<void> | undefined;

export function ensureOriginalMathMocks(): Promise<void> {
  if (!pending) pending = install().catch((error) => { pending = undefined; throw error; });
  return pending;
}

async function install() {
  const existing = await db.prepare(
    "SELECT id FROM mocks WHERE id LIKE 'bluemind-original-math-%'"
  ).all() as { id: string }[];
  if (IDS.every((id) => existing.some((row) => row.id === id))) return;

  await db.transaction(async (tx) => {
    await tx.prepare("SELECT pg_advisory_xact_lock(74510820)").get();
    const current = await tx.prepare(
      "SELECT id FROM mocks WHERE id LIKE 'bluemind-original-math-%'"
    ).all() as { id: string }[];
    const present = new Set(current.map((row) => row.id));
    for (let i = 0; i < IDS.length; i++) {
      const id = IDS[i];
      if (present.has(id)) continue;
      const seen = new Set<string>();
      const questions: Record<string, unknown>[] = [];
      for (const module of [1, 2]) {
        const selected: ReturnType<typeof generateMathQuestions> = [];
        for (let pass = 0; pass < 10 && selected.length < 22; pass++) {
          const candidates = generateMathQuestions(66, module === 1
            ? { Easy: 21, Medium: 30, Hard: 15 }
            : { Easy: 6, Medium: 24, Hard: 36 });
          for (const q of candidates) {
            if (seen.has(q.questionText)) continue;
            seen.add(q.questionText);
            selected.push(q);
            if (selected.length === 22) break;
          }
        }
        if (selected.length !== 22) throw new Error("Could not build a complete original module");
        for (const [position, q] of selected.entries()) {
          if (q.questionType === "multiple_choice" && (
            q.choices.length !== 4 || new Set(q.choices.map((c) => c.text)).size !== 4 ||
            !q.choices.some((c) => c.id === q.correctAnswer)
          )) throw new Error("Invalid original question choices");
          questions.push({
            id: id + "-m" + module + "-q" + (position + 1),
            mock_id: id, section: "Math", domain: q.domain, skill: q.skill,
            difficulty: q.difficulty, module, module_pool: module === 2 ? "higher" : null,
            question_text: q.questionText, choices: JSON.stringify(q.choices),
            correct_answer: q.correctAnswer, question_type: q.questionType,
            rationale: q.rationale, explanation: q.explanation,
            estimated_time: q.estimatedTime, position: position + 1,
          });
        }
      }
      await tx.prepare(
        `INSERT INTO mocks (id, title, subtitle, group_label, month, year,
          order_in_month, total_questions, duration_minutes, is_official, official_source)
         VALUES (?, ?, ?, '2026', 'November', 2026, ?, 44, 70, 0, 'BlueMind original foundational practice')`
      ).run(id, "Math Practice " + String(i + 1).padStart(2, "0"),
        "Original · 2 complete modules · foundational skills", i + 10);
      await tx.prepare(
        `INSERT INTO questions
         (id, mock_id, section, domain, skill, difficulty, module, module_pool,
          question_text, choices, correct_answer, question_type, rationale,
          explanation, estimated_time, position, source)
         SELECT id, mock_id, section, domain, skill, difficulty, module, module_pool,
          question_text, choices, correct_answer, question_type, rationale,
          explanation, estimated_time, position, 'BlueMind Original'
         FROM jsonb_to_recordset(?::jsonb) AS q(
          id text, mock_id text, section text, domain text, skill text, difficulty text,
          module integer, module_pool text, question_text text, choices text,
          correct_answer text, question_type text, rationale text, explanation text,
          estimated_time integer, position integer)`
      ).run(JSON.stringify(questions));
      await tx.prepare(
        "INSERT INTO module_releases (mock_id, section, module, released) VALUES (?, 'Math', 1, 1), (?, 'Math', 2, 1)"
      ).run(id, id);
    }
  });
}
