import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { gradeBankSet } from "@/lib/qbank";
export async function POST(req: NextRequest, { params }: { params: { setId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || !body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
    return NextResponse.json({ error: "Answers are required" }, { status: 400 });
  }
  const id = typeof body.submissionId === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(body.submissionId) ? body.submissionId : null;
  const mode = ["timed", "untimed", "exam"].includes(body.mode) ? body.mode : "timed";
  try {
    const result = await gradeBankSet(user.id, params.setId, body.answers, body.preview === true, user.isAdmin, id ? { id, mode } : undefined);
    if (!result) return NextResponse.json({ error: "Practice set not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Your result could not be saved. Your answers are still here; please retry submission." }, { status: 503 });
  }
}
