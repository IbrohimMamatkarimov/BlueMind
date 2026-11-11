import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getQuestionBankOverview, getGlobalPracticeStats } from "@/lib/practice";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to view the Question Bank" }, { status: 401 });

  const [sections, stats] = await Promise.all([
    getQuestionBankOverview(user.id),
    getGlobalPracticeStats(user.id),
  ]);
  return NextResponse.json({ sections, stats });
}
