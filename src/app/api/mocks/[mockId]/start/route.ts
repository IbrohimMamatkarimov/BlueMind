import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";

export async function POST(req: NextRequest, { params }: { params: Promise<{ mockId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { mockId } = await params;
  const mock = await db.prepare("SELECT * FROM mocks WHERE id = ?").get(mockId);
  if (!mock) return NextResponse.json({ error: "Mock not found" }, { status: 404 });

  // Resume an existing in-progress attempt on this mock if one exists.
  const existing = (await db
    .prepare("SELECT id FROM attempts WHERE user_id = ? AND mock_id = ? AND status = 'in_progress'")
    .get(user.id, mockId)) as { id: string } | undefined;
  if (existing) {
    return NextResponse.json({ attemptId: existing.id, resumed: true });
  }

  try {
    const attemptId = newId("attempt");
    await db
      .prepare(
        `INSERT INTO attempts (id, user_id, mock_id, status, current_section, current_module, current_module_started_at)
         VALUES (?, ?, ?, 'in_progress', 'Reading and Writing', 1, datetime('now'))`
      )
      .run(attemptId, user.id, mockId);
    return NextResponse.json({ attemptId, resumed: false });
  } catch (err) {
    console.error("Failed to start mock:", err);
    return NextResponse.json({ error: "Couldn't start this mock. Please try again." }, { status: 500 });
  }
}
