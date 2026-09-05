import { NextResponse } from "next/server";
import { requireAdmin } from "../_guard";
import { releaseAllBankedModules } from "@/lib/admin";

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const result = await releaseAllBankedModules();
  return NextResponse.json({ ok: true, ...result });
}
