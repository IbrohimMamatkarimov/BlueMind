import { db } from "./db";
import { getMistakes } from "./mistakes";

interface CountRow {
  questions?: unknown;
  correct?: unknown;
  sessions?: unknown;
  vocabulary_reviews?: unknown;
  reflections?: unknown;
  vocabulary_added?: unknown;
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function calculateStreak(days: string[]) {
  const activity = new Set(days);
  const dateKey = (date: Date) => date.toISOString().slice(0, 10);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const start = activity.has(dateKey(today)) ? today : activity.has(dateKey(yesterday)) ? yesterday : null;
  let current = 0;
  if (start) {
    const cursor = new Date(start);
    while (activity.has(dateKey(cursor))) {
      current++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }

  let best = 0;
  let run = 0;
  let previous = "";
  for (const day of [...activity].sort()) {
    if (!previous) run = 1;
    else {
      const gap = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / 86_400_000;
      run = gap === 1 ? run + 1 : 1;
    }
    best = Math.max(best, run);
    previous = day;
  }
  return { current, best, activeToday: activity.has(dateKey(today)) };
}

export async function getTodayDashboard(userId: string) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const start = todayStart.toISOString();
  const weekStart = isoDaysAgo(7);

  const [todayRow, weeklyRow, skillRow, activityRows, reading, math] = await Promise.all([
    db.prepare(`
      SELECT
        COALESCE((SELECT SUM(total) FROM study_results WHERE user_id = ? AND source = 'mock' AND completed_at >= ?), 0) +
          COALESCE((SELECT COUNT(*) FROM practice_attempts WHERE user_id = ? AND created_at >= ?), 0) AS questions,
        COALESCE((SELECT SUM(correct_count) FROM study_results WHERE user_id = ? AND source = 'mock' AND completed_at >= ?), 0) +
          COALESCE((SELECT SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) FROM practice_attempts WHERE user_id = ? AND created_at >= ?), 0) AS correct,
        COALESCE((SELECT COUNT(*) FROM study_results WHERE user_id = ? AND completed_at >= ?), 0) AS sessions,
        COALESCE((SELECT COUNT(*) FROM vocabulary_words WHERE user_id = ? AND last_reviewed_at >= ?), 0) AS vocabulary_reviews,
        COALESCE((SELECT COUNT(*) FROM mistake_journal_entries WHERE user_id = ? AND updated_at >= ?), 0) AS reflections
    `).get(userId, start, userId, start, userId, start, userId, start, userId, start, userId, start, userId, start) as Promise<CountRow>,
    db.prepare(`
      SELECT
        COALESCE((SELECT SUM(total) FROM study_results WHERE user_id = ? AND source = 'mock' AND completed_at >= ?), 0) +
          COALESCE((SELECT COUNT(*) FROM practice_attempts WHERE user_id = ? AND created_at >= ?), 0) AS questions,
        COALESCE((SELECT SUM(correct_count) FROM study_results WHERE user_id = ? AND source = 'mock' AND completed_at >= ?), 0) +
          COALESCE((SELECT SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) FROM practice_attempts WHERE user_id = ? AND created_at >= ?), 0) AS correct,
        COALESCE((SELECT COUNT(*) FROM study_results WHERE user_id = ? AND completed_at >= ?), 0) AS sessions,
        COALESCE((SELECT COUNT(*) FROM vocabulary_words WHERE user_id = ? AND created_at >= ?), 0) AS vocabulary_added,
        COALESCE((SELECT COUNT(*) FROM vocabulary_words WHERE user_id = ? AND last_reviewed_at >= ?), 0) AS vocabulary_reviews,
        COALESCE((SELECT COUNT(*) FROM mistake_journal_entries WHERE user_id = ? AND updated_at >= ?), 0) AS reflections
    `).get(userId, weekStart, userId, weekStart, userId, weekStart, userId, weekStart, userId, weekStart, userId, weekStart, userId, weekStart, userId, weekStart) as Promise<CountRow>,
    db.prepare(`SELECT section, skill, attempted, correct
      FROM skill_stats WHERE user_id = ? AND attempted >= 3
      ORDER BY (correct::float / NULLIF(attempted, 0)) ASC, attempted DESC LIMIT 1`)
      .get(userId) as Promise<Record<string, unknown> | undefined>,
    db.prepare(`SELECT DISTINCT day FROM (
      SELECT LEFT(completed_at, 10) AS day FROM study_results WHERE user_id = ?
      UNION SELECT LEFT(created_at, 10) AS day FROM practice_attempts WHERE user_id = ?
      UNION SELECT LEFT(created_at, 10) AS day FROM vocabulary_words WHERE user_id = ?
      UNION SELECT LEFT(last_reviewed_at, 10) AS day FROM vocabulary_words WHERE user_id = ? AND last_reviewed_at IS NOT NULL
      UNION SELECT LEFT(updated_at, 10) AS day FROM mistake_journal_entries WHERE user_id = ?
    ) activity WHERE day IS NOT NULL ORDER BY day`)
      .all(userId, userId, userId, userId, userId) as Promise<{ day: string }[]>,
    getMistakes(userId, "Reading and Writing"),
    getMistakes(userId, "Math"),
  ]);

  const vocabulary = await db.prepare(`SELECT
    COUNT(*) FILTER (WHERE definition <> '' AND next_review_at <= ?) AS due,
    COUNT(*) FILTER (WHERE definition = '') AS needs_definition
    FROM vocabulary_words WHERE user_id = ?`).get(new Date().toISOString(), userId) as Record<string, unknown>;

  const todayQuestions = Number(todayRow.questions ?? 0);
  const todayCorrect = Number(todayRow.correct ?? 0);
  const weeklyQuestions = Number(weeklyRow.questions ?? 0);
  const weeklyCorrect = Number(weeklyRow.correct ?? 0);
  const unresolvedMistakes = [...reading.mistakes, ...math.mistakes].filter((item) => !item.latestCorrect);
  const reflectedMistakes = [...reading.mistakes, ...math.mistakes].filter((item) => item.journal).length;
  const weakSkill = skillRow ? {
    section: String(skillRow.section),
    skill: String(skillRow.skill),
    attempted: Number(skillRow.attempted),
    accuracy: Math.round(Number(skillRow.correct) / Number(skillRow.attempted) * 100),
  } : null;

  return {
    today: {
      questions: todayQuestions,
      correct: todayCorrect,
      accuracy: todayQuestions ? Math.round(todayCorrect / todayQuestions * 100) : null,
      sessions: Number(todayRow.sessions ?? 0),
      vocabularyReviews: Number(todayRow.vocabulary_reviews ?? 0),
      reflections: Number(todayRow.reflections ?? 0),
    },
    plan: {
      mistakesDue: unresolvedMistakes.length,
      vocabularyDue: Number(vocabulary.due ?? 0),
      wordsToDefine: Number(vocabulary.needs_definition ?? 0),
      weakSkill,
    },
    streak: calculateStreak(activityRows.map((row) => row.day)),
    weekly: {
      questions: weeklyQuestions,
      accuracy: weeklyQuestions ? Math.round(weeklyCorrect / weeklyQuestions * 100) : null,
      sessions: Number(weeklyRow.sessions ?? 0),
      vocabularyAdded: Number(weeklyRow.vocabulary_added ?? 0),
      vocabularyReviews: Number(weeklyRow.vocabulary_reviews ?? 0),
      reflections: Number(weeklyRow.reflections ?? 0),
      reflectedMistakes,
    },
  };
}
