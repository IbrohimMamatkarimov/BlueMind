/**
 * Per-question accuracy for the Question Bank navigator.
 *
 * Every check the learner makes is one attempt in practice_attempts, so a
 * question's colour is simply correct ÷ attempts: a first miss paints it
 * red, one make afterwards moves it to 50 % (amber), and each further make
 * pushes it toward green — a later miss pulls it back. The same stats feed
 * the "3 of 4 correct" pill and decide which questions "Next Unsolved" skips.
 */

export interface QuestionAccuracy {
  /** Every recorded attempt for this user, across all sets. */
  attempts: number;
  /** How many of those were correct. */
  correct: number;
  /** Outcome of the most recent attempt, null when never attempted. */
  lastCorrect: boolean | null;
  /** Attempts recorded inside the current set (idempotency for retries). */
  sessionAttempts: number;
}

export const EMPTY_ACCURACY: QuestionAccuracy = { attempts: 0, correct: 0, lastCorrect: null, sessionAttempts: 0 };

export function accuracyPercent(stats: Pick<QuestionAccuracy, "attempts" | "correct">): number | null {
  if (stats.attempts <= 0) return null;
  return Math.round((Math.min(stats.correct, stats.attempts) / stats.attempts) * 100);
}

/** Merge one newly recorded attempt into a stats snapshot (optimistic UI). */
export function recordAttempt(stats: QuestionAccuracy, isCorrect: boolean): QuestionAccuracy {
  return {
    attempts: stats.attempts + 1,
    correct: stats.correct + (isCorrect ? 1 : 0),
    lastCorrect: isCorrect,
    sessionAttempts: stats.sessionAttempts + 1,
  };
}

/** A question counts as solved once its latest attempt was correct — the
 * same rule the bank listing's correct/incorrect filter uses. */
export function isSolved(stats: Pick<QuestionAccuracy, "lastCorrect">): boolean {
  return stats.lastCorrect === true;
}

type Rgb = [number, number, number];

// Red (0 %) → amber (50 %) → green (100 %). The end colours are the ones the
// exam screen already uses for "For Review" red and the old "Solved" green,
// so a perfect record looks exactly the way it did before.
const STOPS: { at: number; rgb: Rgb }[] = [
  { at: 0, rgb: [193, 53, 21] }, // #c13515
  { at: 50, rgb: [217, 158, 6] }, // #d99e06
  { at: 100, rgb: [21, 128, 61] }, // #15803d
];

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance, used to pick white or near-black text. */
function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export interface AccuracyPalette {
  /** Tile fill. */
  background: string;
  /** Text that stays readable on that fill. */
  foreground: string;
  /** 0–100, or null when the question was never attempted. */
  percent: number | null;
}

/** Colour for a navigator tile: proportional to the accuracy rate, null
 * (caller keeps the plain unanswered style) when there is no history. */
export function accuracyPalette(stats: Pick<QuestionAccuracy, "attempts" | "correct">): AccuracyPalette | null {
  const percent = accuracyPercent(stats);
  if (percent === null) return null;
  const pct = Math.max(0, Math.min(100, percent));
  let rgb: Rgb = STOPS[STOPS.length - 1].rgb;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const from = STOPS[i];
    const to = STOPS[i + 1];
    if (pct <= to.at) {
      rgb = mix(from.rgb, to.rgb, (pct - from.at) / (to.at - from.at));
      break;
    }
  }
  // White on the amber middle of the ramp fails contrast; switch to dark
  // text there and back to white once the fill is deep enough again.
  const foreground = luminance(rgb) > 0.22 ? "#1e1e1e" : "#ffffff";
  return { background: toHex(rgb), foreground, percent: pct };
}

/** "3 of 4 correct · 75%" for tooltips and screen readers. */
export function describeAccuracy(stats: Pick<QuestionAccuracy, "attempts" | "correct">): string {
  const percent = accuracyPercent(stats);
  if (percent === null) return "not attempted yet";
  const attempts = stats.attempts;
  return `${Math.min(stats.correct, attempts)} of ${attempts} correct · ${percent}%`;
}
