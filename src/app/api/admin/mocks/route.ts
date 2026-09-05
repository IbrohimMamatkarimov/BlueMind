import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../_guard";
import { listMocksAdmin, createMockAdmin } from "@/lib/admin";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ mocks: await listMocksAdmin() });
}

const CreateMockSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(120).nullable().optional(),
  groupLabel: z.string().min(1).max(60),
  month: z.string().min(1).max(30),
  year: z.number().int().min(2000).max(2100),
  orderInMonth: z.number().int().min(1).max(50).optional(),
});

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateMockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const id = await createMockAdmin(parsed.data);
  return NextResponse.json({ ok: true, id });
}
