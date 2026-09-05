import { NextResponse } from "next/server";
import { requireAdmin } from "../../_guard";
import { getAdminMockLibrary } from "@/lib/mock-library";

// Same response shape as /api/public/mocks, but with TRUE question counts —
// not gated on the module_releases flag. Powers the admin's own /mocks view
// so "Manage Questions" correctly flips to "Start Practice" the moment
// questions exist, independent of whether it's been released to students.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const groups = await getAdminMockLibrary();
  return NextResponse.json({ groups });
}
