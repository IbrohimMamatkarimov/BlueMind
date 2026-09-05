import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

/** Every /api/admin/* route calls this first. Returns a 401/403 response to
 * short-circuit with, or null if the caller is a signed-in admin. */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}
