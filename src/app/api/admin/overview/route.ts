import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../_guard";
import { getAdminOverview } from "@/lib/admin-monitor";
import { normalizeRange } from "@/lib/admin-monitor-shared";

export const dynamic = "force-dynamic";

/** Stats, trend, usage and recent activity for the admin "Users & activity" tab. */
export async function GET(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const days = normalizeRange(req.nextUrl.searchParams.get("days"));
  try {
    return NextResponse.json(await getAdminOverview(days));
  } catch (error) {
    console.error("Admin overview failed:", error);
    return NextResponse.json({ error: "Could not load the dashboard. Please try again." }, { status: 503 });
  }
}
