export interface CountableSkill {
  section: string;
  skill: string;
  easy: number;
  medium: number;
  hard: number;
}

/** Count every question represented by the learner's topic/difficulty filters. */
export function countMatchingQuestions(
  rows: CountableSkill[],
  section: string,
  skills: string[],
  difficulties: string[]
) {
  const allDifficulties = difficulties.length === 0;
  return rows
    .filter((row) => row.section === section && skills.includes(row.skill))
    .reduce(
      (sum, row) => sum +
        (allDifficulties || difficulties.includes("Easy") ? row.easy : 0) +
        (allDifficulties || difficulties.includes("Medium") ? row.medium : 0) +
        (allDifficulties || difficulties.includes("Hard") ? row.hard : 0),
      0
    );
}

/** Find the next unsolved question after the current one, wrapping once.
 * The current question is deliberately excluded so a learner can skip it
 * for now and return after working through the rest of the set. */
export function findNextUnsolvedIndex(
  questionIds: string[],
  currentIndex: number,
  solvedQuestionIds: ReadonlySet<string>
): number | null {
  if (questionIds.length < 2) return null;
  for (let offset = 1; offset < questionIds.length; offset++) {
    const candidate = (currentIndex + offset) % questionIds.length;
    if (!solvedQuestionIds.has(questionIds[candidate])) return candidate;
  }
  return null;
}
