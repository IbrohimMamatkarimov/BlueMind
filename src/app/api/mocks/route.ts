import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

interface MockRow {
  id: string;
  title: string;
  month: string;
  year: number;
  order_in_month: number;
  total_questions: number;
  duration_minutes: number;
  is_official: number;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const mocks = (await db
    .prepare(
      "SELECT id, title, month, year, order_in_month, total_questions, duration_minutes, is_official FROM mocks ORDER BY rowid ASC"
    )
    .all()) as MockRow[];

  const MONTH_INDEX: Record<string, number> = {
    January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
    July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
  };

  const attempts = (await db
    .prepare("SELECT mock_id, id, status FROM attempts WHERE user_id = ?")
    .all(user.id)) as { mock_id: string; id: string; status: string }[];
  const attemptByMock = new Map(attempts.map((a) => [a.mock_id, a]));

  // Group by "Month Year", ordered most-recent-month-first.
  const grouped = new Map<string, { year: number; monthIdx: number; mocks: MockRow[] }>();
  for (const mock of mocks) {
    const key = `${mock.month} ${mock.year}`;
    if (!grouped.has(key)) {
      grouped.set(key, { year: mock.year, monthIdx: MONTH_INDEX[mock.month] ?? 0, mocks: [] });
    }
    grouped.get(key)!.mocks.push(mock);
  }

  const sortedKeys = Array.from(grouped.keys()).sort((a, b) => {
    const ga = grouped.get(a)!;
    const gb = grouped.get(b)!;
    if (ga.year !== gb.year) return gb.year - ga.year;
    return gb.monthIdx - ga.monthIdx;
  });

  const result = sortedKeys.map((key) => ({
    label: key,
    mocks: grouped.get(key)!.mocks.map((m) => {
      const attempt = attemptByMock.get(m.id);
      return {
        id: m.id,
        title: m.title,
        totalQuestions: m.total_questions,
        durationMinutes: m.duration_minutes,
        isOfficial: !!m.is_official,
        status: attempt ? attempt.status : "not_started",
        attemptId: attempt?.id ?? null,
      };
    }),
  }));

  return NextResponse.json({ months: result });
}
