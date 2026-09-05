"use client";

import { Fragment, memo, useMemo } from "react";
import katex from "katex";

/**
 * Renders question/choice text that may contain LaTeX math, italics, and
 * underlines.
 *
 * Authoring convention (used in the admin question editor too):
 *   - Inline math:  $ ... $      e.g. "If $x^2 = 9$, what is $x$?"
 *   - Block math:   $$ ... $$    e.g. on its own line for a standalone equation
 *   - Italic:       *text*       e.g. "adapted from *Culture and Anarchy*"
 *   - Underline:    __text__     e.g. real SAT R&W underlined-portion questions
 *
 * The admin question form's formatting toolbar (FormatToolbar) inserts this
 * exact markup — you don't need to type it by hand, but you can.
 *
 * Plain text (no markup) renders exactly as before — this is a strict
 * superset, so existing questions are unaffected. Line breaks in the source
 * text are preserved.
 *
 * Wrapped in memo() deliberately: the practice pages re-render every second
 * (countdown timers), and without memo that repeated re-render was wiping
 * out the manually-inserted <mark> highlight elements the passage panel adds
 * outside of React (via range.insertNode) almost as soon as a student
 * created them — memo makes React skip this subtree entirely when `text`
 * hasn't changed, so those manual DOM nodes survive.
 */
export const MathText = memo(function MathText({
  text,
  className = "",
  underline,
  mathOnly = false,
}: {
  text: string;
  className?: string;
  underline?: string;
  /** For answer-choice text ONLY. The general safety net below
   * deliberately never converts a bare "a/b" into a stacked fraction —
   * too risky in ordinary prose (dates, ratios in a passage, "and/or").
   * A Math answer choice never has that problem: it's either a pure
   * numeric/symbolic expression or a short verbal phrase, never a
   * sentence with a coincidental slash. Set this to also turn something
   * like "191/(2*sqrt(190))" into a real stacked fraction with a radical
   * in the denominator, matching how it actually looks on the real exam. */
  mathOnly?: boolean;
}) {
  // Splits into up to three chunks around the first case-insensitive match
  // of `underline` (used to underline the exact phrase a vocab-in-context
  // question is asking about, matching real Bluebook's convention) — each
  // chunk still goes through the normal math-aware renderer below.
  const chunks = useMemo(() => {
    const source = mathOnly ? convertMathOnlyChoice(text ?? "") : normalizePlainMathNotation(text ?? "");
    if (!underline) return [{ value: source, underlined: false }];
    const idx = source.toLowerCase().indexOf(underline.toLowerCase());
    if (idx === -1) return [{ value: source, underlined: false }];
    return [
      { value: source.slice(0, idx), underlined: false },
      { value: source.slice(idx, idx + underline.length), underlined: true },
      { value: source.slice(idx + underline.length), underlined: false },
    ];
  }, [text, underline, mathOnly]);

  return (
    <span className={className}>
      {chunks.map((chunk, ci) => {
        const parts = splitMath(chunk.value);
        const rendered = parts.map((part, i) => {
          if (part.type === "text") {
            return <Fragment key={i}>{renderFormattedText(part.value, `${ci}-${i}`)}</Fragment>;
          }
          const html = renderKatex(part.value, part.type === "block");
          return part.type === "block" ? (
            <span key={i} className="block my-2" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
          );
        });
        return chunk.underlined ? (
          <u key={ci} className="decoration-brand-navy">
            {rendered}
          </u>
        ) : (
          <Fragment key={ci}>{rendered}</Fragment>
        );
      })}
    </span>
  );
});

/** Renders one plain-text (non-math) chunk, handling *italic*, __underline__,
 * fill-in-the-blank runs of underscores, and line breaks. */
function renderFormattedText(value: string, keyPrefix: string) {
  const segments = splitFormatting(value);
  return segments.map((seg, si) => {
    const lines = seg.value.split("\n");
    const content = lines.map((line, li) => (
      <Fragment key={li}>
        {li > 0 && <br />}
        {renderLineWithBlanks(line, `${keyPrefix}-${si}-${li}`)}
      </Fragment>
    ));
    const key = `${keyPrefix}-${si}`;
    if (seg.type === "italic") return <em key={key}>{content}</em>;
    if (seg.type === "underline") return <u key={key}>{content}</u>;
    return <Fragment key={key}>{content}</Fragment>;
  });
}

/** Turns a run of 3+ underscores (the standard way question banks write a
 * fill-in-the-blank, e.g. "tend to ______ batteries") into a bold visual
 * blank line instead of thin keyboard underscore characters — matching how
 * the real Digital SAT actually renders blanks. Width scales with the
 * original run length so a short blank and a long blank still look
 * proportionate to each other. */
function renderLineWithBlanks(line: string, keyPrefix: string) {
  const parts = line.split(/(_{3,})/g);
  return parts.map((part, i) =>
    /^_{3,}$/.test(part) ? (
      <span
        key={`${keyPrefix}-blank-${i}`}
        className="inline-block align-baseline border-b-[3px] border-current mx-1"
        style={{ width: `${Math.max(2, part.length * 0.65)}ch` }}
      />
    ) : (
      <Fragment key={`${keyPrefix}-t-${i}`}>{part}</Fragment>
    )
  );
}

type FormatSegment = { type: "text" | "italic" | "underline"; value: string };

/** Tokenizes *italic* and __underline__ markup within a single (already
 * math-free) text chunk. Only an EXACT run of two underscores opens
 * underline markup — a longer run ("______", a fill-in-the-blank) is left
 * as literal text instead, since the naive "first '__' pair" check used to
 * misread adjacent underscores in a blank as a string of empty open/close
 * underline pairs and mangle it. */
function splitFormatting(input: string): FormatSegment[] {
  const segments: FormatSegment[] = [];
  let i = 0;
  let buffer = "";

  const flush = () => {
    if (buffer) {
      segments.push({ type: "text", value: buffer });
      buffer = "";
    }
  };

  while (i < input.length) {
    if (input[i] === "_") {
      let j = i;
      while (input[j] === "_") j++;
      const runLength = j - i;
      if (runLength === 2) {
        const end = input.indexOf("__", i + 2);
        if (end !== -1) {
          flush();
          segments.push({ type: "underline", value: input.slice(i + 2, end) });
          i = end + 2;
          continue;
        }
      }
      // Not exactly a "__...__" pair (could be a single underscore, or a
      // longer blank-line run) — keep the whole run as literal text.
      buffer += input.slice(i, j);
      i = j;
      continue;
    }
    if (input[i] === "*") {
      const end = input.indexOf("*", i + 1);
      if (end !== -1) {
        flush();
        segments.push({ type: "italic", value: input.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    buffer += input[i];
    i++;
  }
  flush();
  return segments;
}

function renderKatex(src: string, block: boolean): string {
  // <= / >= aren't valid LaTeX on their own (KaTeX would render them as
  // separate < and = glyphs, not ≤) — convert to the real comparison
  // macros first so typing plain ASCII inside $...$ still gets the correct
  // symbol, matching the same conversion applied to bare (non-$) text.
  const normalized = src.replace(/<=/g, "\\leq ").replace(/>=/g, "\\geq ");
  // Convert any bare "/" division left inside the LaTeX into a real
  // stacked \frac{}{} — see convertSlashesToFrac's own doc for why this is
  // safe to do unconditionally here (unlike in plain prose).
  const withFractions = convertSlashesToFrac(normalized);
  try {
    return katex.renderToString(withFractions, {
      // strict + throwOnError:false still lets KaTeX dump its own red
      // "parse error" HTML inline for malformed input (e.g. leftover
      // corrupted data from before the toolbar fix) — catch that case
      // ourselves and fall back to showing the raw text plainly instead,
      // so a bad question shows *something* readable rather than an
      // alarming red error dump.
      throwOnError: true,
      displayMode: block,
      output: "html",
    });
  } catch {
    const escaped = src.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<span class="text-brand-slate">${escaped}</span>`;
  }
}

/**
 * Converts a bare "/" division inside an already-confirmed math expression
 * (this runs as the last step before handing the string to KaTeX, so
 * everything reaching it is content between $...$/$$...$$ delimiters) into
 * a real stacked \frac{}{} instead of a plain division slash.
 *
 * Unlike normalizePlainMathNotation's safety net below (which deliberately
 * leaves bare "a/b" alone in plain prose — too risky: dates, ratios,
 * "and/or" all use "/" in ordinary English), there's no ambiguity here:
 * nothing inside a confirmed math segment is ever ordinary prose with a
 * coincidental slash. Every "/" found at this stage IS division and should
 * render as a fraction — this is exactly what was missing for extracted
 * choices like "$-1/6 - \sqrt{109}/6$": already real, already-$-wrapped
 * LaTeX (proven by \sqrt{109} rendering as a correct radical), but with a
 * literal "/" instead of \frac, so it displayed as a division slash
 * instead of a stacked fraction bar.
 */
function convertSlashesToFrac(latex: string): string {
  if (!latex.includes("/")) return latex;
  let result = "";
  let i = 0;
  while (i < latex.length) {
    if (latex[i] === "/") {
      const left = captureFracOperandBackward(result);
      if (left) {
        const right = captureFracOperandForward(latex, i + 1);
        if (right) {
          result = result.slice(0, result.length - left.length);
          result += `\\frac{${left}}{${right.text}}`;
          i = right.nextIndex;
          continue;
        }
      }
    }
    result += latex[i];
    i++;
  }
  return result;
}

/** Mirrors captureBaseBackward, but for a fraction's left-hand operand:
 * either a trailing {...} group (optionally with a \command / \command[n]
 * prefix like \sqrt{109} or \sqrt[3]{x}), or a plain digit/decimal run. */
function captureFracOperandBackward(textSoFar: string): string | null {
  let end = textSoFar.length;
  let start = end;
  if (textSoFar[end - 1] === "}") {
    let depth = 0;
    let k = end - 1;
    for (; k >= 0; k--) {
      if (textSoFar[k] === "}") depth++;
      else if (textSoFar[k] === "{") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (k < 0) return null;
    start = k;
    const before = textSoFar.slice(0, start);
    const cmdMatch = before.match(/\\[a-zA-Z]+(\[[^\]]*\])?$/);
    if (cmdMatch) start -= cmdMatch[0].length;
  } else if (/[A-Za-z0-9.]/.test(textSoFar[end - 1] ?? "")) {
    while (start > 0 && /[A-Za-z0-9.]/.test(textSoFar[start - 1])) start--;
  } else {
    return null;
  }
  if (start === end) return null;
  return textSoFar.slice(start, end);
}

/** Mirrors captureExponentForward, but for a fraction's right-hand operand:
 * a \command{...} / \command[n]{...} group (\sqrt{6}), a bare {...} group,
 * or a plain digit/decimal run. */
function captureFracOperandForward(input: string, start: number): { text: string; nextIndex: number } | null {
  const cmdMatch = input.slice(start).match(/^\\[a-zA-Z]+(\[[^\]]*\])?\{/);
  if (cmdMatch) {
    const braceStart = start + cmdMatch[0].length - 1;
    const close = findMatchingBrace(input, braceStart);
    if (close === -1) return null;
    return { text: input.slice(start, close + 1), nextIndex: close + 1 };
  }
  if (input[start] === "{") {
    const close = findMatchingBrace(input, start);
    if (close === -1) return null;
    return { text: input.slice(start + 1, close), nextIndex: close + 1 };
  }
  const m = input.slice(start).match(/^[A-Za-z0-9.]+/);
  if (!m) return null;
  return { text: m[0], nextIndex: start + m[0].length };
}

type Segment = { type: "text" | "inline" | "block"; value: string };

function splitMath(input: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  let buffer = "";

  const flush = () => {
    if (buffer) {
      segments.push({ type: "text", value: buffer });
      buffer = "";
    }
  };

  while (i < input.length) {
    if (input[i] === "$" && input[i + 1] === "$") {
      const end = input.indexOf("$$", i + 2);
      if (end !== -1) {
        flush();
        segments.push({ type: "block", value: input.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (input[i] === "$") {
      const end = input.indexOf("$", i + 1);
      if (end !== -1) {
        flush();
        segments.push({ type: "inline", value: input.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    buffer += input[i];
    i++;
  }
  flush();
  return segments;
}

/**
 * Safety net for math notation that never got wrapped in $...$ in the
 * first place — most commonly when text is pasted into "Paste & structure
 * with AI" and the source used plain-text conventions like "7m^2" or
 * "sqrt(25)" instead of LaTeX. The AI extraction prompt is instructed to
 * convert these to real LaTeX itself (the more reliable fix, since it can
 * handle arbitrary complexity a regex can't), but this catches whatever
 * slips through that — or gets typed by hand directly into the admin
 * editor without the toolbar.
 *
 * Only ever touches segments that are NOT already inside $...$/$$...$$
 * (reuses splitMath to find those boundaries first) so real, already-
 * correct LaTeX is never double-wrapped or corrupted.
 *
 * Deliberately narrow in scope: simple alphanumeric exponents
 * ("7m^2", "x^{10}", "10^-3") and sqrt(...). Both are unambiguous — that
 * exact character sequence is never valid English prose — so there's no
 * false-positive risk worth guarding against. More ambitious patterns
 * (bare fractions like "1/2", comparison operators like "<=") are
 * deliberately NOT handled here: those characters show up constantly in
 * ordinary non-math text (dates, ratios in a reading passage, code-like
 * snippets), so a regex would cause more harm (mangled prose) than good.
 */
function normalizePlainMathNotation(input: string): string {
  const parts = splitMath(input);
  return parts
    .map((part) => {
      if (part.type === "inline") return `$${part.value}$`;
      if (part.type === "block") return `$$${part.value}$$`;
      return convertBareMathInText(part.value);
    })
    .join("");
}

function convertBareMathInText(input: string): string {
  // Raw, undelimited LaTeX commands (\frac{1}{6}, \sqrt{109}, \pi, etc.)
  // that never got wrapped in $...$ in the first place — most commonly
  // when AI extraction produces real LaTeX syntax but forgets the $
  // delimiters around it (the model is instructed to always wrap math in
  // $...$, but occasionally emits bare LaTeX for a single choice). A
  // backslash followed by a letter sequence is never valid English prose,
  // so this is unambiguous to detect and safe to auto-wrap unconditionally
  // — handled first, before the input is scanned further below.
  input = wrapBareLatexCommands(input);

  let result = "";
  let i = 0;

  while (i < input.length) {
    // Skip over spans we already wrapped in $...$ above — don't let the
    // sqrt(...)/^ handling below reach inside and double-process them.
    if (input[i] === "$") {
      const end = input.indexOf("$", i + 1);
      if (end !== -1) {
        result += input.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }

    // <=  and  >=  → real ≤ / ≥ glyphs (the actual character with the bar
    // under it, not the two-character ASCII approximation) — safe to do
    // unconditionally since that exact two-character sequence never shows
    // up in ordinary English prose, unlike a bare "1/2" which does.
    if (input[i] === "<" && input[i + 1] === "=") {
      result += "\u2264";
      i += 2;
      continue;
    }
    if (input[i] === ">" && input[i + 1] === "=") {
      result += "\u2265";
      i += 2;
      continue;
    }

    // sqrt(...) — including nested parens inside, e.g. sqrt((x+1)*2)
    if (input.startsWith("sqrt(", i)) {
      const closeIdx = findMatchingParen(input, i + 4);
      if (closeIdx !== -1) {
        result += `$\\sqrt{${input.slice(i + 5, closeIdx)}}$`;
        i = closeIdx + 1;
        continue;
      }
    }

    if (input[i] === "^") {
      const base = captureBaseBackward(result);
      if (base) {
        const exponent = captureExponentForward(input, i + 1);
        if (exponent) {
          result = result.slice(0, result.length - base.length);
          result += `$${base}^{${exponent.text}}$`;
          i = exponent.nextIndex;
          continue;
        }
      }
    }

    result += input[i];
    i++;
  }

  return result;
}

/** Recognized LaTeX command names worth auto-wrapping when found bare
 * (outside $...$). Deliberately a fixed list rather than "any \word" —
 * keeps this from ever mistaking something unrelated for math. */
const LATEX_COMMAND_NAMES =
  /\\(frac|sqrt|pi|theta|alpha|beta|gamma|delta|sum|int|infty|times|div|cdot|pm|mp|leq|geq|neq|approx|rightarrow|leftarrow|left|right|text|overline|vec|hat|binom)\b/;

/** Finds every bare (non-$-delimited) run starting with a recognized LaTeX
 * command and wraps it — command name plus all of its immediately-adjoining
 * {...} argument groups (\frac{1}{6}, \sqrt{109}, chained ones like
 * \frac{1}{6}\sqrt{2}) — in $...$. If the ENTIRE input turns out to be
 * nothing but math after removing recognized commands (matching real
 * answer choices like "\frac{1}{6} + \sqrt{109}"), the whole thing is
 * wrapped as one span instead of several adjacent ones, so spacing around
 * "+"/"-" renders correctly as math rather than as prose next to math. */
function wrapBareLatexCommands(input: string): string {
  if (!LATEX_COMMAND_NAMES.test(input)) return input;

  // Already-real math wrapped in $...$ shouldn't be touched — only scan
  // the plain-text segments between existing $ delimiters.
  const segments = splitMath(input);
  return segments
    .map((seg) => {
      if (seg.type !== "text") return seg.type === "inline" ? `$${seg.value}$` : `$$${seg.value}$$`;
      if (!LATEX_COMMAND_NAMES.test(seg.value)) return seg.value;

      const trimmed = seg.value.trim();
      const withoutCommandsAndBraces = trimmed
        .replace(/\\[a-zA-Z]+/g, "") // \sqrt, \frac, \pi, etc.
        .replace(/\\[,;!]/g, "") // \; \, \! — LaTeX spacing commands use punctuation, not letters, so the rule above misses them
        .replace(/[{}\[\]]/g, ""); // braces AND \sqrt[3]{...}'s optional root-index brackets
      const isPureMath = /^[\d\s+\-*/^().,]*$/.test(withoutCommandsAndBraces);
      if (isPureMath) {
        const leading = seg.value.slice(0, seg.value.indexOf(trimmed));
        const trailing = seg.value.slice(seg.value.indexOf(trimmed) + trimmed.length);
        return `${leading}$${trimmed}$${trailing}`;
      }

      // Mixed prose + inline command(s) — wrap just each command span
      // (name + its optional [n] root-index + its {...} argument groups),
      // leaving surrounding text alone.
      let out = "";
      let i = 0;
      while (i < seg.value.length) {
        const rest = seg.value.slice(i);
        const match = rest.match(LATEX_COMMAND_NAMES);
        if (!match || match.index === undefined) {
          out += rest;
          break;
        }
        out += rest.slice(0, match.index);
        let j = i + match.index + match[0].length;
        // \sqrt[3]{...} — consume the optional bracketed root index BEFORE
        // looking for {...} groups, or it gets left behind as literal text
        // (this was the actual bug: \sqrt alone got wrapped in $...$, and
        // "[3]{x^{16}...}" right after it stayed completely unrendered).
        if (seg.value[j] === "[") {
          const closeBracket = seg.value.indexOf("]", j);
          if (closeBracket !== -1) j = closeBracket + 1;
        }
        while (seg.value[j] === "{") {
          const close = findMatchingBrace(seg.value, j);
          if (close === -1) break;
          j = close + 1;
        }
        out += `$${seg.value.slice(i + match.index, j)}$`;
        i = j;
      }
      return out;
    })
    .join("");
}

/** Like findMatchingParen, but for {...} groups. */
function findMatchingBrace(str: string, openIdx: number): number {
  let depth = 0;
  for (let j = openIdx; j < str.length; j++) {
    if (str[j] === "{") depth++;
    else if (str[j] === "}") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/** Given the index of an opening '(' in `str`, returns the index of its
 * matching ')' (honoring nesting), or -1 if unbalanced. */
function findMatchingParen(str: string, openIdx: number): number {
  let depth = 0;
  for (let j = openIdx; j < str.length; j++) {
    if (str[j] === "(") depth++;
    else if (str[j] === ")") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/**
 * Answer-choice-only math conversion (see the `mathOnly` prop doc above).
 * Only activates when the WHOLE choice looks like a pure math expression
 * (nothing but digits/operators/parens/whitespace once "sqrt" is removed)
 * — a real word anywhere in the choice ("For example", "Rooftop hives are
 * illegal") bails out to the normal, conservative rendering path instead.
 */
function convertMathOnlyChoice(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes("$")) return normalizePlainMathNotation(input); // already real LaTeX, or empty — don't touch
  if (!looksLikePureMathExpression(trimmed)) return normalizePlainMathNotation(input);

  let latex = toLatexFragment(trimmed);
  const slashIdx = findTopLevelSlash(latex);
  if (slashIdx !== -1) {
    const numerator = stripOuterParens(latex.slice(0, slashIdx));
    const denominator = stripOuterParens(latex.slice(slashIdx + 1));
    latex = `\\frac{${numerator}}{${denominator}}`;
  }
  return `$${latex}$`;
}

function looksLikePureMathExpression(s: string): boolean {
  const withoutMathWords = s.replace(/sqrt/gi, "");
  return /^[\d\s+\-*/^().,%]+$/.test(withoutMathWords) && /\d/.test(s);
}

/** Like convertBareMathInText, but builds one continuous LaTeX fragment
 * (sqrt -> \sqrt{}, a^b -> a^{b}, '*' dropped for implicit multiplication)
 * instead of wrapping each piece in its own $...$ — needed here since the
 * whole thing may still get wrapped in one outer \frac{}{} afterward. */
function toLatexFragment(input: string): string {
  let result = "";
  let i = 0;
  while (i < input.length) {
    if (input.startsWith("sqrt(", i)) {
      const close = findMatchingParen(input, i + 4);
      if (close !== -1) {
        result += `\\sqrt{${toLatexFragment(input.slice(i + 5, close))}}`;
        i = close + 1;
        continue;
      }
    }
    if (input[i] === "^") {
      const base = captureBaseBackward(result);
      if (base) {
        const exponent = captureExponentForward(input, i + 1);
        if (exponent) {
          result = result.slice(0, result.length - base.length);
          result += `${base}^{${toLatexFragment(exponent.text)}}`;
          i = exponent.nextIndex;
          continue;
        }
      }
    }
    if (input[i] === "*") {
      i++; // implicit multiplication — "2*sqrt(190)" reads as "2√190", no visible dot
      continue;
    }
    result += input[i];
    i++;
  }
  return result;
}

/** Finds a '/' that isn't nested inside (), so "a/(b/c)" correctly treats
 * only the OUTER slash as the fraction bar. */
function findTopLevelSlash(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "{" || s[i] === "(") depth++;
    else if (s[i] === "}" || s[i] === ")") depth--;
    else if (s[i] === "/" && depth === 0) return i;
  }
  return -1;
}

function stripOuterParens(s: string): string {
  const t = s.trim();
  if (t[0] === "(" && t[t.length - 1] === ")" && findMatchingParen(t, 0) === t.length - 1) {
    return t.slice(1, -1);
  }
  return t;
}

/** Looks at the end of the text built up SO FAR (before the '^' we just
 * hit) and captures the base of the exponent expression — handling a
 * trailing parenthesized group (with nesting, e.g. "18.19(1.03)") plus any
 * adjoining alphanumeric/decimal run immediately before it ("18.19"), or
 * just a plain alphanumeric/decimal run on its own ("x", "7m", "10").
 * Returns the captured substring, or null if there's nothing base-shaped
 * to grab (e.g. '^' appearing right after a space or punctuation — not
 * something this should touch). */
function captureBaseBackward(textSoFar: string): string | null {
  let end = textSoFar.length;
  let start = end;

  if (textSoFar[end - 1] === ")") {
    // Walk backward to find this closing paren's matching opener.
    let depth = 0;
    let k = end - 1;
    for (; k >= 0; k--) {
      if (textSoFar[k] === ")") depth++;
      else if (textSoFar[k] === "(") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (k < 0) return null; // unbalanced — bail rather than guess
    start = k;
  }

  // Extend further left over any adjoining alphanumeric/decimal run (the
  // "18.19" before "(1.03)", or just "x"/"7m" if there was no paren group).
  while (start > 0 && /[A-Za-z0-9.]/.test(textSoFar[start - 1])) start--;

  if (start === end) return null; // nothing base-shaped immediately before '^'
  return textSoFar.slice(start, end);
}

/** Captures the exponent immediately after '^' — a parenthesized group
 * (with nesting, outer parens stripped since they become redundant once
 * wrapped in LaTeX's own {}), a {...} group already, or a simple
 * alphanumeric/signed token. Returns null if nothing exponent-shaped
 * follows (so a bare '^' with nothing sensible after it is left alone). */
function captureExponentForward(input: string, start: number): { text: string; nextIndex: number } | null {
  if (input[start] === "(") {
    const closeIdx = findMatchingParen(input, start);
    if (closeIdx === -1) return null;
    return { text: input.slice(start + 1, closeIdx), nextIndex: closeIdx + 1 };
  }
  if (input[start] === "{") {
    const closeIdx = input.indexOf("}", start);
    if (closeIdx === -1) return null;
    return { text: input.slice(start + 1, closeIdx), nextIndex: closeIdx + 1 };
  }
  const m = input.slice(start).match(/^-?[A-Za-z0-9]+/);
  if (!m) return null;
  return { text: m[0], nextIndex: start + m[0].length };
}
