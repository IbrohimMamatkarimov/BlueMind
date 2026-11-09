import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 12;
const MAX_QUESTION_CHARS = 2_000;
const MAX_CONTEXT_CHARS = 4_000;
const requestWindows = new Map<string, { count: number; resetAt: number }>();

function takeRateLimit(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const entry = requestWindows.get(ip);
  if (!entry || entry.resetAt <= now) {
    requestWindows.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) return false;
  entry.count += 1;
  return true;
}


function offlineStudyHelp(question: string) {
  const q = question.toLowerCase();
  if (/(plan|schedule|session|study)/.test(q)) return "Here is a focused 30-minute session:\n\n1. **3 min** — choose one small goal.\n2. **17 min** — work through 4–6 practice questions without checking answers.\n3. **7 min** — review every mistake and write the reason.\n4. **3 min** — choose your first task for next time.\n\nTell me the SAT section you are working on and I can tailor the plan.";
  if (/(math|equation|algebra|geometry|percent)/.test(q)) return "Try this method:\n\n1. Underline what the question is asking for.\n2. List the numbers and relationships you are given.\n3. Write one equation or draw one quick diagram before calculating.\n4. Check whether your answer makes sense in the original question.\n\nPaste the exact problem when you can, and I’ll help you choose the next step.";
  return "I can still help you make progress right now. Start by telling me the section, the exact part that feels confusing, and what you have tried. I’ll help you turn it into one small next step.";
}

function answerText(data: unknown) {
  const candidate = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0];
  return candidate?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}

export async function POST(request: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Student help is not configured yet." }, { status: 503 });
  }
  if (!takeRateLimit(request)) {
    return NextResponse.json({ error: "Please wait a few minutes before asking again." }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { question?: unknown; context?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const context = typeof body?.context === "string" ? body.context.trim() : "";
  if (!question || question.length > MAX_QUESTION_CHARS || context.length > MAX_CONTEXT_CHARS) {
    return NextResponse.json({ error: "Keep your question under 2,000 characters." }, { status: 400 });
  }

  const prompt = [
    "You are BlueMind's concise SAT study helper.",
    "Help the student understand the method. Do not claim material is official SAT content unless the provided context says so. Do not invent facts from a passage that is not included.",
    "If this is an active exam question, give a process hint and do not reveal an answer. For normal practice, explain the reasoning in clear numbered steps.",
    "Keep the response under 350 words. Use simple Markdown only.",
    `Page context:\n${context || "No extra page context."}`,
    `Student question:\n${question}`,
  ].join("\n\n");

  try {
    const preferred = process.env.GEMINI_MODEL || "gemini-flash-latest";
    let response: Response | undefined;
    for (const model of [...new Set([preferred, "gemini-flash-lite-latest"])]) {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1200, temperature: 0.35 } }),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok || ![404, 503].includes(response.status)) break;
    }
    if (!response || !response.ok) {
      console.error("[student-help] Gemini request status", response?.status);
      if (response?.status === 429) return NextResponse.json({ error: "The AI quota is currently full. Please try again later." }, { status: 429 });
      return NextResponse.json({ answer: offlineStudyHelp(question), fallback: true });
    }
    const answer = answerText(await response.json());
    if (!answer) return NextResponse.json({ answer: offlineStudyHelp(question), fallback: true });
    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ answer: offlineStudyHelp(question), fallback: true });
  }
}

