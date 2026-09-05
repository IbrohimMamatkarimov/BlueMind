import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBankSet } from "@/lib/qbank";

// Serves one Question Bank set to the exam page in the same shape as
// /api/public/module (mockTitle, minutes, questions…) so the page can run
// a set exactly like a mock module. Answers and rationale are never
// included here — they come back from the grade endpoint only.
export async function GET(_req: Request, { params }: { params: { setId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const set = await getBankSet(user.id, params.setId, user.isAdmin);
  if (!set) return NextResponse.json({ error: "This practice set doesn't exist or isn't yours." }, { status: 404 });

  return NextResponse.json({
    setId: set.setId,
    mockTitle: set.title,
    mockSubtitle: null,
    section: set.section,
    module: 1,
    minutes: set.minutes,
    questions: set.questions,
    total: set.total,
    correctCount: set.correctCount,
    completedAt: set.completedAt,
    results: set.results,
  });
}
