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
