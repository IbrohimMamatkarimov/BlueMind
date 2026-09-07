import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const missingConfiguration = [
    !process.env.DATABASE_URL && "DATABASE_URL",
    !process.env.SESSION_SECRET && "SESSION_SECRET",
    !(process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) &&
      "GOOGLE_CLIENT_ID",
  ].filter(Boolean) as string[];

  if (missingConfiguration.length > 0) {
    console.error(
      `[health] Missing required configuration: ${missingConfiguration.join(", ")}`
    );
    return NextResponse.json(
      { ok: false, status: "configuration_error" },
      { status: 503 }
    );
  }

  try {
    await db.prepare("SELECT 1 AS ok").get();
    return NextResponse.json({ ok: true, status: "healthy" });
  } catch (err) {
    console.error("[health] Database initialization failed:", err);
    return NextResponse.json(
      { ok: false, status: "database_unavailable" },
      { status: 503 }
    );
  }
}
