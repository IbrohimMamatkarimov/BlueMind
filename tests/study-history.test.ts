import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../src/lib/db";
import { saveStudyResult, readSavedGrade, StudyRecord } from "../src/lib/study-history";

// An isolated transactional store lets the persistence code exercise retries,
// cross-user IDs, and write failures without connecting to the live database.
function store() {
  let records = new Map<string, { source_id: string; section: string; module: number | null; grade_json: string }>();
  let latest = new Map<string, string>();
  let failLatest = false;
  const database = {
    ...db,
    prepare(sql: string) {
      return {
        async run(...values: unknown[]) {
          if (sql.includes("INSERT INTO study_results")) {
            const key = `${values[1]}|${values[0]}`;
            if (records.has(key)) return { changes: 0, lastInsertRowid: undefined };
            records.set(key, { source_id: values[3] as string, section: values[5] as string, module: values[6] as number | null, grade_json: values[11] as string });
          } else if (sql.includes("INSERT INTO module_results")) {
            if (failLatest) throw new Error("Simulated save failure");
            latest.set(`${values[1]}|${values[2]}|${values[3]}|${values[4]}`, values[7] as string);
          } else throw new Error("Unexpected mutation");
          return { changes: 1, lastInsertRowid: undefined };
        },
        async get(...values: unknown[]) {
          const row = records.get(`${values[0]}|${values[1]}`);
          return values.length > 2 && row?.source_id !== values[2] ? undefined : row;
        },
        async all() { return []; },
      };
    },
    async transaction<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
      const before = new Map(records); const latestBefore = new Map(latest);
      try { return await fn(database); } catch (error) { records = before; latest = latestBefore; throw error; }
    },
  };
  return { database, count: () => records.size, latest: () => [...latest.values()], fail: (value: boolean) => { failLatest = value; } };
}
function record(overrides: Partial<StudyRecord> = {}): StudyRecord {
  return { id: "submission-a", userId: "student-a", source: "mock", sourceId: "mock-a", title: "March mock", section: "Math", module: 1, mode: "timed", fullExamId: null,
    grade: { total: 1, correctCount: 1, accuracyPct: 100, results: [{ questionId: "q-1", skill: "Algebra", isCorrect: true }] }, ...overrides };
}
test("retry returns the original saved grade without a second session or latest overwrite", async () => {
  const memory = store(); const original = record();
  await saveStudyResult(original, memory.database);
  const returned = await saveStudyResult(record({ grade: { ...original.grade, correctCount: 0 } }), memory.database);
  assert.deepEqual(returned, original.grade); assert.equal(memory.count(), 1);
  assert.equal(memory.latest().length, 1);
});
test("a retake adds history and a failed latest-result save rolls back the whole submission", async () => {
  const memory = store(); await saveStudyResult(record(), memory.database);
  memory.fail(true);
  await assert.rejects(saveStudyResult(record({ id: "submission-b" }), memory.database));
  assert.equal(memory.count(), 1);
  memory.fail(false); await saveStudyResult(record({ id: "submission-b" }), memory.database);
  assert.equal(memory.count(), 2);
});
test("history is scoped to the student even when submission IDs match", async () => {
  const memory = store(); await saveStudyResult(record(), memory.database);
  assert.equal(await readSavedGrade("student-b", "submission-a", "mock-a", memory.database), null);
  await saveStudyResult(record({ userId: "student-b" }), memory.database);
  assert.equal(memory.count(), 2);
});
test("an existing submission cannot be reused for a different module", async () => {
  const memory = store(); await saveStudyResult(record(), memory.database);
  await assert.rejects(saveStudyResult(record({ module: 2 }), memory.database), /different session/);
  assert.equal(memory.count(), 1);
});
