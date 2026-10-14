// Saved-test progress lives under these localStorage keys (written by
// PracticeExam and FullExam) and is mirrored to the server's test_progress
// table under the very same key, so both sides can be compared directly.
//
//   bluemind_progress_<mockId>_<section>_<module>   one mock module
//   bluemind_progress_qbank_<section>_<setId>       a Question Bank set
//   bluemind_full_exam_<mockId>                     a full exam's step/results
//   bluemind_full_exam_<mockId>_module_<step>       a module inside a full exam
//
// Mock ids contain underscores ("mock_ab12…"), so the module form is parsed
// by anchoring on the two known section names.

export type ProgressKind = "module" | "qbank" | "full" | "full_module";

export interface ProgressKeyInfo {
  kind: ProgressKind;
  mockId: string;
  section: string | null;
  module: string | null;
}

const MODULE_KEY = /^bluemind_progress_(.+)_(Math|Reading and Writing)_([A-Za-z0-9_-]+)$/;
const FULL_KEY = /^bluemind_full_exam_(.+?)(?:_module_([0-4]))?$/;

export function describeProgressKey(key: string): ProgressKeyInfo | null {
  if (key.length > 200) return null;
  const moduleMatch = MODULE_KEY.exec(key);
  if (moduleMatch) {
    const [, mockId, section, module] = moduleMatch;
    if (mockId === "qbank") return { kind: "qbank", mockId, section, module };
    if (module !== "1" && module !== "2") return null;
    return { kind: "module", mockId, section, module };
  }
  const fullMatch = FULL_KEY.exec(key);
  if (fullMatch) {
    const [, mockId, step] = fullMatch;
    return step === undefined
      ? { kind: "full", mockId, section: null, module: null }
      : { kind: "full_module", mockId, section: null, module: step };
  }
  return null;
}

export function isProgressKey(key: string) {
  return describeProgressKey(key) !== null;
}

export function moduleProgressKey(mockId: string, section: string, module: number | string) {
  return `bluemind_progress_${mockId}_${section}_${module}`;
}

export interface ProgressSummary extends ProgressKeyInfo {
  key: string;
  savedAt: number;
  /** Module/qbank: questions answered so far. */
  answered?: number;
  /** Module/qbank: the question the learner was on (0-based). */
  index?: number;
  /** Full exam: FULL_EXAM_STEPS index the learner is on (5 = finished). */
  step?: number;
  mode?: string;
}

/** The catalog-sized view of a saved blob — computed the same way for the
 * server's copy and for one that only exists in this browser. */
export function summarizeProgress(key: string, info: ProgressKeyInfo, state: unknown, savedAt?: number): ProgressSummary {
  const record = state && typeof state === "object" ? state as Record<string, unknown> : {};
  const summary: ProgressSummary = {
    ...info, key,
    savedAt: savedAt ?? (typeof record.savedAt === "number" ? record.savedAt : 0),
  };
  if (typeof record.mode === "string") summary.mode = record.mode;
  if (info.kind === "full") {
    if (typeof record.step === "number") summary.step = record.step;
  } else {
    const answers = record.answers && typeof record.answers === "object" ? Object.values(record.answers as Record<string, unknown>) : [];
    summary.answered = answers.filter((value) => typeof value === "string" && value.trim() !== "").length;
    if (typeof record.index === "number") summary.index = record.index;
  }
  return summary;
}

/** "saved just now" / "saved 5 min ago" / "saved Mar 3". */
export function savedAgo(savedAt: number) {
  const minutes = Math.round((Date.now() - savedAt) / 60000);
  if (minutes < 1) return "saved just now";
  if (minutes < 60) return `saved ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `saved ${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `saved ${days} day${days === 1 ? "" : "s"} ago`;
  return `saved ${new Date(savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
