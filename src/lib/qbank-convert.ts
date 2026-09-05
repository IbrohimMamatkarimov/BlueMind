/**
 * Converts College Board Question Bank content (the HTML the official
 * satsuitequestionbank.collegeboard.org site renders) into the markup
 * BlueMind stores in `questions` — the same conventions the admin editor
 * and MathText use:
 *
 *   $...$ inline LaTeX, $$...$$ block LaTeX, *italic*, __underline__,
 *   ______ (a run of underscores) for a fill-in-the-blank, "• " bullet
 *   lines for student notes, blank lines between paragraphs.
 *
 * Two source formats exist in the bank:
 *   - "modern" items (external_id): MathML for every formula, inline
 *     <svg> figures, HTML tables.
 *   - "legacy" items (ibn, no external_id): formulas are PNG <img> tags
 *     with a spoken-English alt text ("120 a, plus 100 b, is less than or
 *     equal to 1,100"), which this file turns back into LaTeX.
 *
 * Pure functions only — no DOM, no network — so the importer can run
 * under tsx and the output can be inspected without a database.
 */

/* ---------------------------------------------------------------------- */
/* Tiny tolerant HTML parser                                              */
/* ---------------------------------------------------------------------- */

export type HtmlNode =
  | { type: "el"; name: string; attrs: Record<string, string>; children: HtmlNode[] }
  | { type: "text"; value: string }
  | { type: "svg"; raw: string };

const VOID_ELEMENTS = new Set(["br", "img", "hr", "input", "meta", "link", "wbr", "source", "col", "area", "base"]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", sbquo: "‚", bdquo: "„",
  mdash: "—", ndash: "–", hellip: "…", middot: "·", bull: "•",
  deg: "°", times: "×", divide: "÷", minus: "−", plusmn: "±", le: "≤", ge: "≥",
  ne: "≠", asymp: "≈", equiv: "≡", infin: "∞", radic: "√", sum: "∑", prod: "∏",
  int: "∫", part: "∂", nabla: "∇", isin: "∈", notin: "∉", cap: "∩", cup: "∪",
  sub: "⊂", sup: "⊃", sube: "⊆", supe: "⊇", perp: "⊥", ang: "∠", sdot: "⋅",
  lowast: "∗", prop: "∝", there4: "∴", sim: "∼", cong: "≅", empty: "∅",
  larr: "←", rarr: "→", harr: "↔", uarr: "↑", darr: "↓", rArr: "⇒", lArr: "⇐",
  hArr: "⇔", prime: "′", Prime: "″", frac12: "½", frac14: "¼", frac34: "¾",
  sup1: "¹", sup2: "²", sup3: "³", micro: "µ", para: "¶", sect: "§", copy: "©",
  reg: "®", trade: "™", euro: "€", pound: "£", yen: "¥", cent: "¢",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ",
  omicron: "ο", pi: "π", rho: "ρ", sigma: "σ", sigmaf: "ς", tau: "τ", upsilon: "υ",
  phi: "φ", chi: "χ", psi: "ψ", omega: "ω", Alpha: "Α", Beta: "Β", Gamma: "Γ",
  Delta: "Δ", Epsilon: "Ε", Theta: "Θ", Lambda: "Λ", Pi: "Π", Sigma: "Σ", Phi: "Φ",
  Psi: "Ψ", Omega: "Ω", thinsp: " ", ensp: " ", emsp: " ", zwj: "‍", zwnj: "‌",
  InvisibleTimes: "⁢", it: "⁢", ApplyFunction: "⁡", af: "⁡", InvisibleComma: "⁣", ic: "⁣",
  OverBar: "¯", macr: "¯", circ: "ˆ", tilde: "˜", dot: "˙", ordm: "º", ordf: "ª",
  laquo: "«", raquo: "»", iexcl: "¡", iquest: "¿", shy: "", acute: "´", uml: "¨",
  eacute: "é", egrave: "è", ecirc: "ê", aacute: "á", agrave: "à", acirc: "â",
  iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", ccedil: "ç", ouml: "ö",
  uuml: "ü", auml: "ä", Eacute: "É", ecaron: "ě", scaron: "š", zcaron: "ž",
};

export function decodeEntities(input: string): string {
  if (!input.includes("&")) return input;
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

export function parseHtml(html: string): HtmlNode[] {
  const root: HtmlNode = { type: "el", name: "#root", attrs: {}, children: [] };
  const stack: Extract<HtmlNode, { type: "el" }>[] = [root];
  let i = 0;
  const len = html.length;

  const pushText = (raw: string) => {
    if (!raw) return;
    stack[stack.length - 1].children.push({ type: "text", value: decodeEntities(raw) });
  };

  while (i < len) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      pushText(html.slice(i));
      break;
    }
    if (lt > i) pushText(html.slice(i, lt));
    i = lt;

    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? len : end + 3;
      continue;
    }
    if (html.startsWith("<!", i) || html.startsWith("<?", i)) {
      const end = html.indexOf(">", i + 2);
      i = end === -1 ? len : end + 1;
      continue;
    }
    if (html.startsWith("</", i)) {
      const end = html.indexOf(">", i + 2);
      const name = html
        .slice(i + 2, end === -1 ? len : end)
        .trim()
        .toLowerCase();
      i = end === -1 ? len : end + 1;
      // Pop to the matching open element; ignore stray closers.
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].name === name) {
          stack.length = s;
          break;
        }
      }
      continue;
    }

    // Opening tag
    const nameMatch = /^<([A-Za-z][A-Za-z0-9:_-]*)/.exec(html.slice(i, i + 64));
    if (!nameMatch) {
      // A bare "<" in text (e.g. "x < 5" written without an entity).
      pushText("<");
      i += 1;
      continue;
    }
    const name = nameMatch[1].toLowerCase();
    let j = i + nameMatch[0].length;
    const attrs: Record<string, string> = {};
    let selfClosing = false;
    while (j < len) {
      while (j < len && /\s/.test(html[j])) j++;
      if (html[j] === ">") {
        j++;
        break;
      }
      if (html[j] === "/" ) {
        selfClosing = true;
        j++;
        continue;
      }
      const attrMatch = /^([^\s=\/>]+)/.exec(html.slice(j, j + 256));
      if (!attrMatch) {
        j++;
        continue;
      }
      const attrName = attrMatch[1].toLowerCase();
      j += attrMatch[0].length;
      while (j < len && /\s/.test(html[j])) j++;
      let value = "";
      if (html[j] === "=") {
        j++;
        while (j < len && /\s/.test(html[j])) j++;
        const quote = html[j];
        if (quote === '"' || quote === "'") {
          const end = html.indexOf(quote, j + 1);
          value = html.slice(j + 1, end === -1 ? len : end);
          j = end === -1 ? len : end + 1;
        } else {
          const m = /^[^\s>]*/.exec(html.slice(j));
          value = m ? m[0] : "";
          j += value.length;
        }
      }
      attrs[attrName] = decodeEntities(value);
    }

    if (name === "svg") {
      // Keep the SVG source verbatim (it becomes an image), skipping any
      // nested <svg> pairs so the closing tag lines up.
      let depth = 1;
      let k = j;
      let end = len;
      while (k < len) {
        const nextOpen = html.indexOf("<svg", k);
        const nextClose = html.indexOf("</svg", k);
        if (nextClose === -1) break;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          k = nextOpen + 4;
          continue;
        }
        depth--;
        const closeEnd = html.indexOf(">", nextClose);
        k = closeEnd === -1 ? len : closeEnd + 1;
        if (depth === 0) {
          end = k;
          break;
        }
      }
      stack[stack.length - 1].children.push({ type: "svg", raw: html.slice(i, end) });
      i = end;
      continue;
    }

    if (name === "script" || name === "style") {
      const closeIdx = html.toLowerCase().indexOf(`</${name}`, j);
      const closeEnd = closeIdx === -1 ? len : html.indexOf(">", closeIdx);
      i = closeEnd === -1 ? len : closeEnd + 1;
      continue;
    }

    const el: Extract<HtmlNode, { type: "el" }> = { type: "el", name, attrs, children: [] };
    stack[stack.length - 1].children.push(el);
    if (!selfClosing && !VOID_ELEMENTS.has(name)) stack.push(el);
    i = j;
  }
  return root.children;
}

/* ---------------------------------------------------------------------- */
/* LaTeX helpers                                                          */
/* ---------------------------------------------------------------------- */

/** Unicode / operator characters → LaTeX, for MathML operators and the
 * occasional symbol in plain text. */
const CHAR_TO_LATEX: Record<string, string> = {
  "−": "-", "–": "-", "—": "-",
  "×": "\\times ", "·": "\\cdot ", "⋅": "\\cdot ", "∙": "\\cdot ", "÷": "\\div ",
  "≤": "\\le ", "≥": "\\ge ", "≠": "\\ne ", "±": "\\pm ", "∓": "\\mp ",
  "∞": "\\infty ", "°": "^{\\circ}", "√": "\\surd ",
  "π": "\\pi ", "θ": "\\theta ", "α": "\\alpha ", "β": "\\beta ", "γ": "\\gamma ",
  "δ": "\\delta ", "Δ": "\\Delta ", "ε": "\\varepsilon ", "λ": "\\lambda ", "μ": "\\mu ",
  "µ": "\\mu ", "σ": "\\sigma ", "Σ": "\\Sigma ", "τ": "\\tau ", "φ": "\\varphi ",
  "ϕ": "\\phi ", "ω": "\\omega ", "Ω": "\\Omega ", "ρ": "\\rho ", "ν": "\\nu ",
  "κ": "\\kappa ", "η": "\\eta ", "ζ": "\\zeta ", "ξ": "\\xi ", "χ": "\\chi ",
  "ψ": "\\psi ", "Γ": "\\Gamma ", "Θ": "\\Theta ", "Λ": "\\Lambda ", "Π": "\\Pi ",
  "Φ": "\\Phi ", "Ψ": "\\Psi ", "ι": "\\iota ", "ο": "o",
  "∠": "\\angle ", "△": "\\triangle ", "∆": "\\triangle ", "≈": "\\approx ", "≅": "\\cong ",
  "∼": "\\sim ", "⊥": "\\perp ", "∥": "\\parallel ", "→": "\\to ", "←": "\\leftarrow ",
  "↔": "\\leftrightarrow ", "⇒": "\\Rightarrow ", "⇔": "\\Leftrightarrow ", "∈": "\\in ",
  "∉": "\\notin ", "∪": "\\cup ", "∩": "\\cap ", "∅": "\\varnothing ", "…": "\\ldots ",
  "⋯": "\\cdots ", "′": "'", "″": "''", "∘": "\\circ ", "∗": "*", "∑": "\\sum ",
  "∏": "\\prod ", "∫": "\\int ", "∂": "\\partial ", "∇": "\\nabla ", "∝": "\\propto ",
  "∴": "\\therefore ", "∵": "\\because ", "≡": "\\equiv ", "⊂": "\\subset ", "⊆": "\\subseteq ",
  "ℝ": "\\mathbb{R}", "½": "\\tfrac{1}{2}", "¼": "\\tfrac{1}{4}", "¾": "\\tfrac{3}{4}",
  "²": "^{2}", "³": "^{3}", "¹": "^{1}", "ℓ": "\\ell ", "⁄": "/", "∣": "\\mid ",
  "‖": "\\|", "⌢": "\\frown ", "⏜": "\\frown ", "⁢": "", "⁡": "", "⁣": "",
  "​": "", " ": "\\ ", " ": "\\,", " ": "\\ ", " ": "\\quad ",
  "{": "\\{", "}": "\\}", "%": "\\%", "$": "\\text{\\textdollar}", "&": "\\&", "#": "\\#", "_": "\\_",
  "¯": "\\bar{}", "’": "'", "‘": "`", "“": "``", "”": "''",
};

const FUNCTION_NAMES = new Set([
  "sin", "cos", "tan", "sec", "csc", "cot", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh",
  "log", "ln", "exp", "lim", "max", "min", "det", "gcd", "deg", "dim", "arg", "lg",
]);

/** Escapes a run of plain text for use inside \text{...}. */
export function escapeLatexText(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash ")
    .replace(/([{}%$&#_])/g, "\\$1")
    .replace(/\^/g, "\\textasciicircum ")
    .replace(/~/g, "\\textasciitilde ")
    .replace(/ /g, "~")
    .replace(/−/g, "-");
}

function latexForChar(ch: string): string {
  if (CHAR_TO_LATEX[ch] !== undefined) return CHAR_TO_LATEX[ch];
  return ch;
}

function latexNumber(raw: string): string {
  // "1,100" → 1{,}100 so KaTeX doesn't insert a thin space after the comma
  return raw.trim().replace(/,/g, "{,}");
}

/* ---------------------------------------------------------------------- */
/* MathML → LaTeX                                                         */
/* ---------------------------------------------------------------------- */

type El = Extract<HtmlNode, { type: "el" }>;

function elementChildren(node: El): HtmlNode[] {
  return node.children.filter((c) => !(c.type === "text" && c.value.trim() === ""));
}

function textContent(node: HtmlNode): string {
  if (node.type === "text") return node.value;
  if (node.type === "svg") return "";
  return node.children.map(textContent).join("");
}

/** Wraps `inner` in a fence pair, using \left/\right only when the content
 * is tall (fractions, roots, arrays) - plain parentheses otherwise, which
 * matches how the original MathML renders and keeps spacing tight. */
function fence(open: string, inner: string, close: string): string {
  const tall = /\\(frac|tfrac|dfrac|binom|sqrt|begin\{array\}|sum|prod|int|overset|underset)\b/.test(inner) || /\^\{[^}]*\\frac/.test(inner);
  if (tall || open === "." || close === ".") return `\\left${open}${inner}\\right${close}`;
  return `${open}${inner}${close}`;
}

class MathmlConverter {
  warnings: string[] = [];

  convert(math: El): string {
    return this.row(elementChildren(math)).trim();
  }

  private row(children: HtmlNode[]): string {
    // A row that is wrapped in ( ... ) / [ ... ] / | ... | gets \left/\right
    // so fractions inside stretch the fence like the original rendering.
    if (children.length >= 2) {
      const first = children[0];
      const last = children[children.length - 1];
      if (first.type === "el" && first.name === "mo" && last.type === "el" && last.name === "mo") {
        const open = textContent(first).trim();
        const close = textContent(last).trim();
        const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", "|": "|" };
        if (pairs[open] === close && children.length > 2) {
          const inner = this.row(children.slice(1, -1));
          const o = open === "{" ? "\\{" : open;
          const c = close === "}" ? "\\}" : close;
          return fence(o, inner, c);
        }
      }
    }
    return children.map((c) => this.node(c)).join("");
  }

  private node(node: HtmlNode): string {
    if (node.type === "text") return this.textRun(node.value);
    if (node.type === "svg") return "";
    const kids = elementChildren(node);
    const nth = (i: number) => (kids[i] ? this.node(kids[i]) : "{}");
    switch (node.name) {
      case "math":
      case "mrow":
      case "mstyle":
      case "mpadded":
      case "merror":
      case "maction":
        return this.row(kids);
      case "semantics":
        return kids.length ? this.node(kids[0]) : "";
      case "annotation":
      case "annotation-xml":
        return "";
      case "mi":
        return this.identifier(node);
      case "mn":
        return latexNumber(textContent(node));
      case "mo":
        return this.operator(node);
      case "mtext":
        return this.mtext(node);
      case "mspace":
        return "\\ ";
      case "mfrac": {
        const linethickness = node.attrs["linethickness"];
        if (linethickness === "0" || linethickness === "0px") return `\\binom{${nth(0)}}{${nth(1)}}`;
        return `\\frac{${nth(0)}}{${nth(1)}}`;
      }
      case "msup":
        return `{${nth(0)}}^{${nth(1)}}`;
      case "msub":
        return `{${nth(0)}}_{${nth(1)}}`;
      case "msubsup":
        return `{${nth(0)}}_{${nth(1)}}^{${nth(2)}}`;
      case "msqrt":
        return `\\sqrt{${this.row(kids)}}`;
      case "mroot":
        return `\\sqrt[${nth(1)}]{${nth(0)}}`;
      case "mfenced": {
        const open = node.attrs["open"] ?? "(";
        const close = node.attrs["close"] ?? ")";
        const seps = (node.attrs["separators"] ?? ",").replace(/\s+/g, "");
        const parts = kids.map((k) => this.node(k));
        let inner = "";
        parts.forEach((p, idx) => {
          if (idx > 0) inner += seps[Math.min(idx - 1, seps.length - 1)] ?? ",";
          inner += p;
        });
        const o = open === "" ? "." : open === "{" ? "\\{" : open;
        const c = close === "" ? "." : close === "}" ? "\\}" : close;
        return fence(o, inner, c);
      }
      case "mover":
        return this.over(kids);
      case "munder":
        return this.under(kids);
      case "munderover": {
        const base = nth(0);
        const isBigOp = /\\(sum|prod|int|lim)\b/.test(base) || /^\s*\\lim/.test(base);
        if (isBigOp) return `${base}_{${nth(1)}}^{${nth(2)}}`;
        return `\\overset{${nth(2)}}{\\underset{${nth(1)}}{${base}}}`;
      }
      case "mtable":
        return this.table(node);
      case "mtr":
      case "mlabeledtr":
        return kids.map((k) => this.node(k)).join(" & ");
      case "mtd":
        return this.row(kids);
      case "menclose": {
        const notation = (node.attrs["notation"] ?? "").toLowerCase();
        const inner = this.row(kids);
        if (notation.includes("updiagonalstrike") || notation.includes("downdiagonalstrike")) return `\\cancel{${inner}}`;
        if (notation.includes("box") || notation.includes("roundedbox")) return `\\boxed{${inner}}`;
        if (notation.includes("top") || notation.includes("longdiv")) return `\\overline{${inner}}`;
        if (notation.includes("bottom")) return `\\underline{${inner}}`;
        return inner;
      }
      case "mphantom":
        return `\\phantom{${this.row(kids)}}`;
      case "mmultiscripts":
        return this.row(kids.slice(0, 1));
      case "mglyph":
      case "malignmark":
      case "maligngroup":
        return "";
      default:
        this.warnings.push(`unknown MathML element <${node.name}>`);
        return this.row(kids);
    }
  }

  private textRun(raw: string): string {
    const value = raw.replace(/\s+/g, " ").trim();
    if (!value) return "";
    return value
      .split("")
      .map((ch) => latexForChar(ch))
      .join("");
  }

  private identifier(node: El): string {
    const raw = textContent(node).trim();
    if (!raw) return "";
    const variant = (node.attrs["mathvariant"] ?? "").toLowerCase();
    if (raw.length === 1) {
      const mapped = latexForChar(raw);
      if (variant === "normal" && /^[A-Za-z]$/.test(raw)) return `\\mathrm{${raw}}`;
      if (variant === "bold") return `\\mathbf{${mapped}}`;
      return mapped;
    }
    const lower = raw.toLowerCase();
    if (FUNCTION_NAMES.has(lower)) return `\\${lower} `;
    if (/^[A-Za-z]+$/.test(raw)) {
      // Multi-letter identifiers render upright in MathML (units, point
      // names like ABC). \mathrm keeps them upright without \text spacing.
      return variant === "italic" ? raw : `\\mathrm{${raw}}`;
    }
    // Mixed content (e.g. "$", "%", "sin²") — treat char by char.
    return raw
      .split("")
      .map((ch) => latexForChar(ch))
      .join("");
  }

  private operator(node: El): string {
    const raw = textContent(node).trim();
    if (!raw) return "";
    const known: Record<string, string> = {
      "-": "-", "+": "+", "=": "=", "<": "<", ">": ">", "/": "/", "(": "(", ")": ")", "[": "[", "]": "]",
      "{": "\\{", "}": "\\}", "|": "|", ",": ",", ".": ".", ":": ":", ";": ";", "!": "!", "?": "?", "'": "'",
      "*": "\\ast ", "^": "^", "⁢": "", "⁡": "", "⁣": "", "lim": "\\lim ", "mod": "\\bmod ",
    };
    if (known[raw] !== undefined) return known[raw];
    if (raw.length === 1) return latexForChar(raw);
    if (FUNCTION_NAMES.has(raw.toLowerCase())) return `\\${raw.toLowerCase()} `;
    if (/^[A-Za-z]+$/.test(raw)) return `\\operatorname{${raw}}`;
    return raw
      .split("")
      .map((ch) => latexForChar(ch))
      .join("");
  }

  private mtext(node: El): string {
    const raw = textContent(node);
    if (raw.trim() === "") return raw.length > 0 ? "\\ " : "";
    const leading = /^\s/.test(raw) ? "\\ " : "";
    const trailing = /\s$/.test(raw) ? "\\ " : "";
    return `${leading}\\text{${escapeLatexText(raw.trim())}}${trailing}`;
  }

  private over(kids: HtmlNode[]): string {
    if (kids.length < 2) return this.row(kids);
    const base = this.node(kids[0]);
    const accent = textContent(kids[1]).trim();
    const accents: Record<string, string> = {
      "¯": "\\overline", "‾": "\\overline", "_": "\\overline", "-": "\\overline", "―": "\\overline",
      "^": "\\hat", "ˆ": "\\hat", "~": "\\tilde", "˜": "\\tilde", "→": "\\overrightarrow",
      "⃗": "\\vec", "˙": "\\dot", ".": "\\dot", "¨": "\\ddot", "⌢": "\\overset{\\frown}",
      "⏜": "\\overset{\\frown}", "↔": "\\overleftrightarrow", "⏞": "\\overbrace",
    };
    if (accents[accent]) return `${accents[accent]}{${base}}`;
    return `\\overset{${this.node(kids[1])}}{${base}}`;
  }

  private under(kids: HtmlNode[]): string {
    if (kids.length < 2) return this.row(kids);
    const base = this.node(kids[0]);
    const under = textContent(kids[1]).trim();
    if (under === "_" || under === "¯" || under === "―") return `\\underline{${base}}`;
    if (under === "⏟") return `\\underbrace{${base}}`;
    if (/\\(sum|prod|int|lim|max|min)\b/.test(base)) return `${base}_{${this.node(kids[1])}}`;
    return `\\underset{${this.node(kids[1])}}{${base}}`;
  }

  private table(node: El): string {
    const rows = elementChildren(node).filter((r) => r.type === "el" && (r.name === "mtr" || r.name === "mlabeledtr")) as El[];
    if (rows.length === 0) return this.row(elementChildren(node));
    const align = (node.attrs["columnalign"] ?? "center").split(/\s+/);
    const width = Math.max(...rows.map((r) => elementChildren(r).length), 1);
    const spec = Array.from({ length: width }, (_, i) => {
      const a = (align[Math.min(i, align.length - 1)] ?? "center").toLowerCase();
      return a.startsWith("l") ? "l" : a.startsWith("r") ? "r" : "c";
    }).join("");
    const body = rows.map((r) => this.node(r)).join(" \\\\ ");
    return `\\begin{array}{${spec}}${body}\\end{array}`;
  }
}

/** Converts one <math> element to LaTeX (no $ delimiters). */
export function mathmlToLatex(math: HtmlNode): { latex: string; warnings: string[] } {
  if (math.type !== "el") return { latex: "", warnings: [] };
  const conv = new MathmlConverter();
  const latex = conv.convert(math);
  return { latex: tidyLatex(latex), warnings: conv.warnings };
}

function tidyLatex(latex: string): string {
  return latex
    .replace(/\s+/g, " ")
    .replace(/\\left\(\s*\\right\)/g, "()")
    .replace(/\{\}\^/g, "^")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();
}

/* ---------------------------------------------------------------------- */
/* Spoken math (MathSpeak / legacy alt text) → LaTeX                       */
/* ---------------------------------------------------------------------- */

const SPOKEN_WORDS: Record<string, string> = {
  plus: "+", minus: "-", negative: "-", times: "\\times ", dot: "\\cdot ", equals: "=", equal: "=",
  percent: "\\%", degrees: "^{\\circ}", degree: "^{\\circ}", pi: "\\pi ", theta: "\\theta ", alpha: "\\alpha ",
  beta: "\\beta ", gamma: "\\gamma ", delta: "\\delta ", lambda: "\\lambda ", sigma: "\\sigma ", omega: "\\omega ",
  mu: "\\mu ", phi: "\\phi ", rho: "\\rho ", tau: "\\tau ", epsilon: "\\varepsilon ",
  infinity: "\\infty ", angle: "\\angle ", triangle: "\\triangle ", prime: "'", comma: ",", colon: ":",
  semicolon: ";", ellipsis: "\\ldots ", "dot-dot-dot": "\\ldots ", approximately: "\\approx ", congruent: "\\cong ",
  similar: "\\sim ", perpendicular: "\\perp ", parallel: "\\parallel ", element: "\\in ", union: "\\cup ",
  intersection: "\\cap ", therefore: "\\therefore ", sine: "\\sin ", cosine: "\\cos ", tangent: "\\tan ",
  sin: "\\sin ", cos: "\\cos ", tan: "\\tan ", log: "\\log ", ln: "\\ln ", squared: "^{2}", cubed: "^{3}",
  factorial: "!", bar: "\\bar{}", dollar: "\\text{\\textdollar}", dollars: "\\text{\\textdollar}", cents: "\\text{\\textcent}",
  "half": "\\tfrac{1}{2}", "third": "\\tfrac{1}{3}", "fourth": "\\tfrac{1}{4}", "quarter": "\\tfrac{1}{4}",
  "tenth": "\\tfrac{1}{10}",
};

class SpokenMathParser {
  private tokens: string[];
  private pos = 0;

  constructor(text: string) {
    const cleaned = text
      .replace(/−/g, "-")
      .replace(/[‘’]/g, "'")
      .replace(/([A-Za-z0-9.])[,;](?=\s|$)/g, "$1") // pauses ("120 a, plus") → drop the comma
      .replace(/\s+/g, " ")
      .trim();
    this.tokens = cleaned ? cleaned.split(" ") : [];
  }

  parse(): string {
    return tidyLatex(this.sequence(() => false));
  }

  private peek(offset = 0): string | undefined {
    return this.tokens[this.pos + offset];
  }
  private peekLower(offset = 0): string {
    return (this.peek(offset) ?? "").toLowerCase();
  }
  private next(): string {
    return this.tokens[this.pos++] ?? "";
  }
  private accept(...words: string[]): boolean {
    for (let i = 0; i < words.length; i++) {
      if (this.peekLower(i) !== words[i]) return false;
    }
    this.pos += words.length;
    return true;
  }

  private sequence(stop: () => boolean): string {
    let out = "";
    while (this.pos < this.tokens.length && !stop()) {
      const before = this.pos;
      out += this.term(out);
      if (this.pos === before) this.pos++; // safety: never loop forever
    }
    return out;
  }

  private nestedStop(word: string, level: number): string {
    // MathSpeak nests fractions as StartStartFraction / OverOver / EndEndFraction
    const prefix = word === "over" ? "over".repeat(level) : word;
    return prefix;
  }

  private term(soFar: string): string {
    const lower = this.peekLower();
    if (!lower) return "";

    // --- Fractions: Start(Start)*Fraction ... Over(Over)* ... End(End)*Fraction
    const fracStart = /^((?:start)+)fraction$/.exec(lower);
    if (fracStart) {
      const level = fracStart[1].length / "start".length;
      this.next();
      const overWord = "over".repeat(level);
      const endWord = `${"end".repeat(level)}fraction`;
      const num = this.sequence(() => this.peekLower() === overWord);
      this.accept(overWord);
      const den = this.sequence(() => this.peekLower() === endWord);
      this.accept(endWord);
      return `\\frac{${num}}{${den}}`;
    }
    if (/^((?:start)+)binomialorfraction$/.test(lower)) {
      this.next();
      const num = this.sequence(() => this.peekLower().startsWith("choose"));
      this.accept("choose");
      const den = this.sequence(() => /^((?:end)+)binomialorfraction$/.test(this.peekLower()));
      this.next();
      return `\\binom{${num}}{${den}}`;
    }

    // --- Roots
    if (lower === "rootindex") {
      this.next();
      const index = this.sequence(() => this.peekLower() === "startroot");
      this.accept("startroot");
      const radicand = this.sequence(() => this.peekLower() === "endroot");
      this.accept("endroot");
      return `\\sqrt[${index}]{${radicand}}`;
    }
    if (lower === "startroot") {
      this.next();
      const radicand = this.sequence(() => this.peekLower() === "endroot");
      this.accept("endroot");
      return `\\sqrt{${radicand}}`;
    }
    if (this.accept("the", "square", "root", "of") || this.accept("square", "root", "of")) {
      return `\\sqrt{${this.atom()}}`;
    }
    if (this.accept("the", "cube", "root", "of") || this.accept("cube", "root", "of")) {
      return `\\sqrt[3]{${this.atom()}}`;
    }

    // --- Absolute value
    if (lower === "startabsolutevalue") {
      this.next();
      const inner = this.sequence(() => this.peekLower() === "endabsolutevalue");
      this.accept("endabsolutevalue");
      return `\\left|${inner}\\right|`;
    }
    if (this.accept("the", "absolute", "value", "of") || this.accept("absolute", "value", "of")) {
      const inner = this.sequence(() => this.atComparison());
      return `\\left|${inner}\\right|`;
    }

    // --- Fences
    if (lower === "left" || lower === "open") {
      const kind = this.peekLower(1);
      const fenceOpen: Record<string, string> = { parenthesis: "(", paren: "(", bracket: "[", brace: "\\{", bar: "|" };
      if (fenceOpen[kind]) {
        this.pos += 2;
        const closeWord = lower === "left" ? "right" : "close";
        const inner = this.sequence(() => this.peekLower() === closeWord && this.peekLower(1) === kind);
        this.accept(closeWord, kind);
        const close: Record<string, string> = { parenthesis: ")", paren: ")", bracket: "]", brace: "\\}", bar: "|" };
        return fence(fenceOpen[kind], inner, close[kind]);
      }
    }
    if ((lower === "right" || lower === "close") && /^(parenthesis|paren|bracket|brace|bar)$/.test(this.peekLower(1))) {
      // unmatched closer — emit literally
      const kind = this.peekLower(1);
      this.pos += 2;
      return { parenthesis: ")", paren: ")", bracket: "]", brace: "\\}", bar: "|" }[kind] ?? "";
    }

    // --- Scripts
    if (lower === "superscript" || lower === "subscript") {
      this.next();
      const isSup = lower === "superscript";
      const inner = this.sequence(
        () => this.peekLower() === "baseline" || this.peekLower() === "superscript" || this.peekLower() === "subscript"
      );
      this.accept("baseline");
      return isSup ? `^{${inner}}` : `_{${inner}}`;
    }
    if (lower === "sub" && this.peek(1)) {
      this.next();
      return `_{${this.atom()}}`;
    }
    if (this.accept("to", "the", "power", "of") || this.accept("raised", "to", "the", "power", "of")) {
      return `^{${this.atom()}}`;
    }
    if (this.accept("to", "the")) {
      const exp = this.atom();
      this.accept("power");
      return `^{${exp}}`;
    }
    if (lower === "baseline") {
      this.next();
      return "";
    }

    // --- Modifiers (bars, arrows)
    if (lower === "modifyingabove" || lower === "modifyingbelow") {
      this.next();
      const base = this.sequence(() => this.peekLower() === "with");
      this.accept("with");
      const what = this.next().toLowerCase();
      const map: Record<string, string> = {
        bar: "\\overline", "right-arrow": "\\overrightarrow", arrow: "\\overrightarrow", caret: "\\hat",
        dot: "\\dot", tilde: "\\tilde", "left-right-arrow": "\\overleftrightarrow", frown: "\\overset{\\frown}",
      };
      return `${map[what] ?? "\\overline"}{${base}}`;
    }
    if (lower === "overbar" || lower === "with-bar") {
      this.next();
      return "";
    }

    // --- Comparisons
    if (lower === "is") {
      this.next();
      if (this.accept("not", "equal", "to") || this.accept("not", "equals")) return "\\ne ";
      if (this.accept("equal", "to") || this.accept("equals")) return "=";
      if (this.accept("approximately", "equal", "to") || this.accept("approximately")) return "\\approx ";
      return this.comparison() ?? "";
    }
    const cmp = this.comparison();
    if (cmp !== null) return cmp;
    if (this.accept("not", "equal", "to") || this.accept("does", "not", "equal") || this.accept("not", "equals")) return "\\ne ";
    if (this.accept("plus", "or", "minus")) return "\\pm ";
    if (this.accept("divided", "by")) return "\\div ";
    if (this.accept("multiplied", "by")) return "\\times ";

    // --- Simple binary "a over b" (legacy alt text)
    if (lower === "over") {
      this.next();
      const left = lastAtom(soFar);
      const right = this.atom();
      if (left) return ` FRAC${left.length} \\frac{${left}}{${right}}`; // marker handled by caller
      return `/${right}`;
    }

    return this.atom();
  }

  /** True when the next tokens start a comparison ("is", "equals", "less than"...). */
  private atComparison(): boolean {
    const w = this.peekLower();
    return w === "is" || w === "equals" || w === "less" || w === "greater" || w === "not" || w === "";
  }

  private comparison(): string | null {
    if (this.accept("less", "than", "or", "equal", "to")) return "\\le ";
    if (this.accept("greater", "than", "or", "equal", "to")) return "\\ge ";
    if (this.accept("less", "than")) return "<";
    if (this.accept("greater", "than")) return ">";
    if (this.accept("less-than-or-equal-to")) return "\\le ";
    if (this.accept("greater-than-or-equal-to")) return "\\ge ";
    if (this.accept("not-equal-to") || this.accept("not-equals")) return "\\ne ";
    return null;
  }

  /** One token's worth of LaTeX (a number, a letter, a word). */
  private atom(): string {
    const tok = this.next();
    if (!tok) return "";
    const lower = tok.toLowerCase();
    if (/^-?\d[\d,]*(\.\d+)?$/.test(tok) || /^-?\.\d+$/.test(tok)) return latexNumber(tok);
    if (SPOKEN_WORDS[lower] !== undefined) return SPOKEN_WORDS[lower];
    if (/^[A-Za-z]$/.test(tok)) return tok;
    if (tok.length === 1) return latexForChar(tok);
    if (/^[A-Za-z]'+$/.test(tok)) return tok;
    if (lower === "the" || lower === "of" || lower === "a" || lower === "an" || lower === "and") return "";
    if (/^[A-Za-z][A-Za-z-]*$/.test(tok)) return `\\text{${tok}}`;
    return tok
      .split("")
      .map((ch) => latexForChar(ch))
      .join("");
  }
}

/** Captures the trailing operand of a LaTeX string for "a over b". */
function lastAtom(latex: string): string {
  const trimmed = latex.trimEnd();
  const m = /(\\frac\{[^{}]*\}\{[^{}]*\}|[A-Za-z0-9.{},]+(\^\{[^}]*\})?|\\[a-zA-Z]+ ?)$/.exec(trimmed);
  return m ? m[0] : "";
}

/** Turns spoken math ("StartFraction 12 x plus 28 Over 4 EndFraction",
 * "120 a, plus 100 b, is less than or equal to 1,100") into LaTeX. */
export function spokenMathToLatex(text: string): string {
  const parser = new SpokenMathParser(text);
  let out = parser.parse();
  // Resolve "a over b" markers:  FRAC<n>  means "drop the previous
  // n characters, they were folded into the \frac that follows".
  const marker = / FRAC(\d+) /;
  let m = marker.exec(out);
  while (m) {
    const n = Number(m[1]);
    const before = out.slice(0, m.index).trimEnd();
    out = before.slice(0, Math.max(0, before.length - n)) + out.slice(m.index + m[0].length);
    m = marker.exec(out);
  }
  return tidyLatex(out);
}

/* ---------------------------------------------------------------------- */
/* HTML fragment → BlueMind markup                                        */
/* ---------------------------------------------------------------------- */

export type ImageRef = { kind: "svg"; svg: string } | { kind: "data"; dataUrl: string } | { kind: "url"; src: string };

export interface FragmentResult {
  text: string;
  images: ImageRef[];
  warnings: string[];
}

type Block = { kind: "p" | "li" | "math" | "table"; text: string };

const BLOCK_ELEMENTS = new Set([
  "p", "div", "ul", "ol", "li", "table", "blockquote", "figure", "figcaption", "h1", "h2", "h3", "h4", "h5", "h6",
  "section", "article", "header", "footer", "pre", "hr", "dl", "dt", "dd", "caption",
]);

class FragmentConverter {
  images: ImageRef[] = [];
  warnings: string[] = [];
  private blocks: Block[] = [];

  run(nodes: HtmlNode[]): FragmentResult {
    this.blocks = [];
    this.walkBlocks(nodes);
    const text = joinBlocks(this.blocks);
    return { text, images: this.images, warnings: this.warnings };
  }

  /** Splits a node list into paragraphs/lines. Inline runs between block
   * elements become their own paragraph. */
  private walkBlocks(nodes: HtmlNode[], listPrefix = "") {
    let inlineRun: HtmlNode[] = [];
    const flushInline = () => {
      if (inlineRun.length === 0) return;
      const text = this.inline(inlineRun).trim();
      inlineRun = [];
      if (text) this.blocks.push({ kind: listPrefix ? "li" : "p", text: listPrefix + text });
    };

    for (const node of nodes) {
      if (node.type === "text") {
        inlineRun.push(node);
        continue;
      }
      if (node.type === "svg") {
        this.pushSvg(node.raw);
        continue;
      }
      if (isHiddenForSightedUsers(node)) continue;
      if (!BLOCK_ELEMENTS.has(node.name)) {
        // <math display="block"> standing on its own also counts as a block.
        if (node.name === "math" && (node.attrs["display"] ?? "").toLowerCase() === "block") {
          flushInline();
          this.blocks.push({ kind: "math", text: this.mathBlock(node) });
          continue;
        }
        inlineRun.push(node);
        continue;
      }
      flushInline();
      switch (node.name) {
        case "ul":
        case "ol": {
          let n = 0;
          for (const child of node.children) {
            if (child.type === "el" && child.name === "li") {
              n++;
              const prefix = node.name === "ol" ? `${n}. ` : "• ";
              this.walkBlocks(child.children, prefix);
            } else if (child.type !== "text" || child.value.trim()) {
              this.walkBlocks([child], listPrefix);
            }
          }
          break;
        }
        case "li":
          this.walkBlocks(node.children, listPrefix || "• ");
          break;
        case "table":
          this.blocks.push({ kind: "table", text: this.table(node) });
          break;
        case "hr":
          break;
        case "p": {
          // A centered paragraph that holds nothing but MathML is a display
          // equation — render it as a $$ block rather than inline.
          const kids = elementChildren(node);
          const onlyMath = kids.length > 0 && kids.every((k) => k.type === "el" && k.name === "math");
          const style = (node.attrs["style"] ?? "").replace(/\s+/g, "").toLowerCase();
          const centered = style.includes("text-align:center");
          const classes = node.attrs["class"] ?? "";
          if (onlyMath && (centered || (node.attrs["display"] ?? "") === "block" || /center/i.test(classes))) {
            for (const k of kids) this.blocks.push({ kind: "math", text: this.mathBlock(k as El) });
            break;
          }
          this.walkBlocks(node.children, listPrefix);
          break;
        }
        default:
          this.walkBlocks(node.children, listPrefix);
      }
    }
    flushInline();
  }

  private pushSvg(raw: string) {
    this.images.push({ kind: "svg", svg: raw });
  }

  private mathBlock(math: El): string {
    const { latex, warnings } = mathmlToLatex(math);
    this.warnings.push(...warnings);
    return `$$${latex}$$`;
  }

  /** Renders inline content to markup text. */
  private inline(nodes: HtmlNode[]): string {
    let out = "";
    for (const node of nodes) out += this.inlineNode(node);
    return collapseSpaces(out);
  }

  private inlineNode(node: HtmlNode): string {
    if (node.type === "text") return escapeProse(node.value);
    if (node.type === "svg") {
      this.pushSvg(node.raw);
      return "";
    }
    if (isHiddenForSightedUsers(node)) return "";
    const cls = node.attrs["class"] ?? "";
    const style = (node.attrs["style"] ?? "").replace(/\s+/g, "").toLowerCase();

    switch (node.name) {
      case "math": {
        const { latex, warnings } = mathmlToLatex(node);
        this.warnings.push(...warnings);
        return latex ? `$${latex}$` : "";
      }
      case "img": {
        const alt = node.attrs["alt"] ?? "";
        const src = node.attrs["src"] ?? "";
        const isMathImage = /\bmath-img\b/.test(cls) || node.attrs["role"] === "math";
        if (isMathImage) {
          const latex = spokenMathToLatex(alt);
          return latex ? `$${latex}$` : "";
        }
        if (src.startsWith("data:")) this.images.push({ kind: "data", dataUrl: src });
        else if (/^https?:\/\//.test(src)) this.images.push({ kind: "url", src });
        else this.warnings.push(`image with unsupported src skipped: ${src.slice(0, 60)}`);
        return "";
      }
      case "br":
        return "\n";
      case "span":
      case "font": {
        if (/\bsr-only\b/.test(cls) || /\bvisually-hidden\b/.test(cls)) return "";
        const inner = this.inline(node.children);
        if (/\bitalic\b/.test(cls) || style.includes("font-style:italic")) return italic(inner);
        if (/\bunderline\b/.test(cls) || style.includes("text-decoration:underline") || style.includes("text-decoration-line:underline"))
          return underline(inner);
        return inner;
      }
      case "em":
      case "i":
      case "cite":
      case "var":
      case "dfn":
        return italic(this.inline(node.children));
      case "u":
      case "ins":
        return underline(this.inline(node.children));
      case "strong":
      case "b":
      case "mark":
      case "a":
      case "abbr":
      case "small":
      case "q":
      case "code":
      case "kbd":
      case "s":
      case "del":
      case "label":
        return this.inline(node.children);
      case "sup": {
        const inner = textContent(node).trim();
        if (/^(st|nd|rd|th)$/i.test(inner)) return inner;
        return inner ? `$^{${escapeLatexText(inner)}}$` : "";
      }
      case "sub": {
        const inner = textContent(node).trim();
        return inner ? `$_{${escapeLatexText(inner)}}$` : "";
      }
      case "figure":
      case "figcaption":
      case "picture":
      case "table":
      case "p":
      case "div":
      case "ul":
      case "ol":
      case "li":
      case "blockquote":
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        // Block inside an inline run (rare) — flatten with line breaks.
        if (node.name === "table") return `\n${this.table(node)}\n`;
        return `\n${this.inline(node.children)}\n`;
      }
      default:
        return this.inline(node.children);
    }
  }

  /** HTML table → a KaTeX array block so it renders as a real grid. */
  private table(table: El): string {
    const rows: { cells: string[]; header: boolean }[] = [];
    let caption = "";
    const visit = (nodes: HtmlNode[]) => {
      for (const n of nodes) {
        if (n.type !== "el") continue;
        if (n.name === "caption") {
          caption = this.inline(n.children).trim();
        } else if (n.name === "tr") {
          const cells: string[] = [];
          let header = false;
          for (const c of n.children) {
            if (c.type !== "el" || (c.name !== "td" && c.name !== "th")) continue;
            if (c.name === "th") header = true;
            const span = Math.max(1, Number(c.attrs["colspan"] ?? 1) || 1);
            const latex = this.cellLatex(c.children, c.name === "th");
            cells.push(span > 1 ? `\\multicolumn{${span}}{|c|}{${latex}}` : latex);
            for (let s = 1; s < span; s++) cells.push(" SPAN");
          }
          rows.push({ cells, header });
        } else {
          visit(n.children);
        }
      }
    };
    visit(table.children);
    if (rows.length === 0) return "";
    const width = Math.max(...rows.map((r) => r.cells.length));
    const spec = `|${"c|".repeat(width)}`;
    const body = rows
      .map((r) => {
        const cells = [...r.cells];
        while (cells.length < width) cells.push("");
        return cells.filter((c) => c !== " SPAN").join(" & ");
      })
      .join(" \\\\ \\hline ");
    const block = `$$\\begin{array}{${spec}}\\hline ${body} \\\\ \\hline\\end{array}$$`;
    return caption ? `${italic(caption)}\n${block}` : block;
  }

  private cellLatex(nodes: HtmlNode[], bold: boolean): string {
    let out = "";
    const walk = (list: HtmlNode[]) => {
      for (const n of list) {
        if (n.type === "text") {
          const t = collapseSpaces(n.value);
          const trimmed = t.trim();
          if (/^[-\u2212]?\d[\d,]*(\.\d+)?%?$/.test(trimmed)) out += latexNumber(trimmed).replace(/\u2212/g, "-").replace(/%$/, "\\%");
          else if (trimmed) out += `\\text{${escapeLatexText(trimmed)}}`;
          else if (t) out += " ";
          continue;
        }
        if (n.type === "svg") {
          this.warnings.push("figure inside a table cell was dropped");
          continue;
        }
        if (n.name === "math") {
          const { latex, warnings } = mathmlToLatex(n);
          this.warnings.push(...warnings);
          out += latex;
        } else if (n.name === "img") {
          const alt = n.attrs["alt"] ?? "";
          if (/\bmath-img\b/.test(n.attrs["class"] ?? "") || n.attrs["role"] === "math") out += spokenMathToLatex(alt);
          else this.warnings.push("figure inside a table cell was dropped");
        } else if (n.name === "br") {
          out += "\\ ";
        } else if (n.name === "em" || n.name === "i") {
          const before = out;
          out = "";
          walk(n.children);
          out = `${before}\\textit{${out}}`;
        } else if (n.name === "sup") {
          out += `^{${escapeLatexText(textContent(n).trim())}}`;
        } else if (n.name === "sub") {
          out += `_{${escapeLatexText(textContent(n).trim())}}`;
        } else {
          walk(n.children);
        }
      }
    };
    walk(nodes);
    const cell = out.trim();
    if (!bold || !cell) return cell;
    const onlyText = /^\\text\{([^{}]*)\}$/.exec(cell);
    return onlyText ? `\\textbf{${onlyText[1]}}` : `\\textbf{${cell}}`;
  }
}

/** Screen-reader-only content: the "sr-only" long description College
 * Board attaches to every figure, hidden inputs, etc. It duplicates what
 * the figure already shows, so it must not become visible text. */
function isHiddenForSightedUsers(node: El): boolean {
  const cls = node.attrs["class"] ?? "";
  if (/\b(sr-only|visually-hidden|screen-reader-only)\b/.test(cls)) return true;
  if ((node.attrs["aria-hidden"] ?? "") === "true" && !/^_+$/.test(textContent(node).trim())) return false;
  const style = (node.attrs["style"] ?? "").replace(/\s+/g, "").toLowerCase();
  if (style.includes("display:none")) return true;
  const label = (node.attrs["aria-label"] ?? "").toLowerCase();
  return node.attrs["role"] === "region" && label.startsWith("long description");
}

function collapseSpaces(text: string): string {
  // HTML whitespace semantics: runs of spaces/tabs collapse, but keep the
  // explicit "\n" line breaks we emit for <br>.
  return text
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Escapes plain prose so MathText's markup characters can't misfire:
 * a literal "$" would open a math segment, a literal "*" would open italics. */
function escapeProse(raw: string): string {
  // "$" is MathText's math delimiter, so a literal dollar sign becomes a
  // tiny math segment (\textdollar); "*" would open italics.
  const MARK = "\u0000";
  const withDollars = raw
    .replace(/\u00a0/g, " ")
    .replace(/\$\s?(\d[\d,]*(?:\.\d+)?)?/g, (_m, num?: string) =>
      num ? `${MARK}\\text{\\textdollar}${latexNumber(num)}${MARK}` : `${MARK}\\text{\\textdollar}${MARK}`
    );
  return withDollars.replace(/\u0000/g, "$").replace(/\*/g, "\u2217");
}

function italic(inner: string): string {
  const t = inner.trim();
  if (!t) return inner;
  if (t.includes("*")) return inner; // nested italics — leave plain rather than mangle
  const lead = inner.startsWith(" ") ? " " : "";
  const tail = inner.endsWith(" ") ? " " : "";
  return `${lead}*${t}*${tail}`;
}

function underline(inner: string): string {
  const t = inner.trim();
  if (!t) return inner;
  if (/^_{3,}$/.test(t)) return inner; // a fill-in blank is already underscores
  const lead = inner.startsWith(" ") ? " " : "";
  const tail = inner.endsWith(" ") ? " " : "";
  return `${lead}__${t}__${tail}`;
}

function joinBlocks(blocks: Block[]): string {
  let out = "";
  blocks.forEach((b, i) => {
    if (i > 0) {
      const prev = blocks[i - 1];
      const tight = prev.kind === "li" && b.kind === "li";
      out += tight ? "\n" : "\n\n";
    }
    out += b.text;
  });
  return out.trim();
}

/** Converts an HTML fragment (a stem, a stimulus, a choice, a rationale)
 * to BlueMind markup plus any figures it contained. */
export function htmlToMarkup(html: string | null | undefined): FragmentResult {
  if (!html || !html.trim()) return { text: "", images: [], warnings: [] };
  const nodes = parseHtml(html);
  return new FragmentConverter().run(nodes);
}

/** Plain text (no markup at all) — for rationale summaries and search. */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  const nodes = parseHtml(html);
  const walk = (list: HtmlNode[]): string =>
    list
      .map((n) => {
        if (n.type === "text") return n.value;
        if (n.type === "svg") return "";
        if (n.name === "math") return n.attrs["alttext"] ?? textContent(n);
        if (n.name === "img") return n.attrs["alt"] ?? "";
        if (n.name === "br") return "\n";
        if (BLOCK_ELEMENTS.has(n.name)) return `\n${walk(n.children)}\n`;
        return walk(n.children);
      })
      .join("");
  return collapseSpaces(walk(nodes)).replace(/\n{2,}/g, "\n").trim();
}

/* ---------------------------------------------------------------------- */
/* Figures                                                                */
/* ---------------------------------------------------------------------- */

function svgSize(svg: string): { width: number; height: number } {
  const open = /<svg[^>]*>/i.exec(svg)?.[0] ?? "";
  const attr = (name: string) => {
    const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(open) ?? new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i").exec(open);
    return m ? m[1] : null;
  };
  const toPx = (v: string | null): number | null => {
    if (!v) return null;
    const m = /^\s*([\d.]+)\s*(px|pt|mm|cm|in|em|)\s*$/i.exec(v);
    if (!m) return null;
    const n = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    const factor = unit === "pt" ? 96 / 72 : unit === "mm" ? 96 / 25.4 : unit === "cm" ? 96 / 2.54 : unit === "in" ? 96 : unit === "em" ? 16 : 1;
    return n * factor;
  };
  let width = toPx(attr("width"));
  let height = toPx(attr("height"));
  const viewBox = attr("viewBox");
  if ((width === null || height === null) && viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      width = width ?? parts[2];
      height = height ?? parts[3];
    }
  }
  return { width: width ?? 300, height: height ?? 200 };
}

function ensureSvgNamespace(svg: string): string {
  if (/<svg[^>]*\sxmlns\s*=/.test(svg)) return svg;
  return svg.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
}

/** Stacks several SVG figures into one SVG document (top to bottom). */
export function combineSvgs(svgs: string[]): string {
  if (svgs.length === 1) return ensureSvgNamespace(svgs[0]);
  const gap = 16;
  const sizes = svgs.map(svgSize);
  const width = Math.max(...sizes.map((s) => s.width));
  const height = sizes.reduce((sum, s) => sum + s.height, 0) + gap * (svgs.length - 1);
  let y = 0;
  const inner = svgs
    .map((svg, i) => {
      const placed = ensureSvgNamespace(svg).replace(/<svg/, `<svg x="0" y="${y.toFixed(2)}"`);
      y += sizes[i].height + gap;
      return placed;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width.toFixed(2)}" height="${height.toFixed(2)}" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}">\n${inner}\n</svg>`;
}

export function svgToDataUrl(svg: string): string {
  const cleaned = ensureSvgNamespace(svg).replace(/^\s*<\?xml[^>]*>\s*/i, "");
  return `data:image/svg+xml;base64,${Buffer.from(cleaned, "utf-8").toString("base64")}`;
}

/* ---------------------------------------------------------------------- */
/* Whole-question conversion                                              */
/* ---------------------------------------------------------------------- */

export interface ConvertedChoice {
  id: string;
  text: string;
  imageData: string | null;
}

export interface ConvertedQuestion {
  passageText: string | null;
  questionText: string;
  imageData: string | null;
  /** Remote images still to be downloaded and turned into imageData. */
  pendingImageUrls: string[];
  choices: ConvertedChoice[];
  correctAnswer: string;
  questionType: "multiple_choice" | "spr";
  rationale: string;
  explanation: string;
  warnings: string[];
}

/** Picks a single data URL for a fragment's figures — SVGs are stacked
 * into one image; a raster image wins if it's the only kind present. */
function resolveImages(images: ImageRef[], warnings: string[]): { imageData: string | null; pendingUrls: string[] } {
  if (images.length === 0) return { imageData: null, pendingUrls: [] };
  const svgs = images.filter((i): i is Extract<ImageRef, { kind: "svg" }> => i.kind === "svg");
  const datas = images.filter((i): i is Extract<ImageRef, { kind: "data" }> => i.kind === "data");
  const urls = images.filter((i): i is Extract<ImageRef, { kind: "url" }> => i.kind === "url");
  if (svgs.length > 0) {
    if (datas.length > 0 || urls.length > 0) warnings.push("mixed SVG and raster figures — only the SVG figure(s) were kept");
    return { imageData: svgToDataUrl(combineSvgs(svgs.map((s) => s.svg))), pendingUrls: [] };
  }
  if (datas.length > 0) {
    if (datas.length > 1 || urls.length > 0) warnings.push("several raster figures — only the first was kept");
    return { imageData: datas[0].dataUrl, pendingUrls: [] };
  }
  if (urls.length > 1) warnings.push("several remote figures — only the first was kept");
  return { imageData: null, pendingUrls: [urls[0].src] };
}

/** First sentence of a rationale, for the short `rationale` column. */
export function summarizeRationale(markup: string): string {
  const text = markup.replace(/\s+/g, " ").trim();
  if (!text) return "";
  // First sentence - but never split inside a $...$ math segment.
  let inMath = false;
  for (let i = 0; i < Math.min(text.length, 400); i++) {
    const ch = text[i];
    if (ch === "$") inMath = !inMath;
    if (inMath || i < 20) continue;
    if ((ch === "." || ch === "!" || ch === "?") && (i + 1 === text.length || text[i + 1] === " ")) {
      return text.slice(0, i + 1).trim();
    }
  }
  return text.slice(0, 300).trim();
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Modern (external_id) question JSON from
 * /questionbank/digital/get-question. */
export interface ModernQuestionJson {
  type: string; // "mcq" | "spr"
  stem?: string;
  stimulus?: string;
  keys?: string[];
  answerOptions?: { id: string; content: string }[];
  correct_answer?: string[] | string;
  rationale?: string;
  externalid?: string;
}

export function convertModernQuestion(raw: ModernQuestionJson, section: "Math" | "Reading and Writing"): ConvertedQuestion {
  const warnings: string[] = [];
  const stimulus = htmlToMarkup(raw.stimulus);
  const stem = htmlToMarkup(raw.stem);
  warnings.push(...stimulus.warnings.map((w) => `stimulus: ${w}`), ...stem.warnings.map((w) => `stem: ${w}`));

  const isRw = section === "Reading and Writing";
  let passageText: string | null = null;
  let questionText: string;
  if (isRw) {
    passageText = stimulus.text || null;
    questionText = stem.text;
    if (!questionText && passageText) {
      questionText = passageText;
      passageText = null;
    }
  } else {
    questionText = [stimulus.text, stem.text].filter(Boolean).join("\n\n");
  }
  const figures = resolveImages([...stimulus.images, ...stem.images], warnings);

  const isSpr = (raw.type ?? "").toLowerCase() === "spr" || !raw.answerOptions || raw.answerOptions.length === 0;
  const choices: ConvertedChoice[] = [];
  let correctAnswer = "";
  if (!isSpr && raw.answerOptions) {
    raw.answerOptions.forEach((opt, i) => {
      const conv = htmlToMarkup(opt.content);
      warnings.push(...conv.warnings.map((w) => `choice ${LETTERS[i]}: ${w}`));
      const img = resolveImages(conv.images, warnings);
      if (img.pendingUrls.length) warnings.push(`choice ${LETTERS[i]}: remote image not embedded`);
      choices.push({ id: LETTERS[i] ?? String(i + 1), text: conv.text, imageData: img.imageData });
    });
    const given = Array.isArray(raw.correct_answer) ? raw.correct_answer : raw.correct_answer ? [raw.correct_answer] : [];
    const letters = given.map((g) => String(g).trim().toUpperCase()).filter((g) => LETTERS.includes(g));
    if (letters.length > 0) {
      correctAnswer = letters.join(",");
    } else if (raw.keys && raw.keys.length > 0) {
      const idx = raw.answerOptions.findIndex((o) => o.id === raw.keys![0]);
      if (idx >= 0) correctAnswer = LETTERS[idx];
    }
  } else {
    const given = Array.isArray(raw.correct_answer) ? raw.correct_answer : raw.correct_answer ? [raw.correct_answer] : [];
    correctAnswer = Array.from(new Set(given.map((g) => String(g).trim()).filter(Boolean))).join(",");
    if (!correctAnswer && raw.keys && raw.keys.length > 0) {
      correctAnswer = Array.from(new Set(raw.keys.map((k) => String(k).trim()).filter(Boolean))).join(",");
    }
    if (!correctAnswer) correctAnswer = extractSprAnswerFromRationale(raw.rationale);
  }

  const rationaleMarkup = htmlToMarkup(raw.rationale);
  warnings.push(...rationaleMarkup.warnings.map((w) => `rationale: ${w}`));
  const explanation = rationaleMarkup.text;
  const rationale = summarizeRationale(explanation);

  return {
    passageText,
    questionText,
    imageData: figures.imageData,
    pendingImageUrls: figures.pendingUrls,
    choices,
    correctAnswer,
    questionType: isSpr ? "spr" : "multiple_choice",
    rationale,
    explanation,
    warnings,
  };
}

/** Legacy (ibn) question JSON from saic.collegeboard.org/disclosed/<ibn>.json */
export interface LegacyQuestionJson {
  item_id?: string;
  section?: string;
  prompt?: string;
  body?: string;
  stimulus?: string;
  answer?: {
    style?: string;
    choices?: Record<string, { body?: string }> | { body?: string }[];
    correct_choice?: string | string[];
    correct_answer?: string | string[];
    answers?: string[];
    rationale?: string;
  };
  rationale?: string;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const DENOMINATOR_WORDS: Record<string, number> = {
  half: 2, halves: 2, third: 3, thirds: 3, fourth: 4, fourths: 4, quarter: 4, quarters: 4, fifth: 5, fifths: 5,
  sixth: 6, sixths: 6, seventh: 7, sevenths: 7, eighth: 8, eighths: 8, ninth: 9, ninths: 9, tenth: 10, tenths: 10,
  eleventh: 11, elevenths: 11, twelfth: 12, twelfths: 12, thirteenth: 13, thirteenths: 13, fourteenth: 14,
  fourteenths: 14, fifteenth: 15, fifteenths: 15, sixteenth: 16, sixteenths: 16, seventeenth: 17, seventeenths: 17,
  eighteenth: 18, eighteenths: 18, nineteenth: 19, nineteenths: 19, twentieth: 20, twentieths: 20,
  thirtieth: 30, thirtieths: 30, fortieth: 40, fortieths: 40, fiftieth: 50, fiftieths: 50, hundredth: 100,
  hundredths: 100, thousandth: 1000, thousandths: 1000,
};

function wordsToInteger(words: string[]): number | null {
  if (words.length === 0) return null;
  let total = 0;
  let current = 0;
  for (const w of words) {
    if (w === "and") continue;
    if (w in NUMBER_WORDS) current += NUMBER_WORDS[w];
    else if (w === "hundred") current = (current || 1) * 100;
    else if (w === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
    } else if (/^\d+$/.test(w)) current += Number(w);
    else return null;
  }
  return total + current;
}

function denominatorFromWord(word: string): number | null {
  if (word in DENOMINATOR_WORDS) return DENOMINATOR_WORDS[word];
  const parts = word.split("-"); // "twenty-fifths"
  if (parts.length === 2 && parts[0] in NUMBER_WORDS && parts[1] in DENOMINATOR_WORDS && DENOMINATOR_WORDS[parts[1]] < 10) {
    return NUMBER_WORDS[parts[0]] + DENOMINATOR_WORDS[parts[1]];
  }
  return null;
}

/** "three halves" → "3/2", "negative one fourth" → "-1/4", "twelve" → "12",
 * "five point five" → "5.5", "StartFraction 3 Over 2 EndFraction" → "3/2". */
export function spokenNumberToAnswer(alt: string): string | null {
  let s = alt.trim().toLowerCase().replace(/[,]/g, "").replace(/\s+/g, " ");
  if (!s) return null;
  let sign = "";
  const neg = /^(negative|minus)\s+/.exec(s);
  if (neg) {
    sign = "-";
    s = s.slice(neg[0].length);
  }
  if (/^-?\d+(\.\d+)?$/.test(s) || /^-?\.\d+$/.test(s)) return sign + s;
  let m = /^(\d+(?:\.\d+)?)\s*(?:\/|over)\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (m) return `${sign}${m[1]}/${m[2]}`;
  m = /^startfraction (.+?) over (.+?) endfraction$/.exec(s);
  if (m) {
    const a = spokenNumberToAnswer(m[1]);
    const b = spokenNumberToAnswer(m[2]);
    return a && b ? `${sign}${a}/${b}` : null;
  }
  const words = s.split(" ");
  const pointIdx = words.indexOf("point");
  if (pointIdx !== -1) {
    const whole = pointIdx === 0 ? 0 : wordsToInteger(words.slice(0, pointIdx));
    const digits = words.slice(pointIdx + 1).map((w) => (w in NUMBER_WORDS && NUMBER_WORDS[w] < 10 ? String(NUMBER_WORDS[w]) : /^\d$/.test(w) ? w : null));
    if (whole === null || digits.some((d) => d === null) || digits.length === 0) return null;
    return `${sign}${whole}.${digits.join("")}`;
  }
  const last = words[words.length - 1];
  const den = words.length >= 2 ? denominatorFromWord(last) : null;
  if (den !== null) {
    const num = wordsToInteger(words.slice(0, -1));
    if (num === null) return null;
    return `${sign}${num}/${den}`;
  }
  const whole = wordsToInteger(words);
  return whole === null ? null : `${sign}${whole}`;
}

/** Pulls the accepted answer(s) out of a rationale like "The correct answer
 * is <img alt='three halves'>." or "The correct answer is either 4 or 5." */
export function extractSprAnswerFromRationale(rationaleHtml: string | null | undefined): string {
  if (!rationaleHtml) return "";
  const nodes = parseHtml(rationaleHtml);
  const walk = (list: HtmlNode[]): string =>
    list
      .map((n) => {
        if (n.type === "text") return n.value;
        if (n.type === "svg") return "";
        if (n.name === "img") return ` «${n.attrs["alt"] ?? ""}» `;
        if (n.name === "math") return ` «${n.attrs["alttext"] ?? textContent(n)}» `;
        if (n.name === "br" || BLOCK_ELEMENTS.has(n.name)) return ` ${walk(n.children)} `;
        return walk(n.children);
      })
      .join("");
  const text = walk(nodes).replace(/\s+/g, " ").trim();
  const patterns = [
    /correct answers?\s+(?:is|are|would be)\s+(?:either\s+|both\s+)?(.+?)(?:\.\s|\.$|$|;)/i,
    /(?:either|both)\s+(.{1,80}?)\s+(?:is|are)\s+(?:also\s+)?(?:an?\s+)?correct/i,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (!m) continue;
    const candidates = m[1]
      .split(/\s*(?:,|\bor\b|\band\b)\s*/i)
      .map((c) => c.trim())
      .filter(Boolean);
    const answers: string[] = [];
    for (const c of candidates) {
      const inner = /«([^»]*)»/.exec(c);
      const raw = (inner ? inner[1] : c).replace(/[«»]/g, "").trim();
      const a = spokenNumberToAnswer(raw);
      if (a && !answers.includes(a)) answers.push(a);
    }
    if (answers.length > 0) return answers.join(",");
  }
  return "";
}

export function convertLegacyQuestion(raw: LegacyQuestionJson, section: "Math" | "Reading and Writing"): ConvertedQuestion {
  const warnings: string[] = ["legacy source format (formulas rebuilt from spoken alt text)"];
  const stimulus = htmlToMarkup(raw.body ?? raw.stimulus);
  const stem = htmlToMarkup(raw.prompt);
  warnings.push(...stimulus.warnings.map((w) => `stimulus: ${w}`), ...stem.warnings.map((w) => `stem: ${w}`));

  const isRw = section === "Reading and Writing";
  let passageText: string | null = null;
  let questionText: string;
  if (isRw) {
    passageText = stimulus.text || null;
    questionText = stem.text;
  } else {
    questionText = [stimulus.text, stem.text].filter(Boolean).join("\n\n");
  }
  const figures = resolveImages([...stimulus.images, ...stem.images], warnings);

  const answer = raw.answer ?? {};
  const style = (answer.style ?? "").toLowerCase();
  const isMcq = style.includes("multiple") || (!!answer.choices && Object.keys(answer.choices).length > 0);
  const choices: ConvertedChoice[] = [];
  let correctAnswer = "";
  const rationaleHtml = answer.rationale ?? raw.rationale ?? "";
  const rationalePlain = htmlToPlainText(rationaleHtml);

  if (isMcq && answer.choices) {
    const entries: [string, { body?: string }][] = Array.isArray(answer.choices)
      ? answer.choices.map((c, i) => [LETTERS[i].toLowerCase(), c])
      : Object.entries(answer.choices).sort(([a], [b]) => a.localeCompare(b));
    entries.forEach(([key, c], i) => {
      const conv = htmlToMarkup(c.body);
      const letter = /^[a-f]$/i.test(key) ? key.toUpperCase() : LETTERS[i];
      warnings.push(...conv.warnings.map((w) => `choice ${letter}: ${w}`));
      const img = resolveImages(conv.images, warnings);
      choices.push({ id: letter, text: conv.text, imageData: img.imageData });
    });
    const given = Array.isArray(answer.correct_choice) ? answer.correct_choice : answer.correct_choice ? [answer.correct_choice] : [];
    correctAnswer = given
      .map((g) => String(g).trim().toUpperCase())
      .filter((g) => LETTERS.includes(g))
      .join(",");
    if (!correctAnswer) {
      const m = /Choice ([A-D]) is correct/i.exec(rationalePlain);
      if (m) correctAnswer = m[1].toUpperCase();
    }
  } else {
    const candidates = [answer.correct_answer, answer.correct_choice, answer.answers]
      .flatMap((c) => (Array.isArray(c) ? c : c ? [c] : []))
      .map((c) => String(c).trim())
      .filter(Boolean);
    correctAnswer = Array.from(new Set(candidates)).join(",");
    if (!correctAnswer) correctAnswer = extractSprAnswerFromRationale(rationaleHtml);
  }

  const rationaleMarkup = htmlToMarkup(rationaleHtml);
  warnings.push(...rationaleMarkup.warnings.map((w) => `rationale: ${w}`));

  return {
    passageText,
    questionText,
    imageData: figures.imageData,
    pendingImageUrls: figures.pendingUrls,
    choices,
    correctAnswer,
    questionType: isMcq ? "multiple_choice" : "spr",
    rationale: summarizeRationale(rationaleMarkup.text),
    explanation: rationaleMarkup.text,
    warnings,
  };
}
