import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_guard";
import { getModuleReleasesForMock, setModuleReleased } from "@/lib/admin";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (guard) return guard;
  return NextResponse.json({ releases: await getModuleReleasesForMock(params.id) });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const { section, module, released } = body ?? {};
  if ((section !== "Math" && section !== "Reading and Writing") || (module !== 1 && module !== 2) || typeof released !== "boolean") {
    return NextResponse.json({ error: "section, module, and released are required" }, { status: 400 });
  }

  const result = await setModuleReleased(params.id, section, module, released);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ releases: await getModuleReleasesForMock(params.id) });
}
