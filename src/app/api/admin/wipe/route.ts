import { NextResponse } from "next/server";
import { requireAdmin } from "../_guard";
import { wipeAllMockContent } from "@/lib/admin";

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const result = await wipeAllMockContent();
  return NextResponse.json({ ok: true, ...result });
}
