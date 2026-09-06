import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createMistakePracticeSet, getMistakes } from "@/lib/mistakes";
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
