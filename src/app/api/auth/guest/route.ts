import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { hashPassword, setSessionCookie } from "@/lib/auth";

export async function POST() {
  try {
    const id = newId("guest");
    const email = `${id}@guest.bluemind.local`;
    const passwordHash = await hashPassword(newId()); // unusable random password
    await db
      .prepare("INSERT INTO users (id, email, name, password_hash, is_guest) VALUES (?, ?, ?, ?, 1)")
      .run(id, email, "Guest Student", passwordHash);
    await setSessionCookie(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Guest session failed:", err);
    return NextResponse.json({ error: "Couldn't start a guest session" }, { status: 500 });
  }
}
