import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAdminMockLibrary, getPublicMockLibrary } from "@/lib/mock-library";
import { fullExamAvailable } from "@/lib/test-session";

export async function GET(request: NextRequest) {
  const mockId = request.nextUrl.searchParams.get("mockId");
  if (!mockId) return NextResponse.json({ error: "Choose a paper to start a full exam." }, { status: 400 });
  const user = await getCurrentUser();
  const groups = await (user?.isAdmin ? getAdminMockLibrary() : getPublicMockLibrary());
  const mock = groups.flatMap((group) => group.mocks).find((item) => item.id === mockId);
  if (!mock || !fullExamAvailable(mock)) return NextResponse.json({ error: "This paper’s full exam is coming soon. All four complete modules must be available first." }, { status: 404 });
  return NextResponse.json({ mockTitle: mock.title, mockSubtitle: mock.subtitle });
}
