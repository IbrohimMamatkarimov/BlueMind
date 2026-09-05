import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { gradeBankSet } from "@/lib/qbank";

// Grades a Question Bank set. `preview: true` only computes the score (the
// exam page's answer-key preview inside Module Review); a real submit
// records every answered question in practice_attempts + skill_stats and
// saves the breakdown on the set for the Review screen.
export async function POST(req: NextRequest, { params }: { params: { setId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const answers = body && typeof body.answers === "object" && body.answers !== null ? (body.answers as Record<string, string | null>) : null;
  if (!answers) return NextResponse.json({ error: "answers are required" }, { status: 400 });
  const preview = body.preview === true;

  const result = await gradeBankSet(user.id, params.setId, answers, preview, user.isAdmin);
  if (!result) return NextResponse.json({ error: "Practice set not found" }, { status: 404 });
  return NextResponse.json(result);
}
