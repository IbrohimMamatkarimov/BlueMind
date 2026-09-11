import { NextResponse } from "next/server";
import { requireAdmin } from "../../_guard";
import { getUserMonitorDetail } from "@/lib/admin-monitor";

export const dynamic = "force-dynamic";

/** One account's full activity picture for the admin user drawer. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const detail = await getUserMonitorDetail(params.id);
    if (!detail) return NextResponse.json({ error: "That user no longer exists." }, { status: 404 });
    return NextResponse.json(detail);
  } catch (error) {
    console.error("Admin user detail failed:", error);
    return NextResponse.json({ error: "Could not load this user. Please try again." }, { status: 503 });
  }
}
