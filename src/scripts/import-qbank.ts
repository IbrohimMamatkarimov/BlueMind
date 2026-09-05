/* eslint-disable no-console */
/**
 * Imports the official College Board SAT Question Bank into BlueMind's
 * standalone practice bank (questions with no mock_id), pulling from the
 * same JSON endpoints the official site
 * (satsuitequestionbank.collegeboard.org) uses. Every question keeps its
 * official 8-character ID in questions.external_id, so re-running the
 * script updates content in place instead of duplicating it — student
 * history attached to a question survives a re-import.
 *
 * Usage:
 *   npm run db:import-qbank                      # fetch (cached) + import both sections
 *   npm run db:import-qbank -- --section math    # one section: math | rw
 *   npm run db:import-qbank -- --fetch-only      # download into the cache, don't touch the DB
 *   npm run db:import-qbank -- --dry-run         # convert only; writes content/qbank/converted.json
 *   npm run db:import-qbank -- --offline         # never hit the network (cache only)
 *   npm run db:import-qbank -- --limit 40        # first N questions per section (testing)
 *   npm run db:import-qbank -- --ids f1bfbed3,ac472881
 *   npm run db:import-qbank -- --concurrency 4   # parallel downloads (default 4)
 *   npm run db:import-qbank -- --refresh-lists   # re-download the question lists
 *
 * Cache layout (gitignored, safe to delete):
 *   content/qbank/raw/list-rw.json, list-math.json   the question lists
 *   content/qbank/raw/q/<questionId>.json            one file per question
 *   content/qbank/raw/img/<hash>.txt                 downloaded remote figures
 *   content/qbank/import-report.json                 skipped items + warnings
 *
 * Reads DATABASE_URL from the environment or ./.env (tsx doesn't load
 * .env on its own the way Next.js does).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile();

import { DOMAINS } from "../lib/sat-constants";
import {
  convertLegacyQuestion,
  convertModernQuestion,
  type ConvertedQuestion,
  type LegacyQuestionJson,
  type ModernQuestionJson,
} from "../lib/qbank-convert";

/* ---------------------------------------------------------------------- */
/* Config                                                                 */
/* ---------------------------------------------------------------------- */

type Section = "Math" | "Reading and Writing";

const API_BASE = "https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital";
const LEGACY_BASE = "https://saic.collegeboard.org/disclosed";
const SITE_ORIGIN = "https://satsuitequestionbank.collegeboard.org";
const SAT_ASSESSMENT_ID = 99; // 100 = PSAT/NMSQT, 102 = PSAT 8/9

const SECTION_CONFIG: Record<Section, { key: "rw" | "math"; test: number; domains: string; estimatedTime: number }> = {
  "Reading and Writing": { key: "rw", test: 1, domains: "INI,CAS,EOI,SEC", estimatedTime: 71 },
  Math: { key: "math", test: 2, domains: "H,P,Q,S", estimatedTime: 95 },
};

export const QBANK_SOURCE = "College Board Question Bank";

const ROOT = path.join(process.cwd(), "content", "qbank");
const RAW_DIR = path.join(ROOT, "raw");
const Q_DIR = path.join(RAW_DIR, "q");
const IMG_DIR = path.join(RAW_DIR, "img");

/** College Board's fine-grained Math skills → BlueMind's taxonomy
 * (src/lib/sat-constants.ts). Reading & Writing names already match. */
const MATH_SKILL_MAP: Record<string, string> = {
  "linear equations in one variable": "Linear Equations",
  "linear equations in two variables": "Linear Equations",
  "linear functions": "Linear Functions",
  "systems of two linear equations in two variables": "Systems of Equations",
  "linear inequalities in one or two variables": "Linear Inequalities",
  "nonlinear functions": "Nonlinear Functions",
  "nonlinear equations in one variable and systems of equations in two variables": "Nonlinear Equations",
  "equivalent expressions": "Equivalent Expressions",
  "ratios, rates, proportional relationships, and units": "Ratios and Proportions",
  percentages: "Percentages",
  "one-variable data: distributions and measures of center and spread": "Data Interpretation",
  "two-variable data: models and scatterplots": "Data Interpretation",
  "probability and conditional probability": "Probability",
  "inference from sample statistics and margin of error": "Data Interpretation",
  "evaluating statistical claims: observational studies and experiments": "Data Interpretation",
  "area and volume": "Area and Volume",
  "lines, angles, and triangles": "Lines/Angles/Triangles",
  "right triangles and trigonometry": "Right Triangle Trig",
  circles: "Circles",
};

/* ---------------------------------------------------------------------- */
/* Types                                                                  */
/* ---------------------------------------------------------------------- */

interface ListEntry {
  questionId: string;
  external_id: string | null;
  ibn: string | null;
  difficulty: "E" | "M" | "H";
  skill_desc: string;
  primary_class_cd_desc: string;
  program: string;
  skill_cd?: string;
  updateDate?: number;
}

interface CachedQuestion {
  questionId: string;
  format: "modern" | "legacy";
  fetchedAt: string;
  meta: ListEntry;
  detail: unknown;
}

interface ImportRow {
  externalId: string;
  section: Section;
  domain: string;
  skill: string;
  difficulty: "Easy" | "Medium" | "Hard";
  officialSkill: string;
  format: "modern" | "legacy";
  converted: ConvertedQuestion;
}

interface Options {
  sections: Section[];
  fetchOnly: boolean;
  dryRun: boolean;
  offline: boolean;
  limit: number | null;
  ids: Set<string> | null;
  concurrency: number;
  refreshLists: boolean;
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                                */
/* ---------------------------------------------------------------------- */

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const opts: Options = {
    sections: ["Reading and Writing", "Math"],
    fetchOnly: false,
    dryRun: false,
    offline: false,
    limit: null,
    ids: null,
    concurrency: 4,
    refreshLists: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => {
      const v = args[++i];
      if (v === undefined) fail(`${a} needs a value`);
      return v;
    };
    switch (a) {
      case "--section": {
        const v = next().toLowerCase();
        if (v === "math") opts.sections = ["Math"];
        else if (v === "rw" || v === "reading" || v === "reading-and-writing") opts.sections = ["Reading and Writing"];
        else if (v === "all") opts.sections = ["Reading and Writing", "Math"];
        else fail(`Unknown section "${v}" — use math, rw or all`);
        break;
      }
      case "--fetch-only":
        opts.fetchOnly = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--offline":
        opts.offline = true;
        break;
      case "--limit":
        opts.limit = Math.max(1, Number(next()) || 1);
        break;
      case "--ids":
        opts.ids = new Set(
          next()
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        );
        break;
      case "--concurrency":
        opts.concurrency = Math.min(8, Math.max(1, Number(next()) || 4));
        break;
      case "--refresh-lists":
        opts.refreshLists = true;
        break;
      case "--help":
      case "-h":
        console.log(fs.readFileSync(__filename, "utf-8").split("*/")[0]);
        process.exit(0);
      // eslint-disable-next-line no-fallthrough
      default:
        fail(`Unknown flag ${a}`);
    }
  }
  return opts;
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, data: unknown) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (err) {
      lastError = err;
    }
    await sleep(500 * 2 ** (attempt - 1));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: SITE_ORIGIN,
      Referer: `${SITE_ORIGIN}/`,
      "User-Agent": "Mozilla/5.0 (BlueMind question bank importer)",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (BlueMind question bank importer)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

/* ---------------------------------------------------------------------- */
/* Fetching                                                               */
/* ---------------------------------------------------------------------- */

async function loadList(section: Section, opts: Options): Promise<ListEntry[]> {
  const cfg = SECTION_CONFIG[section];
  const file = path.join(RAW_DIR, `list-${cfg.key}.json`);
  const cached = readJson<ListEntry[]>(file);
  if (cached && !opts.refreshLists) return cached;
  if (opts.offline) {
    if (cached) return cached;
    fail(`No cached question list for ${section} (content/qbank/raw/list-${cfg.key}.json) — run without --offline first.`);
  }
  process.stdout.write(`Downloading ${section} question list… `);
  const list = await postJson<ListEntry[]>(`${API_BASE}/get-questions`, {
    asmtEventId: SAT_ASSESSMENT_ID,
    test: cfg.test,
    domain: cfg.domains,
  });
  if (!Array.isArray(list)) fail("Unexpected list response (not an array)");
  writeJson(file, list);
  console.log(`${list.length} questions`);
  return list;
}

function cacheFile(questionId: string) {
  return path.join(Q_DIR, `${questionId}.json`);
}

async function fetchQuestion(entry: ListEntry): Promise<CachedQuestion> {
  if (entry.external_id) {
    const detail = await postJson<ModernQuestionJson>(`${API_BASE}/get-question`, { external_id: entry.external_id });
    return { questionId: entry.questionId, format: "modern", fetchedAt: new Date().toISOString(), meta: entry, detail };
  }
  if (entry.ibn) {
    const detail = await getJson<LegacyQuestionJson[] | LegacyQuestionJson>(`${LEGACY_BASE}/${encodeURIComponent(entry.ibn)}.json`);
    return { questionId: entry.questionId, format: "legacy", fetchedAt: new Date().toISOString(), meta: entry, detail };
  }
  throw new Error("list entry has neither external_id nor ibn");
}

async function fetchMissing(entries: ListEntry[], opts: Options): Promise<{ fetched: number; failed: { questionId: string; error: string }[] }> {
  ensureDir(Q_DIR);
  const missing = entries.filter((e) => !fs.existsSync(cacheFile(e.questionId)));
  const failed: { questionId: string; error: string }[] = [];
  if (missing.length === 0) return { fetched: 0, failed };
  if (opts.offline) {
    console.log(`  ${missing.length} question(s) not in the cache — skipped (offline mode)`);
    return { fetched: 0, failed: missing.map((m) => ({ questionId: m.questionId, error: "not cached (offline)" })) };
  }
  console.log(`  Downloading ${missing.length} question(s) with ${opts.concurrency} parallel connections…`);
  let index = 0;
  let done = 0;
  const started = Date.now();
  const worker = async () => {
    while (index < missing.length) {
      const entry = missing[index++];
      try {
        const cached = await fetchQuestion(entry);
        writeJson(cacheFile(entry.questionId), cached);
      } catch (err) {
        failed.push({ questionId: entry.questionId, error: err instanceof Error ? err.message : String(err) });
      }
      done++;
      if (done % 50 === 0 || done === missing.length) {
        const secs = Math.round((Date.now() - started) / 1000);
        process.stdout.write(`\r  ${done}/${missing.length} downloaded (${secs}s)${failed.length ? `, ${failed.length} failed` : ""}   `);
      }
      await sleep(120); // stay polite to the public API
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency }, worker));
  console.log();
  return { fetched: missing.length - failed.length, failed };
}

async function downloadImageAsDataUrl(url: string, offline: boolean): Promise<string | null> {
  ensureDir(IMG_DIR);
  const hash = crypto.createHash("sha1").update(url).digest("hex");
  const file = path.join(IMG_DIR, `${hash}.txt`);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf-8");
  if (offline) return null;
  try {
    const res = await fetchWithRetry(url, { headers: { "User-Agent": "Mozilla/5.0 (BlueMind question bank importer)" } });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "image/png").split(";")[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    fs.writeFileSync(file, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------- */
/* Conversion + validation                                                */
/* ---------------------------------------------------------------------- */

function mapDifficulty(d: string): "Easy" | "Medium" | "Hard" | null {
  if (d === "E") return "Easy";
  if (d === "M") return "Medium";
  if (d === "H") return "Hard";
  return null;
}

function mapTaxonomy(section: Section, entry: ListEntry): { domain: string; skill: string } | { error: string } {
  const domainRaw = (entry.primary_class_cd_desc ?? "").trim();
  const domain = Object.keys(DOMAINS).find((d) => d.toLowerCase() === domainRaw.toLowerCase());
  if (!domain) return { error: `unknown domain "${domainRaw}"` };
  if (DOMAINS[domain].section !== section) return { error: `domain "${domain}" is not a ${section} domain` };

  const skillRaw = (entry.skill_desc ?? "").trim().replace(/\s+/g, " ");
  let skill: string | undefined;
  if (section === "Math") {
    skill = MATH_SKILL_MAP[skillRaw.toLowerCase()];
  } else {
    skill = DOMAINS[domain].skills.find((s) => s.toLowerCase() === skillRaw.toLowerCase());
  }
  if (!skill) return { error: `unknown skill "${skillRaw}" (${domain})` };
  if (!DOMAINS[domain].skills.includes(skill)) return { error: `skill "${skill}" doesn't belong to "${domain}"` };
  return { domain, skill };
}

function validateConverted(c: ConvertedQuestion): string | null {
  if (!c.questionText.trim()) return "empty question text";
  if (c.questionType === "multiple_choice") {
    if (c.choices.length < 2) return `only ${c.choices.length} answer choices`;
    if (c.choices.some((ch) => !ch.text.trim() && !ch.imageData)) return "an answer choice is empty";
    if (!c.correctAnswer) return "no correct answer";
    const ids = new Set(c.choices.map((ch) => ch.id));
    if (!c.correctAnswer.split(",").every((a) => ids.has(a))) return `correct answer "${c.correctAnswer}" isn't a choice`;
  } else if (!c.correctAnswer.trim()) {
    return "no correct answer for the student-produced response";
  }
  if (!c.explanation.trim()) return "empty rationale";
  return null;
}

async function convertAll(
  section: Section,
  entries: ListEntry[],
  opts: Options,
  report: { skipped: { questionId: string; section: Section; reason: string }[]; warnings: { questionId: string; warnings: string[] }[] }
): Promise<ImportRow[]> {
  const rows: ImportRow[] = [];
  for (const entry of entries) {
    const cached = readJson<CachedQuestion>(cacheFile(entry.questionId));
    if (!cached) {
      report.skipped.push({ questionId: entry.questionId, section, reason: "not downloaded" });
      continue;
    }
    const difficulty = mapDifficulty(entry.difficulty);
    if (!difficulty) {
      report.skipped.push({ questionId: entry.questionId, section, reason: `unknown difficulty "${entry.difficulty}"` });
      continue;
    }
    const tax = mapTaxonomy(section, entry);
    if ("error" in tax) {
      report.skipped.push({ questionId: entry.questionId, section, reason: tax.error });
      continue;
    }
    let converted: ConvertedQuestion;
    try {
      if (cached.format === "modern") {
        converted = convertModernQuestion(cached.detail as ModernQuestionJson, section);
      } else {
        const detail = cached.detail;
        const item = (Array.isArray(detail) ? detail[0] : detail) as LegacyQuestionJson | undefined;
        if (!item) throw new Error("empty legacy payload");
        converted = convertLegacyQuestion(item, section);
      }
    } catch (err) {
      report.skipped.push({ questionId: entry.questionId, section, reason: `conversion failed: ${err instanceof Error ? err.message : String(err)}` });
      continue;
    }
    if (converted.pendingImageUrls.length > 0 && !converted.imageData) {
      const dataUrl = await downloadImageAsDataUrl(converted.pendingImageUrls[0], opts.offline);
      if (dataUrl) converted.imageData = dataUrl;
      else converted.warnings.push(`remote figure could not be downloaded: ${converted.pendingImageUrls[0]}`);
    }
    const problem = validateConverted(converted);
    if (problem) {
      report.skipped.push({ questionId: entry.questionId, section, reason: problem });
      continue;
    }
    if (converted.warnings.length > 0) report.warnings.push({ questionId: entry.questionId, warnings: converted.warnings });
    rows.push({
      externalId: entry.questionId,
      section,
      domain: tax.domain,
      skill: tax.skill,
      difficulty,
      officialSkill: (entry.skill_desc ?? "").trim(),
      format: cached.format,
      converted,
    });
  }
  return rows;
}

/* ---------------------------------------------------------------------- */
/* Database                                                               */
/* ---------------------------------------------------------------------- */

function sortKey(row: ImportRow): string {
  const domainIdx = Object.keys(DOMAINS).indexOf(row.domain);
  const skillIdx = DOMAINS[row.domain].skills.indexOf(row.skill);
  const diffIdx = ["Easy", "Medium", "Hard"].indexOf(row.difficulty);
  return `${String(domainIdx).padStart(2, "0")}|${String(skillIdx).padStart(2, "0")}|${diffIdx}|${row.externalId}`;
}

async function writeToDatabase(rows: ImportRow[]): Promise<{ inserted: number; updated: number }> {
  if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set — add it to .env or the environment (or use --dry-run).");
  const { db } = await import("../lib/db");
  const { newId } = await import("../lib/id");

  const existing = (await db.prepare("SELECT id, external_id FROM questions WHERE external_id IS NOT NULL").all()) as {
    id: string;
    external_id: string;
  }[];
  const idByExternal = new Map(existing.map((e) => [e.external_id, e.id]));

  // Stable ordering inside each section — domain, skill, difficulty, ID —
  // written into `position` so listings never depend on random ids.
  const bySection = new Map<Section, ImportRow[]>();
  for (const r of rows) bySection.set(r.section, [...(bySection.get(r.section) ?? []), r]);
  const positions = new Map<string, number>();
  for (const [, list] of bySection) {
    list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    list.forEach((r, i) => positions.set(r.externalId, i + 1));
  }

  let inserted = 0;
  let updated = 0;
  const BATCH = 100;
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    await db.transaction(async (tx) => {
      for (const row of batch) {
        const c = row.converted;
        const choicesJson = JSON.stringify(c.choices.map((ch) => ({ id: ch.id, text: ch.text, imageData: ch.imageData ?? null })));
        const estimatedTime = SECTION_CONFIG[row.section].estimatedTime;
        const existingId = idByExternal.get(row.externalId);
        if (existingId) {
          await tx
            .prepare(
              `UPDATE questions SET
                 section = ?, domain = ?, skill = ?, difficulty = ?, module = 1, module_pool = NULL,
                 passage_text = ?, image_data = ?, question_text = ?, choices = ?, correct_answer = ?,
                 question_type = ?, rationale = ?, explanation = ?, estimated_time = ?, source = ?,
                 review_status = 'validated', position = ?, version = version + 1,
                 updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
               WHERE id = ?`
            )
            .run(
              row.section,
              row.domain,
              row.skill,
              row.difficulty,
              c.passageText,
              c.imageData,
              c.questionText,
              choicesJson,
              c.correctAnswer,
              c.questionType,
              c.rationale,
              c.explanation,
              estimatedTime,
              QBANK_SOURCE,
              positions.get(row.externalId) ?? 0,
              existingId
            );
          updated++;
        } else {
          const id = newId("q");
          await tx
            .prepare(
              `INSERT INTO questions
                 (id, mock_id, section, domain, skill, difficulty, module, module_pool,
                  passage_text, image_data, question_text, choices, correct_answer, question_type,
                  rationale, explanation, estimated_time, source, version, review_status, position, external_id)
               VALUES (?, NULL, ?, ?, ?, ?, 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'validated', ?, ?)`
            )
            .run(
              id,
              row.section,
              row.domain,
              row.skill,
              row.difficulty,
              c.passageText,
              c.imageData,
              c.questionText,
              choicesJson,
              c.correctAnswer,
              c.questionType,
              c.rationale,
              c.explanation,
              estimatedTime,
              QBANK_SOURCE,
              positions.get(row.externalId) ?? 0,
              row.externalId
            );
          idByExternal.set(row.externalId, id);
          inserted++;
        }
      }
    });
    process.stdout.write(`\r  ${Math.min(start + BATCH, rows.length)}/${rows.length} written   `);
  }
  console.log();
  await db.close();
  return { inserted, updated };
}

/* ---------------------------------------------------------------------- */
/* Main                                                                   */
/* ---------------------------------------------------------------------- */

async function main() {
  const opts = parseArgs();
  ensureDir(RAW_DIR);
  console.log(`College Board SAT Question Bank → BlueMind`);
  console.log(`  sections: ${opts.sections.join(", ")}${opts.dryRun ? "  (dry run)" : ""}${opts.fetchOnly ? "  (fetch only)" : ""}${opts.offline ? "  (offline)" : ""}\n`);

  const report = {
    generatedAt: new Date().toISOString(),
    skipped: [] as { questionId: string; section: Section; reason: string }[],
    warnings: [] as { questionId: string; warnings: string[] }[],
    downloadFailures: [] as { questionId: string; error: string }[],
  };

  const allRows: ImportRow[] = [];
  for (const section of opts.sections) {
    console.log(`▶ ${section}`);
    let entries = (await loadList(section, opts)).filter((e) => (e.program ?? "SAT") === "SAT");
    if (opts.ids) entries = entries.filter((e) => opts.ids!.has(e.questionId));
    if (opts.limit) entries = entries.slice(0, opts.limit);
    console.log(`  ${entries.length} question(s) selected (${entries.filter((e) => !e.external_id).length} in the older format)`);

    const { fetched, failed } = await fetchMissing(entries, opts);
    if (fetched) console.log(`  ${fetched} downloaded`);
    report.downloadFailures.push(...failed);
    if (opts.fetchOnly) continue;

    const rows = await convertAll(section, entries, opts, report);
    console.log(`  ${rows.length} converted, ${report.skipped.filter((s) => s.section === section).length} skipped`);
    allRows.push(...rows);
  }

  writeJson(path.join(ROOT, "import-report.json"), report);

  if (opts.fetchOnly) {
    console.log(`\n✔ Cache is up to date (${report.downloadFailures.length} download failure(s)).`);
    return;
  }

  // Summary by domain / skill / difficulty
  const summary = new Map<string, { Easy: number; Medium: number; Hard: number }>();
  for (const r of allRows) {
    const key = `${r.section} › ${r.domain} › ${r.skill}`;
    const entry = summary.get(key) ?? { Easy: 0, Medium: 0, Hard: 0 };
    entry[r.difficulty]++;
    summary.set(key, entry);
  }
  console.log("\nQuestions ready to import:");
  for (const [key, counts] of Array.from(summary.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const total = counts.Easy + counts.Medium + counts.Hard;
    console.log(`  ${key.padEnd(90)} ${String(total).padStart(4)}  (E ${counts.Easy} / M ${counts.Medium} / H ${counts.Hard})`);
  }
  console.log(`  ${"TOTAL".padEnd(90)} ${String(allRows.length).padStart(4)}`);
  if (report.skipped.length) {
    console.log(`\n${report.skipped.length} skipped — reasons:`);
    const byReason = new Map<string, number>();
    for (const s of report.skipped) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1);
    for (const [reason, n] of byReason) console.log(`  ${n}× ${reason}`);
  }
  if (report.warnings.length) console.log(`\n${report.warnings.length} question(s) have conversion warnings — see content/qbank/import-report.json`);

  if (opts.dryRun) {
    const out = allRows.map((r) => ({
      externalId: r.externalId,
      section: r.section,
      domain: r.domain,
      skill: r.skill,
      officialSkill: r.officialSkill,
      difficulty: r.difficulty,
      format: r.format,
      ...r.converted,
    }));
    writeJson(path.join(ROOT, "converted.json"), out);
    console.log(`\n✔ Dry run — wrote ${out.length} converted question(s) to content/qbank/converted.json (nothing written to the database).`);
    return;
  }

  if (allRows.length === 0) fail("Nothing to import.");
  console.log(`\nWriting ${allRows.length} question(s) to the database…`);
  const { inserted, updated } = await writeToDatabase(allRows);
  console.log(`\n✔ Done — ${inserted} inserted, ${updated} updated. Bank questions have no mock and show up under Question Bank → Browse.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
