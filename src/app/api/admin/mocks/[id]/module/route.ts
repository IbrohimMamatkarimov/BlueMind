import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../_guard";
import { deleteAllQuestionsForModule } from "@/lib/admin";

// Admin-only. Deletes every question in one (mock, section, module) group
// in a single call — used to clear a bad AI import and start that module
// over, instead of deleting questions one at a time.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const section = searchParams.get("section");
  const moduleParam = searchParams.get("module");
  if (section !== "Math" && section !== "Reading and Writing") {
    return NextResponse.json({ error: "Invalid or missing section" }, { status: 400 });
  }
  const module = Number(moduleParam);
  if (module !== 1 && module !== 2) {
    return NextResponse.json({ error: "Invalid or missing module" }, { status: 400 });
  }

  const result = await deleteAllQuestionsForModule(params.id, section, module as 1 | 2);
  return NextResponse.json(result);
}
