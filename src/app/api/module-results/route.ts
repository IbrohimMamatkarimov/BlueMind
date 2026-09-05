import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";

// Signed-in only. POST saves/overwrites the latest result for a given
// (user, mock, section, module) — retaking a module replaces the previous
// saved result, which is what "start again" is for. GET returns a compact
// map the /mocks page uses to decide whether to show "Start Practice" or
// the saved score for each module.

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { mockId, section, module, correctCount, total, results } = body ?? {};
  if (!mockId || !section || (module !== 1 && module !== 2) || typeof correctCount !== "number" || typeof total !== "number") {
    return NextResponse.json({ error: "mockId, section, module, correctCount, total are required" }, { status: 400 });
  }

  try {
    const existing = (await db
      .prepare("SELECT id FROM module_results WHERE user_id = ? AND mock_id = ? AND section = ? AND module = ?")
      .get(user.id, mockId, section, module)) as { id: string } | undefined;

    if (existing) {
      await db
        .prepare(
          "UPDATE module_results SET correct_count = ?, total = ?, results_json = ?, completed_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') WHERE id = ?"
        )
        .run(correctCount, total, JSON.stringify(results ?? []), existing.id);
    } else {
      await db
        .prepare(
          "INSERT INTO module_results (id, user_id, mock_id, section, module, correct_count, total, results_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(newId("mres"), user.id, mockId, section, module, correctCount, total, JSON.stringify(results ?? []));
    }
  } catch (err) {
    // Most likely cause: the module_results table doesn't exist yet because
    // the dev server hasn't been fully restarted since it was added to
    // schema.sql (CREATE TABLE only runs on server startup, not hot-reload).
    // eslint-disable-next-line no-console
    console.error("[module-results] Failed to save — did you fully restart `npm run dev`?", err);
    return NextResponse.json({ error: "Couldn't save this result. Check the server terminal for details." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ results: [] });

  try {
    const rows = (await db
      .prepare("SELECT mock_id as mockId, section, module, correct_count as correctCount, total FROM module_results WHERE user_id = ?")
      .all(user.id)) as { mockId: string; section: string; module: number; correctCount: number; total: number }[];

    return NextResponse.json({ results: rows });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[module-results] Failed to read — did you fully restart `npm run dev`?", err);
    return NextResponse.json({ results: [] });
  }
}
