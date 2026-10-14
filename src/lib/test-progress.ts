import { db } from "./db";
import { describeProgressKey, summarizeProgress, type ProgressKind, type ProgressSummary } from "./progress-keys";

// Server copy of unfinished tests. The runners still save to localStorage
// first (instant, works offline and for guests) and mirror the same blob
// here for signed-in learners; see src/lib/progress-sync.ts for the client.

const MAX_STATE_CHARS = 1_500_000;

type Row = { progress_key: string; kind: string; mock_id: string; section: string | null; module: string | null; state_json: string; saved_at: string | number };

function summarize(row: Row): ProgressSummary {
  const info = { kind: row.kind as ProgressKind, mockId: row.mock_id, section: row.section, module: row.module };
  let state: unknown = null;
  // An unreadable blob still counts as "in progress"; the runner decides what to do with it.
  try { state = JSON.parse(row.state_json); } catch {}
  return summarizeProgress(row.progress_key, info, state, Number(row.saved_at));
}

function submissionIdOf(kind: ProgressKind, state: Record<string, unknown>) {
  const value = kind === "full" ? state.sessionId : state.submissionId;
  return typeof value === "string" && value.length <= 100 ? value : null;
}

async function isSubmitted(userId: string, submissionId: string) {
  return !!(await db.prepare("SELECT 1 AS ok FROM study_results WHERE user_id = ? AND id = ?").get(userId, submissionId));
}

export async function getTestProgress(userId: string, key: string) {
  const row = await db.prepare("SELECT state_json, saved_at, updated_at FROM test_progress WHERE user_id = ? AND progress_key = ?")
    .get(userId, key) as { state_json: string; saved_at: string | number; updated_at: string } | undefined;
  if (!row) return null;
  try {
    return { state: JSON.parse(row.state_json) as Record<string, unknown>, savedAt: Number(row.saved_at), updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

/** Whether a locally saved blob belongs to a test that was already submitted
 * (on this or another device), so the client can drop its stale copy. */
export async function isStaleProgress(userId: string, key: string, submissionId: string | null) {
  const info = describeProgressKey(key);
  if (!info || info.kind === "full" || !submissionId) return false;
  return isSubmitted(userId, submissionId);
}

export type SaveProgressResult = { ok: true; stale: boolean } | { ok: false; error: string };

export async function saveTestProgress(userId: string, key: string, state: unknown): Promise<SaveProgressResult> {
  const info = describeProgressKey(key);
  if (!info) return { ok: false, error: "Unknown progress key." };
  if (!state || typeof state !== "object" || Array.isArray(state)) return { ok: false, error: "Progress must be an object." };
  const record = state as Record<string, unknown>;
  const json = JSON.stringify(record);
  if (json.length > MAX_STATE_CHARS) return { ok: false, error: "Progress is too large to save." };
  const submissionId = submissionIdOf(info.kind, record);
  // A late autosave can arrive after grading already finished this attempt.
  if (info.kind !== "full" && submissionId && await isSubmitted(userId, submissionId)) {
    await deleteTestProgress(userId, key);
    return { ok: true, stale: true };
  }
  const savedAt = typeof record.savedAt === "number" && Number.isFinite(record.savedAt) ? Math.round(record.savedAt) : Date.now();
  await db.prepare(`
    INSERT INTO test_progress (user_id, progress_key, kind, mock_id, section, module, submission_id, state_json, saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, progress_key) DO UPDATE SET
      kind = EXCLUDED.kind, mock_id = EXCLUDED.mock_id, section = EXCLUDED.section, module = EXCLUDED.module,
      submission_id = EXCLUDED.submission_id, state_json = EXCLUDED.state_json, saved_at = EXCLUDED.saved_at,
      updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    WHERE test_progress.saved_at <= EXCLUDED.saved_at
  `).run(userId, key, info.kind, info.mockId, info.section, info.module, submissionId, json, savedAt);
  return { ok: true, stale: false };
}

export async function deleteTestProgress(userId: string, key: string) {
  await db.prepare("DELETE FROM test_progress WHERE user_id = ? AND progress_key = ?").run(userId, key);
}

/** Unfinished mock modules and full exams for the catalog. Question Bank
 * sets and full-exam sub-modules are restored by their runner, not listed. */
export async function listTestProgress(userId: string): Promise<ProgressSummary[]> {
  const rows = await db.prepare(`
    SELECT progress_key, kind, mock_id, section, module, state_json, saved_at
    FROM test_progress WHERE user_id = ? AND kind IN ('module', 'full')
    ORDER BY saved_at DESC
  `).all(userId) as Row[];
  return rows.map(summarize);
}

/** Uploads progress this browser has that the server doesn't (or has an
 * older copy of) and reports which local copies belong to already-submitted
 * tests. Returns the server's list afterwards. */
export async function reconcileTestProgress(userId: string, entries: { key: string; state: unknown }[]) {
  const stale: string[] = [];
  for (const entry of entries.slice(0, 50)) {
    const result = await saveTestProgress(userId, entry.key, entry.state);
    if (result.ok && result.stale) stale.push(entry.key);
  }
  return { stale, progress: await listTestProgress(userId) };
}
