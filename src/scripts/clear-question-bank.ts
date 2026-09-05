/* eslint-disable no-console */
import { db } from "../lib/db";

/**
 * Wipes every BlueMind-authored placeholder question (and everything built
 * on top of them — answers, scores, skill stats, practice history) so the
 * owner can bulk-import their own real questions via the admin panel.
 *
 * Deliberately KEEPS:
 *   - mocks             (titles/months/groups stay — just re-import questions into them)
 *   - users             (accounts, including the demo login, are untouched)
 *   - sessions          (no one gets logged out)
 *   - score_conversions (raw->scaled tables aren't question-specific)
 *
 * Deletion order matters — child rows that reference questions.id (or
 * attempts.id) must go first or the database's foreign-key enforcement
 * will reject the DELETE.
 */
async function main() {
  const order = [
    "question_reports", // references questions.id
    "coach_conversations", // references attempts.id (not FK-enforced, but tidy to clear)
    "score_records", // references attempts.id
    "answers", // references attempts.id + questions.id
    "module_results", // references mocks.id + users.id, holds stale results_json
    "skill_stats", // per-user skill progress, meaningless without the old questions
    "practice_sessions", // stores question_ids for old practice runs
    "attempts", // references mocks.id + users.id
    "questions", // the actual bank — deleted last, once nothing references it
  ];

  console.log("Clearing question bank and everything built on top of it...\n");
  for (const table of order) {
    const before = ((await db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get()) as { n: number }).n;
    await db.prepare(`DELETE FROM ${table}`).run();
    console.log(`  ${table.padEnd(20)} - removed ${before} row(s)`);
  }

  const mockCount = ((await db.prepare("SELECT COUNT(*) as n FROM mocks").get()) as { n: number }).n;
  const userCount = ((await db.prepare("SELECT COUNT(*) as n FROM users").get()) as { n: number }).n;
  console.log(`\nKept ${mockCount} mock(s) and ${userCount} user(s) untouched.`);
  console.log("Every mock now has 0 questions - bulk-import your real ones via /admin.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.close();
  });
