/**
 * BlueMind Scoring Service
 * ------------------------
 * The ONLY place score-conversion logic lives. Nothing else in the app
 * should compute a score directly — always call calculateBlueMindScore().
 *
 * Two conversion methods are supported:
 *  - "official_table": a published College Board practice-test raw->scaled
 *    conversion table, stored per mock/section in score_conversions.
 *    Result is labeled an Official College Board Score.
 *  - "bluemind_estimate": no official table exists for this mock (true for
 *    all BlueMind-authored mocks). We estimate using a smooth monotonic
 *    curve calibrated to resemble the *shape* of published SAT curves
 *    (steeper in the middle, flatter at the extremes), clearly labeled
 *    "Estimated BlueMind Score" everywhere in the UI.
 *
 * We deliberately do NOT use "raw * 10" or any other fake linear formula,
 * and we never claim an estimate is an official score.
 */

import { db } from "./db";
import { newId } from "./id";

export type ConversionMethod = "official_table" | "bluemind_estimate";

export interface ScoreResult {
  section: "Reading and Writing" | "Math" | "Total";
  rawScore: number;
  maxRaw: number;
  estimatedScore: number;
  scoreRange: { lower: number; upper: number };
  scoringSource: string;
  isOfficialConversion: boolean;
  conversionMethod: ConversionMethod;
  conversionVersion: string;
}

const SECTION_MIN = 200;
const SECTION_MAX = 800;

/**
 * BlueMind's calibrated estimation curve (version "v1").
 * Maps a raw-score percentage (0..1) to a scaled score in [200,800] using an
 * S-curve so that near-floor/near-ceiling performance compresses (mirroring
 * how real SAT curves behave), while the middle of the distribution is more
 * sensitive to each additional correct answer.
 */
function bluemindEstimateCurve(rawScore: number, maxRaw: number): number {
  if (maxRaw <= 0) return SECTION_MIN;
  const p = Math.min(1, Math.max(0, rawScore / maxRaw));
  // Logistic S-curve centered at 0.5, steepness k tuned for a ~600pt span.
  const k = 8;
  const s = 1 / (1 + Math.exp(-k * (p - 0.5)));
  // Normalize s (which itself ranges ~0..1 but not exactly) back to 0..1
  const sMin = 1 / (1 + Math.exp(-k * (0 - 0.5)));
  const sMax = 1 / (1 + Math.exp(-k * (1 - 0.5)));
  const norm = (s - sMin) / (sMax - sMin);
  const scaled = SECTION_MIN + norm * (SECTION_MAX - SECTION_MIN);
  // Round to nearest 10, like official SAT scaled scores.
  return Math.round(scaled / 10) * 10;
}

interface CalcInput {
  mockId: string;
  section: "Reading and Writing" | "Math";
  rawScore: number;
  maxRaw: number;
  scoringVersion?: string;
}

export async function calculateBlueMindScore(input: CalcInput): Promise<ScoreResult> {
  const version = input.scoringVersion ?? "v1";

  // Look for an official conversion table for this mock+section.
  const officialRow = (await db
    .prepare(
      "SELECT * FROM score_conversions WHERE mock_id = ? AND section = ? AND conversion_version = ? AND is_official = 1"
    )
    .get(input.mockId, input.section, version)) as { table_json: string; source: string } | undefined;

  if (officialRow) {
    const table = JSON.parse(officialRow.table_json) as Record<
      string,
      { lower: number; upper: number; scaled: number }
    >;
    const entry = table[String(input.rawScore)];
    if (entry) {
      return {
        section: input.section,
        rawScore: input.rawScore,
        maxRaw: input.maxRaw,
        estimatedScore: entry.scaled,
        scoreRange: { lower: entry.lower, upper: entry.upper },
        scoringSource: officialRow.source,
        isOfficialConversion: true,
        conversionMethod: "official_table",
        conversionVersion: version,
      };
    }
  }

  // Fall back to the BlueMind estimate curve.
  const scaled = bluemindEstimateCurve(input.rawScore, input.maxRaw);
  const margin = 30; // +/- range communicated to students as an estimate band
  return {
    section: input.section,
    rawScore: input.rawScore,
    maxRaw: input.maxRaw,
    estimatedScore: scaled,
    scoreRange: {
      lower: Math.max(SECTION_MIN, scaled - margin),
      upper: Math.min(SECTION_MAX, scaled + margin),
    },
    scoringSource: "BlueMind estimate curve (not an official College Board conversion)",
    isOfficialConversion: false,
    conversionMethod: "bluemind_estimate",
    conversionVersion: version,
  };
}

export function calculateTotalScore(rw: ScoreResult, math: ScoreResult): ScoreResult {
  return {
    section: "Total",
    rawScore: rw.rawScore + math.rawScore,
    maxRaw: rw.maxRaw + math.maxRaw,
    estimatedScore: rw.estimatedScore + math.estimatedScore,
    scoreRange: {
      lower: rw.scoreRange.lower + math.scoreRange.lower,
      upper: rw.scoreRange.upper + math.scoreRange.upper,
    },
    scoringSource:
      rw.isOfficialConversion && math.isOfficialConversion
        ? "Official College Board conversion tables"
        : "BlueMind estimate (see section scores for details)",
    isOfficialConversion: rw.isOfficialConversion && math.isOfficialConversion,
    conversionMethod:
      rw.isOfficialConversion && math.isOfficialConversion ? "official_table" : "bluemind_estimate",
    conversionVersion: rw.conversionVersion,
  };
}

/** Persists a ScoreResult onto an attempt. */
export async function saveScoreRecord(attemptId: string, result: ScoreResult): Promise<void> {
  await db
    .prepare(
      `INSERT INTO score_records
        (id, attempt_id, section, raw_score, conversion_method, lower_score, upper_score,
         estimated_score, is_official_conversion, source, conversion_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      newId("score"),
      attemptId,
      result.section,
      result.rawScore,
      result.conversionMethod,
      result.scoreRange.lower,
      result.scoreRange.upper,
      result.estimatedScore,
      result.isOfficialConversion ? 1 : 0,
      result.scoringSource,
      result.conversionVersion
    );
}
