import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createQuestionReport } from "@/lib/admin";

// Anyone can report a question — guests included — since guests can take
// practice modules with no account. If signed in, the report is tagged
// with their user id so the admin panel can show who flagged it.
const Schema = z.object({
  questionId: z.string().min(1),
  reason: z.enum(["wrong_answer", "typo", "unclear", "broken", "other"]),
  details: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const user = await getCurrentUser().catch(() => null);
  const result = await createQuestionReport({
    questionId: parsed.data.questionId,
    userId: user && !user.isGuest ? user.id : null,
    reason: parsed.data.reason,
    details: parsed.data.details ?? null,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}
