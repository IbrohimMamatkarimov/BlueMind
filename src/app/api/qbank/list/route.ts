import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listBankQuestions, normalizeFilters, type BankStatus } from "@/lib/qbank";

// Question Bank browse list — one page of standalone bank questions matching
// the filters, with this student's per-question status. Signed-in only (the
// status column is per user, and guests have their own guest account).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to browse the question bank" }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const list = (key: string) =>
    (p.get(key) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const filters = normalizeFilters({
    section: p.get("section") ?? "Reading and Writing",
    domains: list("domains"),
    skills: list("skills"),
    difficulties: list("difficulties"),
    status: (p.get("status") ?? "all") as BankStatus,
    search: p.get("search") ?? "",
  });
  const page = Math.max(1, Number(p.get("page")) || 1);
  const pageSize = Math.max(1, Number(p.get("pageSize")) || 50);

  const result = await listBankQuestions(user.id, filters, page, pageSize);
  return NextResponse.json({ ...result, filters });
}
