import { DOMAINS } from "./sat-constants";
import callGeminiJSON from "./gemini";
import type { QuestionInput } from "./admin";

/** Preview shape returned to the admin UI. Keeps the canonical `QuestionInput`
 * fields but allows a `needsReview` hint produced by the parser/LLM. */
export type QuestionInputPreview = QuestionInput & { needsReview?: boolean };

/** Parse a raw module text (admin paste) into an array of `QuestionInputPreview`.
 * This function builds a strict response schema and forwards the request to the
 * Gemini client. It performs light validation of domains to make sure the
 * returned items reference known taxonomy entries from `DOMAINS`.
 *
 * Note: the actual LLM parsing depends on configuring `GEMINI_URL` and
 * `GEMINI_API_KEY` in the environment. If those are not set the Gemini
 * client will throw a helpful error.
 */
export async function parseMockModule(
  rawText: string,
  section: "Math" | "Reading and Writing",
  module: 1 | 2,
  mockGroupLabel?: string
): Promise<QuestionInputPreview[]> {
  const domainList = Object.keys(DOMAINS).map((d) => `- ${d}`).join("\n");

  const prompt = `You are given the raw text of a full test module. Produce a JSON array of question objects matching the following TypeScript interface exactly, and nothing else:\n\n` +
    `interface QuestionInput {\n` +
    `  mockId: string | null;\n` +
    `  section: \"Math\" | \"Reading and Writing\";\n` +
    `  domain: string; // one of the canonical domains (see list)\n` +
    `  skill: string; // one of the domain's skills when possible\n` +
    `  difficulty: \"Easy\" | \"Medium\" | \"Hard\";\n` +
    `  module: 1 | 2;\n` +
    `  modulePool?: \"higher\" | \"lower\" | null;\n` +
    `  passageText?: string | null;\n` +
    `  imageData?: string | null;\n` +
    `  questionText: string;\n` +
    `  choices: { id: string; text: string }[];\n` +
    `  correctAnswer: string; // letter (A/B/C/D) or text for SPR\n` +
    `  questionType: \"multiple_choice\" | \"spr\";\n` +
    `  rationale: string;\n` +
    `  explanation: string;\n` +
    `  estimatedTime?: number;\n` +
    `  source?: string;\n` +
    `}\n\n` +
    `Use only domains from this canonical list:\n${domainList}\n\n` +
    `Return JSON only. For any field you cannot determine confidently, choose a reasonable default and set a top-level field "needsReview": true on that question object. Preserve math formatting using $...$ for inline math and $$...$$ for display math.\n\n` +
    `Raw module text:\n\n${rawText.slice(0, 20000)}\n\n` +
    `Metadata:\nmodule: ${module}\nsection: ${section}\nmockGroupLabel: ${mockGroupLabel ?? null}`;

  // Simple JSON Schema declaring the expected array-of-objects shape. The
  // schema is permissive for optional fields but enforces the top-level array
  // and core types so the client returns parseable JSON.
  const responseSchema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        mockId: { type: ["string", "null"] },
        section: { type: "string" },
        domain: { type: "string" },
        skill: { type: "string" },
        difficulty: { type: "string" },
        module: { type: "number" },
        modulePool: { type: ["string", "null"] },
        passageText: { type: ["string", "null"] },
        imageData: { type: ["string", "null"] },
        questionText: { type: "string" },
        choices: {
          type: "array",
          items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"] },
        },
        correctAnswer: { type: "string" },
        questionType: { type: "string" },
        rationale: { type: "string" },
        explanation: { type: "string" },
        estimatedTime: { type: "number" },
        source: { type: "string" },
        needsReview: { type: "boolean" },
      },
      required: ["section", "domain", "skill", "difficulty", "module", "questionText", "choices", "correctAnswer", "questionType", "rationale", "explanation"],
    },
  } as const;

  const raw = await callGeminiJSON<QuestionInputPreview[]>({ prompt, responseSchema, maxTokens: 2500 });

  // Post-process: ensure domains exist in canonical list. If not, mark
  // needsReview so admin can correct taxonomy mapping in the preview UI.
  const canonicalDomains = new Set(Object.keys(DOMAINS));
  const out: QuestionInputPreview[] = raw.map((q) => {
    const copy: QuestionInputPreview = { ...q };
    if (!canonicalDomains.has(copy.domain)) {
      copy.needsReview = true;
    }
    // Ensure section/module match the call
    copy.section = section;
    copy.module = module;
    if (mockGroupLabel) copy.mockId = null; // leave null until admin creates the mock
    return copy;
  });

  return out;
}

export default parseMockModule;
