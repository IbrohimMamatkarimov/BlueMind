import { NextResponse } from "next/server";
import { requireAdmin } from "../_guard";
import { getLiveSnapshot } from "@/lib/admin-monitor";

export const dynamic = "force-dynamic";

/** Lightweight "who is online now" count, polled by the dashboard every 30 s. */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json(await getLiveSnapshot());
  } catch (error) {
    console.error("Admin live count failed:", error);
    return NextResponse.json({ error: "Could not check who is online." }, { status: 503 });
  }
}
