import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTodayDashboard } from "@/lib/today";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  try {
    return NextResponse.json(await getTodayDashboard(user.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Your study plan could not be loaded. Please try again." }, { status: 500 });
  }
}
