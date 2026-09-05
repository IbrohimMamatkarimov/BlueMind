/**
 * Math question generator.
 *
 * Design goal from the spec: "Do NOT rely on an LLM blindly for official
 * quality questions... Verify mathematical correctness, verify the solution,
 * verify that exactly one answer is correct, check numerical consistency."
 *
 * We satisfy this by generating every Math question from a parametrized
 * template where the correct answer is COMPUTED from the same parameters
 * used to render the question text — the answer can never drift from the
 * question. Distractors are generated from common real error patterns
 * (sign errors, off-by-one, wrong operation) and then checked to ensure
 * they are numerically distinct from the correct answer (exactly one
 * correct choice).
 */

import { newId } from "../id";

export interface GenQuestion {
  id: string;
  section: "Math";
  domain: string;
  skill: string;
  difficulty: "Easy" | "Medium" | "Hard";
  questionText: string;
  choices: { id: string; text: string }[];
  correctAnswer: string;
  questionType: "multiple_choice" | "spr";
  rationale: string;
  explanation: string;
  estimatedTime: number;
}

function rint(min: number, max: number, avoid: number[] = []): number {
  let v: number;
  do {
    v = Math.floor(Math.random() * (max - min + 1)) + min;
  } while (avoid.includes(v));
  return v;
}

function uniqueDistractors(correct: number, candidates: number[], count: number): number[] {
  const seen = new Set<number>([correct]);
  const out: number[] = [];
  for (const c of candidates) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
    if (out.length === count) break;
  }
  // Top up with random offsets if templates produced collisions.
  let guard = 0;
  while (out.length < count && guard < 50) {
    const cand = correct + rint(-9, 9, [0]);
    if (!seen.has(cand)) {
      seen.add(cand);
      out.push(cand);
    }
    guard++;
  }
  return out;
}

function mcQuestion(
  base: Omit<GenQuestion, "id" | "choices" | "correctAnswer" | "questionType"> & {
    correctValue: string;
    distractorValues: string[];
  }
): GenQuestion {
  const letters = ["A", "B", "C", "D"];
  const allValues = [base.correctValue, ...base.distractorValues].slice(0, 4);
  // Shuffle
  for (let i = allValues.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allValues[i], allValues[j]] = [allValues[j], allValues[i]];
  }
  const choices = allValues.map((text, i) => ({ id: letters[i], text }));
  const correctChoice = choices.find((c) => c.text === base.correctValue)!;
  const { correctValue, distractorValues, ...rest } = base;
  return {
    ...rest,
    id: newId("q"),
    choices,
    correctAnswer: correctChoice.id,
    questionType: "multiple_choice",
  };
}

function sprQuestion(
  base: Omit<GenQuestion, "id" | "choices" | "correctAnswer" | "questionType"> & {
    correctValue: string;
  }
): GenQuestion {
  const { correctValue, ...rest } = base;
  return {
    ...rest,
    id: newId("q"),
    choices: [],
    correctAnswer: correctValue,
    questionType: "spr",
  };
}

// ---------- Algebra: Linear Equations ----------
function genLinearEquation(difficulty: GenQuestion["difficulty"]): GenQuestion {
  const range = difficulty === "Easy" ? 10 : difficulty === "Medium" ? 20 : 40;
  const a = rint(2, range / 2);
  const x = rint(-range, range, [0]);
  const b = rint(-range, range);
  const c = a * x + b;
  const cStr = c >= 0 ? `${c}` : `(${c})`;
  const bStr = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;
  const correct = String(x);
  const distractors = [String(x + 1), String(-x), String(x + b > 0 ? x + b : x - b)].map(String);
  const isSpr = Math.random() < 0.4;
  const base = {
    section: "Math" as const,
    domain: "Algebra",
    skill: "Linear Equations",
    difficulty,
    questionText: `If ${a}x ${bStr} = ${cStr}, what is the value of x?`,
    rationale: `Subtract ${b} from both sides, then divide by ${a}: x = (${c} ${b >= 0 ? "-" : "+"} ${Math.abs(b)}) / ${a} = ${x}.`,
    explanation: `To isolate x, undo the operations in reverse order. First subtract the constant term (${b}) from both sides, then divide by the coefficient of x (${a}). This gives x = ${x}.`,
    estimatedTime: difficulty === "Hard" ? 90 : 60,
  };
  return isSpr
    ? sprQuestion({ ...base, correctValue: correct })
    : mcQuestion({ ...base, correctValue: correct, distractorValues: uniqueDistractors(x, distractors.map(Number), 3).map(String) });
}

// ---------- Algebra: Systems of Equations ----------
function genSystemOfEquations(difficulty: GenQuestion["difficulty"]): GenQuestion {
  const range = difficulty === "Easy" ? 8 : difficulty === "Medium" ? 12 : 20;
  const x = rint(-range, range, [0]);
  const y = rint(-range, range, [0]);
  const a1 = rint(1, 5);
  const b1 = rint(1, 5);
  const a2 = rint(1, 5, [a1]);
  const b2 = rint(1, 5, [b1]);
  const c1 = a1 * x + b1 * y;
  const c2 = a2 * x + b2 * y;
  const correct = String(x + y);
  const distractors = [String(x - y), String(x), String(y)];
  return mcQuestion({
    section: "Math",
    domain: "Algebra",
    skill: "Systems of Equations",
    difficulty,
    questionText: `${a1}x + ${b1}y = ${c1}\n${a2}x + ${b2}y = ${c2}\nBased on the system of equations above, what is the value of x + y?`,
    correctValue: correct,
    distractorValues: uniqueDistractors(x + y, distractors.map(Number), 3).map(String),
    rationale: `Solving the system gives x = ${x}, y = ${y}, so x + y = ${x + y}.`,
    explanation:
      "Use elimination or substitution to solve for both variables, then compute the requested expression. Always double-check by plugging both values back into the original equations.",
    estimatedTime: 100,
  });
}

// ---------- Advanced Math: Nonlinear Equations (quadratics with nice roots) ----------
function genQuadratic(difficulty: GenQuestion["difficulty"]): GenQuestion {
  const r1 = rint(-8, 8, [0]);
  const r2 = rint(-8, 8, [0, r1]);
  // (x - r1)(x - r2) = x^2 - (r1+r2)x + r1*r2
  const b = -(r1 + r2);
  const c = r1 * r2;
  const bStr = b >= 0 ? `+ ${b}x` : `- ${Math.abs(b)}x`;
  const cStr = c >= 0 ? `+ ${c}` : `- ${Math.abs(c)}`;
  const larger = Math.max(r1, r2);
  const correct = String(larger);
  const distractors = [String(Math.min(r1, r2)), String(-larger), String(larger + 1)];
  return mcQuestion({
    section: "Math",
    domain: "Advanced Math",
    skill: "Nonlinear Equations",
    difficulty,
    questionText: `What is the largest solution to x^2 ${bStr} ${cStr} = 0?`,
    correctValue: correct,
    distractorValues: uniqueDistractors(larger, distractors.map(Number), 3).map(String),
    rationale: `The equation factors as (x - ${r1})(x - ${r2}) = 0, so x = ${r1} or x = ${r2}. The larger solution is ${larger}.`,
    explanation:
      "Factor the quadratic into two binomials whose product matches the original expression, then set each factor equal to zero. Check your factoring by expanding it back out.",
    estimatedTime: 100,
  });
}

// ---------- Advanced Math: Nonlinear Functions (exponential growth) ----------
function genExponential(difficulty: GenQuestion["difficulty"]): GenQuestion {
  const initial = rint(2, 10) * 10;
  const rate = rint(2, 5) * 10; // percent growth
  const years = rint(1, 3);
  let value = initial;
  for (let i = 0; i < years; i++) value = Math.round(value * (1 + rate / 100));
  const correct = String(value);
  const distractors = [
    String(initial + rate * years),
    String(Math.round(initial * (1 + (rate * years) / 100))),
    String(value + rint(5, 20)),
  ];
  return mcQuestion({
    section: "Math",
    domain: "Advanced Math",
    skill: "Nonlinear Functions",
    difficulty,
    questionText: `A population starts at ${initial} and grows by ${rate}% each year. What is the population after ${years} year${years > 1 ? "s" : ""}, rounded to the nearest whole number?`,
    correctValue: correct,
    distractorValues: uniqueDistractors(value, distractors.map(Number), 3).map(String),
    rationale: `Multiply by (1 + ${rate}/100) once per year, rounding at each step: starting at ${initial}, after ${years} year(s) the population is ${value}.`,
    explanation:
      "Exponential growth multiplies the previous value by the same growth factor each period — it does not add the same fixed amount each time, which is the most common error on this skill.",
    estimatedTime: 90,
  });
}

// ---------- Problem Solving & Data Analysis: Percentages ----------
function genPercentage(difficulty: GenQuestion["difficulty"]): GenQuestion {
  const whole = rint(4, 20) * 25;
  const pct = rint(2, 19) * 5;
  const part = Math.round((whole * pct) / 100);
  const correct = String(part);
  const distractors = [String(Math.round(whole * (pct + 5) / 100)), String(whole - part), String(part + rint(2, 8))];
  return mcQuestion({
    section: "Math",
    domain: "Problem-Solving and Data Analysis",
    skill: "Percentages",
    difficulty,
    questionText: `What is ${pct}% of ${whole}?`,
    correctValue: correct,
    distractorValues: uniqueDistractors(part, distractors.map(Number), 3).map(String),
    rationale: `${pct}% of ${whole} = (${pct}/100) × ${whole} = ${part}.`,
    explanation: "Convert the percent to a decimal (divide by 100), then multiply by the whole quantity.",
    estimatedTime: 50,
  });
}

// ---------- Problem Solving & Data Analysis: Ratios ----------
function genRatio(difficulty: GenQuestion["difficulty"]): GenQuestion {
  const ratioA = rint(2, 9);
  const ratioB = rint(2, 9, [ratioA]);
  const scale = rint(2, 8);
  const totalA = ratioA * scale;
  const totalB = ratioB * scale;
  const correct = String(totalB);
  const distractors = [String(totalA), String(totalB + scale), String(ratioB)];
  return mcQuestion({
    section: "Math",
    domain: "Problem-Solving and Data Analysis",
    skill: "Ratios and Proportions",
    difficulty,
    questionText: `In a class, the ratio of boys to girls is ${ratioA}:${ratioB}. If there are ${totalA} boys, how many girls are there?`,
    correctValue: correct,
    distractorValues: uniqueDistractors(totalB, distractors.map(Number), 3).map(String),
    rationale: `The scale factor is ${totalA} / ${ratioA} = ${scale}, so girls = ${ratioB} × ${scale} = ${totalB}.`,
    explanation: "Find the scale factor from the known quantity, then apply the same scale factor to the other side of the ratio.",
    estimatedTime: 70,
  });
}

// ---------- Geometry and Trigonometry: Area/Volume ----------
function genGeometryArea(difficulty: GenQuestion["difficulty"]): GenQuestion {
  const base = rint(4, 20);
  const height = rint(4, 20);
  const area = 0.5 * base * height;
  const correct = Number.isInteger(area) ? String(area) : area.toFixed(1);
  const distractors = [String(base * height), String(base + height), String(0.5 * base * height + rint(2, 6))];
  return mcQuestion({
    section: "Math",
    domain: "Geometry and Trigonometry",
    skill: "Area and Volume",
    difficulty,
    questionText: `A triangle has a base of ${base} and a height of ${height}. What is its area?`,
    correctValue: correct,
    distractorValues: uniqueDistractors(area, distractors.map(Number), 3).map(String),
    rationale: `Area of a triangle = (1/2) × base × height = (1/2) × ${base} × ${height} = ${correct}.`,
    explanation: "The triangle area formula is (1/2) × base × height — a common error is forgetting the 1/2 factor, which produces the parallelogram/rectangle area instead.",
    estimatedTime: 60,
  });
}

// ---------- Geometry: Right Triangle basics (Pythagorean triples) ----------
const PYTHAG_TRIPLES: [number, number, number][] = [
  [3, 4, 5],
  [6, 8, 10],
  [5, 12, 13],
  [9, 12, 15],
  [8, 15, 17],
  [7, 24, 25],
];
function genRightTriangle(difficulty: GenQuestion["difficulty"]): GenQuestion {
  const [a, b, c] = PYTHAG_TRIPLES[rint(0, PYTHAG_TRIPLES.length - 1)];
  const correct = String(c);
  const distractors = [String(a + b), String(c + 1), String(c - 1)];
  return mcQuestion({
    section: "Math",
    domain: "Geometry and Trigonometry",
    skill: "Right Triangle Trig",
    difficulty,
    questionText: `A right triangle has legs of length ${a} and ${b}. What is the length of the hypotenuse?`,
    correctValue: correct,
    distractorValues: uniqueDistractors(c, distractors.map(Number), 3).map(String),
    rationale: `By the Pythagorean theorem, c^2 = ${a}^2 + ${b}^2 = ${a * a} + ${b * b} = ${a * a + b * b}, so c = ${c}.`,
    explanation: "The Pythagorean theorem (a² + b² = c²) applies to any right triangle, where c is the hypotenuse (the side opposite the right angle).",
    estimatedTime: 60,
  });
}

const GENERATORS = [
  genLinearEquation,
  genSystemOfEquations,
  genQuadratic,
  genExponential,
  genPercentage,
  genRatio,
  genGeometryArea,
  genRightTriangle,
];

/**
 * Generates `count` Math questions spread across domains/skills with the
 * requested difficulty distribution. Used both for mock modules and for
 * standalone Practice sessions.
 */
export function generateMathQuestions(
  count: number,
  difficultyMix: { Easy: number; Medium: number; Hard: number }
): GenQuestion[] {
  const pool: GenQuestion["difficulty"][] = [
    ...Array(difficultyMix.Easy).fill("Easy"),
    ...Array(difficultyMix.Medium).fill("Medium"),
    ...Array(difficultyMix.Hard).fill("Hard"),
  ];
  while (pool.length < count) pool.push("Medium");

  // Shuffle before handing difficulties out to generators. Without this,
  // difficulty is entirely determined by array position: pool[0..6] is
  // always Easy, pool[7..16] always Medium, etc, and each generator always
  // lands on the same few fixed positions (i % GENERATORS.length). That
  // means e.g. "Linear Equations" (always GENERATORS[0]) gets the exact
  // same difficulty split — never more than 1 Hard question — on every
  // single mock, forever, regardless of the requested mix. Shuffling makes
  // each skill get a fair, representative sample of the mix instead.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const out: GenQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const gen = GENERATORS[i % GENERATORS.length];
    out.push(gen(pool[i]));
  }
  return out;
}

export function generateMathQuestionsForSkill(
  skill: string,
  count: number,
  difficulty: GenQuestion["difficulty"] = "Medium"
): GenQuestion[] {
  const genMap: Record<string, () => GenQuestion> = {
    "Linear Equations": () => genLinearEquation(difficulty),
    "Systems of Equations": () => genSystemOfEquations(difficulty),
    "Nonlinear Equations": () => genQuadratic(difficulty),
    "Nonlinear Functions": () => genExponential(difficulty),
    Percentages: () => genPercentage(difficulty),
    "Ratios and Proportions": () => genRatio(difficulty),
    "Area and Volume": () => genGeometryArea(difficulty),
    "Right Triangle Trig": () => genRightTriangle(difficulty),
  };
  const gen = genMap[skill] ?? (() => GENERATORS[rint(0, GENERATORS.length - 1)](difficulty));
  return Array.from({ length: count }, () => gen());
}
