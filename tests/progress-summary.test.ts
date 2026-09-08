import assert from "node:assert/strict";
import test from "node:test";
import { summarizeProgress, type StudyEntry } from "../src/lib/progress-summary";

function entry(overrides: Partial<StudyEntry> = {}): StudyEntry {
  return { id: "attempt-1", source: "mock", sourceId: "paper-1", title: "Paper", section: "Math", module: 1,
    mode: "timed", fullExamId: null, correctCount: 1, total: 1, completedAt: "2026-09-06T12:00:00.000Z", questions: [], ...overrides };
}
test("accuracy is weighted by question count, not averaged across sessions", () => {
  const result = summarizeProgress([entry(), entry({ id: "attempt-2", correctCount: 0, total: 9 })]);
  assert.equal(result.accuracy, 10);
  assert.equal(result.questions, 10);
  assert.equal(result.sessions, 2);
  assert.equal(result.sections[1].accuracy, null);
});
test("empty history does not invent scores or recommendations", () => {
  const result = summarizeProgress([]);
  assert.equal(result.accuracy, null);
  assert.equal(result.nextPractice, null);
  assert.equal(result.fullExams, 0);
});
test("skill recommendations require evidence and keep subjects separate", () => {
  const questions = Array.from({ length: 3 }, () => ({ skill: "Vocabulary", isCorrect: false }));
  const result = summarizeProgress([entry({ section: "Reading and Writing", total: 3, correctCount: 0, questions }), entry({ questions: [{ skill: "Vocabulary", isCorrect: true }] })]);
  assert.equal(result.nextPractice?.section, "Reading and Writing");
  assert.equal(result.nextPractice?.attempted, 3);
  assert.equal(result.skills.length, 2);
});
test("a full exam requires four distinct modules within the same sitting", () => {
  const modules = [entry({ fullExamId: "sitting-a" }), entry({ fullExamId: "sitting-a", module: 2 }), entry({ fullExamId: "sitting-a", section: "Reading and Writing" })];
  assert.equal(summarizeProgress([...modules, modules[0]]).fullExams, 0);
  assert.equal(summarizeProgress([...modules, entry({ fullExamId: "sitting-b", section: "Reading and Writing", module: 2 })]).fullExams, 0);
  assert.equal(summarizeProgress([...modules, entry({ fullExamId: "sitting-a", section: "Reading and Writing", module: 2 })]).fullExams, 1);
});
test("difficulty and pacing statistics keep missing data distinct from zero", () => {
  const result = summarizeProgress([entry({ section: "Reading and Writing", total: 3, correctCount: 2, questions: [
    { skill: "Words in Context", difficulty: "Easy", isCorrect: true, timeSpentSeconds: 30 },
    { skill: "Words in Context", difficulty: "Easy", isCorrect: true, timeSpentSeconds: 50 },
    { skill: "Inferences", difficulty: "Hard", isCorrect: false, timeSpentSeconds: 100 },
  ] })]);
  assert.deepEqual(result.difficultyStats.map((item) => [item.difficulty, item.accuracy, item.averageTimeSeconds]), [
    ["Easy", 100, 40], ["Medium", null, null], ["Hard", 0, 100],
  ]);
  assert.equal(result.sections.find((item) => item.section === "Reading and Writing")?.averageTimeSeconds, 60);
  assert.equal(result.sections.find((item) => item.section === "Math")?.averageTimeSeconds, null);
  assert.equal(result.averageTimeSeconds, 60);
});
