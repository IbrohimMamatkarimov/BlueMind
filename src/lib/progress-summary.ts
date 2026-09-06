export interface StudyEntry {
  id: string; source: "mock" | "qbank"; sourceId: string; title: string; section: string;
  module: number | null; mode: string; fullExamId: string | null; correctCount: number;
  total: number; completedAt: string; questions: { skill: string; isCorrect: boolean }[];
}
export function summarizeProgress(entries: StudyEntry[]) {
  const questions = entries.reduce((sum, entry) => sum + entry.total, 0);
  const correct = entries.reduce((sum, entry) => sum + entry.correctCount, 0);
  const sections = ["Math", "Reading and Writing"].map((section) => {
    const items = entries.filter((entry) => entry.section === section);
    const total = items.reduce((sum, entry) => sum + entry.total, 0);
    const correctCount = items.reduce((sum, entry) => sum + entry.correctCount, 0);
    return { section, total, accuracy: total ? Math.round(correctCount / total * 100) : null };
  });
  const skills = new Map<string, { section: string; skill: string; attempted: number; correct: number }>();
  for (const entry of entries) for (const question of entry.questions) {
    if (!question.skill) continue;
    const key = entry.section + "|" + question.skill;
    const skill = skills.get(key) ?? { section: entry.section, skill: question.skill, attempted: 0, correct: 0 };
    skill.attempted++; skill.correct += question.isCorrect ? 1 : 0; skills.set(key, skill);
  }
  const skillStats = [...skills.values()].map((skill) => ({ ...skill, accuracy: Math.round(skill.correct / skill.attempted * 100) })).sort((a, b) => a.accuracy - b.accuracy);
  const fullExams = new Map<string, Set<string>>();
  for (const entry of entries) if (entry.fullExamId) {
    const sitting = entry.sourceId + "|" + entry.fullExamId;
    const modules = fullExams.get(sitting) ?? new Set<string>();
    modules.add(entry.section + "|" + entry.module); fullExams.set(sitting, modules);
  }
  return { questions, accuracy: questions ? Math.round(correct / questions * 100) : null, sections,
    sessions: entries.length, fullExams: [...fullExams.values()].filter((modules) => ["Math|1", "Math|2", "Reading and Writing|1", "Reading and Writing|2"].every((key) => modules.has(key))).length,
    skills: skillStats, nextPractice: skillStats.find((skill) => skill.attempted >= 3 && skill.accuracy < 80) ?? null };
}
