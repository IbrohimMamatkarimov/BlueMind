import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPracticeQuestions, getPracticeQuestionsMulti } from "@/lib/practice";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to practice by category" }, { status: 401 });

  const skillsParam = req.nextUrl.searchParams.get("skills"); // comma-separated, multi-select picker
  const skill = req.nextUrl.searchParams.get("skill"); // legacy single-skill drill

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(100, Math.max(1, Number(limitParam) || 10)) : 10;

  if (skillsParam) {
    const skills = skillsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const difficultiesParam = req.nextUrl.searchParams.get("difficulties");
    const difficulties = difficultiesParam ? difficultiesParam.split(",").map((d) => d.trim()).filter(Boolean) : [];
    const shuffle = req.nextUrl.searchParams.get("shuffle") === "1";
    const excludeSeen = req.nextUrl.searchParams.get("excludeSeen") === "1";

    if (skills.length === 0) return NextResponse.json({ error: "Pick at least one category" }, { status: 400 });

    const questions = await getPracticeQuestionsMulti({
      skills,
      difficulties,
      limit,
      shuffle,
      excludeSeenUserId: excludeSeen ? user.id : undefined,
    });
    if (questions.length === 0) {
      return NextResponse.json(
        { error: "No banked questions match those filters yet — try widening your selection." },
        { status: 404 }
      );
    }
    return NextResponse.json({ questions });
  }

  if (!skill) return NextResponse.json({ error: "skill is required" }, { status: 400 });
  const difficulty = req.nextUrl.searchParams.get("difficulty") || undefined;
  const questions = await getPracticeQuestions(skill, limit, difficulty);
  if (questions.length === 0) {
    return NextResponse.json({ error: "No banked questions for this skill yet" }, { status: 404 });
  }
  return NextResponse.json({ skill, questions });
}
