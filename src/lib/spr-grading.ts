/**
 * Grades a Student-Produced Response (SPR / "grid-in") answer the way the
 * real Digital SAT does: it accepts any mathematically equivalent form, not
 * just an exact string match. Without this, correct answers like "3/2" vs
 * the banked "1.5" (or "6/4", "1 1/2", "150%", "√2.25", etc.) were marked
 * wrong purely because the characters differed.
 *
 * Multiple-choice grading is NOT affected by this file — a choice id like
 * "A"/"B" is still graded with plain string equality, which is correct for
 * that question type.
 */

/** Parses a single SPR answer string into a numeric value, or null if it
 * isn't a recognizable number/fraction/percent/sqrt expression (in which
 * case the caller falls back to normalized string equality). */
function parseSprNumeric(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;

  s = s.replace(/,/g, ""); // thousands separators: "1,234" -> "1234"
  s = s.replace(/\$/g, ""); // stray currency sign

  let isPercent = false;
  if (s.endsWith("%")) {
    isPercent = true;
    s = s.slice(0, -1).trim();
  }

  // √9, sqrt(9), sqrt 9, -sqrt(9)
  const sqrtMatch = s.match(/^(-?)\s*(?:sqrt|√)\s*\(?\s*(\d+(?:\.\d+)?)\s*\)?$/i);
  if (sqrtMatch) {
    const inner = parseFloat(sqrtMatch[2]);
    if (!Number.isNaN(inner) && inner >= 0) {
      const val = Math.sqrt(inner);
      return sqrtMatch[1] === "-" ? -val : val;
    }
  }

  // Mixed number: "1 1/2"
  const mixedMatch = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedMatch) {
    const whole = parseFloat(mixedMatch[1]);
    const num = parseFloat(mixedMatch[2]);
    const den = parseFloat(mixedMatch[3]);
    if (den !== 0) {
      const frac = num / den;
      const val = whole < 0 ? whole - frac : whole + frac;
      return isPercent ? val / 100 : val;
    }
  }

  // Plain fraction: "3/2", "-3/2"
  const fracMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (fracMatch) {
    const num = parseFloat(fracMatch[1]);
    const den = parseFloat(fracMatch[2]);
    if (den !== 0) {
      const val = num / den;
      return isPercent ? val / 100 : val;
    }
  }

  // Plain number: "1.5", "-4", ".75"
  if (/^-?\d*\.?\d+$/.test(s)) {
    const num = Number(s);
    if (!Number.isNaN(num)) return isPercent ? num / 100 : num;
  }

  return null;
}

/** True if `selected` is an accepted answer for the SPR question whose
 * banked correct answer is `correct`. Tries exact normalized-string match
 * first (covers non-numeric acceptable answers), then falls back to
 * numeric equivalence via parseSprNumeric with a small floating-point
 * tolerance. */
export function isSprAnswerCorrect(selected: string | null | undefined, correct: string | null | undefined): boolean {
  if (!selected || !correct) return false;
  const a = selected.trim();
  const b = correct.trim();
  if (!a) return false;

  const normA = a.replace(/\s+/g, "").toLowerCase();
  const normB = b.replace(/\s+/g, "").toLowerCase();
  if (normA === normB) return true;

  const numA = parseSprNumeric(a);
  const numB = parseSprNumeric(b);
  if (numA === null || numB === null) return false;

  const tolerance = Math.max(1e-6, Math.abs(numB) * 1e-6);
  return Math.abs(numA - numB) <= tolerance;
}

/** Splits a banked correct-answer string into the individual accepted
 * answers — supports a question having MORE THAN ONE correct answer
 * (e.g. a multi-select multiple-choice item, or an SPR question where both
 * "2" and "-2" are valid), stored comma-separated ("A,C" or "2,-2").
 * A single answer with no comma (the overwhelmingly common case) just
 * comes back as a one-element array — fully backward compatible with
 * every question banked before multi-answer support existed. */
export function parseAcceptedAnswers(correct: string | null | undefined): string[] {
  if (!correct) return [];
  return correct
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Single entry point for grading ANY question type — multiple-choice uses
 * strict id equality, SPR uses the equivalence checker above. Checks the
 * selected answer against EVERY accepted answer (see parseAcceptedAnswers)
 * and is correct if it matches any one of them. Use this everywhere an
 * answer gets graded so both flows can never drift apart again. */
export function isAnswerCorrect(
  questionType: string,
  selected: string | null | undefined,
  correct: string | null | undefined
): boolean {
  if (!selected) return false;
  const accepted = parseAcceptedAnswers(correct);
  if (accepted.length === 0) return false;
  if (questionType === "spr") return accepted.some((acc) => isSprAnswerCorrect(selected, acc));
  return accepted.includes(selected);
}
