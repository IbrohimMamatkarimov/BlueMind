// Reference: official College Board Digital SAT structure.
// Reading and Writing: 54 questions / 64 min / 2 modules of 32 min.
// Math: 44 questions / 70 min / 2 modules of 35 min.
// Total: 98 questions / 134 minutes testing time, with a 10-minute break
// between the R&W and Math sections. BlueMind mirrors this structure for
// its mock tests; it does not claim to reproduce College Board's proprietary
// adaptive algorithm — routing between modules is BlueMind's own transparent
// "BlueMind Adaptive Practice" system (see src/lib/adaptive.ts).

export const SAT_STRUCTURE = {
  readingWriting: {
    label: "Reading and Writing",
    totalQuestions: 54,
    totalMinutes: 64,
    modules: 2,
    questionsPerModule: 27,
    minutesPerModule: 32,
  },
  math: {
    label: "Math",
    totalQuestions: 44,
    totalMinutes: 70,
    modules: 2,
    questionsPerModule: 22,
    minutesPerModule: 35,
  },
  breakMinutes: 10,
  totalQuestions: 98,
  totalMinutes: 134,
} as const;

export const SECTIONS = {
  RW: "Reading and Writing",
  MATH: "Math",
} as const;

// Current SAT domain / skill taxonomy (official College Board terminology).
export const DOMAINS: Record<string, { section: string; skills: string[] }> = {
  "Information and Ideas": {
    section: SECTIONS.RW,
    skills: ["Central Ideas and Details", "Command of Evidence", "Inferences"],
  },
  "Craft and Structure": {
    section: SECTIONS.RW,
    skills: ["Words in Context", "Text Structure and Purpose", "Cross-Text Connections"],
  },
  "Expression of Ideas": {
    section: SECTIONS.RW,
    skills: ["Rhetorical Synthesis", "Transitions"],
  },
  "Standard English Conventions": {
    section: SECTIONS.RW,
    skills: ["Boundaries", "Form, Structure, and Sense"],
  },
  Algebra: {
    section: SECTIONS.MATH,
    skills: ["Linear Equations", "Linear Functions", "Systems of Equations", "Linear Inequalities"],
  },
  "Advanced Math": {
    section: SECTIONS.MATH,
    skills: ["Nonlinear Functions", "Nonlinear Equations", "Equivalent Expressions"],
  },
  "Problem-Solving and Data Analysis": {
    section: SECTIONS.MATH,
    skills: ["Ratios and Proportions", "Percentages", "Data Interpretation", "Probability"],
  },
  "Geometry and Trigonometry": {
    section: SECTIONS.MATH,
    skills: ["Area and Volume", "Lines/Angles/Triangles", "Right Triangle Trig", "Circles"],
  },
};

export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// The real SAT (digital, and paper before it) has only ever been administered
// in these months since 2023 — confirmed against College Board's own
// dates-and-deadlines page and multiple independent test-prep sources.
// September was added as a new administration month starting fall 2025;
// January, February, April, and July have never had a domestic SAT date in
// this period. Used to keep mock "Month" fields realistic — both filtering
// what the public mock library displays and constraining the admin picker.
export const SAT_TEST_MONTHS = [
  "March",
  "May",
  "June",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
export type SatTestMonth = (typeof SAT_TEST_MONTHS)[number];

export const MISTAKE_TYPES = [
  { id: "concept_gap", label: "Concept gap" },
  { id: "reasoning_error", label: "Reasoning error" },
  { id: "calculation_error", label: "Calculation error" },
  { id: "misread_question", label: "Misread question" },
  { id: "timing_issue", label: "Timing issue" },
  { id: "careless_error", label: "Careless error" },
  { id: "strategy_issue", label: "Strategy issue" },
] as const;
