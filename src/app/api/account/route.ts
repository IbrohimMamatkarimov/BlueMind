import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let country: string | null = null;
  let avatarData: string | null = null;
  let memberSince: string = new Date().toISOString();

  try {
    const row = await db
      .prepare("SELECT country, avatar_data, created_at FROM users WHERE id = ?")
      .get(user.id);

    if (
      row &&
      typeof row === "object" &&
      "created_at" in row
    ) {
      const typed = row as {
        country: string | null;
        avatar_data: string | null;
        created_at: string;
      };

      country = typed.country ?? null;
      avatarData = typed.avatar_data ?? null;
      memberSince = typed.created_at;
    }
  } catch (err) {
    console.error(
      "[account] country/avatar_data/created_at read failed:",
      err
    );

    try {
      const fallback = await db
        .prepare("SELECT created_at FROM users WHERE id = ?")
        .get(user.id);

      if (
        fallback &&
        typeof fallback === "object" &&
        "created_at" in fallback
      ) {
        memberSince = (fallback as { created_at: string }).created_at;
      }
    } catch (err2) {
      console.error("[account] even fallback failed:", err2);
    }
  }

  return NextResponse.json({
    name: user.name,
    email: user.email,
    country,
    avatarData,
    memberSince,
  });
}

const PatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  country: z.string().max(80).nullable().optional(),
  avatarData: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const sets: string[] = [];
  const values: unknown[] = [];

  if (parsed.data.name !== undefined) {
    sets.push("name = ?");
    values.push(parsed.data.name.trim());
  }

  if (parsed.data.country !== undefined) {
    sets.push("country = ?");
    values.push(parsed.data.country);
  }

  if (parsed.data.avatarData !== undefined) {
    sets.push("avatar_data = ?");
    values.push(parsed.data.avatarData);
  }

  if (sets.length === 0) {
    return NextResponse.json({ ok: true });
  }

  values.push(user.id);

  try {
    await db
      .prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
      .run(...values);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[account] PATCH failed:", err);
    return NextResponse.json(
      { error: "Couldn't save that change — try again." },
      { status: 500 }
    );
  }
}
