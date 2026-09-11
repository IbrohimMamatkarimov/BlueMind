import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { clampPingSeconds, recordActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

// When each user last reported, per server process. A second open tab (or a
// replayed request) can then only add the time that really passed since the
// previous report, so two tabs don't count a minute twice.
const lastReportAt = new Map<string, number>();

/** Heartbeat from ActivityHeartbeat: { path, seconds } → 204. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { path?: unknown; seconds?: unknown } | null;
  const path = typeof body?.path === "string" && body.path.startsWith("/") ? body.path.slice(0, 300) : "/";
  let seconds = clampPingSeconds(body?.seconds);

  const now = Date.now();
  const previous = lastReportAt.get(user.id);
  if (previous !== undefined) {
    seconds = Math.min(seconds, Math.max(0, Math.ceil((now - previous) / 1000)) + 5);
  }
  lastReportAt.set(user.id, now);
  if (lastReportAt.size > 10_000) lastReportAt.clear();

  try {
    await recordActivity(user.id, path, seconds, new Date(now));
  } catch (error) {
    console.error("Activity ping failed:", error);
    return NextResponse.json({ error: "Could not record activity" }, { status: 503 });
  }
  return new NextResponse(null, { status: 204 });
}
