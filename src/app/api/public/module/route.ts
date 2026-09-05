import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getModuleQuestionsPublic, moduleMinutes } from "@/lib/mock-library";

// Public, guest-friendly single-module practice. No auth, nothing written
// to the database — deliberately stateless so "no sign-in, nothing saved"
// holds. Never returns correct_answer/rationale/explanation here; those
// only come back from /api/public/module/grade after the student submits.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mockId = searchParams.get("mockId");
  const section = searchParams.get("section");
  const moduleParam = searchParams.get("module");

  if (!mockId || !section || (moduleParam !== "1" && moduleParam !== "2")) {
    return NextResponse.json({ error: "mockId, section, and module (1 or 2) are required" }, { status: 400 });
  }
  if (section !== "Math" && section !== "Reading and Writing") {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }

  const mock = (await db.prepare("SELECT id, title, subtitle FROM mocks WHERE id = ?").get(mockId)) as
    | { id: string; title: string; subtitle: string | null }
    | undefined;
  if (!mock) return NextResponse.json({ error: "Mock not found" }, { status: 404 });

  const module = Number(moduleParam) as 1 | 2;
  const rows = await getModuleQuestionsPublic(mockId, section, module);
  if (rows.length === 0) {
    return NextResponse.json({ error: "This module isn't available yet" }, { status: 404 });
  }

  return NextResponse.json({
    mockTitle: mock.title,
    mockSubtitle: mock.subtitle,
    section,
    module,
    minutes: moduleMinutes(section),
    questions: rows.map((q) => ({
      id: q.id,
      domain: q.domain,
      skill: q.skill,
      difficulty: q.difficulty,
      passageText: q.passage_text ?? null,
      imageData: q.image_data ?? null,
      questionText: q.question_text,
      choices: JSON.parse(q.choices),
      questionType: q.question_type,
    })),
  });
}
