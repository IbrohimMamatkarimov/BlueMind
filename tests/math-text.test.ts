import assert from "node:assert/strict";
import test from "node:test";
import katex from "katex";
import { convertMathOnlyChoice, convertSlashesToFrac } from "../src/components/MathText";

/** What renderKatex() does with the converted string. A throw is the
 * real-world failure: renderKatex catches it and prints raw LaTeX source in
 * gray instead of the equation. A strict-mode warning is the quieter one —
 * KaTeX renders, but silently drops part of the input. */
function renders(latex: string): string {
  const warnings: string[] = [];
  const html = katex.renderToString(latex, {
    throwOnError: true,
    output: "html",
    strict: (code: string, message: string) => {
      warnings.push(`${message} [${code}]`);
      return "ignore";
    },
  });
  assert.deepEqual(warnings, [], `KaTeX warned on ${latex}`);
  return html;
}

const visibleText = (html: string) => html.replace(/<[^>]+>/g, "");

test("a unit inside \\text{} keeps its literal slash while real division still becomes a fraction", () => {
  const converted = convertSlashesToFrac("12.60 \\text{ m/s}^{2} \\times 3600/1609");
  assert.equal(converted, "12.60 \\text{ m/s}^{2} \\times \\frac{3600}{1609}");
  renders(converted);
});

test("the m/s span from 2026-march-us-b that KaTeX rejected now renders", () => {
  // modules[3].questions[0].rationale — \frac isn't legal in text mode, so
  // descending into \text{ m/s} made KaTeX throw and the student saw source.
  const span =
    "12.60 \\text{ m/s}^{2} \\times \\frac{3600 \\text{ s}^{2}}{1 \\text{ min}^{2}} \\times \\frac{1 \\text{ mi}}{1609 \\text{ m}} \\approx 28.2";
  const converted = convertSlashesToFrac(span);
  assert.equal(converted, span);
  renders(converted);
});

test("every text-mode group is skipped, but a slash between two of them is division", () => {
  for (const cmd of ["text", "textbf", "textit", "mathrm", "operatorname"]) {
    const span = `5 \\${cmd}{ km/h}`;
    assert.equal(convertSlashesToFrac(span), span);
    renders(span);
  }
  assert.equal(convertSlashesToFrac("\\text{m}/\\text{s}"), "\\frac{\\text{m}}{\\text{s}}");
  renders(convertSlashesToFrac("\\text{m}/\\text{s}"));
});

test("ordinary division outside text mode still stacks, including under a radical", () => {
  const converted = convertSlashesToFrac("-1/6 - \\sqrt{109}/6");
  assert.equal(converted, "-\\frac{1}{6} - \\frac{\\sqrt{109}}{6}");
  renders(converted);
});

test("an unterminated text group is left alone rather than swallowing the rest", () => {
  assert.equal(convertSlashesToFrac("\\text{ m/s"), "\\text{ m/s");
});

test("a percentage answer choice keeps the percent sign it is about", () => {
  // "%" opens a comment in LaTeX, so the generated "$35%$" rendered as a
  // bare "35" — in a question whose four choices were all percentages,
  // every one of them lost the sign.
  assert.equal(convertMathOnlyChoice("35%"), "$35\\%$");
  assert.equal(convertMathOnlyChoice("156.00%"), "$156.00\\%$");
  assert.ok(visibleText(renders("35\\%")).includes("%"));
});
