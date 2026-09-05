import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in required" },
      { status: 401 }
    );
  }

  const rows = (await db
    .prepare(
      `SELECT id, messages, created_at, updated_at
       FROM coach_conversations
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 50`
    )
    .all(user.id)) as {
    id: string;
    messages: string;
    created_at: string;
    updated_at: string;
  }[];

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      messages: JSON.parse(row.messages),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  );
}
