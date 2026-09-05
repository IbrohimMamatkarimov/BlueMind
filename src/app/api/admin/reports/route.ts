import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../_guard";
import { listReportsAdmin } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  return NextResponse.json({ reports: await listReportsAdmin(status) });
}
