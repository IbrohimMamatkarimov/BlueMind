import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSectionTopicList } from "@/lib/practice";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to view the Question Bank" }, { status: 401 });

  const section = req.nextUrl.searchParams.get("section");
  if (section !== "Math" && section !== "Reading and Writing") {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }
  const firstTryOnly = req.nextUrl.searchParams.get("firstTryOnly") === "1";

  return NextResponse.json({ topics: await getSectionTopicList(user.id, section, firstTryOnly) });
}
