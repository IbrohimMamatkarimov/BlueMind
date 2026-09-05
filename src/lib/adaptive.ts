/**
 * BlueMind Adaptive Practice
 * --------------------------
 * This is BlueMind's own transparent adaptive routing system. It is
 * explicitly NOT a reproduction of College Board's proprietary
 * multistage-adaptive algorithm — it is a simpler, disclosed heuristic:
 * Module 1 mixes difficulty broadly; based on how the student did
 * (correctness + difficulty weighting + skill coverage), Module 2 is
 * pulled from a "higher difficulty" or "lower difficulty" question pool.
 *
 * Deterministic: same inputs -> same routing decision, every time.
 * The decision + reason are persisted on the Attempt record.
 */

export type DifficultyLevel = "higher" | "lower";

export interface QuestionDifficultyInfo {
  questionId: string;
  difficulty: "Easy" | "Medium" | "Hard";
  skill: string;
  isCorrect: boolean;
}

export interface SkillPerformance {
  skill: string;
  correct: number;
  attempted: number;
}

export interface SelectNextModuleInput {
  firstModuleResult: QuestionDifficultyInfo[];
  adaptiveRuleVersion?: string;
}

export interface SelectNextModuleOutput {
  moduleId: DifficultyLevel; // "higher" | "lower" pool identifier
  difficultyLevel: DifficultyLevel;
  routingReason: string;
  performanceScore: number; // 0..1, for transparency/debugging
}

const DIFFICULTY_WEIGHT: Record<string, number> = {
  Easy: 1,
  Medium: 1.5,
  Hard: 2,
};

/**
 * Weighted performance score:
 *   sum(correct question's difficulty weight) / sum(all difficulty weights)
 * This rewards getting hard questions right more than easy ones, without
 * needing a black-box IRT model.
 */
function computeWeightedPerformance(results: QuestionDifficultyInfo[]): number {
  if (results.length === 0) return 0;
  let earned = 0;
  let possible = 0;
  for (const r of results) {
    const w = DIFFICULTY_WEIGHT[r.difficulty] ?? 1;
    possible += w;
    if (r.isCorrect) earned += w;
  }
  return possible === 0 ? 0 : earned / possible;
}

/** Routing threshold: BlueMind Adaptive Practice v1 uses a simple 60% cut. */
const ROUTING_THRESHOLD_V1 = 0.6;

export function selectNextModule(input: SelectNextModuleInput): SelectNextModuleOutput {
  const version = input.adaptiveRuleVersion ?? "v1";
  const score = computeWeightedPerformance(input.firstModuleResult);
  const correctCount = input.firstModuleResult.filter((r) => r.isCorrect).length;
  const total = input.firstModuleResult.length;

  if (version === "v1") {
    if (score >= ROUTING_THRESHOLD_V1) {
      return {
        moduleId: "higher",
        difficultyLevel: "higher",
        routingReason: `Strong Module 1 performance (${correctCount}/${total} correct, weighted score ${(score * 100).toFixed(0)}%) — routed to the Higher-Difficulty Module 2 pool.`,
        performanceScore: score,
      };
    }
    return {
      moduleId: "lower",
      difficultyLevel: "lower",
      routingReason: `Module 1 performance (${correctCount}/${total} correct, weighted score ${(score * 100).toFixed(0)}%) was below the routing threshold — routed to the Lower-Difficulty Module 2 pool to reinforce fundamentals.`,
      performanceScore: score,
    };
  }

  // Future adaptive_rule_version branches can be added here without
  // touching any UI code.
  throw new Error(`Unknown adaptive_rule_version: ${version}`);
}
