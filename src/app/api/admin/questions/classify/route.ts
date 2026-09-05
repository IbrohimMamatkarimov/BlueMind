import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../../_guard";
import { classifyQuestion } from "@/lib/groq";

// Admin-only. Given a question's text (and optionally passage/choices),
// asks AI to fill in domain/skill/difficulty — used by the manual "Add a
// question" form so the admin never has to know College Board's taxonomy.
const BodySchema = z.object({
  section: z.enum(["Math", "Reading and Writing"]),
  questionText: z.string().min(1),
  passageText: z.string().optional(),
  choices: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
});

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await classifyQuestion(parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result.data);
}
