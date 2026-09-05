import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../_guard";
import { deleteMockAdmin, updateMockAdmin } from "@/lib/admin";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const result = await deleteMockAdmin(params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}

const UpdateMockSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  subtitle: z.string().max(120).nullable().optional(),
  groupLabel: z.string().min(1).max(60).optional(),
  month: z.string().min(1).max(30).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  orderInMonth: z.number().int().min(1).max(50).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = UpdateMockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await updateMockAdmin(params.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
