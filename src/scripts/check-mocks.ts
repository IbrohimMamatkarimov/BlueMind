/* eslint-disable no-console */
/**
 * Checks the LaTeX/markup in hand-transcribed mock files before they are
 * imported — the authoring mistakes that survive `db:import-mock` (which
 * only validates structure) but render wrong for a student.
 *
 * Usage:
 *   npm run mocks:check                                  (every set under content/mocks)
 *   npm run mocks:check -- content/mocks/2026-march-us-b (one set, or several)
 *
 * Three checks, all on the fields the app actually renders through
 * <MathText> (passageText, questionText, rationale, explanation and each
 * choice's text):
 *
 *   1. Unbalanced "$". splitMath treats EVERY "$" as a math delimiter and
 *      has no escape handling — "\$8.00" is just as broken as "$8.00" — so
 *      a currency sign either disappears into a math span or pairs up with
 *      a later one and swallows the sentence between them. Write money out
 *      as "8 dollars"; that is the convention across every existing set.
 *   2. KaTeX. Every span is rendered with throwOnError so a span KaTeX
 *      rejects is caught here. In the app it isn't loud: renderKatex
 *      catches the throw and quietly prints the raw LaTeX source in gray,
 *      so a broken equation looks like a typo rather than a bug. KaTeX's
 *      strict-mode warnings are reported too — they flag input that
 *      renders but drops content, e.g. an unescaped "%" commenting out the
 *      rest of the span.
 *   3. Prose inside a math span. English words between "$"s almost always
 *      mean a stray delimiter pairing with a later one — check 1 misses
 *      that whenever the strays happen to be even in number.
 *
 * Every span is fed through the real pipeline imported from
 * ../components/MathText, not a copy of it. That matters: the bug this
 * script exists to catch (\frac generated inside \text{ m/s}) was found by
 * a throwaway copy of that pipeline and would have been missed by a copy
 * that had drifted.
 */
import fs from "fs";
import path from "path";
import katex from "katex";
import {
  convertMathOnlyChoice,
  normalizePlainMathNotation,
  preprocessMathForKatex,
  splitMath,
} from "../components/MathText";

interface MockFileChoice {
  id: string;
  text: string;
}

interface MockFileQuestion {
  number?: number;
  passageText?: string;
  questionText?: string;
  rationale?: string;
  explanation?: string;
  choices?: MockFileChoice[];
}

interface MockFileModule {
  section: string;
  module: number;
  questions: MockFileQuestion[];
}

interface MockFile {
  modules: MockFileModule[];
}

/** Bare (non-backslashed) words that are maths, not prose — KaTeX renders
 * "sin" upright whether or not it was written as \sin, and a mock that
 * spells one without its backslash shouldn't be reported as prose. */
const MATH_WORDS = new Set([
  "sin", "cos", "tan", "sec", "csc", "cot", "arcsin", "arccos", "arctan",
  "sinh", "cosh", "tanh", "log", "ln", "exp", "lim", "min", "max", "mod",
  "det", "gcd", "lcm", "deg",
]);

/** English words inside a math span. Text-mode groups are dropped first —
 * "\text{ nickels}" is a legitimate label — as are all LaTeX command
 * names. What's left must contain a lowercase letter to count: single
 * capitals and all-caps runs are geometry ("$ABC$", "$PQRS$"), not prose. */
function proseWordsIn(span: string): string[] {
  const stripped = span
    .replace(/\\(?:text|textbf|textit|mathrm|mathbf|operatorname)\s*\{[^{}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ");
  const words = stripped.match(/[A-Za-z]{3,}/g) ?? [];
  return words.filter((w) => /[a-z]/.test(w) && !MATH_WORDS.has(w.toLowerCase()));
}

interface Problem {
  where: string;
  detail: string;
}

let spansChecked = 0;

/**
 * Checks one rendered field. `mathOnly` mirrors <MathText>'s prop: answer
 * choices are rendered with it in PracticeExam and without it in FullExam
 * and the admin previews, and the two take different code paths, so a
 * choice is checked both ways and duplicate findings are collapsed.
 */
function checkField(where: string, raw: string, isChoice: boolean): Problem[] {
  if (!raw) return [];
  const problems: Problem[] = [];

  const dollars = (raw.match(/\$/g) ?? []).length;
  if (dollars % 2 === 1) {
    problems.push({
      where,
      detail: `unbalanced "$" (${dollars} of them) — a currency sign? write it as "8 dollars"\n    ${excerpt(raw)}`,
    });
  }

  const seen = new Set<string>();
  const sources = isChoice ? [convertMathOnlyChoice(raw), normalizePlainMathNotation(raw)] : [normalizePlainMathNotation(raw)];
  for (const source of sources) {
    for (const segment of splitMath(source)) {
      if (segment.type === "text") continue;
      spansChecked++;

      // KaTeX's strict warnings are not cosmetic: "commentAtEnd" means an
      // unescaped "%" started a LaTeX comment and everything after it was
      // dropped from the output, which is how a "35%" choice rendered as
      // a bare "35". Capture them instead of letting KaTeX log them.
      const warnings: string[] = [];
      try {
        katex.renderToString(preprocessMathForKatex(segment.value), {
          throwOnError: true,
          displayMode: segment.type === "block",
          output: "html",
          strict: (code: string, message: string) => {
            warnings.push(`${message} [${code}]`);
            return "ignore";
          },
        });
      } catch (err) {
        const message = String(err instanceof Error ? err.message : err).split("\n")[0];
        add(problems, seen, where, `KaTeX rejects this span (the app would print it as raw source)\n    span: ${segment.value}\n    ${message}`);
      }
      for (const warning of new Set(warnings)) {
        add(problems, seen, where, `KaTeX warns on this span — part of it may not render\n    span: ${segment.value}\n    ${warning}`);
      }

      const prose = proseWordsIn(segment.value);
      if (prose.length) {
        add(problems, seen, where, `prose inside a math span — a stray "$" probably paired with a later one\n    span:  ${segment.value}\n    words: ${[...new Set(prose)].join(", ")}`);
      }
    }
  }
  return problems;
}

function add(problems: Problem[], seen: Set<string>, where: string, detail: string) {
  if (seen.has(detail)) return;
  seen.add(detail);
  problems.push({ where, detail });
}

function excerpt(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 160 ? `${oneLine.slice(0, 157)}…` : oneLine;
}

function checkMock(file: string): Problem[] {
  const data = JSON.parse(fs.readFileSync(file, "utf-8")) as MockFile;
  const problems: Problem[] = [];
  for (const mod of data.modules ?? []) {
    for (const [i, q] of (mod.questions ?? []).entries()) {
      const tag = `${mod.section} M${mod.module} Q${q.number ?? i + 1}`;
      for (const field of ["passageText", "questionText", "rationale", "explanation"] as const) {
        problems.push(...checkField(`${tag} ${field}`, q[field] ?? "", false));
      }
      for (const choice of q.choices ?? []) {
        problems.push(...checkField(`${tag} choice ${choice.id}`, choice.text ?? "", true));
      }
    }
  }
  return problems;
}

function mockFiles(): string[] {
  const args = process.argv.slice(2);
  if (args.length) {
    return args.map((arg) => {
      const resolved = path.resolve(process.cwd(), arg);
      const file = resolved.endsWith(".json") ? resolved : path.join(resolved, "mock.json");
      if (!fs.existsSync(file)) {
        console.error(`\n✖ No mock.json at ${file}`);
        process.exit(1);
      }
      return file;
    });
  }
  const root = path.resolve(process.cwd(), "content/mocks");
  return fs
    .readdirSync(root)
    .map((slug) => path.join(root, slug, "mock.json"))
    .filter((file) => fs.existsSync(file))
    .sort();
}

function main() {
  const files = mockFiles();
  let failed = 0;

  for (const file of files) {
    const label = path.relative(process.cwd(), file).replace(/\\/g, "/");
    const problems = checkMock(file);
    if (!problems.length) {
      console.log(`✔ ${label}`);
      continue;
    }
    failed++;
    console.log(`✖ ${label} — ${problems.length} problem(s)`);
    for (const p of problems) console.log(`  • ${p.where}: ${p.detail}`);
  }

  console.log(
    `\n${files.length} mock(s), ${spansChecked} math span(s) checked — ${failed ? `${failed} with problems` : "all clean"}.`
  );
  if (failed) process.exit(1);
}

main();
