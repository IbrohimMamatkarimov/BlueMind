import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { BANK_SET_SIZE_MAX, createBankSet, normalizeFilters, type BankStatus } from "@/lib/qbank";

const BodySchema = z.object({
  section: z.string(),
  domains: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  difficulties: z.array(z.string()).optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  count: z.number().int().min(1).max(BANK_SET_SIZE_MAX).optional(),
  shuffle: z.boolean().optional(),
  questionIds: z.array(z.string().min(1)).max(BANK_SET_SIZE_MAX).optional(),
  title: z.string().max(120).optional(),
});

// Creates a Question Bank practice set — either an explicit list of
// question ids (one row's "Solve" button) or `count` questions drawn from
// the filters — and returns its id. The exam page then runs it at
// /practice/qbank/<section>/<setId>.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to practice from the question bank" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;
  const filters = normalizeFilters({
    section: input.section,
    domains: input.domains,
    skills: input.skills,
    difficulties: input.difficulties,
    status: input.status as BankStatus | undefined,
    search: input.search,
  });

  const result = await createBankSet(user.id, {
    filters,
    count: input.count ?? 10,
    shuffle: input.shuffle ?? true,
    questionIds: input.questionIds,
    title: input.title,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({
    setId: result.setId,
    count: result.count,
    section: result.section,
    href: `/practice/qbank/${encodeURIComponent(result.section)}/${result.setId}`,
  });
}
