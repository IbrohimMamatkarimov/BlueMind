import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPracticeCounts } from "@/lib/practice";

// Signed-in only — practice-by-category is a logged-in feature so progress
// (skill_stats) has somewhere to accumulate. Guests get guided to sign up.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to practice by category" }, { status: 401 });

  return NextResponse.json({ counts: await getPracticeCounts(user.id) });
}
