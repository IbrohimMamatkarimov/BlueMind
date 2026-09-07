import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createMistakePracticeSet, getMistakes, saveMistakeJournalEntry } from "@/lib/mistakes";
import type { MistakeCategory } from "@/lib/mistakes";
import type { BankSection } from "@/lib/qbank";

function sectionOf(value: string | null): BankSection { return value === "Math" ? "Math" : "Reading and Writing"; }

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json(await getMistakes(user.id, sectionOf(req.nextUrl.searchParams.get("section"))));
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.questionIds)) return NextResponse.json({ error: "Questions are required" }, { status: 400 });
  const result = await createMistakePracticeSet(user.id, sectionOf(body.section), body.questionIds);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ setId: result.setId, count: result.count,
    href: `/practice/qbank/${encodeURIComponent(result.section)}/${result.setId}` });
}

const JournalSchema = z.object({
  section: z.enum(["Reading and Writing", "Math"]),
  questionId: z.string().min(1).max(200),
  reason: z.string().max(1000),
  warning: z.string().max(1000),
  category: z.enum(["unclassified", "concept_gap", "careless_error", "misread_question", "timing_issue", "strategy_issue"]).default("unclassified"),
});

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = JournalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Keep each reflection under 1,000 characters." }, { status: 400 });
  }

  const result = await saveMistakeJournalEntry(
    user.id,
    parsed.data.section,
    parsed.data.questionId,
    parsed.data.reason,
    parsed.data.warning,
    parsed.data.category as MistakeCategory,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ journal: result.entry });
}
