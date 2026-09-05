import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBankFacets } from "@/lib/qbank";

// Counts for the Question Bank filter sidebar: every domain/skill with how
// many bank questions it holds and how many this student has attempted.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to browse the question bank" }, { status: 401 });

  const section = req.nextUrl.searchParams.get("section") === "Math" ? "Math" : "Reading and Writing";
  const facets = await getBankFacets(user.id, section);
  return NextResponse.json(facets);
}
