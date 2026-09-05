// GROQ_API_KEY drives everything below. Groq exposes an OpenAI-compatible
// /chat/completions endpoint, so this is a plain fetch — no SDK dependency
// needed.
//
// Model note: Groq's lineup turns over fairly often. As of writing,
// llama-3.3-70b-versatile and meta-llama/llama-4-scout-17b-16e-instruct
// (this file's previous models) are deprecated in favor of the two below.
// If Groq deprecates these too, this is the only place that needs updating.

import { DOMAINS } from "./sat-constants";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Groq's current flagship text model.
const TEXT_MODEL = "openai/gpt-oss-120b";
// Vision-capable model, used only for mode "photo" (and photo-based
// question extraction). Currently a Groq preview model — swap here if
// Groq promotes a new vision model to GA.
const VISION_MODEL = "qwen/qwen3.6-27b";

function getApiKey() {
  return process.env.GROQ_API_KEY || null;
}

export interface CoachStructuredResponse {
  diagnosis: string;
  mistake_type: string;
  concept: string;
  hint: string;
  explanation: string;
  next_step: string;
  recommended_skill: string;
  difficulty: string;
}

const FALLBACK_RESPONSE: CoachStructuredResponse = {
  diagnosis:
    "BlueMind Coach couldn't reach the AI service just now, but here's what we can tell from your answer data.",
  mistake_type: "n/a",
  concept: "Review the skill tag on this question and re-read the explanation below.",
  hint: "Re-read the question stem carefully and eliminate answer choices one at a time.",
  explanation:
    "Coach is temporarily unavailable. Your progress and answers are saved — nothing was lost. Try again in a moment, or use the built-in explanation for this question.",
  next_step: "Retry Coach shortly, or continue practicing — your session isn't affected.",
  recommended_skill: "",
  difficulty: "n/a",
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Groq request timed out")), ms)),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch() wrapper for Groq calls that specifically retries on HTTP 429
 * (rate limited) with backoff, honoring the `Retry-After` header when Groq
 * sends one. Without this, a batch that got rate-limited just failed
 * outright and its questions were silently dropped — which is exactly
 * what was happening pasting a large (~20+ question) block: by the 3rd or
 * 4th sequential batch, cumulative token usage in that same minute blew
 * past Groq's free-tier 8,000 TPM cap, and every batch after that failed.
 * Every Groq call site should go through this instead of calling fetch()
 * directly, so none of them can silently lose content to a transient rate
 * limit again.
 */
async function fetchGroqWithRetry(
  body: Record<string, unknown>,
  apiKey: string,
  timeoutMs: number,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await withTimeout(
      fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      }),
      timeoutMs
    );
    if (response.status !== 429 || attempt >= maxRetries) return response;
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterMs = retryAfterHeader ? Math.round(parseFloat(retryAfterHeader) * 1000) : NaN;
    // Groq's 429 body also carries a more precise wait time buried in its
    // error message on some plans; the header is the reliable source when
    // present. Falls back to exponential backoff (8s, 16s, 32s) when Groq
    // doesn't say how long to wait.
    const waitMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 8000 * Math.pow(2, attempt);
    await sleep(Math.min(waitMs, 60000));
  }
}

export interface AskCoachParams {
  mode: "hint" | "strategy" | "explain" | "teach" | "similar_question" | "diagnose" | "study_plan" | "chat" | "photo";
  questionText?: string;
  choices?: { id: string; text: string }[];
  correctAnswer?: string;
  studentAnswer?: string;
  skill?: string;
  difficulty?: string;
  userMessage?: string;
  examMode?: boolean; // if true, never reveal the correct answer
  imageBase64?: string; // for mode "photo" — a photographed/screenshotted question
  imageMimeType?: string;
}

function sectionForSkill(skill?: string): "Math" | "Reading and Writing" | null {
  if (!skill) return null;
  for (const domain of Object.values(DOMAINS)) {
    if (domain.skills.includes(skill)) return domain.section as "Math" | "Reading and Writing";
  }
  return null;
}

// The exact expert-tutor walkthrough structure, verbatim per product spec —
// used for "explain" / "teach" / "photo", i.e. whenever Coach is actually
// solving/teaching a question rather than giving a quick nudge or a
// behind-the-scenes diagnosis.
const TUTOR_STRUCTURE = `Solve this SAT question like an expert SAT tutor, using the same style as a high-quality visual SAT explanation.

Do NOT just give the answer up front. Teach the student how to recognize the logic quickly.

Follow this exact structure, using markdown headers exactly as shown:

## 1. What Is The Question Really Asking?
- Rewrite the question in very simple language.
- Identify exactly what relationship, claim, inference, or comparison must be proven.

## 2. Understand The Information
- Before calculating or choosing an answer, explain what each important part of the graph/table/passage means.
- Define categories, variables, units, labels, and comparisons if necessary.
- Ignore information that is irrelevant.

## 3. Find The Key Evidence
- Identify the 1–3 pieces of information that actually determine the answer.
- Explicitly compare the relevant values.
- If something increases/decreases, say so clearly.
- Focus on the BIGGEST or MOST RELEVANT change rather than analyzing every number unnecessarily.

## 4. Connect The Evidence To The Claim
- Explain the logical chain: evidence → what it means → why that supports/refutes the claim.
- Do not make a logical jump.
- If the question asks whether evidence supports a conclusion, explicitly explain WHY.

## 5. Eliminate The Wrong Answers
- Briefly explain why each wrong choice fails.
- Point out traps such as: reversing cause and effect, confusing correlation with causation, using irrelevant information, exaggerating what the passage says, comparing the wrong categories, answering a different question than the one asked.

## 6. Final Answer
- Give the correct answer clearly.
- Then give a one-sentence reason using the strongest evidence.

## 7. SAT Quick Strategy
- End with a short "SAT Strategy" explaining the reusable skill or shortcut for similar questions.

STYLE RULES:
- Think like a 1500+ SAT tutor.
- Make the reasoning extremely clear and structured.
- Use simple language, not unnecessarily complicated vocabulary.
- Bold the key numbers/words using markdown **like this**.
- When comparing data, use arrows such as 83% → 15% or 13% → 78%.
- Explicitly label important changes as INCREASES, DECREASES, JUMPS, or DROPS when appropriate.
- Separate "what the evidence says" from "what the evidence means."
- Don't over-explain irrelevant details.
- If there is a faster SAT-specific way to solve it, show that too.`;

const RW_ADDENDUM = `For this Reading & Writing question, always identify the exact textual evidence that makes the correct answer work.

Use this reasoning pattern: CLAIM → TEXT EVIDENCE → LOGICAL CONNECTION → ANSWER

For vocabulary-in-context questions: ignore the word's common definition at first, read the surrounding sentence and paragraph, determine the meaning required by context, and test each answer choice in the sentence.

For inference questions: separate what the text explicitly says from what can reasonably be inferred. Never choose an answer that requires information not supported by the passage.

For transitions: identify the relationship between the previous and next sentence FIRST, then choose the transition that expresses that relationship.

For rhetorical synthesis / data questions: identify the purpose of the sentence/question, find only the data that directly serves that purpose, and explain exactly how the data supports the intended statement.`;

const JSON_CONTRACT = `Respond with ONLY a single JSON object — no markdown code fences, no text before or after it — with exactly these string keys:
{
  "diagnosis": string,        // one-line restatement of what the question is asking (or, for mode "diagnose", why the student likely got it wrong)
  "mistake_type": string,     // one of: concept_gap | reasoning_error | calculation_error | misread_question | timing_issue | careless_error | strategy_issue | n/a
  "concept": string,          // the underlying concept/skill being tested, in a sentence or two
  "hint": string,             // ONE short, non-revealing nudge — never the answer itself
  "explanation": string,      // the full walkthrough — this is the main content, use markdown, this is where the structured tutor response goes
  "next_step": string,        // what to study/practice next
  "recommended_skill": string,// a skill name to drill next, or ""
  "difficulty": string        // Easy | Medium | Hard | n/a
}
Every key is required. Values are plain strings (markdown allowed inside "explanation" and "concept"). Do not wrap the JSON in \`\`\`.`;

function buildSystemPrompt(params: AskCoachParams): string {
  const lines = [
    "You are BlueMind Coach, a calm, encouraging, extremely clear SAT tutor.",
    params.examMode
      ? "EXAM MODE IS ON: do NOT reveal or hint at the final correct answer anywhere in your response, including inside 'explanation'. Only give process-level strategy. Keep 'explanation' focused on HOW to approach the question, not what the answer is, and never fill in '## 6. Final Answer' with the actual answer — describe how the student can find and verify it instead."
      : "Coach mode is on: you may fully explain the correct answer and reasoning.",
  ];

  const solvingModes: AskCoachParams["mode"][] = ["explain", "teach", "photo"];
  if (solvingModes.includes(params.mode)) {
    lines.push(TUTOR_STRUCTURE);
    const section = sectionForSkill(params.skill);
    if (section === "Reading and Writing") lines.push(RW_ADDENDUM);
  } else {
    const taskByMode: Partial<Record<AskCoachParams["mode"], string>> = {
      hint: "Task: give ONE short, non-revealing hint that nudges the student toward the approach — never the answer.",
      strategy:
        "Task: explain the general METHOD/APPROACH for solving this type of question — what to look for, what steps to take, in what order — as a short numbered or bulleted strategy. Do NOT solve this specific question's numbers, do NOT reference the specific values/choices in this question beyond identifying its type, and do NOT reveal the answer. Write it as reusable strategy the student could apply to any similar question of this skill.",
      similar_question: "Task: describe a similar practice question idea at the same skill/difficulty, without solving this one.",
      diagnose: "Task: diagnose why the student likely got this wrong, precisely.",
      study_plan: "Task: recommend what to study next given this pattern.",
      chat: "Task: respond helpfully to the student's message.",
    };
    if (taskByMode[params.mode]) lines.push(taskByMode[params.mode]!);
  }

  if (params.mode === "photo") {
    lines.push(
      "The student has attached a photo of an SAT question (textbook, another site, or handwritten work). Read the question and any visible work/answer in the image, then apply the structure above."
    );
  }

  lines.push(JSON_CONTRACT);
  return lines.join("\n\n");
}

function buildUserContent(params: AskCoachParams): string {
  const parts: string[] = [];
  if (params.questionText) parts.push(`Question: ${params.questionText}`);
  if (params.choices?.length) parts.push(`Choices: ${params.choices.map((c) => `${c.id}) ${c.text}`).join(" | ")}`);
  if (params.correctAnswer && !params.examMode) parts.push(`Correct answer: ${params.correctAnswer}`);
  if (params.studentAnswer) parts.push(`Student's answer: ${params.studentAnswer}`);
  if (params.skill) parts.push(`Skill: ${params.skill}`);
  if (params.difficulty) parts.push(`Difficulty: ${params.difficulty}`);
  if (params.userMessage) parts.push(`Student asked: ${params.userMessage}`);
  if (parts.length === 0) parts.push("(No question text provided — respond based on the student's message only.)");
  return parts.join("\n");
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  // Strip ```json ... ``` fences if the model added them despite instructions.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  // Fall back to the first {...} block.
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

export interface ExtractedQuestionDraft {
  section: "Math" | "Reading and Writing";
  domain: string;
  skill: string;
  difficulty: "Easy" | "Medium" | "Hard";
  passageText: string | null;
  questionText: string;
  choices: { id: string; text: string }[];
  correctAnswer: string;
  questionType: "multiple_choice" | "spr";
  rationale: string;
  explanation: string;
}

/**
 * Deterministic safety net for the extraction prompt's own "NEVER place
 * answer choices inside passageText" rule. Prompt instructions alone
 * don't guarantee 100% compliance, especially on messy pasted input — the
 * model occasionally leaves a trailing A)/B)/C)/D) block sitting in
 * passageText even though it also (correctly) extracted those same
 * choices into the choices array, producing a visible duplicate on the
 * left side of the exam view. This scans the END of passageText for a
 * run of choice-lettered lines and cuts them, regardless of what the
 * model decided to do — a guarantee, not another instruction to hope it
 * follows.
 */
function stripLeakedChoiceLines(text: string | null): string | null {
  if (!text) return text;
  const lines = text.split("\n");
  const choiceLineRe = /^\s*\(?[A-F]\)?[.):]\s+\S/;
  let end = lines.length;
  let sawChoice = false;
  while (end > 0) {
    const line = lines[end - 1];
    if (choiceLineRe.test(line)) {
      sawChoice = true;
      end--;
      continue;
    }
    if (line.trim() === "" && sawChoice) {
      end--;
      continue;
    }
    break;
  }
  if (sawChoice && end < lines.length) {
    const cleaned = lines.slice(0, end).join("\n").trim();
    return cleaned || null;
  }
  return text;
}

function sanitizeDraft(q: ExtractedQuestionDraft): ExtractedQuestionDraft {
  // Student-produced response ("grid-in", no answer choices) is a Math-only
  // format on the real Digital SAT — Reading & Writing never has it. The
  // model is instructed not to output "spr" for R&W, but this is a hard
  // guarantee rather than another instruction to hope it follows: if it
  // ever does, force it back to multiple_choice rather than letting a
  // choice-less R&W question reach the review screen.
  let corrected: ExtractedQuestionDraft =
    q.section !== "Math" && q.questionType === "spr" ? { ...q, questionType: "multiple_choice" } : q;
  // The reverse mistake also happens: a Math question that genuinely has
  // no answer choices (it IS grid-in) sometimes gets left tagged
  // 'multiple_choice' with an empty/near-empty choices array. That's not
  // just cosmetically wrong — the import schema requires >=2 choices for
  // 'multiple_choice' and rejects the question outright, which used to
  // take the entire batch down with it. If there aren't enough choices to
  // be a real multiple-choice question, it can only be SPR — correct the
  // type to match what's actually there instead of leaving a mismatch for
  // validation to reject.
  if (corrected.section === "Math" && corrected.questionType === "multiple_choice" && corrected.choices.length < 2) {
    corrected = { ...corrected, questionType: "spr", choices: [] };
  }
  const withoutLeakedChoices = { ...corrected, passageText: stripLeakedChoiceLines(corrected.passageText) };
  return splitBulkedIntoPassage(withoutLeakedChoices);
}

/**
 * Second deterministic safety net, specifically for Rhetorical Synthesis
 * (and similar bulleted-notes) questions: the model sometimes dumps the
 * bulleted notes AND the trailing "Which choice..." instruction sentence
 * together into 'questionText' with 'passageText' left null, instead of
 * splitting them as instructed. If a question has no passageText but its
 * questionText contains multiple bullet/numbered lines followed by a
 * final instruction sentence, split them here: everything up through the
 * last bullet line goes to passageText, only the trailing instruction
 * sentence(s) stay in questionText — the same split the exam page's own
 * client-side fallback (splitPromptFromPassage) does for plain-sentence
 * R&W questions, applied here for the bulleted-notes case specifically.
 */
function splitBulkedIntoPassage(q: ExtractedQuestionDraft): ExtractedQuestionDraft {
  if (q.section !== "Reading and Writing" || q.passageText || !q.questionText) return q;

  const lines = q.questionText.split("\n");
  const bulletLineRe = /^\s*(?:[•\-*]|\d{1,2}[.)])\s+\S/;
  const bulletLineIndexes = lines.map((l, i) => (bulletLineRe.test(l) ? i : -1)).filter((i) => i !== -1);
  // Need at least 2 bullet-looking lines to be confident this is a
  // notes-list question rather than a single dash/number appearing
  // incidentally inside ordinary question prose.
  if (bulletLineIndexes.length < 2) return q;

  const lastBulletLine = bulletLineIndexes[bulletLineIndexes.length - 1];
  // Everything after the last bullet line (if anything) is the trailing
  // instruction sentence(s) — that's the real questionText. Everything
  // through and including the last bullet line is the passage/notes.
  const trailing = lines
    .slice(lastBulletLine + 1)
    .join("\n")
    .trim();
  const notes = lines.slice(0, lastBulletLine + 1).join("\n").trim();

  if (!trailing || !notes) return q; // couldn't confidently split — leave as-is rather than guess wrong

  return { ...q, passageText: notes, questionText: trailing };
}

const DOMAIN_SKILL_GUIDE = `
Use ONLY these section/domain/skill combinations (official College Board taxonomy):
Reading and Writing:
  Information and Ideas: Central Ideas and Details, Command of Evidence, Inferences
  Craft and Structure: Words in Context, Text Structure and Purpose, Cross-Text Connections
  Expression of Ideas: Rhetorical Synthesis, Transitions
  Standard English Conventions: Boundaries, Form, Structure, and Sense
Math:
  Algebra: Linear Equations, Linear Functions, Systems of Equations, Linear Inequalities
  Advanced Math: Nonlinear Functions, Nonlinear Equations, Equivalent Expressions
  Problem-Solving and Data Analysis: Ratios and Proportions, Percentages, Data Interpretation, Probability
  Geometry and Trigonometry: Area and Volume, Lines/Angles/Triangles, Right Triangle Trig, Circles
`;

const EXTRACT_JSON_CONTRACT = `Respond with ONLY a single JSON object — no markdown code fences, no text before or after it — with exactly this shape:
{ "questions": [ { "section": "Math" | "Reading and Writing", "domain": string, "skill": string, "difficulty": "Easy" | "Medium" | "Hard", "passageText": string | null, "questionText": string, "choices": [{"id": string, "text": string}], "correctAnswer": string, "questionType": "multiple_choice" | "spr", "rationale": string, "explanation": string } ] }
If no questions are found, return { "questions": [] }. Do not wrap the JSON in \`\`\`.`;

export interface ExtractQuestionsParams {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

/**
 * Turns raw pasted text or a photographed/screenshotted worksheet into a
 * batch of question drafts matching BlueMind's schema, via Groq (text or
 * vision model depending on input). Nothing is saved by this function —
 * the admin reviews/edits the returned drafts and only approved ones get
 * imported (see /api/admin/questions/extract).
 */
export async function extractQuestions(
  params: ExtractQuestionsParams
): Promise<{ ok: true; questions: ExtractedQuestionDraft[] } | { ok: false; error: string }> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: "GROQ_API_KEY not configured" };
  if (!params.text?.trim() && !params.imageBase64) {
    return { ok: false, error: "Provide text or an image to extract from" };
  }

  const systemPrompt = [
    "You are a PROFESSIONAL Digital SAT formatter extracting practice questions from source material into structured data for a question bank.",
    "Your task: convert ANY raw, messy, or copied text into PERFECT Digital SAT question data. Output must be indistinguishable in quality and structure from a real Digital SAT mock exam (Bluebook).",
    "",
    "SECTION/TYPE DETECTION (AUTO) — identify each question as one of:",
    "1. Reading & Writing (including Standard English Conventions/grammar, and Vocabulary/Words in Context)",
    "2. Math Multiple Choice",
    "3. Math Student-Produced Response (grid-in / numeric fill-in)",
    "",
    "GLOBAL RULES (STRICT — follow every one of these):",
    "- ONE question per output object. NEVER merge two distinct questions into one.",
    "- NEVER mix passage text, the question stem, and answer choices together in the wrong field — each goes in its own field (passageText / questionText / choices).",
    "- NEVER place answer choices inside passageText.",
    "- ALWAYS keep the ORIGINAL WORDING of the passage and question exactly as given — fix only structure/field-placement, never rewrite or summarize meaning.",
    "- REMOVE stray artifacts that aren't part of the actual content: page numbers, running headers/footers, OCR line-number gutters, scan noise.",
    "- FIX broken or merged questions: if two questions' text got jammed together, split them into two separate objects; if a question was cut off mid-sentence by a page/column break, reconstruct it as best you can from context.",
    "",
    "FIELD RULES BY TYPE:",
    "• Reading & Writing WITH a passage: put the full passage (typically 25–150 words) in 'passageText', ONLY the actual question stem (e.g. 'Which choice completes the text with the most logical transition?') in 'questionText'.",
    "• Rhetorical Synthesis specifically: the source material is a set of bulleted/numbered notes or facts (often introduced by a line like 'A student wants to...' or 'While researching a topic, a student has taken the following notes:'), followed by an instruction sentence such as 'Which choice most effectively uses relevant information from the notes to accomplish this goal?'. ALL of the notes/bullets AND the introductory sentence before them go in 'passageText' — ONLY that final 'Which choice...' instruction sentence goes in 'questionText'. Never leave the notes and the instruction sentence combined together in a single field.",
    "• Reading & Writing with TWO texts (Cross-Text Connections): put both in 'passageText', clearly labeled 'Text 1:' followed by the first passage, then 'Text 2:' followed by the second.",
    "• If the source describes or includes a graph/table/chart the question depends on, describe its data clearly in prose at the start of 'passageText', prefixed 'Table:' or 'Graph:' as appropriate (e.g. 'Table: shows median age at first marriage by year and country for men and women, 1900-2000...') — describe the actual data shown, not just that a table exists.",
    "• Standard English Conventions / grammar questions: the passage is the sentence(s) needing a fix — KEEP the blank exactly as written (e.g. '___' or a blank line) inside 'passageText', don't fill it in or remove it.",
    "• Vocabulary / Words in Context: same as above — keep any blank, don't remove it.",
    "• Math Multiple Choice: full problem statement (including any word-problem context) goes in 'questionText'; passageText stays null.",
    "• Math Student-Produced Response (grid-in): questionType 'spr', choices is an empty array, correctAnswer is the numeric answer as a plain string.",
    "• Math word problems with full context: treat exactly like Math Multiple Choice — the entire context belongs in 'questionText', not split out.",
    "• For any math notation in any field, wrap it in LaTeX delimiters $...$ (inline) or $$...$$ (standalone) — e.g. $x^2 + 3x = 0$. NEVER leave LaTeX commands (anything starting with a backslash, like \\sqrt or \\frac) sitting in plain text outside $ delimiters — unwrapped LaTeX commands render as literal backslash-text to the student, not as math. Use \\frac{numerator}{denominator} for any fraction — never a bare \"/\" character for division. Use \\sqrt[n]{...} for an nth root (cube root, etc.) and \\sqrt{...} for a square root — never plain \"sqrt(...)\" text. Example of a correctly formatted complex expression: a cube root of x^16*y^5 divided by 5x^2 times a sixth root of y^6 must be written as the single self-contained inline expression $\\frac{\\sqrt[3]{x^{16}y^5}}{5x^2\\sqrt[6]{y^6}}$ — not as separate unwrapped pieces with a literal \"/\" between them.",
    "• Multiple-choice 'choices' must use id 'A'/'B'/'C'/'D' (or more if the source has more) in order.",
    "",
    "MIXED / MESSY INPUT HANDLING:",
    "- If multiple questions are run together with no clear break, SPLIT them into separate question objects at the correct boundaries — use question numbers, repeated 'Options'/'A)' patterns, or topic shifts as splitting cues.",
    "- If an answer choice or answer key entry appears in the middle of what should be passage text, MOVE it out into the correct choices/correctAnswer field — never leave it embedded in passageText.",
    "- If the source has no clear labels at all (no 'Question:', no lettered choices), REBUILD the structure yourself from context: identify what's clearly the stimulus, what's clearly being asked, and what the offered choices are.",
    "",
    "ANSWER KEY HANDLING: the source often lists all questions first, then a separate answer key near the end (e.g. 'Answer Key', 'Answers:', or a bare list like '1. C  2. A  3. D...'). If present, match each entry to its question by that question's OWN PRINTED NUMBER (not by counting position) and use it as 'correctAnswer' — do not override an explicit given answer with your own guess. Scan the entire input for this before finalizing. Only determine the answer yourself when no answer key exists anywhere in the text.",
    "Always write 'rationale' (why the correct answer is right) and 'explanation' (fuller walkthrough) yourself, in your own words, regardless of whether the source explained its answers.",
    DOMAIN_SKILL_GUIDE,
    "If you cannot confidently classify a question's domain/skill, pick the closest match — never invent a new one.",
    "",
    "ERROR CONTROL: before finalizing each question, check it against the STRICT rules above — no merged questions, no missing passage/question separation, no answer choices leaked into passageText, no messy leftover formatting. If a question fails any of these checks, fix it before including it in the output rather than passing the problem through.",
    "BE PERMISSIVE ABOUT WHAT COUNTS AS A QUESTION, STRICT ABOUT STRUCTURE ONCE FOUND: source text is often messy (OCR artifacts, inconsistent numbering, mid-question chunk boundaries). If you can identify a plausible question — a recognizable prompt/stem OR a clear set of answer choices with enough context to infer what's being asked — extract and structure it properly rather than skipping it. Only return an empty 'questions' array if the text truly contains no question-like content at all (cover page, table of contents, pure answer key with no visible questions). A partial extraction the admin can fix is far more useful than an empty result.",
    EXTRACT_JSON_CONTRACT,
  ].join("\n");

  const isPhoto = !!params.imageBase64;
  const userText = params.text?.trim() ? params.text.trim() : "Extract every question from the attached image.";
  const userMessage = isPhoto
    ? {
        role: "user",
        content: [
          { type: "text", text: userText },
          {
            type: "image_url",
            image_url: { url: `data:${params.imageMimeType || "image/jpeg"};base64,${params.imageBase64}` },
          },
        ],
      }
    : { role: "user", content: userText };

  try {
    const requestBody: Record<string, unknown> = {
      model: isPhoto ? VISION_MODEL : TEXT_MODEL,
      messages: [{ role: "system", content: systemPrompt }, userMessage],
      response_format: { type: "json_object" },
      temperature: 0.3,
      // Both models sit on an 8,000 TPM cap on Groq's free tier covering
      // prompt + completion COMBINED (see askCoach's note on the same
      // limit). The old 8000 here requested the entire budget as
      // completion alone, guaranteeing every call got rejected before
      // Groq even started generating — which is why PDF/text extraction
      // was silently returning zero questions on every batch. ~5,200
      // leaves room for the system prompt (now ~1,300-1,500 tokens after
      // the detailed formatter ruleset below — up from ~900 — since that
      // prompt is now considerably longer) plus the user's pasted text;
      // batches stay small (QUESTIONS_PER_TEXT_BATCH below) specifically
      // so this margin holds even with the longer system prompt.
      max_completion_tokens: isPhoto ? 4200 : 5200,
    };
    if (isPhoto) {
      requestBody.reasoning_effort = "none"; // see askCoach() for why
    } else {
      requestBody.reasoning_effort = "low"; // gpt-oss-120b: cut hidden reasoning tokens, same reasoning as askCoach
    }
    const response = await fetchGroqWithRetry(requestBody, apiKey, 45000);
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Groq API error ${response.status}: ${errText.slice(0, 300)}`);
    }
    const json = await response.json();
    const text: string | undefined = json?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty Groq response");
    const parsed = JSON.parse(extractJson(text)) as { questions?: ExtractedQuestionDraft[] };
    if (!Array.isArray(parsed.questions)) throw new Error("Malformed extraction response");
    return { ok: true, questions: parsed.questions.map(sanitizeDraft) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Extraction failed" };
  }
}

// How many detected questions go into a single Groq call when splitting a
// large pasted block of text. Same underlying limit as extract-pdf's
// PAGES_PER_BATCH: Groq's free-tier TPM cap covers prompt + completion
// together, and a full write-up (question + choices + rationale +
// explanation) per question needs real completion budget, so pasting an
// entire 40+ question module as one call guarantees the model runs out of
// room and silently returns nothing.
const QUESTIONS_PER_TEXT_BATCH = 3;

// Fallback chunk size (characters) used ONLY when no question-number
// boundaries could be detected at all — e.g. the source uses a numbering
// style the regex below doesn't recognize, or has no numbering (a single
// long passage-based question, or OCR output that dropped the numbers
// entirely). Roughly the size of 3-4 fully written SAT questions, matched
// to extract-pdf's per-batch budget so neither path can silently blow the
// completion token cap by stuffing an entire module into one call.
const FALLBACK_CHUNK_CHARS = 3000;

function looksLikeAnswerKeyBlock(text: string): boolean {
  if (/answer\s*key/i.test(text)) return true;
  const matches = text.match(/\b\d{1,3}\s*[.):]\s*[A-D]\b/g) ?? [];
  return matches.length >= 15 && matches.length * 6 > text.trim().length / 20;
}

// Recognizes the start of a new question across the numbering styles real
// source documents actually use — plain "14." / "14)" / "14 -", a
// parenthesized "(14)", or an explicit "Question 14" / "Q14" label. All
// anchored to the start of a line (allowing leading whitespace) since
// that's how virtually every numbered test document marks question
// starts, and all require a word boundary after the number so "1995." or
// a percentage like "14.5" inside a sentence never counts as a boundary.
const QUESTION_BOUNDARY_REGEX = /^[ \t]*(?:(?:question|q)[ .]?\s*)?\(?\d{1,3}\)?[.):-]\s+(?=\S)/gim;

// Second boundary style: the question number completely BARE on its own
// line — no trailing ".", ")", or "-" at all — immediately followed by a
// "Mark for Review" line. This is exactly what Bluebook's own copy/export
// produces, and QUESTION_BOUNDARY_REGEX above can never match it (it
// requires punctuation right after the number). Without this, a pasted
// Bluebook-style block found ZERO boundaries, fell all the way through to
// blind FALLBACK_CHUNK_CHARS-sized chunking, and that fallback chunk size
// is far too big for the model to reliably extract every question in one
// call — the actual cause of "pasted 22, only 12 came back".
const BLUEBOOK_BOUNDARY_REGEX = /^[ \t]*\d{1,3}[ \t]*\r?\n[ \t]*mark for review[ \t]*$/gim;

/** Tries every known question-numbering style and returns whichever finds
 * the most boundaries — more boundaries means finer-grained batches, which
 * is always safer (never worse) than a coarser split for staying under the
 * token budget per call. */
function findQuestionBoundaries(body: string): number[] {
  function run(regex: RegExp): number[] {
    const out: number[] = [];
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(body)) !== null) {
      out.push(match.index);
      if (match[0].length === 0) regex.lastIndex++;
    }
    return out;
  }
  const primary = run(QUESTION_BOUNDARY_REGEX);
  const bluebook = run(BLUEBOOK_BOUNDARY_REGEX);
  return bluebook.length > primary.length ? bluebook : primary;
}

/**
 * Splits a large pasted block of question text into small batches (by
 * detected question-number boundaries, e.g. lines starting "14." or
 * "14)"), pulls out anything that looks like a trailing answer key so it
 * can be attached to EVERY batch (a key at the bottom is otherwise
 * invisible to whichever batch processes the questions near the top), and
 * runs extractQuestions() on each batch — mirroring extract-pdf's
 * per-page batching, but keyed on question numbers instead of page breaks
 * since raw pasted text has no page boundaries to split on.
 */
export async function extractQuestionsChunked(
  fullText: string
): Promise<{ questions: ExtractedQuestionDraft[]; batchCount: number; batchErrors: string[] }> {
  const text = fullText.trim();

  // Pull out a trailing answer-key block if there is one, so it can ride
  // along with every batch rather than living in only one of them.
  let body = text;
  let answerKeyText = "";
  const headerMatch = text.match(/\n\s*(answer\s*key|answers)\s*:?\s*\n/i);
  if (headerMatch && headerMatch.index !== undefined) {
    body = text.slice(0, headerMatch.index).trim();
    answerKeyText = text.slice(headerMatch.index).trim();
  } else {
    // No explicit header — check whether the tail of the text (last ~25%)
    // is itself just a dense list of "N. LETTER" entries with no question
    // prose around them, and split there instead.
    const tailStart = Math.floor(text.length * 0.75);
    const tail = text.slice(tailStart);
    if (looksLikeAnswerKeyBlock(tail)) {
      body = text.slice(0, tailStart).trim();
      answerKeyText = tail.trim();
    }
  }

  // Find question-number boundaries in the body across every numbering
  // style findQuestionBoundaries recognizes.
  const boundaries = findQuestionBoundaries(body);

  const chunks: string[] = [];
  const expectedCounts: (number | null)[] = []; // null = unknown (fallback char-split path)
  if (boundaries.length < 2) {
    // No recognizable question numbering at all — instead of sending the
    // entire (possibly huge) paste as a single Groq call, which either
    // blows the completion token budget on anything more than a few
    // questions or gives the model too shapeless a blob to confidently
    // extract anything from (this is what was producing an empty
    // 'questions' array with no error), split on fixed-size character
    // boundaries at paragraph breaks so each call gets a manageably-sized
    // slice with a decent chance of overlap covering split questions.
    if (body.length > FALLBACK_CHUNK_CHARS) {
      let cursor = 0;
      while (cursor < body.length) {
        let end = Math.min(cursor + FALLBACK_CHUNK_CHARS, body.length);
        if (end < body.length) {
          // Prefer to break on a blank line near the target size rather
          // than mid-sentence/mid-question.
          const breakPoint = body.lastIndexOf("\n\n", end);
          if (breakPoint > cursor + FALLBACK_CHUNK_CHARS * 0.5) end = breakPoint;
        }
        const chunk = body.slice(cursor, end).trim();
        if (chunk) {
          chunks.push(chunk);
          expectedCounts.push(null);
        }
        cursor = end;
      }
    } else if (body) {
      chunks.push(body);
      expectedCounts.push(null);
    }
  } else {
    for (let i = 0; i < boundaries.length; i += QUESTIONS_PER_TEXT_BATCH) {
      const start = boundaries[i];
      const endIdx = i + QUESTIONS_PER_TEXT_BATCH;
      const end = endIdx < boundaries.length ? boundaries[endIdx] : body.length;
      const chunk = body.slice(start, end).trim();
      if (chunk) {
        chunks.push(chunk);
        expectedCounts.push(Math.min(QUESTIONS_PER_TEXT_BATCH, boundaries.length - i));
      }
    }
  }

  const allQuestions: ExtractedQuestionDraft[] = [];
  const batchErrors: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    // Space batches out to stay under Groq's free-tier 8,000 TPM cap —
    // each batch alone can burn 5,000+ tokens, so firing them back-to-back
    // blew through that ceiling by the 3rd or 4th batch and every one
    // after that failed outright (this is the actual cause of "pasted 22,
    // only ~11 came through"). fetchGroqWithRetry below also recovers
    // from a 429 if one still slips through, but spacing requests out
    // avoids needing that recovery in the first place.
    if (i > 0) await sleep(9000);

    let chunkText = chunks[i];
    if (answerKeyText) {
      chunkText += `\n\n--- ANSWER KEY (applies to this whole document — match each entry to a question by that question's own printed number, NOT by its position in this excerpt) ---\n${answerKeyText}`;
    }

    let result = await extractQuestions({ text: chunkText });
    const expected = expectedCounts[i];

    // A batch can come back "ok" while still short a question — the model
    // just skipped one, which is easy for a single LLM call to do and
    // previously went completely unnoticed (this is very likely the exact
    // cause of "pasted 27, got 26": one 3-question batch quietly returned
    // only 2). Since we know exactly how many question-number boundaries
    // fell in this chunk, we can actually detect that and retry once
    // before giving up.
    if (result.ok && expected !== null && result.questions.length < expected) {
      const retry = await extractQuestions({ text: chunkText });
      if (retry.ok && retry.questions.length > result.questions.length) {
        result = retry;
      }
    }

    if (result.ok) {
      allQuestions.push(...result.questions);
      if (expected !== null && result.questions.length < expected) {
        batchErrors.push(
          `Batch ${i + 1}/${chunks.length}: expected ${expected} question(s) but only got ${result.questions.length} — re-paste this section separately to recover the rest.`
        );
      }
    } else {
      batchErrors.push(`Batch ${i + 1}/${chunks.length}: ${result.error}`);
    }
  }

  return { questions: allQuestions, batchCount: chunks.length, batchErrors };
}

export interface ClassifyQuestionParams {
  section: "Math" | "Reading and Writing";
  questionText: string;
  passageText?: string;
  choices?: { id: string; text: string }[];
}
export interface ClassifyQuestionResult {
  domain: string;
  skill: string;
  difficulty: "Easy" | "Medium" | "Hard";
}

/**
 * Small, cheap classification call for the manual "Add a question" admin
 * form — the admin just types the question, this fills in domain/skill/
 * difficulty automatically so they never have to know College Board's
 * taxonomy. Deliberately tiny token budget since the output is 3 short
 * fields, not a full extraction.
 */
export async function classifyQuestion(
  params: ClassifyQuestionParams
): Promise<{ ok: true; data: ClassifyQuestionResult } | { ok: false; error: string }> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: "GROQ_API_KEY not configured" };
  if (!params.questionText?.trim()) return { ok: false, error: "No question text to classify" };

  const systemPrompt = [
    `Classify this ${params.section} SAT question into the official College Board domain/skill taxonomy, and estimate its difficulty.`,
    DOMAIN_SKILL_GUIDE,
    `Only use domain/skill combinations valid for the "${params.section}" section listed above.`,
    `Respond with ONLY a single JSON object, no markdown fences: { "domain": string, "skill": string, "difficulty": "Easy" | "Medium" | "Hard" }`,
  ].join("\n\n");

  const userParts = [`Question: ${params.questionText}`];
  if (params.passageText) userParts.unshift(`Passage: ${params.passageText}`);
  if (params.choices?.length) userParts.push(`Choices: ${params.choices.map((c) => `${c.id}) ${c.text}`).join(" | ")}`);

  try {
    const response = await withTimeout(
      fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: TEXT_MODEL,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userParts.join("\n") }],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_completion_tokens: 300,
          reasoning_effort: "low",
        }),
      }),
      15000
    );
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Groq API error ${response.status}: ${errText.slice(0, 300)}`);
    }
    const json = await response.json();
    const text: string | undefined = json?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty Groq response");
    const parsed = JSON.parse(extractJson(text)) as Partial<ClassifyQuestionResult>;
    if (!parsed.domain || !parsed.skill || !parsed.difficulty) throw new Error("Malformed classification response");
    return { ok: true, data: parsed as ClassifyQuestionResult };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Classification failed" };
  }
}

export interface GenerateRationaleParams {
  section: "Math" | "Reading and Writing";
  questionText: string;
  passageText?: string;
  choices: { id: string; text: string }[];
  correctAnswer: string;
  questionType: "multiple_choice" | "spr";
}
export interface GenerateRationaleResult {
  rationale: string;
  explanation: string;
}

/**
 * Writes the "rationale" (short, why-the-answer-is-right) and
 * "explanation" (fuller walkthrough) for the manual "Add a question" admin
 * form — the admin only supplies the question, choices, and correct
 * answer; this fills in the two write-up fields so nobody has to draft
 * them by hand. Runs at submit time (needs the correct answer, which is
 * usually the last thing filled in) rather than on blur like classify.
 */
export async function generateRationale(
  params: GenerateRationaleParams
): Promise<{ ok: true; data: GenerateRationaleResult } | { ok: false; error: string }> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: "GROQ_API_KEY not configured" };
  if (!params.questionText?.trim()) return { ok: false, error: "No question text to explain" };
  if (!params.correctAnswer?.trim()) return { ok: false, error: "No correct answer set yet" };

  const systemPrompt = [
    `Write the answer explanation for this ${params.section} SAT question.`,
    "Produce two fields:",
    `- "rationale": 1-3 sentences stating directly why the correct answer is right. Concise, no fluff.`,
    `- "explanation": a fuller walkthrough — for Math, show the key steps/work; for Reading & Writing, cite the specific textual evidence and explain why each wrong choice fails. A few sentences to a short paragraph.`,
    `Respond with ONLY a single JSON object, no markdown fences: { "rationale": string, "explanation": string }`,
  ].join("\n\n");

  const userParts = [`Question: ${params.questionText}`];
  if (params.passageText) userParts.unshift(`Passage: ${params.passageText}`);
  if (params.questionType === "multiple_choice" && params.choices.length) {
    userParts.push(`Choices: ${params.choices.map((c) => `${c.id}) ${c.text}`).join(" | ")}`);
  }
  userParts.push(`Correct answer: ${params.correctAnswer}`);

  try {
    const response = await withTimeout(
      fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: TEXT_MODEL,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userParts.join("\n") }],
          response_format: { type: "json_object" },
          temperature: 0.4,
          max_completion_tokens: 900,
          reasoning_effort: "low",
        }),
      }),
      20000
    );
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Groq API error ${response.status}: ${errText.slice(0, 300)}`);
    }
    const json = await response.json();
    const text: string | undefined = json?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty Groq response");
    const parsed = JSON.parse(extractJson(text)) as Partial<GenerateRationaleResult>;
    if (!parsed.rationale || !parsed.explanation) throw new Error("Malformed rationale response");
    return { ok: true, data: parsed as GenerateRationaleResult };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Rationale generation failed" };
  }
}

export async function askCoach(
  params: AskCoachParams
): Promise<{ ok: true; data: CoachStructuredResponse } | { ok: false; data: CoachStructuredResponse; error: string }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.error("[BlueMind Coach] GROQ_API_KEY is not set in .env — every Coach request will fail until it is.");
    return { ok: false, data: FALLBACK_RESPONSE, error: "GROQ_API_KEY not configured" };
  }

  try {
    const systemPrompt = buildSystemPrompt(params);
    const userText = buildUserContent(params);
    const isPhoto = params.mode === "photo" && !!params.imageBase64;

    // Solving modes (explain/teach/photo) return the full 7-step tutor
    // walkthrough, which routinely runs well past 2048 tokens once you
    // include headers, bullets, and the R&W addendum — that was getting
    // silently truncated mid-JSON, which fails JSON.parse and falls back
    // to the canned "temporarily unavailable" message even though Groq
    // answered fine. Photo mode additionally needs more time: vision
    // input + a long structured completion is slower than plain text.
    const solvingModes: AskCoachParams["mode"][] = ["explain", "teach", "photo"];
    const isSolving = solvingModes.includes(params.mode);
    const model = isPhoto ? VISION_MODEL : TEXT_MODEL;
    // Qwen 3.6 defaults to "thinking" mode, which spends completion tokens
    // on hidden chain-of-thought before ever writing the JSON answer. With
    // a long tutor-structure prompt + an image (itself 2048 tokens) + a
    // json_object response format, it was routinely burning the entire
    // token budget on invisible reasoning and returning a genuinely empty
    // completion (Groq's own error: failed_generation:"") — not a parsing
    // bug, the model just never got to the answer. Forcing non-thinking
    // mode makes it answer directly instead. GPT-OSS uses a different
    // reasoning_effort vocabulary (low/medium/high, no "none"), so it gets
    // "low" for the same reason on long solving-mode responses.
    // Qwen 3.6 (and GPT-OSS 120B) sit on an 8,000 TPM org-wide cap on
    // Groq's free tier — that ceiling covers the WHOLE request: system
    // prompt + user text + image (a flat 2,048 tokens, fixed regardless of
    // resolution/file size — shrinking the photo further doesn't help this
    // specific limit) + the completion budget we ask for. Asking for too
    // much completion room blows the ceiling before Groq even starts
    // generating (HTTP 413). ~1,100 tokens for the tutor-structure system
    // prompt + up to a few hundred for user text leaves roughly 4,200
    // safely spendable on completion for photo mode (2048 image + ~1100
    // prompt + 4200 completion ≈ 7,350, comfortable margin under 8,000).
    const maxTokens = isPhoto ? 4200 : isSolving ? 4200 : 900;
    const timeoutMs = isPhoto ? 45000 : isSolving ? 30000 : 20000;

    const userMessage = isPhoto
      ? {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: { url: `data:${params.imageMimeType || "image/jpeg"};base64,${params.imageBase64}` },
            },
          ],
        }
      : { role: "user", content: userText };

    const requestBody: Record<string, unknown> = {
      model,
      messages: [{ role: "system", content: systemPrompt }, userMessage],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_completion_tokens: maxTokens,
    };
    if (model === VISION_MODEL) {
      requestBody.reasoning_effort = "none";
    } else if (isSolving) {
      requestBody.reasoning_effort = "low";
    }

    const response = await withTimeout(
      fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      }),
      timeoutMs
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Groq API error ${response.status}: ${errText.slice(0, 300)}`);
    }

    const json = await response.json();
    const text: string | undefined = json?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty Groq response");

    const parsed = JSON.parse(extractJson(text)) as CoachStructuredResponse;

    const required: (keyof CoachStructuredResponse)[] = [
      "diagnosis",
      "mistake_type",
      "concept",
      "hint",
      "explanation",
      "next_step",
      "recommended_skill",
      "difficulty",
    ];
    for (const key of required) {
      if (typeof parsed[key] !== "string") {
        throw new Error(`Malformed Groq response: missing ${key}`);
      }
    }

    return { ok: true, data: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Groq error";
    // eslint-disable-next-line no-console
    console.error(`[BlueMind Coach] Groq request failed (mode=${params.mode}, hasImage=${!!params.imageBase64}):`, message);
    return {
      ok: false,
      data: FALLBACK_RESPONSE,
      error: message,
    };
  }
}
