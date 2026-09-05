import { db } from "../lib/db";

// One-off cleanup for the double-submit bug in AdminAiPasteModal /
// MockQuestionsInline: a fast double-click on "Import"/"Save All
// Questions" (now fixed — see those files) could POST the same batch of
// questions twice, duplicating every question in that batch within the
// same (mock, section, module). This finds and removes those duplicates,
// keeping the earliest-saved copy of each and leaving everything else in
// the database untouched.
//
// Run with: npm run db:dedupe

interface Row {
  id: string;
  mock_id: string | null;
  section: string;
  module: number;
  question_text: string;
  position: number;
  created_at: string;
}

async function main() {
  const rows = (await db
    .prepare(
      `SELECT id, mock_id, section, module, question_text, position, created_at
     FROM questions WHERE mock_id IS NOT NULL`
    )
    .all()) as Row[];

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    // Same mock + section + module + exact question text = the same
    // question saved more than once. Grouping on the full text (not just a
    // prefix) avoids ever conflating two genuinely different questions that
    // happen to start the same way.
    const key = `${r.mock_id}|${r.section}|${r.module}|${r.question_text}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  let groupsAffected = 0;
  let removed = 0;
  let skipped = 0;
  const lines: string[] = [];

  const mockTitleStmt = db.prepare("SELECT title FROM mocks WHERE id = ?");
  const answerCountStmt = db.prepare("SELECT COUNT(*) as n FROM answers WHERE question_id = ?");
  const deleteStmt = db.prepare("DELETE FROM questions WHERE id = ?");

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    groupsAffected++;

    // Keep the earliest save (lowest position, then earliest created_at) —
    // that's the original; everything after it in the same group is the
    // accidental re-POST.
    group.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
    const [keep, ...dupes] = group;

    const mockTitle = ((await mockTitleStmt.get(keep.mock_id)) as { title: string } | undefined)?.title ?? keep.mock_id;
    lines.push(
      `${mockTitle} · ${keep.section} · Module ${keep.module} — "${keep.question_text.slice(0, 70)}${
        keep.question_text.length > 70 ? "…" : ""
      }" (${dupes.length} duplicate${dupes.length === 1 ? "" : "s"})`
    );

    for (const dupe of dupes) {
      const answerCount = ((await answerCountStmt.get(dupe.id)) as { n: number }).n;
      if (answerCount > 0) {
        lines.push(`  SKIPPED ${dupe.id} — ${answerCount} student answer(s) reference it, not safe to auto-delete.`);
        skipped++;
        continue;
      }
      await deleteStmt.run(dupe.id);
      removed++;
    }
  }

  console.log(`Scanned ${rows.length} banked questions across every mock.`);
  console.log(`Found ${groupsAffected} duplicate group(s).`);
  console.log(`Removed ${removed} duplicate row(s).${skipped > 0 ? ` Skipped ${skipped} (already answered by a student).` : ""}\n`);
  if (lines.length > 0) {
    lines.forEach((l) => console.log(l));
  } else {
    console.log("No duplicates found — nothing to clean up.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.close();
  });
