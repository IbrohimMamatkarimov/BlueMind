import { NextResponse } from "next/server";
import { requireAdmin } from "../_guard";
import { listUsersMonitor } from "@/lib/admin-monitor";

export const dynamic = "force-dynamic";

/** Every account with its activity summary, for the admin Users & activity tab. */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json({ users: await listUsersMonitor(), generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Admin users failed:", error);
    return NextResponse.json({ error: "Could not load users. Please try again." }, { status: 503 });
  }
}
