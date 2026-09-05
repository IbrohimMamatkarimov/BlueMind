import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  computeNext100,
  computeWeakestSkill,
  computeBlueMindProfile,
  getLatestCompletedAttempt,
  getFirstCompletedAttempt,
  getScoreForAttempt,
  getContinueAttempt,
  getRecentMistakesCount,
} from "@/lib/dashboard";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const latest = await getLatestCompletedAttempt(user.id);
  const first = await getFirstCompletedAttempt(user.id);

  const latestScore = latest ? await getScoreForAttempt(latest.attemptId) : null;
  const firstScore = first ? await getScoreForAttempt(first.attemptId) : null;
  const pointsGained =
    latestScore?.total != null && firstScore?.total != null
      ? latestScore.total - firstScore.total
      : null;

  const weakest = await computeWeakestSkill(user.id);
  const next100 = await computeNext100(user.id);
  const continueAttempt = await getContinueAttempt(user.id);
  const mistakesCount = await getRecentMistakesCount(user.id, 3);
  const profile = await computeBlueMindProfile(user.id);

  return NextResponse.json({
    userName: user.name,
    latestScore: latest
      ? { ...latestScore, mockTitle: latest.mockTitle, completedAt: latest.completed_at }
      : null,
    pointsGained,
    nextPractice: weakest
      ? { skill: weakest.skill, domain: weakest.domain, questionCount: 8 }
      : null,
    next100,
    recommendedSession: {
      items: next100.slice(0, 2).map((n, i) => ({ label: n.label, count: i === 0 ? 8 : 5 })),
      mistakesCount,
    },
    continueAttempt: continueAttempt ?? null,
    todaysPractice: {
      items: [
        weakest ? { label: weakest.skill, count: 10 } : { label: "Reading & Writing", count: 10 },
        { label: "Reading & Writing", count: 5 },
        { label: "Previous mistakes", count: mistakesCount },
      ],
      estimatedMinutes: 20,
    },
    blueMindProfile: {
      strong: profile.filter((p) => p.status === "strong").slice(0, 3),
      improving: profile.filter((p) => p.status === "improving").slice(0, 3),
      needsPractice: profile.filter((p) => p.status === "needs_practice").slice(0, 3),
    },
  });
}
