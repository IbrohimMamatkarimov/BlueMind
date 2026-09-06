import { SAT_STRUCTURE } from "./sat-constants";

export type TestMode = "timed" | "untimed" | "exam";
export type TestSection = "Math" | "Reading and Writing";
export const TEST_MODES: { value: TestMode; label: string; description: string }[] = [
  { value: "timed", label: "Timed practice", description: "Practice with the standard module countdown. Pause whenever you need." },
  { value: "untimed", label: "Untimed practice", description: "Work at your own pace, with no countdown or automatic submission." },
  { value: "exam", label: "Real exam environment", description: "Standard timing in fullscreen. Leaving fullscreen or switching away pauses the test and shows a warning." },
];

export const FULL_EXAM_STEPS = [
  { section: "Reading and Writing", module: 1, minutes: SAT_STRUCTURE.readingWriting.minutesPerModule },
  { section: "Reading and Writing", module: 2, minutes: SAT_STRUCTURE.readingWriting.minutesPerModule },
  { section: "Break", module: 0, minutes: SAT_STRUCTURE.breakMinutes },
  { section: "Math", module: 1, minutes: SAT_STRUCTURE.math.minutesPerModule },
  { section: "Math", module: 2, minutes: SAT_STRUCTURE.math.minutesPerModule },
] as const;

export function isTestMode(value: unknown): value is TestMode {
  return value === "timed" || value === "untimed" || value === "exam";
}

export function fullExamKey(mockId: string) {
  return `bluemind_full_exam_${mockId}`;
}

export function fullExamAvailable(mock: {
  math: { module: number; questionCount: number }[];
  readingWriting: { module: number; questionCount: number }[];
}) {
  return [1, 2].every((module) =>
    mock.math.some((m) => m.module === module && Number(m.questionCount) === SAT_STRUCTURE.math.questionsPerModule) &&
    mock.readingWriting.some((m) => m.module === module && Number(m.questionCount) === SAT_STRUCTURE.readingWriting.questionsPerModule)
  );
}

export function remainingSeconds(deadline: number, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
