import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

/** Lists the signed-in user's Coach conversations, newest first, with a
 * short title derived from the first user message — powers the "Chat
 * History" sidebar. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const rowsRaw = await db
    .prepare(
      `SELECT id, messages, created_at, updated_at FROM coach_conversations
       WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`
    )
    .all(user.id);
  // Cast through `unknown` first — safe regardless of whether the
  // underlying db client is synchronous (better-sqlite3, returns the array
  // directly) or async (a hosted client like Turso/libSQL, returns a
  // Promise): `await` on a non-Promise value just resolves to that same
  // value immediately, so this works either way.
  const rows = rowsRaw as unknown as { id: string; messages: string; created_at: string; updated_at: string }[];

  const conversations = rows.map((r) => {
    let title = "New chat";
    try {
      const messages = JSON.parse(r.messages) as StoredMessage[];
      const firstUser = messages.find((m) => m.role === "user");
      if (firstUser?.content) {
        title = firstUser.content.replace(/^\[|\]$/g, "").slice(0, 60);
      }
    } catch {
      // keep default title
    }
    return { id: r.id, title, createdAt: r.created_at, updatedAt: r.updated_at };
  });

  return NextResponse.json({ conversations });
}
