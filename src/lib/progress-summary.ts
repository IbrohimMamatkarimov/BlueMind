export interface StudyEntry {
  id: string; source: "mock" | "qbank"; sourceId: string; title: string; section: string;
  module: number | null; mode: string; fullExamId: string | null; correctCount: number;
  total: number; completedAt: string; questions: {
    domain?: string; skill: string; difficulty?: string; questionType?: string;
    isCorrect: boolean; timeSpentSeconds?: number;
  }[];
}

const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;

export function summarizeProgress(entries: StudyEntry[]) {
  const questions = entries.reduce((sum, entry) => sum + entry.total, 0);
  const correct = entries.reduce((sum, entry) => sum + entry.correctCount, 0);
  const trackedTimes = entries.flatMap((entry) => entry.questions.map((question) => question.timeSpentSeconds))
    .filter((time): time is number => typeof time === "number" && Number.isFinite(time) && time > 0);
  const sections = ["Math", "Reading and Writing"].map((section) => {
    const items = entries.filter((entry) => entry.section === section);
    const total = items.reduce((sum, entry) => sum + entry.total, 0);
    const correctCount = items.reduce((sum, entry) => sum + entry.correctCount, 0);
    const times = items.flatMap((entry) => entry.questions.map((question) => question.timeSpentSeconds))
      .filter((time): time is number => typeof time === "number" && Number.isFinite(time) && time > 0);
    return { section, total, accuracy: total ? Math.round(correctCount / total * 100) : null,
      averageTimeSeconds: times.length ? Math.round(times.reduce((sum, time) => sum + time, 0) / times.length) : null,
      timedQuestions: times.length };
  });
  const skills = new Map<string, { section: string; skill: string; attempted: number; correct: number; totalTime: number; timed: number }>();
  for (const entry of entries) for (const question of entry.questions) {
    if (!question.skill) continue;
    const key = entry.section + "|" + question.skill;
    const skill = skills.get(key) ?? { section: entry.section, skill: question.skill, attempted: 0, correct: 0, totalTime: 0, timed: 0 };
    skill.attempted++; skill.correct += question.isCorrect ? 1 : 0;
    if (typeof question.timeSpentSeconds === "number" && Number.isFinite(question.timeSpentSeconds) && question.timeSpentSeconds > 0) {
      skill.totalTime += question.timeSpentSeconds; skill.timed++;
    }
    skills.set(key, skill);
  }
  const skillStats = [...skills.values()].map((skill) => ({ ...skill,
    accuracy: Math.round(skill.correct / skill.attempted * 100),
    averageTimeSeconds: skill.timed ? Math.round(skill.totalTime / skill.timed) : null,
  })).sort((a, b) => a.accuracy - b.accuracy);
  const difficultyStats = DIFFICULTIES.map((difficulty) => {
    const matching = entries.flatMap((entry) => entry.questions).filter((question) => question.difficulty === difficulty);
    const timed = matching.filter((question) => typeof question.timeSpentSeconds === "number" && Number.isFinite(question.timeSpentSeconds) && question.timeSpentSeconds > 0);
    const correctCount = matching.filter((question) => question.isCorrect).length;
    return { difficulty, attempted: matching.length, correct: correctCount,
      accuracy: matching.length ? Math.round(correctCount / matching.length * 100) : null,
      averageTimeSeconds: timed.length ? Math.round(timed.reduce((sum, question) => sum + question.timeSpentSeconds!, 0) / timed.length) : null,
      timedQuestions: timed.length };
  });
  const fullExams = new Map<string, Set<string>>();
  for (const entry of entries) if (entry.fullExamId) {
    const sitting = entry.sourceId + "|" + entry.fullExamId;
    const modules = fullExams.get(sitting) ?? new Set<string>();
    modules.add(entry.section + "|" + entry.module); fullExams.set(sitting, modules);
  }
  return { questions, accuracy: questions ? Math.round(correct / questions * 100) : null,
    averageTimeSeconds: trackedTimes.length ? Math.round(trackedTimes.reduce((sum, time) => sum + time, 0) / trackedTimes.length) : null,
    timedQuestions: trackedTimes.length, sections,
    sessions: entries.length, fullExams: [...fullExams.values()].filter((modules) => ["Math|1", "Math|2", "Reading and Writing|1", "Reading and Writing|2"].every((key) => modules.has(key))).length,
    skills: skillStats, difficultyStats,
    nextPractice: skillStats.find((skill) => skill.attempted >= 3 && skill.accuracy < 80) ?? null };
}
